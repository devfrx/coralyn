import { Injectable } from '@nestjs/common';
import type { DayMapDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { projectDayMap, type MapSource } from './map.projection';
import { resolveDate } from '../common/dates';

@Injectable()
export class MapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getDayMap(date?: string): Promise<DayMapDTO> {
    const tenantId = this.tenant.require();
    const day = resolveDate(date);
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
      const dayDate = new Date(`${day}T00:00:00Z`);
      const bookings = await tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        orderBy: { createdAt: 'asc' },
        select: { umbrellaId: true, timeSlotId: true, type: true },
      });
      return { umbrellaTypes, timeSlots, sectors, bookings };
    });
    return projectDayMap(day, source);
  }
}
