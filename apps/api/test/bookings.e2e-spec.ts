import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';

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
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.b1@e2e.test', 'admin.b2@e2e.test', 'super.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const body = (over: Partial<Record<string, unknown>> = {}) => ({
    customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, date: D, totalPrice: 28, ...over,
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
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token2)).send(body({ date: '2026-07-16' })).expect(422);
  });

  it('superuser (no tenant) → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(superToken)).send(body({ date: '2026-07-17' })).expect(400);
  });

  it('validazione: data calendariale impossibile → 400; prezzo negativo → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ date: '2026-13-40' })).expect(400);
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ totalPrice: -5, date: '2026-07-18' })).expect(400);
  });

  it('DELETE annulla → la mappa torna free e si può ricreare', async () => {
    const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, date: '2026-07-19' })).expect(201);
    await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    const map = await request(app.getHttpServer()).get('/api/map?date=2026-07-19').set(...bearer(token1)).expect(200);
    const u2 = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === ids.u2);
    expect(u2.stateBySlot[ids.slotMorning]).toBe('free');
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, date: '2026-07-19' })).expect(201);
  });
});
