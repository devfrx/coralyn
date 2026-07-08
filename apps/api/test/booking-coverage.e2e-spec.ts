import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';

/**
 * Test della BookingCoverage (D-013 sospensione spec 1/2, ADR-0046). Verifica:
 * - che l'app scriva effettivamente la coverage a ogni prenotazione (1:1 sul percorso di scrittura);
 * - che il constraint coverage_no_overlap (l'UNICO garante anti-overlap, ADR-0037/ADR-0046) abbia
 *   semantica identica al vecchio booking_no_overlap ormai dismesso;
 * - che il trigger di propagazione status Booking → BookingCoverage funzioni.
 */
describe('BookingCoverage (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let ids: MapSeedIds;
  let customerId: string;
  let token1: string;
  let fullDaySlot: string; // Giorno Intero 08-19

  const D = new Date('2026-07-20T00:00:00Z');
  const DStr = '2026-07-20';

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Coverage E2E' } })).id;
    await createUser(prisma, { email: 'admin.cov@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    token1 = await login(app, 'admin.cov@e2e.test', 'pw1');
    ids = await seedMapTenant(prisma, s1);
    await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Cov', lastName: 'Erage' } }),
      )
    ).id;
    fullDaySlot = (
      await prisma.forTenant(s1, (tx) =>
        tx.timeSlot.create({
          data: {
            establishmentId: s1,
            name: 'Giorno Intero',
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T19:00:00Z'),
            sortOrder: 9,
          },
        }),
      )
    ).id;
  });

  afterEach(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: 'admin.cov@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('creando una prenotazione via API esiste 1 coverage con lo stesso span e minuti (Mattina 08-13 → 480/780)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set(...bearer(token1))
      .send({ customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: DStr })
      .expect(201);

    const coverages = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findMany({ where: { bookingId: res.body.id } }),
    );
    expect(coverages).toHaveLength(1);
    const c = coverages[0];
    expect(c.umbrellaId).toBe(ids.u1);
    expect(c.status).toBe('confirmed');
    expect(c.startDate.toISOString().slice(0, 10)).toBe(DStr);
    expect(c.endDate.toISOString().slice(0, 10)).toBe(DStr);
    expect([c.slotStartMin, c.slotEndMin]).toEqual([480, 780]);
  });

  it('coverage_no_overlap: due coverage dirette sovrapposte (stesso ombrellone/fascia/date) → 23P01', async () => {
    await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
    });
    await expect(
      insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
      }),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
  });

  it('fasce contigue (Mattina 08-13 + Pomeriggio 13-19) → accettate', async () => {
    await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
    });
    await expect(
      insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D,
      }),
    ).resolves.toBeDefined();
  });

  it('Giorno Intero (08-19) vs Mattina (08-13), stesso ombrellone/data → rifiutato (semantica oraria)', async () => {
    await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
    });
    await expect(
      insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: fullDaySlot, startDate: D, endDate: D,
      }),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
  });

  it('coverage cancelled non blocca (partial WHERE status=confirmed)', async () => {
    await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
      status: 'cancelled',
    });
    await expect(
      insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1, customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D,
      }),
    ).resolves.toBeDefined();
  });

  it('trigger status-sync: Booking.status="cancelled" → la sua coverage diventa "cancelled"', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set(...bearer(token1))
      .send({ customerId, umbrellaId: ids.u2, timeSlotId: ids.slotMorning, type: 'daily', startDate: DStr })
      .expect(201);

    await prisma.forTenant(s1, (tx) =>
      tx.booking.update({ where: { id: res.body.id }, data: { status: 'cancelled' } }),
    );

    const coverage = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findFirstOrThrow({ where: { bookingId: res.body.id } }),
    );
    expect(coverage.status).toBe('cancelled');
  });
});
