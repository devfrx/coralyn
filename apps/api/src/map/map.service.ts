import { Injectable } from '@nestjs/common';
import type { DayMapDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { projectDayMap, resolveDate, type MapSource } from './map.projection';

@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Map structure for a date (stateBySlot=free in this slice). */
  async getDayMap(date?: string): Promise<DayMapDTO> {
    const tenantId = this.tenant.require();
    const source: MapSource = await this.prisma.forTenant(tenantId, async (tx) => {
      const umbrellaTypes = await tx.umbrellaType.findMany({ orderBy: { sortOrder: 'asc' } });
      const timeSlots = await tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' } });
      const sectors = await tx.sector.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          rows: {
            orderBy: { sortOrder: 'asc' },
            include: { umbrellas: { orderBy: { logicalOrder: 'asc' } } },
          },
        },
      });
      return { umbrellaTypes, timeSlots, sectors };
    });
    return projectDayMap(resolveDate(date), source);
  }
}
