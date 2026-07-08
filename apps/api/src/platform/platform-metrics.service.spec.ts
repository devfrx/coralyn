import { NotFoundException } from '@nestjs/common';
import { PlatformMetricsService } from './platform-metrics.service';

function makeTx() {
  return {
    sector: { count: jest.fn().mockResolvedValue(2) },
    row: { count: jest.fn().mockResolvedValue(5) },
    umbrella: { count: jest.fn().mockResolvedValue(10) },
    season: { findFirst: jest.fn().mockResolvedValue({ startDate: new Date('2026-05-01'), endDate: new Date('2026-09-30') }) },
    booking: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    bookingCoverage: {
      findMany: jest.fn(),
    },
  };
}

function makeService(tx: ReturnType<typeof makeTx>, establishmentOverrides: Record<string, jest.Mock> = {}, userCount = 3) {
  const prisma = {
    forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx),
    user: { count: jest.fn().mockResolvedValue(userCount) },
    establishment: { findMany: jest.fn(), findUnique: jest.fn(), ...establishmentOverrides },
  } as any;
  return { service: new PlatformMetricsService(prisma), prisma };
}

describe('PlatformMetricsService', () => {
  const EST = { id: 'e-1', name: 'Lido A', createdAt: new Date('2026-01-02T00:00:00Z'), suspendedAt: null };

  it('metricsFor: compone il DTO PII-free da count/sum/aggregate', async () => {
    const tx = makeTx();
    tx.booking.aggregate
      .mockResolvedValueOnce({ _max: { createdAt: new Date('2026-06-30T10:00:00Z') } }) // lastActivity
      .mockResolvedValueOnce({ _sum: { amountCollected: 1234 } }); // revenueSeason
    tx.booking.count
      .mockResolvedValueOnce(7)   // bookingsThisSeason
      .mockResolvedValueOnce(4);  // activeSubscriptions
    tx.bookingCoverage.findMany.mockResolvedValue([{ umbrellaId: 'u1' }, { umbrellaId: 'u2' }]); // occupied distinct
    const { service } = makeService(tx);

    const dto = await service.metricsFor(EST);

    expect(dto).toEqual({
      id: 'e-1', name: 'Lido A',
      createdAt: '2026-01-02T00:00:00.000Z', suspendedAt: null,
      sectors: 2, rows: 5, umbrellas: 10,
      staffUsersActive: 3,
      lastActivityAt: '2026-06-30T10:00:00.000Z',
      revenueSeasonTotal: 1234, activeSubscriptions: 4, bookingsThisSeason: 7,
      occupancyPctToday: 20, // 2 occupati / 10 ombrelloni
    });
  });

  it('metricsFor: senza stagione attiva → revenue e bookingsThisSeason a 0', async () => {
    const tx = makeTx();
    tx.season.findFirst.mockResolvedValue(null);
    tx.booking.aggregate.mockResolvedValueOnce({ _max: { createdAt: null } }); // lastActivity solo (no revenue call)
    tx.booking.count.mockResolvedValueOnce(1); // activeSubscriptions
    tx.bookingCoverage.findMany.mockResolvedValue([]);
    const { service } = makeService(tx);

    const dto = await service.metricsFor(EST);
    expect(dto.revenueSeasonTotal).toBe(0);
    expect(dto.bookingsThisSeason).toBe(0);
    expect(dto.lastActivityAt).toBeNull();
    expect(dto.occupancyPctToday).toBe(0);
  });

  it('getOne: 404 se il lido non esiste', async () => {
    const tx = makeTx();
    const { service } = makeService(tx, { findUnique: jest.fn().mockResolvedValue(null) });
    await expect(service.getOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
