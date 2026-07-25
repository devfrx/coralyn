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

describe('Customer access provisioning (D-035 S3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: TenantId;
  let adminToken: string;
  let staffToken: string;
  let ids: MapSeedIds;
  let customerId: string;
  let bookingId: string;
  // Tenant B: usato solo dai test di isolamento (Task 10).
  let s2: TenantId;
  let adminToken2: string;
  let customerId2: string;
  let bookingId2: string;

  beforeAll(async () => {
    // Suite funzionale: limite alto così le molte chiamate /customer/* non scatenano 429 spuri
    // (il throttler è controller-scoped, D-027). Il 429 vero è testato in customer-throttle.e2e.
    process.env.CUSTOMER_THROTTLE_LIMIT = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = await createEstablishment(prisma, 'CA A');
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

    // Tenant B (isolamento): stabilimento + admin + mappa + customer + booking-subscription.
    s2 = await createEstablishment(prisma, 'CA B');
    await createUser(prisma, { email: 'cb.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s2 });
    adminToken2 = await login(app, 'cb.admin@e2e.test', 'pw1');

    const ids2 = await seedMapTenant(prisma, s2);
    const customerB = await prisma.forTenant(s2, (tx) =>
      tx.customer.create({ data: { establishmentId: s2, firstName: 'Luigi', lastName: 'Verdi' } }),
    );
    customerId2 = customerB.id;
    const bookingB = await insertBookingWithCoverage(prisma, s2, {
      establishmentId: s2,
      customerId: customerId2,
      umbrellaId: ids2.u1,
      timeSlotId: ids2.slotMorning,
      startDate: new Date('2026-07-10'),
      endDate: new Date('2026-07-10'),
    });
    bookingId2 = bookingB.id;
  });

  afterAll(async () => {
    await prisma.customerSession.deleteMany({ where: { customerId: { in: [customerId, customerId2] } } });
    await prisma.customerEnrollmentToken.deleteMany({ where: { customerId: { in: [customerId, customerId2] } } });
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.forTenant(s2, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({
      where: { email: { in: ['ca.admin@e2e.test', 'ca.staff@e2e.test', 'cb.admin@e2e.test'] } },
    });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    delete process.env.CUSTOMER_THROTTLE_LIMIT;
    await app.close();
  });

  /** Provisiona un enrollment fresco (admin) e restituisce raw token + pin per l'attivazione.
   *  Default sul tenant A; parametrizzabile per l'isolamento cross-tenant (Task 10).
   *  Thin wrapper sull'helper condiviso (DRY per S4): adatta solo la forma del ritorno
   *  ({ token, pin }) ai call-site esistenti di questo spec. */
  async function provision(
    bId: string = bookingId,
    aToken: string = adminToken,
  ): Promise<{ token: string; pin: string }> {
    const { enrollmentToken, pin } = await provisionCustomerAccess(app, aToken, bId);
    return { token: enrollmentToken, pin };
  }

  /** Provisiona + attiva: restituisce la coppia { accessToken, refreshToken } di una sessione viva. */
  async function activate(): Promise<{ accessToken: string; refreshToken: string }> {
    const { token, pin } = await provision();
    return activateCustomer(app, token, pin);
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

    it('tentativi PIN CONCORRENTI: 5 richieste parallele consumano 5 slot e lasciano il lock (P2-008)', async () => {
      const { token, pin } = await provision();
      const wrong = pin === '000000' ? '111111' : '000000';

      // Il contatore era un read-modify-write: N richieste che leggono lo stesso valore prima che
      // una qualsiasi scriva consumano UN solo slot. Con un PIN a 6 cifre e la soglia a 5, il lock
      // e' l'unica difesa specifica contro il brute-force, e chi attacca non fa richieste in fila.
      await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post('/api/customer/activate')
            .send({ enrollmentToken: token, pin: wrong })
            .expect(401),
        ),
      );

      const row = await prisma.customerEnrollmentToken.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
      expect(row?.pinAttempts).toBe(5);
      expect(row?.revokedAt).not.toBeNull(); // e nessun ramo ha riazzerato la revoca
    });

    it('token inesistente -> 401 generico', async () => {
      await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: 'nope', pin: '123456' })
        .expect(401);
    });
  });

  describe('Customer refresh (D-035 S3)', () => {
    it('refresh valido -> ruota (nuovo refresh) e nuovo accessToken', async () => {
      const first = await activate();

      const r = await request(app.getHttpServer())
        .post('/api/customer/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(r.body.refreshToken).not.toBe(first.refreshToken); // ruotato
      expect(typeof r.body.accessToken).toBe('string');
    });

    it("riuso di un refresh già ruotato -> 401 e REVOCA l'intera catena della sessione", async () => {
      const first = await activate();
      const rotated = await request(app.getHttpServer())
        .post('/api/customer/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      // riuso del vecchio refresh (già ruotato) -> furto sospetto
      await request(app.getHttpServer())
        .post('/api/customer/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);

      // ora anche il refresh nuovo è morto (catena revocata)
      await request(app.getHttpServer())
        .post('/api/customer/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
    });
  });

  describe('Customer me + logout (D-035 S3)', () => {
    it('GET /customer/me con access JWT -> profilo del cliente', async () => {
      const { accessToken } = await activate();

      const r = await request(app.getHttpServer())
        .get('/api/customer/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(r.body).toMatchObject({
        customerId: expect.any(String),
        firstName: expect.any(String),
        establishmentName: expect.any(String),
      });
    });

    it('GET /customer/me senza token -> 401', async () => {
      await request(app.getHttpServer()).get('/api/customer/me').expect(401);
    });

    it('logout revoca la sessione: il refresh non ruota più', async () => {
      const { refreshToken } = await activate();

      await request(app.getHttpServer())
        .post('/api/customer/logout')
        .send({ refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/api/customer/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('Customer channel isolation (D-035 S3, sicurezza)', () => {
    it('un access JWT del tenant A non risolve dati del tenant B', async () => {
      const { accessToken } = await activate(); // sessione del cliente di A

      const r = await request(app.getHttpServer())
        .get('/api/customer/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(r.body.establishmentName).toBe('CA A'); // mai 'CA B'
    });

    it("l'enrollment del tenant A non è attivabile con il PIN del tenant B", async () => {
      const a = await provision(); // tenant A: tokenA + pinA
      const b = await provision(bookingId2, adminToken2); // tenant B: tokenB + pinB

      // token di A con PIN di B -> 401 (il PIN è legato al singolo enrollment)
      await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: a.token, pin: b.pin })
        .expect(401);
    });
  });

  describe('Customer access status (D-051)', () => {
    let freshBookingId: string;

    beforeAll(async () => {
      const c = await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Nuovo', lastName: 'Cliente' } }),
      );
      const b = await insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1,
        customerId: c.id,
        umbrellaId: ids.u1,
        timeSlotId: ids.slotMorning,
        startDate: new Date('2026-07-11'),
        endDate: new Date('2026-07-11'),
      });
      freshBookingId = b.id;
    });

    it("stato 'none' prima di qualsiasi provisioning", async () => {
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body).toEqual({ state: 'none', lastActivatedAt: null });
    });

    it("stato 'issued' dopo il provisioning", async () => {
      await provisionCustomerAccess(app, adminToken, freshBookingId);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('issued');
      expect(r.body.lastActivatedAt).toBeNull();
    });

    it("stato 'active' dopo l'attivazione", async () => {
      const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminToken, freshBookingId);
      await activateCustomer(app, enrollmentToken, pin);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('active');
      expect(r.body.lastActivatedAt).not.toBeNull();
    });

    it("stato 'revoked' dopo la revoca", async () => {
      await provisionCustomerAccess(app, adminToken, freshBookingId);
      await request(app.getHttpServer())
        .post(`/api/bookings/${freshBookingId}/customer-access/revoke`)
        .set(...bearer(adminToken))
        .expect(204);
      const r = await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(r.body.state).toBe('revoked');
    });

    it('admin del tenant A su booking del tenant B -> 404 (nessun leak cross-tenant)', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${bookingId2}/customer-access`)
        .set(...bearer(adminToken))
        .expect(404);
    });

    it('non-admin (staff) -> 403', async () => {
      await request(app.getHttpServer())
        .get(`/api/bookings/${freshBookingId}/customer-access`)
        .set(...bearer(staffToken))
        .expect(403);
    });
  });

  describe('Cross-tenant lato OPERATORE sulle SCRITTURE (P6-020)', () => {
    /**
     * L'isolamento cross-tenant lato operatore è già coperto altrove per bookings, packages,
     * equipment-types, campagne e time-slot — ma su `customer-access` esisteva solo per la
     * LETTURA dello stato (il test 404 del blocco D-051). Le due scritture sono quelle che
     * contano davvero: `provision` consegna a chi chiama un QR + PIN **funzionanti**, `revoke`
     * stacca un cliente dal suo abbonamento. Su queste il 404 non è una formalità.
     *
     * Ogni test asserisce anche l'ASSENZA di effetto collaterale: un 404 restituito dopo aver
     * comunque scritto sarebbe indistinguibile da un 404 corretto, se si guardasse solo il codice.
     */
    let bookingA: string;

    beforeAll(async () => {
      const c = await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Cross', lastName: 'Tenant' } }),
      );
      const b = await insertBookingWithCoverage(prisma, s1, {
        establishmentId: s1,
        customerId: c.id,
        umbrellaId: ids.u2,
        timeSlotId: ids.slotMorning,
        startDate: new Date('2026-07-12'),
        endDate: new Date('2026-07-12'),
      });
      bookingA = b.id;
    });

    it("l'admin del tenant B non provisiona l'accesso su una booking del tenant A → 404, e nulla viene emesso", async () => {
      await request(app.getHttpServer())
        .post(`/api/bookings/${bookingA}/customer-access`)
        .set(...bearer(adminToken2))
        .expect(404);

      const stato = await request(app.getHttpServer())
        .get(`/api/bookings/${bookingA}/customer-access`)
        .set(...bearer(adminToken))
        .expect(200);
      expect(stato.body).toEqual({ state: 'none', lastActivatedAt: null });
    });

    it("l'admin del tenant B non revoca l'accesso di una booking del tenant A → 404, e il cliente resta attivabile", async () => {
      const { enrollmentToken, pin } = await provisionCustomerAccess(app, adminToken, bookingA);

      await request(app.getHttpServer())
        .post(`/api/bookings/${bookingA}/customer-access/revoke`)
        .set(...bearer(adminToken2))
        .expect(404);

      // La prova che conta non è il codice HTTP: è che l'enrollment del cliente di A funziona
      // ancora. Se la revoca fosse passata, questa attivazione sarebbe 401.
      const sessione = await activateCustomer(app, enrollmentToken, pin);
      expect(sessione.accessToken).toEqual(expect.any(String));
    });

    it("l'admin del tenant B non legge lo stato d'accesso di una booking del tenant A → 404", async () => {
      // Il gemello, nella direzione opposta a quella già coperta: lì era A→B, qui è B→A. Con un
      // solo verso un'asimmetria nella risoluzione del tenant resterebbe invisibile.
      await request(app.getHttpServer())
        .get(`/api/bookings/${bookingA}/customer-access`)
        .set(...bearer(adminToken2))
        .expect(404);
    });
  });
});
