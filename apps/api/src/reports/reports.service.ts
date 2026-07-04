import { Injectable } from '@nestjs/common';
import type { ReportSummaryDTO, ReportPeriod, SlotState } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { MapService } from '../map/map.service';
import { RenewalCampaignsService } from '../bookings/renewal-campaigns.service';
import { revenueKpi, revenueBuckets, occupancyPct, stateMix } from './report.projection';
import { todayInRome, toDbDate } from '../common/dates';

type ActiveCampaign = Awaited<ReturnType<RenewalCampaignsService['getActiveCampaign']>>;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly map: MapService,
    private readonly renewals: RenewalCampaignsService,
  ) {}

  async getSummary(period: ReportPeriod): Promise<ReportSummaryDTO> {
    const tenantId = this.tenant.require();
    const todayIso = todayInRome();
    const today = toDbDate(todayIso);
    const weekAgo = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

    const { revenueRows, outstanding, activeSubscriptions } = await this.prisma.forTenant(tenantId, async (tx) => {
      const paid = await tx.booking.findMany({
        where: { collectionDate: { gte: weekAgo, lte: today } },
        select: { collectionDate: true, amountCollected: true },
      });
      const unpaid = await tx.booking.findMany({
        where: { status: 'confirmed', paymentStatus: { not: 'paid' } },
        select: { totalPrice: true, amountCollected: true },
      });
      const activeSubscriptions = await tx.booking.count({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
      });
      return {
        revenueRows: paid.map((p) => ({
          date: p.collectionDate!.toISOString().slice(0, 10),
          amount: Number(p.amountCollected),
        })),
        outstanding: unpaid.reduce((s, b) => s + (Number(b.totalPrice) - Number(b.amountCollected)), 0),
        activeSubscriptions,
      };
    });

    const dayMap = await this.map.getDayMap(todayIso);
    const states: SlotState[] = [];
    for (const sector of dayMap.sectors)
      for (const row of sector.rows)
        for (const u of row.umbrellas)
          for (const slot of dayMap.timeSlots) states.push(u.stateBySlot[slot.id] ?? 'free');
    const occupied = states.filter((s) => s !== 'free').length;

    const campaign = await this.renewals.getActiveCampaign();
    const expiringRenewals = await this.enrichRenewals(tenantId, campaign);

    return {
      period,
      kpis: {
        revenue: revenueKpi(revenueRows, period, todayIso),
        outstanding,
        occupancyPct: occupancyPct(occupied, states.length),
        activeSubscriptions,
      },
      revenueSeries: revenueBuckets(revenueRows, period, todayIso),
      umbrellaStateMix: stateMix(states),
      expiringRenewals,
    };
  }

  private async enrichRenewals(
    tenantId: string,
    campaign: ActiveCampaign,
  ): Promise<ReportSummaryDTO['expiringRenewals']> {
    if (!campaign) return [];
    const open = campaign.windows.filter((w) => w.state === 'open');
    if (open.length === 0) return [];
    return this.prisma.forTenant(tenantId, async (tx) => {
      const customers = await tx.customer.findMany({
        where: { id: { in: open.map((w) => w.customerId) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const umbrellas = await tx.umbrella.findMany({
        where: { id: { in: open.map((w) => w.umbrellaId) } },
        select: { id: true, label: true },
      });
      const cById = new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
      const uById = new Map(umbrellas.map((u) => [u.id, u.label]));
      return open.map((w) => ({
        customerId: w.customerId,
        customerName: cById.get(w.customerId) ?? w.customerId,
        umbrellaLabel: uById.get(w.umbrellaId) ?? '—',
        seniority: w.seniority,
        deadline: campaign.deadline,
      }));
    });
  }
}
