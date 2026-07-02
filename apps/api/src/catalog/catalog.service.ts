import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Rate } from '@prisma/client';
import type { BookingType, CreatePackageInput, PackageDTO, RateDTO, UpdatePackageInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { formatDbDate, toDbDate } from '../common/dates';
import { resolvePrice, type RateRow } from './pricing.engine';
import { toPackageDTO } from './package.projection';

export interface QuoteContext {
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  packageId?: string | null;
  type: BookingType;
}

export type QuoteOutcome =
  | { ok: true; totalPrice: number; matchedRate: RateDTO }
  | { ok: false; reason: 'UMBRELLA_NOT_FOUND' | 'NO_SEASON' | 'NO_RATE' };

export type SeasonRange =
  | { ok: true; id: string; startDate: string; endDate: string }
  | { ok: false; reason: 'NO_SEASON' };

function toRateRow(r: Rate): RateRow {
  return {
    id: r.id,
    type: r.type,
    sectorId: r.sectorId,
    rowId: r.rowId,
    packageId: r.packageId,
    timeSlotId: r.timeSlotId,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : null,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : null,
    price: Number(r.price),
  };
}

/** RateRow (forma piatta engine) → RateDTO (null→undefined). NON usa toRateDTO (che consuma un Rate Prisma). */
function rateRowToDTO(row: RateRow, seasonId: string): RateDTO {
  return {
    id: row.id,
    seasonId,
    type: row.type ?? undefined,
    sectorId: row.sectorId ?? undefined,
    rowId: row.rowId ?? undefined,
    packageId: row.packageId ?? undefined,
    timeSlotId: row.timeSlotId ?? undefined,
    periodStart: row.periodStart ?? undefined,
    periodEnd: row.periodEnd ?? undefined,
    price: row.price,
  };
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Lista dei pacchetti del tenant. Default: solo attivi; `includeArchived` include gli archiviati. */
  async listPackages(includeArchived = false): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.findMany({ where: includeArchived ? {} : { archivedAt: null } }),
    );
    return rows.map(toPackageDTO);
  }

  /** Risolve la stagione attiva per una data e ne ritorna l'intervallo (single source della risoluzione stagione). */
  async resolveSeasonWithin(tx: Prisma.TransactionClient, date: string): Promise<SeasonRange> {
    const day = toDbDate(date);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${date}: uso la prima (${seasons[0].id}).`);
    }
    return {
      ok: true,
      id: seasons[0].id,
      startDate: formatDbDate(seasons[0].startDate),
      endDate: formatDbDate(seasons[0].endDate),
    };
  }

  /** Risolve una stagione per id e ne ritorna l'intervallo (mirror per-id di resolveSeasonWithin). */
  async resolveSeasonById(tx: Prisma.TransactionClient, id: string): Promise<SeasonRange> {
    const season = await tx.season.findFirst({ where: { id } });
    if (!season) return { ok: false, reason: 'NO_SEASON' };
    return {
      ok: true,
      id: season.id,
      startDate: formatDbDate(season.startDate),
      endDate: formatDbDate(season.endDate),
    };
  }

  /**
   * Calcola il prezzo dentro una transazione esistente (usato da BookingsService.create:
   * niente transazione annidata). Risolve posizione + stagione + engine.
   */
  async priceWithin(tx: Prisma.TransactionClient, ctx: QuoteContext): Promise<QuoteOutcome> {
    const umbrella = await tx.umbrella.findFirst({
      where: { id: ctx.umbrellaId },
      include: { row: true },
    });
    if (!umbrella) return { ok: false, reason: 'UMBRELLA_NOT_FOUND' };

    const day = toDbDate(ctx.startDate);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${ctx.startDate}: uso la prima (${seasons[0].id}).`);
    }
    const pricing = await tx.pricing.findFirst({ where: { seasonId: seasons[0].id } });
    if (!pricing) return { ok: false, reason: 'NO_SEASON' };

    const rates = await tx.rate.findMany({ where: { pricingId: pricing.id } });
    const result = resolvePrice(
      {
        type: ctx.type,
        sectorId: umbrella.row.sectorId,
        rowId: umbrella.rowId,
        packageId: ctx.packageId ?? null,
        timeSlotId: ctx.timeSlotId,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
      },
      rates.map(toRateRow),
    );
    if (!result.ok) return { ok: false, reason: 'NO_RATE' };
    return { ok: true, totalPrice: result.totalPrice, matchedRate: rateRowToDTO(result.rate, seasons[0].id) };
  }

  /** Crea un pacchetto per il tenant corrente. */
  async createPackage(input: CreatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, (tx) =>
      tx.package.create({ data: { establishmentId: tenantId, name: input.name, equipment: input.equipment } }),
    );
    return toPackageDTO(p);
  }

  /** Aggiorna nome/equipment di un pacchetto del tenant corrente; 404 se non trovato (anche cross-tenant). */
  async updatePackage(id: string, input: UpdatePackageInput): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      return tx.package.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
        },
      });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /** Archivia (soft-delete) un pacchetto del tenant; 404 se assente/cross-tenant. Idempotente. */
  async archivePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt != null) return existing; // già archiviato: no-op
      return tx.package.update({ where: { id }, data: { archivedAt: new Date() } });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /** Ripristina un pacchetto archiviato (archivedAt → null); 404 se assente/cross-tenant. Idempotente. */
  async restorePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) return existing; // già attivo: no-op
      return tx.package.update({ where: { id }, data: { archivedAt: null } });
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }

  /**
   * Elimina fisicamente un pacchetto del tenant e lo ritorna. Consentito SOLO su un pacchetto già
   * archiviato (409 altrimenti: flusso in due passi, niente cancellazioni accidentali) e senza
   * riferimenti (409 se rate/booking > 0 — rete di sicurezza: le FK sono ON DELETE SET NULL, senza
   * questa guardia la delete azzererebbe silenziosamente il packageId su tariffe/prenotazioni).
   */
  async deletePackage(id: string): Promise<PackageDTO> {
    const tenantId = this.tenant.require();
    const p = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.package.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null) {
        throw new ConflictException('Archivia il pacchetto prima di eliminarlo definitivamente.');
      }
      const [rateCount, bookingCount] = await Promise.all([
        tx.rate.count({ where: { packageId: id } }),
        tx.booking.count({ where: { packageId: id } }),
      ]);
      if (rateCount > 0 || bookingCount > 0) {
        throw new ConflictException('Pacchetto in uso da tariffe o prenotazioni: non eliminabile.');
      }
      await tx.package.delete({ where: { id } });
      return existing;
    });
    if (!p) throw new NotFoundException('Pacchetto non trovato');
    return toPackageDTO(p);
  }
}
