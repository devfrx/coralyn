import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSeasonInput, SeasonDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toDbDate } from '../common/dates';
import { toSeasonDTO } from './season.projection';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<SeasonDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.season.findMany({ orderBy: { startDate: 'asc' } }),
    );
    return rows.map(toSeasonDTO);
  }

  async create(input: CreateSeasonInput): Promise<SeasonDTO> {
    if (input.startDate > input.endDate) {
      throw new BadRequestException('La data di inizio deve precedere la data di fine.');
    }
    const tenantId = this.tenant.require();
    const season = await this.prisma.forTenant(tenantId, async (tx) => {
      const s = await tx.season.create({
        data: {
          establishmentId: tenantId,
          name: input.name,
          startDate: toDbDate(input.startDate),
          endDate: toDbDate(input.endDate),
        },
      });
      // Pricing 1:1 (plumbing, mai esposto): creato insieme alla Season.
      await tx.pricing.create({ data: { establishmentId: tenantId, seasonId: s.id } });
      return s;
    });
    return toSeasonDTO(season);
  }

  async remove(id: string): Promise<SeasonDTO> {
    const tenantId = this.tenant.require();
    // FK ON DELETE RESTRICT su Pricing/Rate: cascata APPLICATIVA (Rate → Pricing → Season)
    // in una singola transazione. Vedi spec §5/§7.
    const season = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.season.findFirst({ where: { id } });
      if (!existing) return null;
      const pricing = await tx.pricing.findFirst({ where: { seasonId: id } });
      if (pricing) {
        await tx.rate.deleteMany({ where: { pricingId: pricing.id } });
        await tx.pricing.delete({ where: { id: pricing.id } });
      }
      await tx.season.delete({ where: { id } });
      return existing;
    });
    if (!season) throw new NotFoundException('Stagione non trovata');
    return toSeasonDTO(season);
  }
}
