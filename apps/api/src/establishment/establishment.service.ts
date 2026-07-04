import { Injectable } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { todayInRome } from '../common/dates';
import { toEstablishmentOverview } from './establishment.projection';

@Injectable()
export class EstablishmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getOverview(): Promise<EstablishmentOverviewDTO> {
    const tenantId = this.tenant.require();
    const todayIso = todayInRome();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [establishment, seasons, timeSlots, users, sectors, umbrellas, types, packages] = await Promise.all([
        tx.establishment.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true } }),
        tx.season.findMany({ select: { name: true, startDate: true, endDate: true } }),
        tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
        tx.user.findMany({ where: { establishmentId: tenantId }, select: { id: true, email: true, role: true } }),
        tx.sector.count(),
        tx.umbrella.count(),
        tx.umbrellaType.count(),
        tx.package.count({ where: { archivedAt: null } }),
      ]);
      return toEstablishmentOverview({
        establishment,
        seasons,
        timeSlots,
        users, // il select restituisce già { id, email, role }: nessun re-map necessario
        structure: { sectors, umbrellas, types, packages },
        todayIso,
      });
    });
  }
}
