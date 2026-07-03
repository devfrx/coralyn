import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OpenRenewalCampaignInput, RenewalCampaignDTO, RenewalCampaignDetailDTO, RenewalWindowState } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { computeSeniority } from './seniority';
import { toRenewalWindowItemDTO } from './renewal-window.projection';
import { dateRangesOverlap } from './booking.availability';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';
import { UUID_SHAPE } from '../common/uuid';

@Injectable()
export class RenewalCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  /** Apre una campagna di prelazione per la stagione di destinazione (server-autoritativo). */
  async open(input: OpenRenewalCampaignInput): Promise<RenewalCampaignDTO> {
    const tenantId = this.tenant.require();
    const row = await this.prisma.forTenant(tenantId, async (tx) => {
      const origin = await this.catalog.resolveSeasonById(tx, input.originSeasonId);
      if (!origin.ok) throw new UnprocessableEntityException('Stagione di origine non trovata');
      const dest = await this.catalog.resolveSeasonById(tx, input.destinationSeasonId);
      if (!dest.ok) throw new UnprocessableEntityException('Stagione di destinazione non trovata');
      if (origin.id === dest.id)
        throw new UnprocessableEntityException('Origine e destinazione devono differire');
      if (dest.startDate <= origin.endDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve iniziare dopo la fine di quella di origine');
      try {
        return await tx.renewalCampaign.create({
          data: {
            establishmentId: tenantId,
            originSeasonId: origin.id,
            destinationSeasonId: dest.id,
            deadline: toDbDate(input.deadline),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          throw new ConflictException('Campagna già aperta per questa stagione');
        throw e;
      }
    });
    return { id: row.id, originSeasonId: row.originSeasonId, destinationSeasonId: row.destinationSeasonId, deadline: formatDbDate(row.deadline) };
  }

  /** Campagna per la stagione di destinazione (per id), con le finestre ordinate per anzianità. */
  async getByDestinationSeasonId(seasonId: string): Promise<RenewalCampaignDetailDTO | null> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const campaign = await tx.renewalCampaign.findFirst({ where: { destinationSeasonId: seasonId } });
      if (!campaign) return null;
      const origin = await tx.season.findFirst({ where: { id: campaign.originSeasonId } });
      if (!origin) return null;
      const dest = await tx.season.findFirst({ where: { id: campaign.destinationSeasonId } });
      if (!dest) return null;

      // Aventi-diritto: abbonati CONFERMATI della stagione di ORIGINE.
      // Overlap inclusivo con la stagione di origine (cfr. dateRangesOverlap): tenere in sync.
      const subs = await tx.booking.findMany({
        where: {
          type: 'subscription',
          status: 'confirmed',
          startDate: { lte: origin.endDate },
          endDate: { gte: origin.startDate },
        },
        include: { renewals: true },
      });
      const seniorityById = await computeSeniority(tx, subs.map((b) => b.id));

      const destStart = dest.startDate;
      const destEnd = dest.endDate;
      const deadlineIso = formatDbDate(campaign.deadline);
      const isExpired = todayInRome() > deadlineIso; // today > deadline → scaduta (giorno-scadenza incluso = aperta)

      const windows = subs
        .map((b) => {
          const exercised = b.renewals.some(
            (r) =>
              r.status === 'confirmed' &&
              dateRangesOverlap(r.startDate, r.endDate, destStart, destEnd),
          );
          const state: RenewalWindowState = exercised ? 'exercised' : isExpired ? 'expired' : 'open';
          return toRenewalWindowItemDTO(b, seniorityById.get(b.id) ?? 1, state);
        })
        .sort((a, z) => z.seniority - a.seniority || (a.sourceBookingId < z.sourceBookingId ? -1 : 1));

      return {
        id: campaign.id,
        originSeasonId: campaign.originSeasonId,
        destinationSeasonId: campaign.destinationSeasonId,
        deadline: deadlineIso,
        windows,
      };
    });
  }

  /** Chiude/annulla una campagna: gli hold derivati cadono subito. */
  async close(id: string): Promise<void> {
    if (!UUID_SHAPE.test(id)) throw new NotFoundException('Campagna non trovata');
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, (tx) => tx.renewalCampaign.deleteMany({ where: { id } }));
    if (removed.count === 0) throw new NotFoundException('Campagna non trovata');
  }
}
