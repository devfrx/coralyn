import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Booking, TimeSlot } from '@prisma/client';
import type {
  AbsenceReleaseSource,
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
  SuspendSubscriptionInput,
  ReactivateSubscriptionInput,
  TransferSubscriptionInput,
  CededSubscriptionDTO,
  SetAbsenceConsentInput,
  ReleaseAbsenceInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';
import { toBookingDTO } from './booking.projection';
import { toSubscriptionListItemDTO } from './subscription.projection';
import { toCustomerBookingDTO, resolveSeasonName, toSuspensionDTO } from './customer-booking.projection';
import { computeRenewalWindowState } from './renewal-window.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { resolvePayment } from './booking.payment';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';
import { computeSeniority } from './seniority';
import { isBookingOverlapExclusion } from './booking.errors';
import { UUID_SHAPE } from '../common/uuid';
import { toTransferDTO, toCededSubscriptionDTO } from './booking-transfer.projection';
import { toAbsenceReleaseDTO } from './absence-release.projection';
import { reconcileCessionPayment } from './cession.payment';

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
        where: { coverages: { some: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } } } },
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
          suspensions: { orderBy: { startDate: 'asc' } },
          transfers: {
            include: { previousCustomer: true, newCustomer: true },
            orderBy: { effectiveDate: 'desc' },
          },
          timeSlot: true,
          absenceReleases: { orderBy: { date: 'asc' } },
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

      const releaseUmbrellaIds = [
        ...new Set(bookings.filter((b) => b.absenceReleases.some((r) => r.canceledAt === null)).map((b) => b.umbrellaId)),
      ];
      const otherCoverages = releaseUmbrellaIds.length
        ? await tx.bookingCoverage.findMany({
            where: { umbrellaId: { in: releaseUmbrellaIds }, status: 'confirmed' },
            include: { booking: { include: { timeSlot: true } } },
          })
        : [];
      const isResold = (b: (typeof bookings)[number], r: (typeof b.absenceReleases)[number]): boolean =>
        r.canceledAt === null &&
        otherCoverages.some(
          (c) =>
            c.bookingId !== b.id &&
            c.umbrellaId === b.umbrellaId &&
            c.startDate <= r.date && r.date <= c.endDate &&
            slotsOverlap(c.booking.timeSlot, b.timeSlot),
        );

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
          suspensions: b.suspensions.map(toSuspensionDTO),
          transfers: b.transfers.map(toTransferDTO),
          absenceConsentAt: b.absenceConsentAt ? b.absenceConsentAt.toISOString() : null,
          absenceReleases: b.absenceReleases.map((r) => toAbsenceReleaseDTO(r, isResold(b, r))),
        });
      });
    });
  }

  /** Cessioni EFFETTUATE da un cliente (previousCustomerId = customerId): per la sezione "cessioni
   *  effettuate" della sua Scheda. Read-only, tenant-scoped. Ordine effectiveDate desc. */
  async listCededByCustomer(customerId: string): Promise<CededSubscriptionDTO[]> {
    const tenantId = this.tenant.require();
    if (!UUID_SHAPE.test(customerId)) return [];
    return this.prisma.forTenant(tenantId, async (tx) => {
      const rows = await tx.bookingTransfer.findMany({
        where: { previousCustomerId: customerId },
        include: { newCustomer: true, booking: { include: { umbrella: true } } },
        orderBy: { effectiveDate: 'desc' },
      });
      if (rows.length === 0) return [];
      const seasons = await tx.season.findMany({});
      return rows.map((t) =>
        toCededSubscriptionDTO(t, {
          umbrellaLabel: t.booking.umbrella.label,
          seasonName: resolveSeasonName(seasons, t.booking.startDate),
        }),
      );
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

    // Anti-overlap su intervallo (ADR-0013): confronta con le COPERTURE confermate dello stesso
    // ombrellone (occupazione fisica, ADR-0046). Il rinnovo esclude le proprie coperture via bookingId.
    const coverages = await tx.bookingCoverage.findMany({
      where: {
        umbrellaId: p.umbrellaId,
        status: 'confirmed',
        ...(p.previousBookingId ? { bookingId: { not: p.previousBookingId } } : {}),
      },
      include: { booking: { include: { timeSlot: true } } },
    });
    const conflict = coverages.some(
      (c) => dateRangesOverlap(c.startDate, c.endDate, dbStart, dbEnd) && slotsOverlap(c.booking.timeSlot, p.slot),
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

    // Scrittura. Rete di sicurezza DB (ADR-0037/ADR-0046): sotto race concorrente il check applicativo
    // sopra può essere aggirato; l'EXCLUDE constraint coverage_no_overlap (su BookingCoverage) scatta
    // (SQLSTATE 23P01) e lo traduciamo nello stesso 409 gentile, così client e test non distinguono chi
    // ha bloccato.
    try {
      const booking = await tx.booking.create({
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
      // Copertura effettiva (occupazione fisica): 1 intervallo = span nominale (ADR-0046). I minuti
      // li riempie il trigger coverage_fill_slot_minutes_trg. Il coverage_no_overlap scatta qui sotto
      // race, con lo stesso 23P01 → 409 gentile.
      await tx.bookingCoverage.create({
        data: {
          bookingId: booking.id,
          establishmentId: p.tenantId,
          umbrellaId: p.umbrellaId,
          startDate: dbStart,
          endDate: dbEnd,
          status: 'confirmed',
        },
      });
      return booking;
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
      // constraint coverage_no_overlap resta backstop di SOLA race (ADR-0037/ADR-0046).
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
   * Rifiuta la sospensione aperta (409 OPEN_SUSPENSION, D1); il carve è per-frammento, mai a
   * tappeto (D3); refundedAmount è un ledger cumulativo — increment sul residuo, non SET (D4).
   */
  async terminate(id: string, input: TerminateSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id }, include: { suspensions: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'ALREADY_TERMINATED' as const };
      // Coerenza con transfer: non si disdice con una sospensione aperta in corso (riattiva prima).
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_SUSPENSION' as const };

      const effective = toDbDate(input.effectiveDate);
      // E ∈ (startDate, endDate]: prima = "mai usato" (è un void → cancel); dopo = fuori stagione.
      if (!(effective > existing.startDate && effective <= existing.endDate)) {
        return { error: 'BAD_DATE' as const };
      }
      const residual = Number(existing.amountCollected) - Number(existing.refundedAmount);
      if (!(input.refundAmount >= 0 && input.refundAmount <= residual)) {
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
          refundedAmount: { increment: input.refundAmount }, // ledger cumulativo (coerente con suspend/reactivate)
        },
      });
      // Post-carve (sospensione chiusa / release) l'abbonamento può avere PIÙ frammenti coverage: tronca
      // per-frammento in sincrono con lo span contrattuale, senza mai creare range invertiti.
      const covs = await tx.bookingCoverage.findMany({ where: { bookingId: id } });
      for (const c of covs) {
        if (c.startDate > lastValid) {
          await tx.bookingCoverage.delete({ where: { id: c.id } }); // frammento interamente oltre lo span troncato
        } else if (c.endDate > lastValid) {
          await tx.bookingCoverage.update({ where: { id: c.id }, data: { endDate: lastValid } }); // clamp del frammento a cavallo
        }
      }
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION')
        throw new UnprocessableEntityException('Solo gli abbonamenti possono essere disdetti');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'ALREADY_TERMINATED') throw new ConflictException('Abbonamento già disdetto');
      if (e === 'OPEN_SUSPENSION') throw new ConflictException('Sospensione aperta: riattiva prima di disdire');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di disdetta non valida');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Sospensione temporanea di un abbonamento (D-013). Scava un buco nell'occupazione (BookingCoverage)
   * SENZA toccare lo span di contratto (Booking.startDate/endDate): un sospeso conserva prezzo, rinnovo,
   * prelazione e seniority. Chiusa [S, R-1] (ritorno noto) o aperta [S, …) (poi reactivate). admin-only.
   */
  async suspend(id: string, input: SuspendSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = 24 * 60 * 60 * 1000;
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id }, include: { suspensions: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      // Una sola sospensione aperta per abbonamento: non si impila una nuova mentre una è in corso.
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_EXISTS' as const };

      const today = toDbDate(todayInRome());
      const S = toDbDate(input.startDate);
      if (S < today || S > existing.endDate) return { error: 'BAD_START' as const }; // S ≥ oggi e dentro lo span

      const closed = input.endDate != null;
      const collected = Number(existing.amountCollected);
      const residual = collected - Number(existing.refundedAmount);
      const refund = closed ? (input.refundAmount ?? 0) : 0; // l'aperta rimborsa alla reactivate
      if (!(refund >= 0 && refund <= residual)) return { error: 'BAD_REFUND' as const };

      const coverages = await tx.bookingCoverage.findMany({ where: { bookingId: id, status: 'confirmed' } });

      if (closed) {
        const Rminus1 = toDbDate(input.endDate!);
        if (Rminus1 < S) return { error: 'BAD_RANGE' as const }; // S ≤ R-1
        if (!(Rminus1 < existing.endDate)) return { error: 'RETURN_OUT' as const }; // ritorno ENTRO la stagione
        const C = coverages.find((c) => c.startDate <= S && Rminus1 <= c.endDate);
        if (!C) return { error: 'NO_COVERAGE' as const }; // buco a cavallo o già libero
        await tx.bookingCoverage.delete({ where: { id: C.id } });
        if (S > C.startDate) {
          await tx.bookingCoverage.create({
            data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
              startDate: C.startDate, endDate: new Date(S.getTime() - day), status: 'confirmed' },
          });
        }
        // coda [R, C.end] sempre non vuota (Rminus1 < endDate = C.end ⇒ R ≤ C.end)
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
            startDate: new Date(Rminus1.getTime() + day), endDate: C.endDate, status: 'confirmed' },
        });
        await tx.bookingSuspension.create({
          data: { bookingId: id, establishmentId: tenantId, startDate: S, endDate: Rminus1,
            refundedAmount: refund, reason: input.reason ?? null },
        });
      } else {
        const C = coverages.find((c) => c.startDate <= S && S <= c.endDate);
        if (!C) return { error: 'NO_COVERAGE' as const };
        // Tronca da S in poi: elimina i frammenti interamente ≥ S (inclusa C se S = C.start)…
        await tx.bookingCoverage.deleteMany({ where: { bookingId: id, startDate: { gte: S } } });
        // …e, se C inizia prima di S (non colpita sopra), sostituiscila con la sola testa [C.start, S-1].
        if (S > C.startDate) {
          await tx.bookingCoverage.delete({ where: { id: C.id } });
          await tx.bookingCoverage.create({
            data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
              startDate: C.startDate, endDate: new Date(S.getTime() - day), status: 'confirmed' },
          });
        }
        await tx.bookingSuspension.create({
          data: { bookingId: id, establishmentId: tenantId, startDate: S, endDate: null,
            refundedAmount: 0, reason: input.reason ?? null },
        });
      }

      const row = refund > 0
        ? await tx.booking.update({ where: { id }, data: { refundedAmount: { increment: refund } } })
        : existing;
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti possono essere sospesi');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto: non sospendibile');
      if (e === 'OPEN_EXISTS') throw new ConflictException('Esiste già una sospensione aperta');
      if (e === 'BAD_START') throw new UnprocessableEntityException('Data di inizio sospensione non valida');
      if (e === 'BAD_RANGE') throw new UnprocessableEntityException('Intervallo di sospensione non valido');
      if (e === 'RETURN_OUT') throw new UnprocessableEntityException('Il ritorno cade a fine stagione: usa la disdetta');
      if (e === 'NO_COVERAGE') throw new UnprocessableEntityException('Periodo non coperto (o già libero)');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Riattiva la sospensione APERTA di un abbonamento (D-013). Fissa R, chiude la sospensione a R-1,
   * ricopre [R, endDate] e registra il rimborso sui giorni realmente sospesi. Se la coda contiene
   * walk-in venduti durante l'apertura → 409 (anti-double-booking, mirror priceAndWrite). admin-only.
   * Rifiuta anzitutto un abbonamento non confermato o già disdetto (422 NOT_CONFIRMED/TERMINATED, D2).
   */
  async reactivate(id: string, input: ReactivateSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = 24 * 60 * 60 * 1000;
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({
        where: { id },
        include: { timeSlot: true, suspensions: true },
      });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      const open = existing.suspensions.find((s) => s.endDate === null);
      if (!open) return { error: 'NO_OPEN' as const };

      const R = toDbDate(input.returnDate);
      if (!(R > open.startDate && R <= existing.endDate)) return { error: 'BAD_DATE' as const }; // S < R ≤ endDate

      const residual = Number(existing.amountCollected) - Number(existing.refundedAmount);
      if (!(input.refundAmount >= 0 && input.refundAmount <= residual)) return { error: 'BAD_REFUND' as const };

      // Pre-check anti-overlap su [R, endDate] contro le coperture di ALTRE prenotazioni sullo stesso
      // ombrellone+fascia (mirror priceAndWrite; esclude la PROPRIA via bookingId).
      const others = await tx.bookingCoverage.findMany({
        where: { umbrellaId: existing.umbrellaId, status: 'confirmed', bookingId: { not: id } },
        include: { booking: { include: { timeSlot: true } } },
      });
      const conflict = others.some(
        (c) => dateRangesOverlap(c.startDate, c.endDate, R, existing.endDate) && slotsOverlap(c.booking.timeSlot, existing.timeSlot),
      );
      if (conflict) return { error: 'CONFLICT' as const };

      // Ricopre [R, endDate]. Il constraint coverage_no_overlap resta backstop di sola race.
      try {
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: existing.umbrellaId,
            startDate: R, endDate: existing.endDate, status: 'confirmed' },
        });
      } catch (e) {
        if (isBookingOverlapExclusion(e)) throw new ConflictException('Il posto è occupato nel periodo di ritorno');
        throw e;
      }

      await tx.bookingSuspension.update({
        where: { id: open.id },
        data: {
          endDate: new Date(R.getTime() - day), // R-1 = ultimo giorno sospeso
          refundedAmount: input.refundAmount,
          reactivatedAt: new Date(),
          reason: input.reason ?? open.reason,
        },
      });

      const row = input.refundAmount > 0
        ? await tx.booking.update({ where: { id }, data: { refundedAmount: { increment: input.refundAmount } } })
        : existing;
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno sospensioni');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
      if (e === 'NO_OPEN') throw new ConflictException('Nessuna sospensione aperta da riattivare');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di ritorno non valida');
      if (e === 'CONFLICT') throw new ConflictException('Il posto è occupato nel periodo di ritorno');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Cessione/subentro di un abbonamento (D-013, ADR-0047). Cambia il titolare (customerId) A->B
   * preservando span/seniority/prelazione (NON tocca BookingCoverage: l'occupazione è continua) e
   * riconcilia l'incasso come MOVIMENTO NETTO su amountCollected (refundToPrevious in uscita,
   * collectedFromNew in entrata) via reconcileCessionPayment; refundedAmount resta INTATTO (la cessione
   * è un trasferimento, non una perdita). Registra la storia su BookingTransfer. admin-only.
   */
  async transfer(id: string, input: TransferSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id }, include: { suspensions: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_SUSPENSION' as const };

      if (input.newCustomerId === existing.customerId) return { error: 'SAME_HOLDER' as const };
      const newCustomer = await tx.customer.findFirst({ where: { id: input.newCustomerId } });
      if (!newCustomer) return { error: 'NEW_CUSTOMER_INVALID' as const };
      if (newCustomer.anonymizedAt) return { error: 'NEW_CUSTOMER_ANON' as const };

      const eff = toDbDate(input.effectiveDate);
      if (!(eff >= existing.startDate && eff <= existing.endDate)) return { error: 'BAD_DATE' as const };

      const money = reconcileCessionPayment(
        Number(existing.amountCollected),
        Number(existing.totalPrice),
        input.refundToPrevious,
        input.collectedFromNew,
      );
      if (!money.ok) return { error: money.reason };

      await tx.bookingTransfer.create({
        data: {
          bookingId: id,
          establishmentId: tenantId,
          previousCustomerId: existing.customerId,
          newCustomerId: input.newCustomerId,
          effectiveDate: eff,
          refundToPrevious: input.refundToPrevious,
          collectedFromNew: input.collectedFromNew,
          reason: input.reason ?? null,
        },
      });
      const row = await tx.booking.update({
        where: { id },
        data: { customerId: input.newCustomerId, amountCollected: money.newCollected, paymentStatus: money.paymentStatus },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti possono essere ceduti');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto: non cedibile');
      if (e === 'OPEN_SUSPENSION') throw new ConflictException('Sospensione aperta: riattiva prima di cedere');
      if (e === 'SAME_HOLDER') throw new UnprocessableEntityException('Il subentrante coincide col titolare attuale');
      if (e === 'NEW_CUSTOMER_INVALID') throw new UnprocessableEntityException('Cliente subentrante non valido');
      if (e === 'NEW_CUSTOMER_ANON') throw new UnprocessableEntityException('Cliente subentrante anonimizzato');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di cessione non valida');
      if (e === 'OVER_TOTAL') throw new UnprocessableEntityException('Il netto incassato supera il totale');
      throw new UnprocessableEntityException('Importi di cessione non validi'); // BAD_REFUND / BAD_COLLECT
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Grant/revoke del consenso "assenze comunicate" (D-035 S1). Setta/annulla Booking.absenceConsentAt.
   * Idempotente. admin-only. Non tocca cassa/span. La revoca NON annulla le release già registrate.
   */
  async setAbsenceConsent(id: string, input: SetAbsenceConsentInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      const row = await tx.booking.update({
        where: { id },
        data: { absenceConsentAt: input.consent ? new Date() : null },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno il consenso assenze');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
      throw new UnprocessableEntityException('Abbonamento non attivo'); // NOT_CONFIRMED
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Registra un'assenza comunicata per un giorno (D-035 S2). Scava un buco a GIORNO SINGOLO in
   * BookingCoverage (versione a giorno singolo del carve sospensione), gated dal consenso. NON tocca
   * cassa/span dell'abbonamento (ADR-0048). admin-only. La rivendita usa il flusso giornaliero.
   * Rifiuta la sospensione aperta (422 OPEN_SUSPENSION, C2): il posto è già liberato/a-hold.
   */
  async releaseAbsence(
    id: string,
    input: ReleaseAbsenceInput,
    opts?: { source?: AbsenceReleaseSource; actingCustomerId?: string },
  ): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const source = opts?.source ?? 'operator';
    const day = 24 * 60 * 60 * 1000;
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({
        where: { id, ...(opts?.actingCustomerId ? { customerId: opts.actingCustomerId } : {}) },
        include: { absenceReleases: true, suspensions: true },
      });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_SUSPENSION' as const };
      if (existing.absenceConsentAt === null) return { error: 'NO_CONSENT' as const };

      const today = toDbDate(todayInRome());
      const D = toDbDate(input.date);
      if (D < existing.startDate || D > existing.endDate) return { error: 'BAD_DATE' as const };
      if (D < today) return { error: 'PAST_DATE' as const };
      if (existing.absenceReleases.some((r) => r.canceledAt === null && +r.date === +D)) return { error: 'ALREADY_RELEASED' as const };

      const coverages = await tx.bookingCoverage.findMany({ where: { bookingId: id, status: 'confirmed' } });
      const C = coverages.find((c) => c.startDate <= D && D <= c.endDate);
      if (!C) return { error: 'NO_COVERAGE' as const };

      await tx.bookingCoverage.delete({ where: { id: C.id } });
      if (D > C.startDate) {
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
            startDate: C.startDate, endDate: new Date(D.getTime() - day), status: 'confirmed' },
        });
      }
      if (D < C.endDate) {
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
            startDate: new Date(D.getTime() + day), endDate: C.endDate, status: 'confirmed' },
        });
      }
      await tx.absenceRelease.create({
        data: { bookingId: id, establishmentId: tenantId, date: D, source, reason: input.reason ?? null },
      });
      return { row: existing };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno assenze comunicate');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
      if (e === 'OPEN_SUSPENSION') throw new UnprocessableEntityException('Sospensione aperta: riattiva prima di segnalare un’assenza');
      if (e === 'NO_CONSENT') throw new UnprocessableEntityException('Consenso assenze comunicate non attivo');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data fuori dallo span dell’abbonamento');
      if (e === 'PAST_DATE') throw new UnprocessableEntityException('Non si può segnalare un’assenza nel passato');
      if (e === 'ALREADY_RELEASED') throw new ConflictException('Assenza già registrata per quel giorno');
      throw new UnprocessableEntityException('Giorno già libero (non coperto)'); // NO_COVERAGE
    }
    return toBookingDTO(outcome.row);
  }

  /**
   * Annulla un'assenza comunicata non ancora rivenduta (D-035 S2): ricopre il giorno [date,date] e marca
   * canceledAt. Se il buco è già occupato da un'altra prenotazione (rivendita) → 409 (vincolante). admin-only.
   * Rifiuta abbonamento non confermato/disdetto (422 NOT_CONFIRMED/TERMINATED, D5) e la sospensione
   * aperta (422 OPEN_SUSPENSION, C2).
   */
  async cancelAbsenceRelease(id: string, releaseId: string): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id }, include: { timeSlot: true, suspensions: true } });
      if (!booking) return { error: 'NOT_FOUND' as const };
      const release = await tx.absenceRelease.findFirst({ where: { id: releaseId, bookingId: id } });
      if (!release) return { error: 'RELEASE_NOT_FOUND' as const };
      if (release.canceledAt !== null) return { error: 'ALREADY_CANCELED' as const };
      // Ri-coprire un giorno su un abbonamento morto o dentro un buco di sospensione è incoerente.
      if (booking.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (booking.terminatedAt) return { error: 'TERMINATED' as const };
      if (booking.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_SUSPENSION' as const };

      // rivenduto? coverage confirmed di ALTRA booking su stesso ombrellone+fascia, con la data dentro l'intervallo.
      const others = await tx.bookingCoverage.findMany({
        where: { umbrellaId: booking.umbrellaId, status: 'confirmed', bookingId: { not: id } },
        include: { booking: { include: { timeSlot: true } } },
      });
      const resold = others.some(
        (c) => dateRangesOverlap(c.startDate, c.endDate, release.date, release.date) && slotsOverlap(c.booking.timeSlot, booking.timeSlot),
      );
      if (resold) return { error: 'RESOLD' as const };

      // Ricopre [date, date]. Il constraint coverage_no_overlap resta backstop di sola race.
      try {
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: booking.umbrellaId,
            startDate: release.date, endDate: release.date, status: 'confirmed' },
        });
      } catch (e) {
        if (isBookingOverlapExclusion(e)) throw new ConflictException('Il giorno è stato rivenduto');
        throw e;
      }
      await tx.absenceRelease.update({ where: { id: releaseId }, data: { canceledAt: new Date() } });
      return { row: booking };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'RELEASE_NOT_FOUND') throw new NotFoundException('Assenza non trovata');
      if (e === 'ALREADY_CANCELED') throw new ConflictException('Assenza già annullata');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto');
      if (e === 'OPEN_SUSPENSION') throw new UnprocessableEntityException('Sospensione aperta: riattiva prima di gestire le assenze');
      throw new ConflictException('Il giorno è stato rivenduto: annullo non consentito'); // RESOLD
    }
    return toBookingDTO(outcome.row);
  }
}
