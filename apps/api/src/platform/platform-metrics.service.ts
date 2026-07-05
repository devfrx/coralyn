import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { todayInRome, toDbDate } from '../common/dates';
import { occupancyPct } from '../reports/report.projection';

type EstablishmentRow = { id: string; name: string; createdAt: Date; suspendedAt: Date | null };
const EST_SELECT = { id: true, name: true, createdAt: true, suspendedAt: true } as const;

@Injectable()
export class PlatformMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlatformEstablishmentDTO[]> {
    const rows = await this.prisma.establishment.findMany({ select: EST_SELECT, orderBy: { createdAt: 'asc' } });
    return Promise.all(rows.map((r) => this.metricsFor(r)));
  }

  async getOne(id: string): Promise<PlatformEstablishmentDTO> {
    const row = await this.prisma.establishment.findUnique({ where: { id }, select: EST_SELECT });
    if (!row) throw new NotFoundException('Stabilimento non trovato');
    return this.metricsFor(row);
  }

  async metricsFor(est: EstablishmentRow): Promise<PlatformEstablishmentDTO> {
    const today = toDbDate(todayInRome());

    // User è fuori RLS → conteggio con filtro esplicito, senza GUC.
    const staffUsersActive = await this.prisma.user.count({
      where: { establishmentId: est.id, disabledAt: null, role: { in: ['admin', 'staff'] } },
    });

    const agg = await this.prisma.forTenant(est.id, async (tx) => {
      const [sectors, rows, umbrellas] = [await tx.sector.count(), await tx.row.count(), await tx.umbrella.count()];
      const lastBooking = await tx.booking.aggregate({ _max: { createdAt: true } });

      const season = await tx.season.findFirst({
        where: { startDate: { lte: today }, endDate: { gte: today } },
        select: { startDate: true, endDate: true },
      });
      let revenueSeasonTotal = 0;
      let bookingsThisSeason = 0;
      if (season) {
        const paid = await tx.booking.aggregate({
          _sum: { amountCollected: true },
          where: { collectionDate: { gte: season.startDate, lte: season.endDate } },
        });
        revenueSeasonTotal = Number(paid._sum.amountCollected ?? 0);
        bookingsThisSeason = await tx.booking.count({
          where: { status: 'confirmed', startDate: { gte: season.startDate, lte: season.endDate } },
        });
      }

      const activeSubscriptions = await tx.booking.count({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
      });
      const occupied = await tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
        select: { umbrellaId: true },
        distinct: ['umbrellaId'],
      });

      return {
        sectors, rows, umbrellas,
        lastActivityAt: lastBooking._max.createdAt,
        revenueSeasonTotal, bookingsThisSeason, activeSubscriptions,
        occupancyPctToday: occupancyPct(occupied.length, umbrellas),
      };
    });

    return {
      id: est.id,
      name: est.name,
      createdAt: est.createdAt.toISOString(),
      suspendedAt: est.suspendedAt ? est.suspendedAt.toISOString() : null,
      sectors: agg.sectors,
      rows: agg.rows,
      umbrellas: agg.umbrellas,
      staffUsersActive,
      lastActivityAt: agg.lastActivityAt ? agg.lastActivityAt.toISOString() : null,
      revenueSeasonTotal: agg.revenueSeasonTotal,
      activeSubscriptions: agg.activeSubscriptions,
      bookingsThisSeason: agg.bookingsThisSeason,
      occupancyPctToday: agg.occupancyPctToday,
    };
  }
}
