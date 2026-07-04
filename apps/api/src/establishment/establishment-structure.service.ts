import { Injectable } from '@nestjs/common';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toEstablishmentStructure } from './establishment-structure.projection';

@Injectable()
export class EstablishmentStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getStructure(): Promise<EstablishmentStructureDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [umbrellaTypes, sectors] = await Promise.all([
        tx.umbrellaType.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true, icon: true } }),
        tx.sector.findMany({
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true, sortOrder: true, kind: true,
            rows: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, label: true, sortOrder: true,
                umbrellas: { orderBy: { logicalOrder: 'asc' }, select: { id: true, label: true, umbrellaTypeId: true, logicalOrder: true } } },
            },
          },
        }),
      ]);
      return toEstablishmentStructure({ sectors, umbrellaTypes });
    });
  }
}
