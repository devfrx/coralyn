import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('RentalTariffs (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let s1: string; let s2: string; let t1: string; let t2: string;
  let itemId: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
  const srv = () => app.getHttpServer();

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(m); prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rent Tariff A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Rent Tariff B' } })).id;
    await createUser(prisma, { email: 'a.rt1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'a.rt2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    t1 = await login(app, 'a.rt1@e2e.test', 'pw1'); t2 = await login(app, 'a.rt2@e2e.test', 'pw2');

    const today = new Date(); const y = today.getUTCFullYear();
    await prisma.forTenant(s1, (tx) => tx.season.create({ data: {
      establishmentId: s1, name: `Stag ${y}`,
      startDate: new Date(Date.UTC(y, 0, 1)), endDate: new Date(Date.UTC(y, 11, 31)) } }));
    itemId = (await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Pedalò' })).body.id;
  });

  afterAll(async () => {
    for (const s of [s1, s2]) await prisma.forTenant(s, async (tx) => {
      await tx.rental.deleteMany({}); await tx.rentalTariff.deleteMany({});
      await tx.season.deleteMany({}); await tx.rentalItem.deleteMany({});
    });
    await prisma.user.deleteMany({ where: { email: { in: ['a.rt1@e2e.test', 'a.rt2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('crea tariffa sulla stagione attiva e la elenca', async () => {
    const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
      .send({ label: '1 ora', price: 8, durationMinutes: 60, sortOrder: 1 }).expect(201);
    expect(c.body).toMatchObject({ label: '1 ora', price: 8, durationMinutes: 60, rentalItemId: itemId });
    const list = await request(srv()).get(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1)).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('PATCH non cambia seasonId (immutabile)', async () => {
    const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
      .send({ label: '30 min', price: 5 }).expect(201);
    const before = c.body.seasonId;
    const u = await request(srv()).patch(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1))
      .send({ price: 6, seasonId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }).expect(200);
    expect(u.body.seasonId).toBe(before); expect(u.body.price).toBe(6);
  });

  it('archive→delete 200; delete non archiviata→409; isolamento tenant', async () => {
    const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
      .send({ label: 'giornata', price: 20 }).expect(201);
    await request(srv()).delete(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1)).expect(409);
    await request(srv()).post(`/api/rental-tariffs/${c.body.id}/archive`).set(...bearer(t1)).expect(201);
    await request(srv()).delete(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1)).expect(200);
    await request(srv()).get(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t2)).expect(200)
      .then((r) => expect(r.body).toEqual([]));
  });
});
