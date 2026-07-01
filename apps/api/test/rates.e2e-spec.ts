import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

describe('Rates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;
  let seasonId: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rate A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Rate B' } })).id;
    await createUser(prisma, { email: 'admin.ra1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.ra2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.ra1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.ra2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1); // umbrelle + fasce per il quote di chiusura cerchio
    // stagione 2028 creata via API (crea anche il Pricing 1:1)
    seasonId = (await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })).body.id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.rate.deleteMany({});
      await tx.pricing.deleteMany({});
      await tx.season.deleteMany({});
    });
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.ra1@e2e.test', 'admin.ra2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea una catch-all e GET la elenca per stagione', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, price: 25, unit: 'day' }).expect(201);
    expect(res.body).toMatchObject({ seasonId, price: 25, unit: 'day' });
    expect(res.body.type).toBeUndefined();

    const list = await request(app.getHttpServer()).get(`/api/rates?seasonId=${seasonId}`).set(...bearer(token1)).expect(200);
    expect(list.body.some((r: { id: string }) => r.id === res.body.id)).toBe(true);
  });

  it('POST di una firma duplicata → 409', async () => {
    // già esiste la catch-all del test precedente → un secondo catch-all viola Rate_signature_key
    await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, price: 99, unit: 'day' }).expect(409);
  });

  it('PATCH modifica il prezzo di una tariffa', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, type: 'subscription', price: 700, unit: 'period' }).expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/rates/${created.body.id}`).set(...bearer(token1)).send({ price: 750 }).expect(200);
    expect(patched.body.price).toBe(750);
  });

  it('PATCH con dimensione a null la azzera (wildcard), non lascia il vecchio valore', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId, sectorId: ids.sectorId, type: 'periodic', price: 33, unit: 'day' }).expect(201);
    expect(created.body.sectorId).toBe(ids.sectorId);

    const patched = await request(app.getHttpServer())
      .patch(`/api/rates/${created.body.id}`).set(...bearer(token1)).send({ sectorId: null }).expect(200);
    expect(patched.body.sectorId).toBeUndefined();

    const refetched = await request(app.getHttpServer())
      .get(`/api/rates?seasonId=${seasonId}`).set(...bearer(token1)).expect(200);
    const row = refetched.body.find((r: { id: string }) => r.id === created.body.id);
    expect(row.sectorId).toBeUndefined();

    // pulizia: evita che la wildcard residua (type periodic) interferisca con altri test
    await request(app.getHttpServer()).delete(`/api/rates/${created.body.id}`).set(...bearer(token1)).expect(200);
  });

  it('DELETE elimina la tariffa e la ritorna; 404 se inesistente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1)).send({ seasonId, timeSlotId: ids.slotMorning, price: 15, unit: 'day' }).expect(201);
    const del = await request(app.getHttpServer()).delete(`/api/rates/${created.body.id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(created.body.id);
    await request(app.getHttpServer()).delete(`/api/rates/${created.body.id}`).set(...bearer(token1)).expect(404);
  });

  it('isolamento: s2 non vede né modifica le tariffe di s1', async () => {
    const list = await request(app.getHttpServer()).get(`/api/rates?seasonId=${seasonId}`).set(...bearer(token2)).expect(200);
    expect(list.body).toEqual([]); // il Pricing di quella stagione appartiene a s1
  });

  it('chiude il cerchio: la nuova catch-all pilota il quote del motore prezzo', async () => {
    // c'è già la catch-all a 25/giorno (day) → un daily nel 2028 deve costare 25
    const quote = await request(app.getHttpServer())
      .get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&type=daily&startDate=2028-07-01`)
      .set(...bearer(token1)).expect(200);
    expect(quote.body.totalPrice).toBe(25);
  });
});
