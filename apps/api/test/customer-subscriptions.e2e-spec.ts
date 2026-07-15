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
import { provisionCustomerAccess, activateCustomer } from './helpers/customer-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

/** Data futura (Roma) + n giorni, formato 'yyyy-mm-dd'. Mirror del fix bookings.e2e-spec:
 *  le date relative a "oggi" evitano che i test marciscano col passare del tempo (guard PAST_DATE). */
const relativeFutureDate = (n = 3): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('Customer subscriptions channel (D-035 S4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tenant A
  let sA: string;
  let adminTokenA: string;
  let idsA: MapSeedIds;
  let umbrellaSeq = 0;

  // Cliente "principale" di A: usato SOLO in test read-only (mai mutato), così
  // `me/subscriptions` resta stabile a 1 elemento per tutta la suite.
  let customerIdA: string;
  let bookingIdA: string;
  let accessTokenA: string;

  // Tenant B (isolamento cross-tenant/cross-customer)
  let sB: string;
  let adminTokenB: string;
  let idsB: MapSeedIds;
  let customerIdB: string;
  let bookingIdB: string;

  const customerIds: string[] = [];
  const bookingIds: string[] = [];

  beforeAll(async () => {
    // Suite funzionale: limite alto così le molte chiamate /customer/* non scatenano 429 spuri
    // (il throttler è controller-scoped, D-027; il 429 vero è testato in customer-throttle.e2e).
    process.env.CUSTOMER_THROTTLE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    sA = (await prisma.establishment.create({ data: { name: 'CS A' } })).id;
    await createUser(prisma, { email: 'cs.admin.a@e2e.test', password: 'pw1', role: Role.admin, establishmentId: sA });
    adminTokenA = await login(app, 'cs.admin.a@e2e.test', 'pw1');
    idsA = await seedMapTenant(prisma, sA);

    sB = (await prisma.establishment.create({ data: { name: 'CS B' } })).id;
    await createUser(prisma, { email: 'cs.admin.b@e2e.test', password: 'pw1', role: Role.admin, establishmentId: sB });
    adminTokenB = await login(app, 'cs.admin.b@e2e.test', 'pw1');
    idsB = await seedMapTenant(prisma, sB);

    // Cliente + abbonamento "principale" di A (consenso ON, mai toccato dalle mutazioni).
    const mainCustomer = await prisma.forTenant(sA, (tx) =>
      tx.customer.create({ data: { establishmentId: sA, firstName: 'Mario', lastName: 'Rossi' } }),
    );
    customerIdA = mainCustomer.id;
    customerIds.push(customerIdA);
    const uMain = await makeUmbrella(sA, idsA.rowId, 'Main');
    const subMain = await insertBookingWithCoverage(prisma, sA, {
      establishmentId: sA, customerId: customerIdA, umbrellaId: uMain, timeSlotId: idsA.slotMorning,
      startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31'),
      type: 'subscription', absenceConsentAt: new Date(),
    });
    bookingIdA = subMain.id;
    bookingIds.push(bookingIdA);

    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, bookingIdA);
    const activated = await activateCustomer(app, enrollmentToken, pin);
    accessTokenA = activated.accessToken;

    // Cliente + abbonamento di B (isolamento).
    const customerB = await prisma.forTenant(sB, (tx) =>
      tx.customer.create({ data: { establishmentId: sB, firstName: 'Luigi', lastName: 'Verdi' } }),
    );
    customerIdB = customerB.id;
    const uB = await makeUmbrella(sB, idsB.rowId, 'B-main');
    const subB = await insertBookingWithCoverage(prisma, sB, {
      establishmentId: sB, customerId: customerIdB, umbrellaId: uB, timeSlotId: idsB.slotMorning,
      startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31'),
      type: 'subscription', absenceConsentAt: new Date(),
    });
    bookingIdB = subB.id;
  });

  afterAll(async () => {
    await prisma.customerSession.deleteMany({ where: { customerId: { in: [...customerIds, customerIdB] } } });
    await prisma.customerEnrollmentToken.deleteMany({ where: { customerId: { in: [...customerIds, customerIdB] } } });
    await prisma.forTenant(sA, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(sA, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, sA);
    await prisma.forTenant(sB, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(sB, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, sB);
    await prisma.user.deleteMany({ where: { email: { in: ['cs.admin.a@e2e.test', 'cs.admin.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [sA, sB] } } });
    delete process.env.CUSTOMER_THROTTLE_LIMIT;
    await app.close();
  });

  /** Ombrellone dedicato per tenant (label univoca): ogni abbonamento full-season ha bisogno del
   *  proprio ombrellone per non collidere con l'anti-overlap (constraint DB coverage_no_overlap). */
  async function makeUmbrella(tenantId: string, rowId: string, label: string): Promise<string> {
    const u = await prisma.forTenant(tenantId, (tx) =>
      tx.umbrella.create({
        data: { establishmentId: tenantId, rowId, umbrellaTypeId: null, label: `${label}-${(umbrellaSeq += 1)}`, logicalOrder: 100 + umbrellaSeq },
      }),
    );
    return u.id;
  }

  /** Crea un cliente + abbonamento (consenso ON) DEDICATO in tenant A, con la propria sessione
   *  attivata. Isolato dal cliente "principale" così le mutazioni di coverage/rilasci non
   *  interferiscono con i test read-only su `customerIdA`/`bookingIdA`. */
  async function makeSubscriptionWithAccess(): Promise<{ customerId: string; bookingId: string; accessToken: string }> {
    const customer = await prisma.forTenant(sA, (tx) =>
      tx.customer.create({ data: { establishmentId: sA, firstName: 'Test', lastName: `Cliente${(umbrellaSeq += 1)}` } }),
    );
    const u = await makeUmbrella(sA, idsA.rowId, 'Sub');
    const booking = await insertBookingWithCoverage(prisma, sA, {
      establishmentId: sA, customerId: customer.id, umbrellaId: u, timeSlotId: idsA.slotMorning,
      startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31'),
      type: 'subscription', absenceConsentAt: new Date(),
    });
    customerIds.push(customer.id);
    bookingIds.push(booking.id);

    const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminTokenA, booking.id);
    const { accessToken } = await activateCustomer(app, enrollmentToken, pin);
    return { customerId: customer.id, bookingId: booking.id, accessToken };
  }

  it('GET /customer/me/subscriptions → solo i propri abbonamenti', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/customer/me/subscriptions')
      .set(...bearer(accessTokenA))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(bookingIdA);
    expect(res.body[0].type).toBe('subscription');
  });

  it('me/subscriptions di A non contiene mai booking di B (cross-tenant/customer)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/customer/me/subscriptions')
      .set(...bearer(accessTokenA))
      .expect(200);
    expect(res.body.every((b: { id: string }) => b.id !== bookingIdB)).toBe(true);
  });

  it('POST release cliente → carve coverage + source=customer', async () => {
    const { bookingId, accessToken } = await makeSubscriptionWithAccess();
    const date = relativeFutureDate();

    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingId}/absence-releases`)
      .set(...bearer(accessToken))
      .send({ date })
      .expect(200);

    const rel = await prisma.forTenant(sA, (tx) =>
      tx.absenceRelease.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } }));
    expect(rel).not.toBeNull();
    expect(rel!.source).toBe('customer');
  });

  it('OWNERSHIP: cliente A non può liberare un abbonamento di B → 404', async () => {
    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingIdB}/absence-releases`)
      .set(...bearer(accessTokenA))
      .send({ date: relativeFutureDate() })
      .expect(404); // stesso codice di "non trovato": nessun leak d'esistenza
  });

  it("OWNERSHIP (IDOR same-tenant): A non può liberare l'abbonamento di un altro cliente dello stesso lido → 404", async () => {
    // Stesso tenant (sA) di accessTokenA: qui la RLS lascia passare la riga, quindi il 404
    // può venire SOLO dal filtro actingCustomerId (ownership) in bookings.service.ts.
    const { bookingId: bookingIdC } = await makeSubscriptionWithAccess();

    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingIdC}/absence-releases`)
      .set(...bearer(accessTokenA))
      .send({ date: relativeFutureDate() })
      .expect(404);
  });

  it('OWNERSHIP: bookingId inesistente → 404', async () => {
    await request(app.getHttpServer())
      .post('/api/customer/subscriptions/00000000-0000-0000-0000-0000000000fa/absence-releases')
      .set(...bearer(accessTokenA))
      .send({ date: relativeFutureDate() })
      .expect(404);
  });

  it('CANCEL cliente su giorno rivenduto → 409 RESOLD', async () => {
    const { bookingId, accessToken } = await makeSubscriptionWithAccess();
    const date = relativeFutureDate();

    // 1) il cliente rilascia il giorno D (carve del buco in coverage).
    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingId}/absence-releases`)
      .set(...bearer(accessToken))
      .send({ date })
      .expect(200);

    const rel = await prisma.forTenant(sA, (tx) =>
      tx.absenceRelease.findFirst({ where: { bookingId }, orderBy: { createdAt: 'desc' } }));
    expect(rel).not.toBeNull();

    // 2) l'operatore rivende quel giorno: prenotazione giornaliera confermata sullo stesso
    //    ombrellone+fascia sul buco appena carvato. Serve l'umbrella/slot dell'abbonamento rilasciato.
    const booking = await prisma.forTenant(sA, (tx) => tx.booking.findFirst({ where: { id: bookingId } }));
    const day = new Date(`${date}T00:00:00.000Z`);
    const walkIn = await prisma.forTenant(sA, (tx) =>
      tx.customer.create({ data: { establishmentId: sA, firstName: 'Walk', lastName: 'In' } }),
    );
    customerIds.push(walkIn.id);
    await insertBookingWithCoverage(prisma, sA, {
      establishmentId: sA, customerId: walkIn.id, umbrellaId: booking!.umbrellaId, timeSlotId: booking!.timeSlotId,
      startDate: day, endDate: day,
    });

    // 3) il cliente prova ad annullare la propria release → 409 (il giorno è stato rivenduto).
    await request(app.getHttpServer())
      .post(`/api/customer/subscriptions/${bookingId}/absence-releases/${rel!.id}/cancel`)
      .set(...bearer(accessToken))
      .expect(409);
  });

  it('SICUREZZA (cross-auth): il token cliente NON autentica sulle rotte staff (JwtAuthGuard) → 401', async () => {
    // Stesso JWT_SECRET di staff e cliente: senza un check esplicito su `kind`,
    // un token cliente (kind='customer', no `role`) verifica correttamente la firma
    // e passerebbe la JwtAuthGuard staff (RolesGuard lascia passare le rotte senza @Roles).
    await request(app.getHttpServer())
      .get('/api/bookings')
      .query({ date: relativeFutureDate() })
      .set(...bearer(accessTokenA))
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/customers')
      .set(...bearer(accessTokenA))
      .expect(401);
  });

  it('REGRESSIONE: endpoint operatore restano source=operator', async () => {
    // Abbonamento separato: nessuna sessione cliente necessaria (flusso operatore puro).
    const u = await makeUmbrella(sA, idsA.rowId, 'Ops');
    const opsCustomer = await prisma.forTenant(sA, (tx) =>
      tx.customer.create({ data: { establishmentId: sA, firstName: 'Ops', lastName: 'Customer' } }),
    );
    customerIds.push(opsCustomer.id);
    const sub = await insertBookingWithCoverage(prisma, sA, {
      establishmentId: sA, customerId: opsCustomer.id, umbrellaId: u, timeSlotId: idsA.slotMorning,
      startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31'),
      type: 'subscription', absenceConsentAt: new Date(),
    });
    bookingIds.push(sub.id);
    const date = relativeFutureDate();

    await request(app.getHttpServer())
      .post(`/api/bookings/${sub.id}/absence-releases`)
      .set(...bearer(adminTokenA))
      .send({ date })
      .expect(200);

    const rel = await prisma.forTenant(sA, (tx) =>
      tx.absenceRelease.findFirst({ where: { bookingId: sub.id }, orderBy: { createdAt: 'desc' } }));
    expect(rel).not.toBeNull();
    expect(rel!.source).toBe('operator');
  });
});
