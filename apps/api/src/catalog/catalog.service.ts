import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Rate } from '@prisma/client';
import type { BookingType, PackageDTO } from '@coralyn/contracts';
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
  | { ok: true; totalPrice: number }
  | { ok: false; reason: 'UMBRELLA_NOT_FOUND' | 'NO_SEASON' | 'NO_RATE' };

export type SeasonRange =
  | { ok: true; startDate: string; endDate: string }
  | { ok: false; reason: 'NO_SEASON' };

function toRateRow(r: Rate): RateRow {
  return {
    type: r.type,
    sectorId: r.sectorId,
    rowId: r.rowId,
    packageId: r.packageId,
    timeSlotId: r.timeSlotId,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : null,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : null,
    price: Number(r.price),
    unit: r.unit,
  };
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Lista dei pacchetti del tenant (read-only, per il selettore FE). */
  async listPackages(): Promise<PackageDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.package.findMany());
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
    return { ok: true, startDate: formatDbDate(seasons[0].startDate), endDate: formatDbDate(seasons[0].endDate) };
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
    return { ok: true, totalPrice: result.totalPrice };
  }
}
