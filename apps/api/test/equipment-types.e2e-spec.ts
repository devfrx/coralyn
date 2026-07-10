import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('EquipmentTypes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Eq A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Eq B' } })).id;
    await createUser(prisma, { email: 'admin.eq1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.eq2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.eq1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.eq2@e2e.test', 'pw2');
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.packageEquipment.deleteMany({});
        await tx.package.deleteMany({});
        await tx.equipmentType.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin.eq1@e2e.test', 'admin.eq2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea un tipo e lo elenca solo al proprietario', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Cassaforte' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Cassaforte' });
    const listS2 = await request(app.getHttpServer()).get('/api/equipment-types').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((t: { id: string }) => t.id === res.body.id)).toBe(false);
  });

  it('POST rifiuta un nome duplicato (case-insensitive) con 409', async () => {
    await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino' }).expect(201);
    await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: '  lettino ' }).expect(409);
  });

  it('PATCH rinomina; 404 ad altro tenant', async () => {
    const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Ombrellone' }).expect(201);
    const p = await request(app.getHttpServer()).patch(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).send({ name: 'Ombrellone XL' }).expect(200);
    expect(p.body).toMatchObject({ id: c.body.id, name: 'Ombrellone XL' });
    await request(app.getHttpServer()).patch(`/api/equipment-types/${c.body.id}`).set(...bearer(token2)).send({ name: 'X' }).expect(404);
  });

  it('archive nasconde dal default, includeArchived lo mostra, restore lo riporta', async () => {
    const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Frigo' }).expect(201);
    const a = await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token1)).expect(201);
    expect(a.body).toMatchObject({ id: c.body.id, archived: true });
    const def = await request(app.getHttpServer()).get('/api/equipment-types').set(...bearer(token1)).expect(200);
    expect(def.body.some((t: { id: string }) => t.id === c.body.id)).toBe(false);
    const all = await request(app.getHttpServer()).get('/api/equipment-types?includeArchived=true').set(...bearer(token1)).expect(200);
    expect(all.body.find((t: { id: string }) => t.id === c.body.id)).toMatchObject({ archived: true });
    const r = await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/restore`).set(...bearer(token1)).expect(201);
    expect(r.body.archived).toBeUndefined();
  });

  it('DELETE 200 se archiviato e senza riferimenti; 404 se ripetuto', async () => {
    const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Effimero' }).expect(201);
    await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token1)).expect(201);
    await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(200);
    await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(404);
  });

  it('DELETE di un tipo NON archiviato → 409', async () => {
    const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Attivo' }).expect(201);
    await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token1)).expect(409);
  });

  it('archive/restore/delete isolati per tenant (404 cross-tenant)', async () => {
    const c = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Isolato' }).expect(201);
    await request(app.getHttpServer()).post(`/api/equipment-types/${c.body.id}/archive`).set(...bearer(token2)).expect(404);
    await request(app.getHttpServer()).delete(`/api/equipment-types/${c.body.id}`).set(...bearer(token2)).expect(404);
  });
});
