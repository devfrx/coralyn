import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Booking, TimeSlot } from '@prisma/client';
import type {
  BookingDTO,
  BookingQuoteDTO,
  BookingType,
  CreateBookingInput,
  CustomerBookingDTO,
  QuoteBookingInput,
  RenewBookingInput,
  SettlePaymentInput,
  SubscriptionListItemDTO,
  TerminateSubscriptionInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';
import { toBookingDTO } from './booking.projection';
import { toSubscriptionListItemDTO } from './subscription.projection';
import { toCustomerBookingDTO, resolveSeasonName } from './customer-booking.projection';
import { computeRenewalWindowState } from './renewal-window.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { resolvePayment } from './booking.payment';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';
import { computeSeniority } from './seniority';
import { isBookingOverlapExclusion } from './booking.errors';
import { UUID_SHAPE } from '../common/uuid';

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

  /**
   * Tutte le prenotazioni di un cliente, arricchite per la Scheda Cliente 360° (ordine startDate desc).
   * Nessun filtro su status: le cancellate servono allo storico (il FE le distingue). Read-only.
   * La prelazione è derivata con l'helper condiviso computeRenewalWindowState (ADR-0034, fonte unica
   * con renewal-campaigns.service): le due viste non possono divergere.
   */
  async listByCustomer(customerId: string): Promise<CustomerBookingDTO[]> {
    const tenantId = this.tenant.require();
    if (!UUID_SHAPE.test(customerId)) return []; // id malformato → invisibile, come un altro tenant
    return this.prisma.forTenant(tenantId, async (tx) => {
      const bookings = await tx.booking.findMany({
        where: { customerId },
        include: {
          umbrella: { include: { row: { include: { sector: true } } } },
          package: true,
          renewals: true,
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });
      if (bookings.length === 0) return [];
      const seasons = await tx.season.findMany({});
      const subIds = bookings.filter((b) => b.type === 'subscription').map((b) => b.id);
      const seniorityById = await computeSeniority(tx, subIds);

      const campaigns =
        subIds.length > 0
          ? await tx.renewalCampaign.findMany({
              include: { originSeason: true, destinationSeason: true },
            })
          : [];
      const todayIso = todayInRome();

      const prelazioneFor = (b: (typeof bookings)[number]): { destinationSeasonName: string; deadline: string } | undefined => {
        if (b.type !== 'subscription' || b.status !== 'confirmed') return undefined;
        const open = campaigns.filter(
          (c) =>
            dateRangesOverlap(b.startDate, b.endDate, c.originSeason.startDate, c.originSeason.endDate) &&
            computeRenewalWindowState(
              b.renewals,
              c.destinationSeason.startDate,
              c.destinationSeason.endDate,
              formatDbDate(c.deadline),
              todayIso,
            ) === 'open',
        );
        if (open.length === 0) return undefined;
        // Più campagne aperte (atipico): la più imminente per deadline.
        const soonest = open.reduce((a, c) => (formatDbDate(c.deadline) < formatDbDate(a.deadline) ? c : a));
        return { destinationSeasonName: soonest.destinationSeason.name, deadline: formatDbDate(soonest.deadline) };
      };

      return bookings.map((b) => {
        const isSub = b.type === 'subscription';
        return toCustomerBookingDTO(b, {
          umbrellaLabel: b.umbrella.label,
          packageName: b.package?.name ?? undefined,
          sectorName: b.umbrella.row.sector.name,
          seasonName: resolveSeasonName(seasons, b.startDate),
          seniority: isSub ? (seniorityById.get(b.id) ?? 1) : undefined,
          renewed: isSub ? b.renewals.some((r) => r.status === 'confirmed') : undefined,
          prelazione: prelazioneFor(b),
        });
      });
    });
  }

  /** Lancia il 422 di dominio col messaggio IT per un esito di pricing fallito. */
  private throwPriceError(outcome: Extract<QuoteOutcome, { ok: false }>, type: BookingType): never {
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    // NO_RATE — messaggio type-aware (ADR-0035): un abbonamento senza tariffa dedicata non è mai
    // prezzato dal wildcard; il no-match è esplicito, mai un forfait silenzioso.
    if (type === 'subscription')
      throw new UnprocessableEntityException('Nessuna tariffa Abbonamento configurata per questa stagione');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino');
  }

  /** Preventivo per il modale FE (preview). Deriva l'intervallo dal tipo come la create (single source). */
  async quote(input: QuoteBookingInput): Promise<BookingQuoteDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      const outcome = await this.catalog.priceWithin(tx, {
        umbrellaId: input.umbrellaId,
        timeSlotId: input.timeSlotId,
        startDate,
        endDate,
        type: input.type,
        packageId: input.packageId ?? null,
      });
      if (!outcome.ok) this.throwPriceError(outcome, input.type);
      return { totalPrice: outcome.totalPrice, matchedRate: outcome.matchedRate };
    });
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

    // Hold di prelazione (D-011, ADR-0034): mentre una finestra è APERTA, l'ombrellone+fascia
    // dell'avente-diritto è riservato a lui; un ALTRO cliente non può prenotarlo nella stagione di
    // destinazione. Valutazione lazy: alla scadenza (today > deadline) la campagna non è più "aperta"
    // e il blocco cade da solo (rilascio). Filtro in DB su scadenza + intersezione con la destinazione.
    const today = todayInRome();
    const openCampaigns = await tx.renewalCampaign.findMany({
      where: {
        deadline: { gte: toDbDate(today) },
        // Overlap inclusivo su intervallo (cfr. dateRangesOverlap): mantenere in sync se cambia la semantica.
        destinationSeason: { startDate: { lte: dbEnd }, endDate: { gte: dbStart } },
      },
      include: { originSeason: true, destinationSeason: true },
    });
    for (const c of openCampaigns) {
      // Aventi-diritto: abbonati CONFERMATI della stagione di ORIGINE sullo stesso ombrellone, di un
      // ALTRO cliente (il proprio rinnovo non confligge col proprio hold), non ancora rinnovati nella
      // stagione di destinazione. Fascia sovrapposta → riservato.
      const holders = await tx.booking.findMany({
        where: {
          type: 'subscription',
          status: 'confirmed',
          umbrellaId: p.umbrellaId,
          // Overlap inclusivo con la stagione di origine (cfr. dateRangesOverlap): tenere in sync.
          startDate: { lte: c.originSeason.endDate },
          endDate: { gte: c.originSeason.startDate },
          customerId: { not: p.customerId },
        },
        include: { timeSlot: true, renewals: true },
      });
      const held = holders.some(
        (h) =>
          slotsOverlap(h.timeSlot, p.slot) &&
          !h.renewals.some(
            (r) =>
              r.status === 'confirmed' &&
              dateRangesOverlap(
                r.startDate,
                r.endDate,
                c.destinationSeason.startDate,
                c.destinationSeason.endDate,
              ),
          ),
      );
      if (held) throw new ConflictException('Ombrellone riservato per prelazione');
    }

    // Prezzo (server-autoritativo, mai dal client).
    const outcome = await this.catalog.priceWithin(tx, {
      umbrellaId: p.umbrellaId,
      timeSlotId: p.slot.id,
      startDate: p.startDate,
      endDate: p.endDate,
      type: p.type,
      packageId: p.packageId,
    });
    if (!outcome.ok) this.throwPriceError(outcome, p.type);
    const totalPrice = outcome.totalPrice;

    // Scrittura. Rete di sicurezza DB (ADR-0037): sotto race concorrente il check applicativo sopra
    // può essere aggirato; l'EXCLUDE constraint booking_no_overlap scatta (SQLSTATE 23P01) e lo
    // traduciamo nello stesso 409 gentile, così client e test non distinguono chi ha bloccato.
    try {
      return await tx.booking.create({
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
    } catch (e) {
      if (isBookingOverlapExclusion(e))
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      throw e;
    }
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
      const season = await this.catalog.resolveSeasonById(tx, input.destinationSeasonId);
      if (!season.ok) throw new UnprocessableEntityException('Stagione di destinazione non trovata');
      // La sorgente (abbonamento) vive nella stagione che contiene la sua startDate; il rinnovo
      // deve puntare a una stagione DIVERSA per identità (non per data d'inizio).
      const sourceSeason = await this.catalog.resolveSeasonWithin(tx, formatDbDate(source.startDate));
      if (sourceSeason.ok && sourceSeason.id === season.id)
        throw new UnprocessableEntityException('Il rinnovo deve puntare a una stagione diversa');
      // Il rinnovo va verso il FUTURO: la stagione di destinazione deve iniziare DOPO la fine
      // dell'abbonamento di origine. Se si sovrappone, le due prenotazioni (stesso ombrellone+fascia)
      // collidono in date e il constraint DB scatterebbe con un 409 generico; qui diamo un 422 chiaro,
      // coerente con la stessa invariante delle campagne rinnovo (renewal-campaigns.open). Così il
      // constraint booking_no_overlap resta backstop di SOLA race (ADR-0037).
      if (season.startDate <= formatDbDate(source.endDate))
        throw new UnprocessableEntityException(
          'La stagione di rinnovo deve iniziare dopo la fine dell’abbonamento di origine',
        );

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

  /** Elenco abbonati confermati della stagione `seasonId`, con anzianità e flag rinnovato. */
  async listSubscriptions(seasonId: string): Promise<SubscriptionListItemDTO[]> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const season = await this.catalog.resolveSeasonById(tx, seasonId);
      if (!season.ok) return [];
      const s = toDbDate(season.startDate);
      const e = toDbDate(season.endDate);
      const subs = await tx.booking.findMany({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: e }, endDate: { gte: s } },
        orderBy: { createdAt: 'asc' },
      });
      if (subs.length === 0) return [];
      const ids = subs.map((b) => b.id);
      const seniorityById = await computeSeniority(tx, ids);
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

  /**
   * Disdetta anticipata di un abbonamento (D-013). Tronca endDate al giorno prima della data
   * effettiva (E = primo giorno di posto libero), marca terminatedAt e registra il rimborso.
   * status resta 'confirmed'. Il posto si libera per date ≥ E (occupazione date-ranged).
   */
  async terminate(id: string, input: TerminateSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'ALREADY_TERMINATED' as const };

      const effective = toDbDate(input.effectiveDate);
      // E ∈ (startDate, endDate]: prima = "mai usato" (è un void → cancel); dopo = fuori stagione.
      if (!(effective > existing.startDate && effective <= existing.endDate)) {
        return { error: 'BAD_DATE' as const };
      }
      const collected = Number(existing.amountCollected);
      if (!(input.refundAmount >= 0 && input.refundAmount <= collected)) {
        return { error: 'BAD_REFUND' as const };
      }

      // Ultimo giorno di validità = E - 1 (UTC-safe: le date DB sono a mezzanotte UTC).
      const lastValid = new Date(effective.getTime() - 24 * 60 * 60 * 1000);
      const row = await tx.booking.update({
        where: { id },
        data: {
          endDate: lastValid,
          terminatedAt: new Date(),
          terminationReason: input.reason ?? null,
          refundedAmount: input.refundAmount,
        },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION')
        throw new UnprocessableEntityException('Solo gli abbonamenti possono essere disdetti');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'ALREADY_TERMINATED') throw new ConflictException('Abbonamento già disdetto');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di disdetta non valida');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }
}
