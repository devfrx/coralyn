import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';
import { createTestApp } from './helpers/create-test-app';
import { provisionCustomerAccess, activateCustomer } from './helpers/customer-auth';
import { createEstablishment } from './helpers/create-establishment';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Customer informativa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: TenantId;
  let adminToken: string;
  let ids: MapSeedIds;
  let customerAccessToken: string;

  beforeAll(async () => {
    // Suite funzionale: limite alto così le poche chiamate /customer/* non scatenano 429 spuri
    // (il throttler è controller-scoped, D-027; il 429 vero è testato in customer-throttle.e2e).
    process.env.CUSTOMER_THROTTLE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = await createEstablishment(prisma, 'CUSTOMER INFORMATIVA A');
    await createUser(prisma, { email: 'ci.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    adminToken = await login(app, 'ci.admin@e2e.test', 'pw1');
    ids = await seedMapTenant(prisma, s1);

    const customer = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
    );
    const booking = await insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1, customerId: customer.id, umbrellaId: ids.u1, timeSlotId: ids.slotMorning,
      startDate: new Date('2026-07-10'), endDate: new Date('2026-07-10'),
    });

    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminToken, booking.id);
    const activated = await activateCustomer(app, enrollmentToken, pin);
    customerAccessToken = activated.accessToken;
  });

  afterAll(async () => {
    await prisma.customerSession.deleteMany({ where: { establishmentId: s1 } });
    await prisma.customerEnrollmentToken.deleteMany({ where: { establishmentId: s1 } });
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: 'ci.admin@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    delete process.env.CUSTOMER_THROTTLE_LIMIT;
    await app.close();
  });

  it('GET /customer/me/informativa con token cliente → 200 con establishmentName', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/customer/me/informativa')
      .set(...bearer(customerAccessToken))
      .expect(200);
    expect(res.body.establishmentName).toBeDefined();
  });

  it('senza token → 401', async () => {
    await request(app.getHttpServer())
      .get('/api/customer/me/informativa')
      .expect(401);
  });
});
