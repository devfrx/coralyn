import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingDTO, CreateBookingInput, QuoteBookingInput, SettlePaymentInput } from '@coralyn/contracts';
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

  /** Preventivo per il modale FE (preview). */
  async quote(input: QuoteBookingInput): Promise<{ totalPrice: number }> {
    const totalPrice = this.priceOrThrow(await this.catalog.quote(input));
    return { totalPrice };
  }

  /** Crea una prenotazione GIORNALIERA (type=daily, status=confirmed). */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = toDbDate(input.date);

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // FK nel tenant (RLS: fuori tenant → null → 422)
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }

      // Anti-overlap (ADR-0013): confermate stesso ombrellone, date intersecanti, fascia sovrapposta.
      const sameUmbrella = await tx.booking.findMany({
        where: { umbrellaId: input.umbrellaId, status: 'confirmed' },
        include: { timeSlot: true },
      });
      const conflict = sameUmbrella.some(
        (b) =>
          dateRangesOverlap(b.startDate, b.endDate, day, day) &&
          slotsOverlap(b.timeSlot, slot),
      );
      if (conflict) {
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      }

      // Auto-pricing (A3.1): il prezzo è calcolato dall'engine nello stesso tenant/tx, mai dal client.
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          date: input.date,
        }),
      );

      return tx.booking.create({
        data: {
          establishmentId: tenantId,
          customerId: input.customerId,
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate: day,
          endDate: day,
          type: 'daily',
          status: 'confirmed',
          totalPrice,
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
