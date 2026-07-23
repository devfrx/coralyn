import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { todayInRome, toDbDate } from '../common/dates';
import { computeSetupStatus } from './setup-status.projection';

@Injectable()
export class SetupStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getStatus(): Promise<SetupStatusDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, (tx) => this.computeForTx(tx));
  }

  /** Riusabile dentro una forTenant già aperta (Platform Console, ADR-0054). */
  async computeForTx(tx: Prisma.TransactionClient): Promise<SetupStatusDTO> {
    const today = toDbDate(todayInRome());
    const [sectors, rows, activeUmbrellas, timeSlots, usable] = await Promise.all([
      tx.sector.count(),
      tx.row.count(),
      tx.umbrella.count({ where: { retiredAt: null } }),
      tx.timeSlot.count(),
      tx.season.findMany({ where: { endDate: { gte: today } }, select: { id: true } }),
    ]);
    let ratesInUsableSeasons = 0;
    let usableSeasonsWithRates = 0;
    let hasCatchAll = false;
    if (usable.length > 0) {
      const pricings = await tx.pricing.findMany({
        where: { seasonId: { in: usable.map((s) => s.id) } },
        select: { id: true },
      });
      const rates = await tx.rate.findMany({
        where: { pricingId: { in: pricings.map((p) => p.id) } },
        select: {
          pricingId: true, type: true, sectorId: true, rowId: true,
          packageId: true, timeSlotId: true, periodStart: true, periodEnd: true,
        },
      });
      ratesInUsableSeasons = rates.length;
      usableSeasonsWithRates = new Set(rates.map((r) => r.pricingId)).size;
      hasCatchAll = rates.some((r) =>
        r.type === null && r.sectorId === null && r.rowId === null &&
        r.packageId === null && r.timeSlotId === null && r.periodStart === null && r.periodEnd === null);
    }
    return computeSetupStatus({
      sectors, rows, activeUmbrellas, timeSlots,
      usableSeasons: usable.length, ratesInUsableSeasons, usableSeasonsWithRates, hasCatchAll,
    });
  }
}
