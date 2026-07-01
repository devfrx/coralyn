import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { BookingDTO, BookingType, CreateBookingInput, QuoteBookingInput, SettlePaymentInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';
import { toBookingDTO } from './booking.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { resolvePayment } from './booking.payment';
import { toDbDate, todayInRome } from '../common/dates';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  /** Prenotazioni confermate del giorno. */
  async listByDate(date: string): Promise<BookingDTO[]> {
    const tenantId = this.tenant.require();
    const dayDate = toDbDate(date);
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map(toBookingDTO);
  }

  /** Mappa l'esito del pricing → prezzo, oppure lancia l'eccezione 422 col messaggio IT. */
  private priceOrThrow(outcome: QuoteOutcome): number {
    if (outcome.ok) return outcome.totalPrice;
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino'); // NO_RATE
  }

  /** Preventivo per il modale FE (preview). Deriva l'intervallo dal tipo come la create (single source). */
  async quote(input: QuoteBookingInput): Promise<{ totalPrice: number }> {
    const tenantId = this.tenant.require();
    const totalPrice = await this.prisma.forTenant(tenantId, async (tx) => {
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      return this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate,
          endDate,
          type: input.type,
          packageId: input.packageId ?? null,
        }),
      );
    });
    return { totalPrice };
  }

  /**
   * Deriva e valida l'intervallo [startDate, endDate] dal tipo (server-autoritativo). Le regole di dominio
   * lanciano 422. Per periodic/subscription risolve la stagione una volta (single source: resolveSeasonWithin).
   */
  private async deriveInterval(
    tx: Prisma.TransactionClient,
    input: { type: BookingType; startDate: string; endDate?: string },
  ): Promise<{ startDate: string; endDate: string }> {
    if (input.type === 'daily') {
      if (input.endDate) throw new UnprocessableEntityException('Giornaliera: non specificare la data di fine');
      return { startDate: input.startDate, endDate: input.startDate };
    }
    const season = await this.catalog.resolveSeasonWithin(tx, input.startDate);
    if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    if (input.type === 'subscription') {
      if (input.endDate)
        throw new UnprocessableEntityException('Abbonamento: la durata è la stagione, non specificare la data di fine');
      return { startDate: season.startDate, endDate: season.endDate };
    }
    // periodic
    if (!input.endDate) throw new UnprocessableEntityException('Periodica: specificare la data di fine');
    if (input.endDate < input.startDate)
      throw new UnprocessableEntityException('La data di fine precede l’inizio');
    if (input.endDate > season.endDate) throw new UnprocessableEntityException('Il periodo supera la stagione');
    return { startDate: input.startDate, endDate: input.endDate };
  }

  /** Crea una prenotazione (daily / periodic / subscription; status=confirmed). Prezzo e durata server-autoritativi. */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Intervallo dal tipo (422 di dominio dentro deriveInterval).
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      const dbStart = toDbDate(startDate);
      const dbEnd = toDbDate(endDate);

      // 2) FK nel tenant (RLS: fuori tenant → null → 422).
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }
      if (input.packageId) {
        const pkg = await tx.package.findFirst({ where: { id: input.packageId } });
        if (!pkg) throw new UnprocessableEntityException('Pacchetto non valido');
      }

      // 3) Anti-overlap su intervallo (ADR-0013): stesso ombrellone, date intersecanti, fascia sovrapposta.
      const sameUmbrella = await tx.booking.findMany({
        where: { umbrellaId: input.umbrellaId, status: 'confirmed' },
        include: { timeSlot: true },
      });
      const conflict = sameUmbrella.some(
        (b) => dateRangesOverlap(b.startDate, b.endDate, dbStart, dbEnd) && slotsOverlap(b.timeSlot, slot),
      );
      if (conflict) {
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      }

      // 4) Prezzo (server-autoritativo, mai dal client).
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate,
          endDate,
          type: input.type,
          packageId: input.packageId ?? null,
        }),
      );

      // 5) Scrittura.
      return tx.booking.create({
        data: {
          establishmentId: tenantId,
          customerId: input.customerId,
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate: dbStart,
          endDate: dbEnd,
          type: input.type,
          status: 'confirmed',
          totalPrice,
          packageId: input.packageId ?? null,
        },
      });
    });
    return toBookingDTO(created);
  }

  /** Annulla (soft, status=cancelled). Idempotente sul già annullato. */
  async cancel(id: string): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.status === 'cancelled') return existing;
      return tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
    });
    if (!updated) throw new NotFoundException('Prenotazione non trovata');
    return toBookingDTO(updated);
  }

  /** Registra l'incasso base (ADR-0011). Stato derivato; idempotente (set assoluto). */
  async settlePayment(id: string, input: SettlePaymentInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.status === 'cancelled') return { error: 'CANCELLED' as const };
      const res = resolvePayment(input, Number(existing.totalPrice), todayInRome());
      if (!res.ok) return { error: res.reason };
      const row = await tx.booking.update({
        where: { id },
        data: {
          amountCollected: res.fields.amountCollected,
          paymentStatus: res.fields.paymentStatus,
          paymentMethod: res.fields.paymentMethod,
          collectionDate: res.fields.collectionDate ? toDbDate(res.fields.collectionDate) : null,
        },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'CANCELLED')
        throw new ConflictException('Impossibile incassare una prenotazione annullata');
      if (e === 'OVER_TOTAL') throw new UnprocessableEntityException('Importo superiore al totale');
      throw new UnprocessableEntityException('Metodo di pagamento richiesto'); // METHOD_REQUIRED
    }
    return toBookingDTO(outcome.row);
  }
}
