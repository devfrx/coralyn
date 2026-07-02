import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

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
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
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
        await tx.package.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin.pk1@e2e.test', 'admin.pk2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('POST crea un pacchetto e lo elenca solo al proprietario', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1))
      .send({ name: 'Comfort', equipment: { sunbeds: 2, deckchairs: 1 } })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Comfort', equipment: { sunbeds: 2, deckchairs: 1 } });
    const id = res.body.id as string;

    const listS2 = await request(app.getHttpServer()).get('/api/packages').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it('PATCH aggiorna nome/equipment del proprietario, 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Base', equipment: { sunbeds: 2 } }).expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/packages/${id}`).set(...bearer(token1)).send({ name: 'Base Plus', equipment: { sunbeds: 3 } }).expect(200);
    expect(patched.body).toMatchObject({ id, name: 'Base Plus', equipment: { sunbeds: 3 } });

    await request(app.getHttpServer()).patch(`/api/packages/${id}`).set(...bearer(token2)).send({ name: 'X' }).expect(404);
  });

  it('DELETE elimina il pacchetto e lo ritorna; 404 se inesistente', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Effimero', equipment: {} }).expect(201);
    const id = created.body.id as string;
    const del = await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(id);
    await request(app.getHttpServer()).delete(`/api/packages/${id}`).set(...bearer(token1)).expect(404);
  });

  it('POST rifiuta nome vuoto con 400', async () => {
    await request(app.getHttpServer()).post('/api/packages').set(...bearer(token1)).send({ name: '', equipment: {} }).expect(400);
  });

  it('DELETE di un pacchetto referenziato da una tariffa → 409', async () => {
    const pkg = await request(app.getHttpServer())
      .post('/api/packages').set(...bearer(token1)).send({ name: 'Referenziato', equipment: {} }).expect(201);
    const season = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Stagione Pkg', startDate: '2029-06-01', endDate: '2029-09-30' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId: season.body.id, packageId: pkg.body.id, price: 40 }).expect(201);

    await request(app.getHttpServer()).delete(`/api/packages/${pkg.body.id}`).set(...bearer(token1)).expect(409);
  });
});
