import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Customer access provisioning (D-035 S3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminToken: string;
  let staffToken: string;
  let ids: MapSeedIds;
  let customerId: string;
  let bookingId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'CA A' } })).id;
    await createUser(prisma, { email: 'ca.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'ca.staff@e2e.test', password: 'pw2', role: Role.staff, establishmentId: s1 });
    adminToken = await login(app, 'ca.admin@e2e.test', 'pw1');
    staffToken = await login(app, 'ca.staff@e2e.test', 'pw2');

    ids = await seedMapTenant(prisma, s1);

    const customer = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
    );
    customerId = customer.id;

    const booking = await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1,
      customerId,
      umbrellaId: ids.u1,
      timeSlotId: ids.slotMorning,
      startDate: new Date('2026-07-10'),
      endDate: new Date('2026-07-10'),
    });
    bookingId = booking.id;
  });

  afterAll(async () => {
    await prisma.customerSession.deleteMany({ where: { customerId } });
    await prisma.customerEnrollmentToken.deleteMany({ where: { customerId } });
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['ca.admin@e2e.test', 'ca.staff@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  /** Provisiona un enrollment fresco (admin) e restituisce raw token + pin per l'attivazione. */
  async function provision(): Promise<{ token: string; pin: string }> {
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set(...bearer(adminToken))
      .expect(201);
    // activationUrl è relativo in test (CUSTOMER_APP_URL non settato): estrai il token via regex.
    const token = res.body.activationUrl.match(/token=([^&]+)/)![1];
    return { token, pin: res.body.pin };
  }

  it('POST /bookings/:id/customer-access ritorna activationUrl+pin+expiresAt (admin)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set(...bearer(adminToken))
      .expect(201);

    expect(res.body.activationUrl).toMatch(/\/attiva\?token=.+/);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const live = await prisma.customerEnrollmentToken.findMany({
      where: { customerId, revokedAt: null },
    });
    expect(live).toHaveLength(1);
    expect(live[0].activatedAt).toBeNull();
  });

  it("ri-provisioning invalida l'enrollment precedente (revokedAt) e ne crea uno nuovo", async () => {
    const before = await prisma.customerEnrollmentToken.findMany({ where: { customerId } });
    const firstId = before.find((t) => t.revokedAt === null)!.id;

    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set(...bearer(adminToken))
      .expect(201);

    const after = await prisma.customerEnrollmentToken.findMany({ where: { customerId } });
    const live = after.filter((t) => t.revokedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(firstId);

    const first = after.find((t) => t.id === firstId)!;
    expect(first.revokedAt).not.toBeNull();
  });

  it('nega a un non-admin (staff) -> 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set(...bearer(staffToken))
      .expect(403);
  });

  describe('Customer activate (D-035 S3)', () => {
    it('token+PIN corretti -> { accessToken, refreshToken }, consuma il one-time', async () => {
      const { token, pin } = await provision();

      const res = await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: token, pin })
        .expect(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');

      // seconda attivazione con lo stesso token -> 401 (one-time già consumato)
      await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: token, pin })
        .expect(401);
    });

    it('PIN errato -> 401 generico e incrementa i tentativi; oltre soglia -> lock (revokedAt)', async () => {
      const { token, pin } = await provision();
      const wrong = pin === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/customer/activate')
          .send({ enrollmentToken: token, pin: wrong })
          .expect(401);
      }
      // soglia superata: ora anche col PIN GIUSTO -> 401 (enrollment revocato/lock)
      await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: token, pin })
        .expect(401);
    });

    it('token inesistente -> 401 generico', async () => {
      await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: 'nope', pin: '123456' })
        .expect(401);
    });
  });
});
