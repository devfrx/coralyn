import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';
import { createTestApp } from './helpers/create-test-app';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let superToken: string;
  let staffToken: string;
  let ids: MapSeedIds;
  let customerId: string;
  let packageId: string;
  let season2026: string;
  let season2027: string;
  const D = '2026-07-15';

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Book A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Book B' } })).id;
    await createUser(prisma, { email: 'admin.b1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.b2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    await createUser(prisma, { email: 'super.b@e2e.test', password: 'pws', role: Role.superuser, establishmentId: null });
    await createUser(prisma, { email: 'staff.b1@e2e.test', password: 'pws1', role: Role.staff, establishmentId: s1 });
    token1 = await login(app, 'admin.b1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.b2@e2e.test', 'pw2');
    superToken = await login(app, 'super.b@e2e.test', 'pws');
    staffToken = await login(app, 'staff.b1@e2e.test', 'pws1');
    ids = await seedMapTenant(prisma, s1);
    const seed = await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
    packageId = seed.packageId;
    season2026 = seed.seasonId;
    season2027 = seed.season2027Id;
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
    await prisma.user.deleteMany({ where: { email: { in: ['admin.b1@e2e.test', 'admin.b2@e2e.test', 'super.b@e2e.test', 'staff.b1@e2e.test'] } } });
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
    it('il quote espone matchedRate (provenienza): la catch-all a 28/giorno', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=${D}`).set(...bearer(token1)).expect(200);
      expect(res.body.totalPrice).toBe(28);
      expect(res.body.matchedRate).toMatchObject({ price: 28 });
      expect(res.body.matchedRate.id).toEqual(expect.any(String));
      expect(res.body.matchedRate.timeSlotId).toBeUndefined(); // catch-all: dimensione null → assente
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

    it('subscription senza tariffa Abbonamento nella stagione -> 422 con messaggio specifico', async () => {
      // Stagione 2028 con listino SOLO catch-all (nessuna tariffa subscription): esercita la partizione.
      await prisma.forTenant(s1, async (tx) => {
        const season2028 = await tx.season.create({
          data: {
            establishmentId: s1,
            name: 'Estate 2028',
            startDate: new Date('2028-05-01T00:00:00Z'),
            endDate: new Date('2028-09-30T00:00:00Z'),
          },
        });
        const pricing2028 = await tx.pricing.create({ data: { establishmentId: s1, seasonId: season2028.id } });
        await tx.rate.create({ data: { establishmentId: s1, pricingId: pricing2028.id, price: 30 } }); // solo catch-all
      });

      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2028-07-01' }))
        .expect(422);
      expect(res.body.message).toBe('Nessuna tariffa Abbonamento configurata per questa stagione');
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

  describe('rinnovo e anzianità (A4.2)', () => {
    let uRen: string; // ombrellone dell'abbonamento sorgente da rinnovare
    let srcId: string; // abbonamento sorgente 2026

    const mkUmbrella = (label: string, order: number) =>
      prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: order } }),
      );

    beforeAll(async () => {
      uRen = (await mkUmbrella('92', 92)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uRen, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      srcId = src.body.id;
      expect(src.body.totalPrice).toBe(800);
    });

    it('elenco abbonati 2026: la sorgente ha seniority=1, renewed=false', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/subscriptions?seasonId=${season2026}`).set(...bearer(token1)).expect(200);
      const row = res.body.find((b: { id: string }) => b.id === srcId);
      expect(row.seniority).toBe(1);
      expect(row.renewed).toBe(false);
    });

    it('rinnovo → 201: stagione 2027, prezzo nuovo listino (850), previousBookingId=sorgente, mappa season', async () => {
      const res = await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(201);
      expect(res.body.type).toBe('subscription');
      expect(res.body.startDate).toBe('2027-05-01');
      expect(res.body.endDate).toBe('2027-09-30');
      expect(res.body.totalPrice).toBe(850);
      expect(res.body.previousBookingId).toBe(srcId);

      const map = await request(app.getHttpServer()).get('/api/map?date=2027-06-15').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uRen);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
    });

    it('dopo il rinnovo: sorgente renewed=true; il rinnovo 2027 ha seniority=2', async () => {
      const s2026 = await request(app.getHttpServer()).get(`/api/bookings/subscriptions?seasonId=${season2026}`).set(...bearer(token1)).expect(200);
      expect(s2026.body.find((b: { id: string }) => b.id === srcId).renewed).toBe(true);
      const s2027 = await request(app.getHttpServer()).get(`/api/bookings/subscriptions?seasonId=${season2027}`).set(...bearer(token1)).expect(200);
      const renewal = s2027.body.find((b: { umbrellaId: string }) => b.umbrellaId === uRen);
      expect(renewal.seniority).toBe(2);
    });

    it('doppio rinnovo → 409', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(409);
    });

    it('rinnovo verso la stessa stagione della sorgente → 422', async () => {
      const u = (await mkUmbrella('93', 93)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2026 }).expect(422);
    });

    it('rinnovo di una prenotazione non-abbonamento → 422', async () => {
      const day = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u2, startDate: '2026-06-05' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${day.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(422);
    });

    it('rinnovo di un abbonamento annullato → 422', async () => {
      const u = (await mkUmbrella('94', 94)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      await request(app.getHttpServer()).delete(`/api/bookings/${src.body.id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(422);
    });

    it('rinnovo di sorgente di un altro tenant → 404 (isolamento)', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token2))
        .send({ destinationSeasonId: season2027 }).expect(404);
    });

    it('anti-overlap sul rinnovo: ombrellone occupato in 2027 → 409', async () => {
      const u = (await mkUmbrella('95', 95)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      // Occupa lo stesso ombrellone in 2027 con un abbonamento diretto.
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2027-07-01' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(409);
    });

    it('rinnovo verso una stagione che si SOVRAPPONE alla sorgente → 422 (pre-flight; il constraint DB resta solo backstop di race)', async () => {
      // La stagione di destinazione [09-01, 12-31] si sovrappone a Estate 2026 [05-01, 09-30] della sorgente.
      // renew() lo intercetta con un 422 chiaro PRIMA di scrivere: il constraint coverage_no_overlap non
      // deve mai essere il percorso primario per un errore di logica prevedibile (ADR-0037/ADR-0046).
      const u = (await mkUmbrella('96', 96)).id;
      const overlapId = (
        await prisma.forTenant(s1, (tx) =>
          tx.season.create({
            data: {
              establishmentId: s1,
              name: 'Autunno 2026 (overlap)',
              startDate: new Date('2026-09-01T00:00:00Z'),
              endDate: new Date('2026-12-31T00:00:00Z'),
            },
          }),
        )
      ).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: overlapId }).expect(422);
      expect(res.body.message).toContain('iniziare dopo la fine');
    });

    it('elenco abbonati per stagione inesistente → [] (nessuna stagione)', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/subscriptions?seasonId=00000000-0000-0000-0000-0000000000ff').set(...bearer(token1)).expect(200);
      expect(res.body).toEqual([]);
    });

    it('GET /bookings/subscriptions senza seasonId → 400; con seasonId malformato → 400', async () => {
      await request(app.getHttpServer()).get('/api/bookings/subscriptions').set(...bearer(token1)).expect(400);
      await request(app.getHttpServer()).get('/api/bookings/subscriptions?seasonId=not-a-uuid').set(...bearer(token1)).expect(400);
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

  describe('disdetta abbonamento (D-013)', () => {
    // umbrella dedicata per non collidere con gli altri test di occupazione
    let uTerm: string;
    let termSeq = 0;

    const makeSub = async (): Promise<string> => {
      const label = `T${(termSeq += 1)}`; // label unica per Establishment (evita collisione @@unique)
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 50 } }),
      );
      uTerm = u.id;
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uTerm, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return res.body.id as string; // abbonamento 2026-05-01 → 2026-09-30, prezzo 800
    };

    it('admin disdice → 200, endDate troncata, terminatedAt e refundedAmount valorizzati', async () => {
      const subId = await makeSub();
      // incassa il forfait (800) così il rimborso di 400 è entro l'incassato
      await request(app.getHttpServer()).patch(`/api/bookings/${subId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 400, reason: 'Trasloco' }).expect(200);
      expect(res.body.status).toBe('confirmed');
      expect(res.body.endDate).toBe('2026-06-30'); // E-1
      expect(res.body.refundedAmount).toBe(400);
      expect(typeof res.body.terminatedAt).toBe('string');
      expect(res.body.terminationReason).toBe('Trasloco');
    });

    it('libera il posto: dopo la disdetta una nuova prenotazione sulle date liberate passa', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(200);
      // prima della disdetta questa daily del 2026-07-15 darebbe 409 (occupata dall'abbonamento)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uTerm, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-15' })).expect(201);
    });

    it('staff → 403 (admin-only)', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(staffToken))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(403);
    });

    it('tenant altrui → 404', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token2))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(404);
    });

    it('data fuori range (≤ startDate) → 422', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-05-01', refundAmount: 0 }).expect(422);
    });

    it('rimborso > incassato → 422', async () => {
      const subId = await makeSub(); // non pagato: amountCollected = 0
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 50 }).expect(422);
    });

    it('già disdetto → 409', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-01', refundAmount: 0 }).expect(409);
    });

    it('non-abbonamento (daily) → 422', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-20' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${res.body.id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-20', refundAmount: 0 }).expect(422);
    });
  });

  describe('sospensione abbonamento (D-013)', () => {
    let sSeq = 0;

    // Abbonamento full-season 2026-05-01 → 2026-09-30 su ombrellone dedicato (label unica).
    const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
      const label = `S${(sSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 60 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string, umbrellaId: u.id };
    };

    it('chiusa: 200, span di contratto invariato, buco liberato, coda riservata', async () => {
      const { id, umbrellaId } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);

      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 50, reason: 'Viaggio' }).expect(200);
      // lo span di contratto NON cambia (prelazione/rinnovo intatti)
      expect(res.body.startDate).toBe('2026-05-01');
      expect(res.body.endDate).toBe('2026-09-30');
      expect(res.body.refundedAmount).toBe(50);

      // buco [2026-07-20, 2026-07-26] libero: una daily nel buco passa (prima darebbe 409)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-22' })).expect(201);
      // coda [2026-07-27, …] ancora riservata all'abbonato: una daily lì dà 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-28' })).expect(409);
      // testa [.., 2026-07-19] ancora riservata: 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-15' })).expect(409);
    });

    it('rimborso aggregato su refundedAmount (disdetta-style netto)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 30 }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-01', endDate: '2026-08-05', refundAmount: 20 }).expect(200);
      expect(res.body.refundedAmount).toBe(50); // 30 + 20 aggregati
    });

    it('staff → 403 (admin-only)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(staffToken))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26' }).expect(403);
    });

    it('tenant altrui → 404', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token2))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26' }).expect(404);
    });

    it('inizio nel passato (< oggi) → 422', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-05-10', endDate: '2026-05-20' }).expect(422);
    });

    it('ritorno a fine stagione (R-1 = endDate) → 422 (usa la disdetta)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-01', endDate: '2026-09-30' }).expect(422);
    });

    it('rimborso > residuo incassato → 422', async () => {
      const { id } = await makeSub(); // non pagato: amountCollected = 0
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 10 }).expect(422);
    });

    it('non-abbonamento (daily) → 422', async () => {
      // Coordinate distinte da quelle della disdetta (u1/slotAfternoon/2026-08-20) per evitare
      // la collisione di occupazione quando le due suite girano nello stesso run.
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-25' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${res.body.id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-25', endDate: '2026-08-26' }).expect(422);
    });

    it('aperta poi reactivate: buco [S, R-1], coda [R, end] ricoperta', async () => {
      const { id, umbrellaId } = await makeSub();
      // apertura: nessun endDate → coda da S libera a tempo indeterminato
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', reason: 'Rientro incerto' }).expect(200);
      // durante l'apertura una daily dopo S passa (posto libero)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-08-15' })).expect(201);

      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(200);
      expect(res.body.endDate).toBe('2026-09-30'); // span invariato

      // dopo il rientro, coda [2026-09-01, …] riservata: una daily lì dà 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-09-05' })).expect(409);
      // il buco [2026-07-20, 2026-08-31] resta libero
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-20' })).expect(201);
    });

    it('reactivate in conflitto con walk-in nella coda → 409', async () => {
      const { id, umbrellaId } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      // walk-in venduto nella futura coda di rientro
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-09-05' })).expect(201);
      // reactivate a R=2026-09-01 richiederebbe [2026-09-01, 2026-09-30], che contiene il walk-in → 409
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(409);
    });

    it('una sola sospensione aperta: seconda apertura → 409', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-10' }).expect(409);
    });

    it('reactivate senza sospensione aperta → 409', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(409);
    });

    it('reactivate con R fuori (≤ S o > endDate) → 422', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-07-20', refundAmount: 0 }).expect(422); // R = S
    });

    it('reactivate: rimborso sui giorni reali aggregato su refundedAmount', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-08-01', refundAmount: 40 }).expect(200);
      expect(res.body.refundedAmount).toBe(40);
    });

    it('reactivate: staff → 403', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(staffToken))
        .send({ returnDate: '2026-08-01', refundAmount: 0 }).expect(403);
    });
  });

  describe('PATCH /bookings/:id/absence-consent (D-035 S1)', () => {
    let acSeq = 0;

    const makeSub = async (): Promise<{ id: string }> => {
      const label = `AC${(acSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 70 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string };
    };

    it('admin attiva il consenso → 200, Booking.absenceConsentAt valorizzato', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(200);
      const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirst({ where: { id } }));
      expect(row?.absenceConsentAt).not.toBeNull();
    });

    it('admin revoca il consenso (consent:false) → 200, absenceConsentAt torna null', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(200);
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: false }).expect(200);
      const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirst({ where: { id } }));
      expect(row?.absenceConsentAt).toBeNull();
    });

    it('non-abbonamento (daily) → 422', async () => {
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label: 'ACDaily', logicalOrder: 71 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'daily', startDate: '2026-07-15' })).expect(201);
      await request(app.getHttpServer()).patch(`/api/bookings/${res.body.id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(422);
    });

    it('id inesistente → 404', async () => {
      await request(app.getHttpServer()).patch('/api/bookings/00000000-0000-0000-0000-0000000000fa/absence-consent')
        .set(...bearer(token1)).send({ consent: true }).expect(404);
    });

    it('staff → 403 (admin-only)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(staffToken))
        .send({ consent: true }).expect(403);
    });
  });

  describe('POST /bookings/:id/absence-releases (D-035 S2)', () => {
    let arSeq = 0;

    // Abbonamento full-season 2026-05-01 → 2026-09-30 su ombrellone dedicato (label unica).
    const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
      const label = `AR${(arSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 80 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string, umbrellaId: u.id };
    };

    const grantConsent = (id: string) =>
      request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(200);

    const rawBooking = (id: string) => prisma.forTenant(s1, (tx) => tx.booking.findFirst({ where: { id } }));

    it('release apre la disponibilità del giorno per la rivendita; cassa/span invariati', async () => {
      const { id, umbrellaId } = await makeSub();
      await grantConsent(id);
      const before = await rawBooking(id);

      const day = '2026-07-20';
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: day }).expect(200);

      // rivendita: una giornaliera sullo stesso ombrellone+fascia in `day` ora passa (era 409 prima della release)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: day })).expect(201);

      // cassa/span dell'abbonamento NON toccati dalla release (ADR-0048)
      const after = await rawBooking(id);
      expect(after?.amountCollected).toStrictEqual(before?.amountCollected);
      expect(after?.refundedAmount).toStrictEqual(before?.refundedAmount);
      expect(after?.startDate).toStrictEqual(before?.startDate);
      expect(after?.endDate).toStrictEqual(before?.endDate);
    });

    it('senza consenso attivo → 422 (NO_CONSENT)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: '2026-07-21' }).expect(422);
    });

    it('data passata (< oggi, dentro lo span) → 422 (PAST_DATE)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: '2026-06-01' }).expect(422);
    });

    it('data fuori dallo span → 422 (BAD_DATE)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: '2027-01-01' }).expect(422);
    });

    it('stesso giorno rilasciato due volte → 409 (ALREADY_RELEASED)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      const day = '2026-07-22';
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: day }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: day }).expect(409);
    });

    it('staff → 403 (admin-only)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(staffToken))
        .send({ date: '2026-07-23' }).expect(403);
    });
  });

  describe('POST /bookings/:id/absence-releases/:rid/cancel (D-035 S2)', () => {
    let cxSeq = 0;

    const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
      const label = `CX${(cxSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 90 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string, umbrellaId: u.id };
    };

    const grantConsent = (id: string) =>
      request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(200);

    const releaseDay = (id: string, day: string) =>
      request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: day }).expect(200);

    // Task 5 (proiezione absenceReleases[] sulla Scheda) non ancora fatto: rilettura diretta da DB.
    const rawRelease = (id: string) =>
      prisma.forTenant(s1, (tx) => tx.absenceRelease.findFirst({ where: { bookingId: id }, orderBy: { createdAt: 'desc' } }));

    it('annullo non rivenduto → 200, ricopre il giorno (rivendita ora conflitta), canceledAt valorizzato', async () => {
      const { id, umbrellaId } = await makeSub();
      await grantConsent(id);
      const day = '2026-07-24';
      await releaseDay(id, day);
      const rel = await rawRelease(id);

      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(200);

      // il giorno è di nuovo coperto: una giornaliera nello stesso buco ora conflitta (era 201 prima dell'annullo)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: day })).expect(409);

      const after = await rawRelease(id);
      expect(after?.canceledAt).not.toBeNull();
    });

    it('già rivenduto → 409 (RESOLD)', async () => {
      const { id, umbrellaId } = await makeSub();
      await grantConsent(id);
      const day = '2026-07-25';
      await releaseDay(id, day);
      const rel = await rawRelease(id);

      // rivendita: una giornaliera occupa il buco lasciato dalla release
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: day })).expect(201);

      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(409);
    });

    it('già annullata → 409 (ALREADY_CANCELED)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      const day = '2026-07-26';
      await releaseDay(id, day);
      const rel = await rawRelease(id);

      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(409);
    });

    it('staff → 403 (admin-only)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      const day = '2026-07-27';
      await releaseDay(id, day);
      const rel = await rawRelease(id);

      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(staffToken))
        .expect(403);
    });
  });

  describe('macchina a stati CTA (hardening)', () => {
    let xSeq = 0;
    const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
      const label = `X${(xSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 90 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string, umbrellaId: u.id };
    };
    const grantConsent = (id: string) =>
      request(app.getHttpServer()).patch(`/api/bookings/${id}/absence-consent`).set(...bearer(token1))
        .send({ consent: true }).expect(200);
    const rawRelease = (id: string) =>
      prisma.forTenant(s1, (tx) => tx.absenceRelease.findFirst({ where: { bookingId: id }, orderBy: { createdAt: 'desc' } }));
    const coverageOf = (id: string) =>
      prisma.forTenant(s1, (tx) => tx.bookingCoverage.findMany({ where: { bookingId: id }, orderBy: { startDate: 'asc' } }));
    const iso = (d: Date): string => d.toISOString().slice(0, 10);
    // Futura rispetto all'«oggi» congelato delle e2e (2026-07-15, jest-frozen-calendar.setup.ts)
    // e dentro lo span dell'abbonamento: supera le guardie PAST_DATE/BAD_DATE in modo
    // deterministico. (Il precedente addDays(todayInRome(), 3) è marcito comunque: relativo a
    // oggi ma vincolato alla stagione fissa — la coerenza ora la garantisce il clock congelato.)
    const releaseDate = '2026-07-18';

    it('D1: suspend-open → terminate → 409 (riattiva prima di disdire)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-01', refundAmount: 0 }).expect(409);
    });

    it('D2: suspend-open → cancel → reactivate → 422 (non attivo)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).delete(`/api/bookings/${id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-08-01', refundAmount: 0 }).expect(422);
    });

    it('C2: suspend-open → release → 422 (sospensione aperta)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: releaseDate }).expect(422);
    });

    it('C2: release → suspend-open → cancel-release → 422 (sospensione aperta)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: releaseDate }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      const rel = await rawRelease(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(422);
    });

    it('D5: release → cancel → cancel-release → 422 (non attivo)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: releaseDate }).expect(200);
      const rel = await rawRelease(id);
      await request(app.getHttpServer()).delete(`/api/bookings/${id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(422);
    });

    it('D5: release → terminate → cancel-release → 422 (disdetto)', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: releaseDate }).expect(200);
      const rel = await rawRelease(id);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-09-01', refundAmount: 0 }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases/${rel!.id}/cancel`).set(...bearer(token1))
        .expect(422);
    });

    it('D3: terminate dopo sospensione chiusa non lascia range invertiti (coda oltre lastValid eliminata)', async () => {
      const { id } = await makeSub();
      // sospensione chiusa [07-20, 07-26] → head [.., 07-19] + coda [07-27, 09-30]
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26' }).expect(200);
      // disdici con lastValid = 07-09 (< inizio coda): la coda va ELIMINATA, non invertita
      await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-10', refundAmount: 0 }).expect(200);
      const cov = await coverageOf(id);
      for (const c of cov) expect(c.startDate.getTime()).toBeLessThanOrEqual(c.endDate.getTime()); // nessun range invertito
      for (const c of cov) expect(iso(c.endDate) <= '2026-07-09').toBe(true); // niente oltre lastValid
      expect(cov).toHaveLength(1); // resta solo la testa troncata [05-01, 07-09]
    });

    it('D3/C3: terminate con release attiva tronca i frammenti e preserva la storia della release', async () => {
      const { id } = await makeSub();
      await grantConsent(id);
      // release del 08-15 → frammenti [.., 08-14] + [08-16, 09-30]
      await request(app.getHttpServer()).post(`/api/bookings/${id}/absence-releases`).set(...bearer(token1))
        .send({ date: '2026-08-15' }).expect(200);
      // disdici con lastValid = 08-31: il frammento di coda [08-16, 09-30] va troncato a 08-31
      await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-09-01', refundAmount: 0 }).expect(200);
      const cov = await coverageOf(id);
      for (const c of cov) expect(c.startDate.getTime()).toBeLessThanOrEqual(c.endDate.getTime());
      for (const c of cov) expect(iso(c.endDate) <= '2026-08-31').toBe(true);
      const rel = await rawRelease(id);
      expect(rel).not.toBeNull(); // la release resta come fatto storico
    });

    it('D4: suspend-closed(rimborso 100) → terminate(rimborso 50) → refundedAmount cumulativo = 150', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 100 }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-01', refundAmount: 50 }).expect(200);
      expect(res.body.refundedAmount).toBe(150); // 100 (sospensione) + 50 (disdetta), non 50
    });

    it('D4: bound sul residuo — rimborso disdetta > residuo → 422', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 100 }).expect(200);
      // residuo = 800 − 100 = 700; chiedere 750 deve essere rifiutato
      await request(app.getHttpServer()).post(`/api/bookings/${id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-01', refundAmount: 750 }).expect(422);
    });
  });
});
