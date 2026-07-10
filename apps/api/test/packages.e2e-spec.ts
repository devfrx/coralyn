import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('Packages (e2e)', () => {
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
    s1 = (await prisma.establishment.create({ data: { name: 'Pkg A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Pkg B' } })).id;
    await createUser(prisma, { email: 'admin.pk1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.pk2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.pk1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.pk2@e2e.test', 'pw2');
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.rate.deleteMany({});
        await tx.pricing.deleteMany({});
        await tx.season.deleteMany({});
        await tx.packageEquipment.deleteMany({});
        await tx.package.deleteMany({});
        await tx.equipmentType.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin.pk1@e2e.test', 'admin.pk2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea un pacchetto con voci di dotazione e le risolve nella risposta', async () => {
    const lettino = await request(app.getHttpServer())
      .post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino' }).expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1))
      .send({ name: 'Comfort', equipment: [{ equipmentTypeId: lettino.body.id, quantity: 2 }] }).expect(201);
    expect(res.body.equipment).toEqual([{ equipmentTypeId: lettino.body.id, name: 'Lettino', quantity: 2 }]);
    const id = res.body.id as string;

    const listS2 = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it('PATCH aggiorna nome/equipment del proprietario, 404 ad altro tenant', async () => {
    const sunbed = await request(app.getHttpServer())
      .post('/api/equipment-types').set(...bearer(token1)).send({ name: 'SunbedBase' }).expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1))
      .send({ name: 'Base', equipment: [{ equipmentTypeId: sunbed.body.id, quantity: 2 }] }).expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/packages/${id}`).set(...bearer(token1))
      .send({ name: 'Base Plus', equipment: [{ equipmentTypeId: sunbed.body.id, quantity: 3 }] }).expect(200);
    expect(patched.body).toMatchObject({
      id,
      name: 'Base Plus',
      equipment: [{ equipmentTypeId: sunbed.body.id, name: 'SunbedBase', quantity: 3 }],
    });

    await request(app.getHttpServer()).patch(`/api/packages/${id}`).set(...bearer(token1)).send({ name: 'X' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/packages/${id}`).set(...bearer(token2)).send({ name: 'X' }).expect(404);
  });

  it('PATCH sostituisce il set di voci senza clobber (bug originario chiuso)', async () => {
    const lettino = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Lettino2' }).expect(201);
    const sdraio = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Sdraio2' }).expect(201);
    const pkg = await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
      .send({ name: 'Multi', equipment: [{ equipmentTypeId: lettino.body.id, quantity: 2 }, { equipmentTypeId: sdraio.body.id, quantity: 1 }] }).expect(201);
    // PATCH col set completo aggiornato: entrambe le voci restano (nessuna sparisce).
    const patched = await request(app.getHttpServer()).patch(`/api/packages/${pkg.body.id}`).set(...bearer(token1))
      .send({ equipment: [{ equipmentTypeId: lettino.body.id, quantity: 4 }, { equipmentTypeId: sdraio.body.id, quantity: 1 }] }).expect(200);
    expect(patched.body.equipment).toHaveLength(2);
    expect(patched.body.equipment.find((e: { name: string }) => e.name === 'Lettino2').quantity).toBe(4);
  });

  it('POST 422 se il tipo non esiste', async () => {
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
      .send({ name: 'X', equipment: [{ equipmentTypeId: '00000000-0000-4000-8000-0000000000ff', quantity: 1 }] }).expect(422);
  });

  it('POST 400 se quantity < 1', async () => {
    const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'QtaZero' }).expect(201);
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
      .send({ name: 'X', equipment: [{ equipmentTypeId: t.body.id, quantity: 0 }] }).expect(400);
  });

  it('POST 422 se il tipo è archiviato', async () => {
    const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Archiviato422' }).expect(201);
    await request(app.getHttpServer()).post(`/api/equipment-types/${t.body.id}/archive`).set(...bearer(token1)).expect(201);
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
      .send({ name: 'X', equipment: [{ equipmentTypeId: t.body.id, quantity: 1 }] }).expect(422);
  });

  it('DELETE di un tipo referenziato da un pacchetto → 409', async () => {
    const t = await request(app.getHttpServer()).post('/api/equipment-types').set(...bearer(token1)).send({ name: 'Referenziato' }).expect(201);
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1))
      .send({ name: 'UsaTipo', equipment: [{ equipmentTypeId: t.body.id, quantity: 1 }] }).expect(201);
    await request(app.getHttpServer()).post(`/api/equipment-types/${t.body.id}/archive`).set(...bearer(token1)).expect(201);
    await request(app.getHttpServer()).delete(`/api/equipment-types/${t.body.id}`).set(...bearer(token1)).expect(409);
  });

  it('DELETE elimina un pacchetto ARCHIVIATO e lo ritorna; 404 se poi si ripete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Effimero', equipment: [] }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/packages/${id}/archive`).set(...bearer(token1)).expect(201);
    const del = await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(id);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(404);
  });

  it('POST rifiuta nome vuoto con 400', async () => {
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1)).send({ name: '', equipment: [] }).expect(400);
  });

  it('DELETE di un pacchetto ARCHIVIATO ma referenziato da una tariffa → 409', async () => {
    const pkg = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Referenziato', equipment: [] }).expect(201);
    const season = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Stagione Pkg', startDate: '2029-06-01', endDate: '2029-09-30' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId: season.body.id, packageId: pkg.body.id, price: 40 }).expect(201);
    await request(app.getHttpServer()).post(`/api/packages/${pkg.body.id}/archive`).set(...bearer(token1)).expect(201);

    await request(app.getHttpServer()).delete(`/api/packages/${pkg.body.id}`).set(...bearer(token1)).expect(409);
  });

  it('archive nasconde il pacchetto dal default e lo mostra con includeArchived; restore lo riporta', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Da Archiviare', equipment: [] }).expect(201);
    const id = created.body.id as string;

    const archived = await request(app.getHttpServer())
      .post(`/api/packages/${id}/archive`).set(...bearer(token1)).expect(201);
    expect(archived.body).toMatchObject({ id, archived: true });

    const listDefault = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
    expect(listDefault.body.some((p: { id: string }) => p.id === id)).toBe(false);

    const listAll = await request(app.getHttpServer())
      .get('/api/packages?includeArchived=true').set(...bearer(token1)).expect(200);
    const found = listAll.body.find((p: { id: string }) => p.id === id);
    expect(found).toMatchObject({ id, archived: true });

    const restored = await request(app.getHttpServer())
      .post(`/api/packages/${id}/restore`).set(...bearer(token1)).expect(201);
    expect(restored.body.id).toBe(id);
    expect(restored.body.archived).toBeUndefined();

    const listAfter = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token1)).expect(200);
    expect(listAfter.body.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  it('DELETE di un pacchetto NON archiviato → 409 (va prima archiviato)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Attivo', equipment: [] }).expect(201);
    await request(app.getHttpServer()).delete(`/api/packages/${created.body.id}`).set(...bearer(token1)).expect(409);
  });

  it('archive/restore/delete sono isolati per tenant (404 cross-tenant)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Isolato', equipment: [] }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer()).post(`/api/packages/${id}/archive`).set(...bearer(token2)).expect(404);
    await request(app.getHttpServer()).post(`/api/packages/${id}/restore`).set(...bearer(token2)).expect(404);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token2)).expect(404);
  });
});
