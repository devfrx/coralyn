import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Booking, TimeSlot } from '@prisma/client';
import type {
  BookingDTO,
  BookingType,
  CreateBookingInput,
  QuoteBookingInput,
  RenewBookingInput,
  SettlePaymentInput,
  SubscriptionListItemDTO,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';
import { toBookingDTO } from './booking.projection';
import { toSubscriptionListItemDTO } from './subscription.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { resolvePayment } from './booking.payment';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';

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

  /**
   * Anti-overlap su intervallo + prezzo server-autoritativo + scrittura. Condiviso da create e renew
   * (riuso, non duplicazione). Gli input sono già validati/copiati dal chiamante; `slot` è la fascia
   * già caricata nel tenant.
   */
  private async priceAndWrite(
    tx: Prisma.TransactionClient,
    p: {
      tenantId: string;
      customerId: string;
      umbrellaId: string;
      slot: TimeSlot;
      packageId: string | null;
      type: BookingType;
      startDate: string;
      endDate: string;
      previousBookingId: string | null;
    },
  ): Promise<Booking> {
    const dbStart = toDbDate(p.startDate);
    const dbEnd = toDbDate(p.endDate);

    // Anti-overlap su intervallo (ADR-0013): stesso ombrellone, date intersecanti, fascia sovrapposta.
    // Un rinnovo non confligge mai con la propria sorgente (`previousBookingId`, ancora `confirmed`): la
    // si esclude, così una stagione di destinazione adiacente a quella della sorgente non produce un 409
    // spurio contro sé stessa. Per la create (`previousBookingId=null`) l'esclusione è un no-op.
    const sameUmbrella = await tx.booking.findMany({
      where: {
        umbrellaId: p.umbrellaId,
        status: 'confirmed',
        ...(p.previousBookingId ? { id: { not: p.previousBookingId } } : {}),
      },
      include: { timeSlot: true },
    });
    const conflict = sameUmbrella.some(
      (b) => dateRangesOverlap(b.startDate, b.endDate, dbStart, dbEnd) && slotsOverlap(b.timeSlot, p.slot),
    );
    if (conflict) throw new ConflictException('Fascia non disponibile per questo ombrellone');

    // Prezzo (server-autoritativo, mai dal client).
    const totalPrice = this.priceOrThrow(
      await this.catalog.priceWithin(tx, {
        umbrellaId: p.umbrellaId,
        timeSlotId: p.slot.id,
        startDate: p.startDate,
        endDate: p.endDate,
        type: p.type,
        packageId: p.packageId,
      }),
    );

    return tx.booking.create({
      data: {
        establishmentId: p.tenantId,
        customerId: p.customerId,
        umbrellaId: p.umbrellaId,
        timeSlotId: p.slot.id,
        startDate: dbStart,
        endDate: dbEnd,
        type: p.type,
        status: 'confirmed',
        totalPrice,
        packageId: p.packageId,
        previousBookingId: p.previousBookingId,
      },
    });
  }

  /** Crea una prenotazione (daily / periodic / subscription; status=confirmed). Prezzo/durata server-autoritativi. */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Intervallo dal tipo (422 di dominio dentro deriveInterval).
      const { startDate, endDate } = await this.deriveInterval(tx, input);

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

      // 3) Anti-overlap + prezzo + scrittura (helper condiviso; non è un rinnovo).
      return this.priceAndWrite(tx, {
        tenantId,
        customerId: input.customerId,
        umbrellaId: input.umbrellaId,
        slot,
        packageId: input.packageId ?? null,
        type: input.type,
        startDate,
        endDate,
        previousBookingId: null,
      });
    });
    return toBookingDTO(created);
  }

  /** Rinnova un abbonamento nella stagione di destinazione (server-autoritativo: copia dalla sorgente). */
  async renew(id: string, input: RenewBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Sorgente valida (nel tenant, abbonamento, confermato).
      const source = await tx.booking.findFirst({ where: { id }, include: { timeSlot: true } });
      if (!source) throw new NotFoundException('Prenotazione non trovata');
      if (source.type !== 'subscription')
        throw new UnprocessableEntityException('Si rinnovano solo gli abbonamenti');
      if (source.status !== 'confirmed')
        throw new UnprocessableEntityException('Impossibile rinnovare un abbonamento annullato');

      // 2) No doppio rinnovo.
      const already = await tx.booking.findFirst({
        where: { previousBookingId: id, status: 'confirmed' },
        select: { id: true },
      });
      if (already) throw new ConflictException('Abbonamento già rinnovato');

      // 3) Nuova stagione (semantica subscription), diversa da quella della sorgente.
      const season = await this.catalog.resolveSeasonWithin(tx, input.startDate);
      if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      if (season.startDate === formatDbDate(source.startDate))
        throw new UnprocessableEntityException('Il rinnovo deve puntare a una stagione diversa');

      // 4) Copia FK dalla sorgente + 5) anti-overlap/prezzo/scrittura (helper condiviso).
      return this.priceAndWrite(tx, {
        tenantId,
        customerId: source.customerId,
        umbrellaId: source.umbrellaId,
        slot: source.timeSlot,
        packageId: source.packageId,
        type: 'subscription',
        startDate: season.startDate,
        endDate: season.endDate,
        previousBookingId: id,
      });
    });
    return toBookingDTO(created);
  }

  /** Elenco abbonati confermati della stagione che contiene `date`, con anzianità e flag rinnovato. */
  async listSubscriptions(date: string): Promise<SubscriptionListItemDTO[]> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const season = await this.catalog.resolveSeasonWithin(tx, date);
      if (!season.ok) return [];
      const s = toDbDate(season.startDate);
      const e = toDbDate(season.endDate);
      const subs = await tx.booking.findMany({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: e }, endDate: { gte: s } },
        orderBy: { createdAt: 'asc' },
      });
      if (subs.length === 0) return [];
      const ids = subs.map((b) => b.id);
      const seniorityById = await this.computeSeniority(tx, ids);
      const renewedIds = new Set(
        (
          await tx.booking.findMany({
            where: { previousBookingId: { in: ids }, status: 'confirmed' },
            select: { previousBookingId: true },
          })
        ).map((r) => r.previousBookingId as string),
      );
      return subs.map((b) =>
        toSubscriptionListItemDTO(b, seniorityById.get(b.id) ?? 1, renewedIds.has(b.id)),
      );
    });
  }

  /**
   * Anzianità = lunghezza catena `previousBookingId`. Risalita iterativa per generazioni con la query
   * API Prisma (RLS via forTenant, niente SQL raw — coerente col resto del codebase). Query bounded dalla
   * profondità della catena (piccola: 1 per stagione), non dal numero di abbonati.
   */
  private async computeSeniority(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const parentOf = new Map<string, string | null>();
    let toLoad = ids;
    while (toLoad.length > 0) {
      const gen = await tx.booking.findMany({
        where: { id: { in: toLoad } },
        select: { id: true, previousBookingId: true },
      });
      for (const r of gen) parentOf.set(r.id, r.previousBookingId);
      toLoad = gen
        .map((r) => r.previousBookingId)
        .filter((x): x is string => x !== null && !parentOf.has(x));
    }
    // Risali da ogni id contando gli antenati (guardia anti-ciclo difensiva: i cicli sono impossibili
    // per costruzione — ogni rinnovo linka un booking preesistente).
    const seniority = new Map<string, number>();
    for (const id of ids) {
      let depth = 1;
      let cur = parentOf.get(id) ?? null;
      const seen = new Set<string>([id]);
      while (cur !== null && parentOf.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        depth += 1;
        cur = parentOf.get(cur) ?? null;
      }
      seniority.set(id, depth);
    }
    return seniority;
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
