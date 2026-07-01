import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OpenRenewalCampaignInput, RenewalCampaignDTO, RenewalCampaignDetailDTO, RenewalWindowState } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { computeSeniority } from './seniority';
import { toRenewalWindowItemDTO } from './renewal-window.projection';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';

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
      const origin = await this.catalog.resolveSeasonWithin(tx, input.originDate);
      if (!origin.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      const dest = await this.catalog.resolveSeasonWithin(tx, input.destinationDate);
      if (!dest.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      if (origin.id === dest.id)
        throw new UnprocessableEntityException('Origine e destinazione devono differire');
      if (dest.startDate <= origin.startDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve seguire quella di origine');
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

  /** Campagna per la stagione che contiene `date` (o null), con le finestre ordinate per anzianità. */
  async getByDestinationDate(date: string): Promise<RenewalCampaignDetailDTO | null> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const dest = await this.catalog.resolveSeasonWithin(tx, date);
      if (!dest.ok) return null;
      const campaign = await tx.renewalCampaign.findFirst({ where: { destinationSeasonId: dest.id } });
      if (!campaign) return null;
      const origin = await tx.season.findFirst({ where: { id: campaign.originSeasonId } });
      if (!origin) return null;

      // Aventi-diritto: abbonati CONFERMATI della stagione di ORIGINE.
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

      const destStart = toDbDate(dest.startDate);
      const destEnd = toDbDate(dest.endDate);
      const deadlineIso = formatDbDate(campaign.deadline);
      const isExpired = todayInRome() > deadlineIso; // today > deadline → scaduta (giorno-scadenza incluso = aperta)

      const windows = subs
        .map((b) => {
          const exercised = b.renewals.some(
            (r) =>
              r.status === 'confirmed' &&
              r.startDate.getTime() <= destEnd.getTime() &&
              r.endDate.getTime() >= destStart.getTime(),
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
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, (tx) => tx.renewalCampaign.deleteMany({ where: { id } }));
    if (removed.count === 0) throw new NotFoundException('Campagna non trovata');
  }
}
