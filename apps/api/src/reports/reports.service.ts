import { Injectable } from '@nestjs/common';
import type { ReportSummaryDTO, ReportPeriod } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { MapService } from '../map/map.service';
import { RenewalCampaignsService } from '../bookings/renewal-campaigns.service';
import { revenueKpi, revenueBuckets, occupancyPct, stateMix, occupancyStates } from './report.projection';
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
      // L'incasso è quello INCASSATO nel periodo. La week (e la serie giornaliera) usa gli ultimi 7 giorni;
      // la season somma l'intera stagione attiva (se presente), altrimenti ripiega sulla week.
      let revenueFrom = weekAgo;
      if (period === 'season') {
        const activeSeason = await tx.season.findFirst({
          where: { startDate: { lte: today }, endDate: { gte: today } },
          select: { startDate: true },
        });
        if (activeSeason) revenueFrom = activeSeason.startDate;
      }
      const paid = await tx.booking.findMany({
        where: { collectionDate: { gte: revenueFrom, lte: today } },
        select: { collectionDate: true, amountCollected: true },
      });
      // «Da incassare» = credito ancora esigibile. Esclude gli annullati (status='cancelled', già fuori dal
      // filtro 'confirmed') e i DISDETTI (terminatedAt≠null): un disdetto resta 'confirmed' ma il contratto è
      // sciolto → il suo residuo non è più esigibile (§4.3, def. "crediti reali": gli scaduti restano inclusi).
      const unpaid = await tx.booking.findMany({
        where: { status: 'confirmed', paymentStatus: { not: 'paid' }, terminatedAt: null },
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
    const states = occupancyStates(dayMap);
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
        umbrellaLabel: uById.get(w.umbrellaId) ?? '–',
        seniority: w.seniority,
        deadline: campaign.deadline,
      }));
    });
  }
}
