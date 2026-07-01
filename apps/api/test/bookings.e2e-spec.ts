import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let superToken: string;
  let ids: MapSeedIds;
  let customerId: string;
  let packageId: string;
  const D = '2026-07-15';

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Book A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Book B' } })).id;
    await createUser(prisma, { email: 'admin.b1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.b2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    await createUser(prisma, { email: 'super.b@e2e.test', password: 'pws', role: Role.superuser, establishmentId: null });
    token1 = await login(app, 'admin.b1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.b2@e2e.test', 'pw2');
    superToken = await login(app, 'super.b@e2e.test', 'pws');
    ids = await seedMapTenant(prisma, s1);
    packageId = (await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon })).packageId;
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.b1@e2e.test', 'admin.b2@e2e.test', 'super.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const body = (over: Partial<Record<string, unknown>> = {}) => ({
    customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: D, ...over,
  });

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).post('/api/bookings').send(body()).expect(401);
  });

  it('crea una giornaliera → 201 e la mappa mostra daily sulla fascia', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body()).expect(201);
    expect(res.body.type).toBe('daily');
    expect(res.body.status).toBe('confirmed');
    expect(res.body.totalPrice).toBe(28);

    const map = await request(app.getHttpServer()).get(`/api/map?date=${D}`).set(...bearer(token1)).expect(200);
    const u1 = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === ids.u1);
    expect(u1.stateBySlot[ids.slotMorning]).toBe('daily');
    expect(u1.stateBySlot[ids.slotAfternoon]).toBe('free');
  });

  it('GET /bookings?date ritorna la confermata', async () => {
    const res = await request(app.getHttpServer()).get(`/api/bookings?date=${D}`).set(...bearer(token1)).expect(200);
    expect(res.body.some((b: { umbrellaId: string }) => b.umbrellaId === ids.u1)).toBe(true);
  });

  it('anti-overlap: stessa fascia → 409; fascia diversa → 201', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body()).expect(409);
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ timeSlotId: ids.slotAfternoon })).expect(201);
  });

  it('isolamento: s2 non vede le prenotazioni di s1', async () => {
    const res = await request(app.getHttpServer()).get(`/api/bookings?date=${D}`).set(...bearer(token2)).expect(200);
    expect(res.body).toEqual([]);
  });

  it('isolamento: s2 non può prenotare un ombrellone di s1 → 422', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token2)).send(body({ startDate: '2026-07-16' })).expect(422);
  });

  it('superuser (no tenant) → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(superToken)).send(body({ startDate: '2026-07-17' })).expect(400);
  });

  it('validazione: data calendariale impossibile → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ startDate: '2026-13-40' })).expect(400);
  });

  it('prezzo calcolato dal listino: pomeriggio usa la tariffa specifica (40)', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, timeSlotId: ids.slotAfternoon, startDate: '2026-07-20' })).expect(201);
    expect(res.body.totalPrice).toBe(40);
  });

  it('data fuori stagione → 422 (nessuna stagione)', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, startDate: '2027-01-10' })).expect(422);
  });

  it('create con packageId valido → 201, prezzo dalla rate pacchetto (60) e lo persiste', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, startDate: '2026-07-21', packageId })).expect(201);
    expect(res.body.totalPrice).toBe(60);
    expect(res.body.packageId).toBe(packageId);

    const get = await request(app.getHttpServer()).get(`/api/bookings?date=2026-07-21`).set(...bearer(token1)).expect(200);
    expect(get.body.find((b: { id: string }) => b.id === res.body.id).packageId).toBe(packageId);
  });

  it('create con packageId inesistente nel tenant → 422', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, startDate: '2026-07-22', packageId: '00000000-0000-0000-0000-0000000000ff' })).expect(422);
  });

  describe('GET /bookings/quote', () => {
    it('senza token → 401', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=${D}`).expect(401);
    });
    it('mattina → 28 (catch-all)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=${D}`).set(...bearer(token1)).expect(200);
      expect(res.body.totalPrice).toBe(28);
    });
    it('pomeriggio → 40 (precedenza fascia)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotAfternoon}&type=daily&startDate=${D}`).set(...bearer(token1)).expect(200);
      expect(res.body.totalPrice).toBe(40);
    });
    it('fuori stagione → 422', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=2027-01-10`).set(...bearer(token1)).expect(422);
    });
    it('isolamento: s2 quota un ombrellone di s1 → 422', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=${D}`).set(...bearer(token2)).expect(422);
    });
  });

  describe('GET /packages', () => {
    it('senza token → 401', async () => {
      await request(app.getHttpServer()).get('/api/packages').expect(401);
    });
    it('con token → 200, lista i pacchetti del tenant', async () => {
      const res = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((p: { id: string; name: string }) => p.id === packageId && p.name === 'Standard')).toBe(true);
      expect(res.body[0].establishmentId).toBeUndefined();
    });
    it('isolamento: s2 non vede i pacchetti di s1', async () => {
      const res = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token2)).expect(200);
      expect(res.body).toEqual([]);
    });
    it('superuser (no tenant) → 400', async () => {
      await request(app.getHttpServer()).get('/api/packages').set(...bearer(superToken)).expect(400);
    });
  });

  describe('periodiche e abbonamenti (A4.1)', () => {
    let uPer: string; // ombrellone dedicato per le periodiche
    let uSub: string; // ombrellone dedicato per l'abbonamento (copre l'intera stagione)

    beforeAll(async () => {
      const mk = (label: string, order: number) =>
        prisma.forTenant(s1, (tx) =>
          tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: order } }),
        );
      uPer = (await mk('90', 90)).id;
      uSub = (await mk('91', 91)).id;
    });

    it('periodic multi-giorno → 201, prezzo = base × giorni, mappa "booked" nei giorni interni', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-24', endDate: '2026-07-26' })).expect(201);
      expect(res.body.type).toBe('periodic');
      expect(res.body.startDate).toBe('2026-07-24');
      expect(res.body.endDate).toBe('2026-07-26');
      expect(res.body.totalPrice).toBe(84); // 28 × 3 giorni (estremi inclusi)

      const map = await request(app.getHttpServer()).get('/api/map?date=2026-07-25').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uPer);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('booked');
    });

    it('anti-overlap su intervalli: periodo intersecante → 409; disgiunto → 201', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-25', endDate: '2026-07-27' })).expect(409);
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-28', endDate: '2026-07-29' })).expect(201);
    });

    it('subscription → 201, durata = stagione, prezzo forfait (800), mappa "season"', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      expect(res.body.type).toBe('subscription');
      expect(res.body.startDate).toBe('2026-05-01'); // season.startDate
      expect(res.body.endDate).toBe('2026-09-30');   // season.endDate
      expect(res.body.totalPrice).toBe(800);

      const map = await request(app.getHttpServer()).get('/api/map?date=2026-06-15').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uSub);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
    });

    it('daily con endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, startDate: '2026-08-10', endDate: '2026-08-11' })).expect(422);
    });

    it('periodic senza endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-08-10' })).expect(422);
    });

    it('periodic con endDate < startDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-08-10', endDate: '2026-08-05' })).expect(422);
    });

    it('periodic che supera la stagione → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-09-28', endDate: '2026-10-15' })).expect(422);
    });

    it('subscription con endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2026-07-01', endDate: '2026-09-30' })).expect(422);
    });

    it('subscription fuori stagione → 422 (nessuna stagione)', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2027-01-10' })).expect(422);
    });

    it('quote periodic → prezzo = base × giorni; quote subscription → forfait', async () => {
      const per = await request(app.getHttpServer())
        .get(`/api/bookings/quote?umbrellaId=${uPer}&timeSlotId=${ids.slotMorning}&type=periodic&startDate=2026-08-01&endDate=2026-08-05`)
        .set(...bearer(token1)).expect(200);
      expect(per.body.totalPrice).toBe(140); // 28 × 5

      const sub = await request(app.getHttpServer())
        .get(`/api/bookings/quote?umbrellaId=${uSub}&timeSlotId=${ids.slotMorning}&type=subscription&startDate=2026-07-01`)
        .set(...bearer(token1)).expect(200);
      expect(sub.body.totalPrice).toBe(800);
    });
  });

  it('DELETE annulla → la mappa torna free e si può ricreare', async () => {
    const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, startDate: '2026-07-19' })).expect(201);
    await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    const map = await request(app.getHttpServer()).get('/api/map?date=2026-07-19').set(...bearer(token1)).expect(200);
    const u2 = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === ids.u2);
    expect(u2.stateBySlot[ids.slotMorning]).toBe('free');
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, startDate: '2026-07-19' })).expect(201);
  });

  describe('PATCH /bookings/:id/payment', () => {
    let bId: string;
    const settle = '2026-08-01';

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: settle })).expect(201);
      bId = res.body.id;
    });

    it('senza token → 401', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).send({ amountCollected: 28, paymentMethod: 'cash' }).expect(401);
    });

    it('salda tutto → paid e GET riflette', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 28, paymentMethod: 'cash' }).expect(200);
      expect(res.body).toMatchObject({ paymentStatus: 'paid', amountCollected: 28, paymentMethod: 'cash' });
      expect(res.body.collectionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const get = await request(app.getHttpServer()).get(`/api/bookings?date=${settle}`).set(...bearer(token1)).expect(200);
      expect(get.body.find((b: { id: string }) => b.id === bId).paymentStatus).toBe('paid');
    });

    it('parziale → partial', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 20, paymentMethod: 'card' }).expect(200);
      expect(res.body).toMatchObject({ paymentStatus: 'partial', amountCollected: 20, paymentMethod: 'card' });
    });

    it('reset (amount 0) → unpaid, method/date assenti', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 0 }).expect(200);
      expect(res.body.paymentStatus).toBe('unpaid');
      expect(res.body.paymentMethod).toBeUndefined();
      expect(res.body.collectionDate).toBeUndefined();
    });

    it('amount > totale → 422', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 60, paymentMethod: 'cash' }).expect(422);
    });

    it('amount > 0 senza metodo → 422', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 10 }).expect(422);
    });

    it('id inesistente → 404', async () => {
      await request(app.getHttpServer()).patch('/api/bookings/99999999-9999-9999-9999-999999999999/payment').set(...bearer(token1))
        .send({ amountCollected: 0 }).expect(404);
    });

    it('prenotazione annullata → 409', async () => {
      const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u2, startDate: '2026-08-02' })).expect(201);
      await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).patch(`/api/bookings/${created.body.id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 30, paymentMethod: 'cash' }).expect(409);
    });

    it('isolamento: s2 non incassa una prenotazione di s1 → 404', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token2))
        .send({ amountCollected: 0 }).expect(404);
    });
  });
});
