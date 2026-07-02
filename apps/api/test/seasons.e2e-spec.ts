import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

describe('Seasons (e2e)', () => {
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
    s1 = (await prisma.establishment.create({ data: { name: 'Seas A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Seas B' } })).id;
    await createUser(prisma, { email: 'admin.se1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.se2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.se1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.se2@e2e.test', 'pw2');
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.rate.deleteMany({});
        await tx.pricing.deleteMany({});
        await tx.season.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['admin.se1@e2e.test', 'admin.se2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/seasons').expect(401);
  });

  it('POST crea la stagione E il suo Pricing 1:1, non visibile ad altro tenant', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' });
    const seasonId = res.body.id as string;

    // Pricing 1:1 creato automaticamente (verifica diretta in DB, tenant-scoped).
    const pricing = await prisma.forTenant(s1, (tx) => tx.pricing.findFirst({ where: { seasonId } }));
    expect(pricing).not.toBeNull();

    const listS1 = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(token1)).expect(200);
    expect(listS1.body.some((s: { id: string }) => s.id === seasonId)).toBe(true);
    const listS2 = await request(app.getHttpServer()).get('/api/seasons').set(...bearer(token2)).expect(200);
    expect(listS2.body.some((s: { id: string }) => s.id === seasonId)).toBe(false);
  });

  it('POST rifiuta startDate > endDate con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Rovescia', startDate: '2028-09-30', endDate: '2028-06-01' })
      .expect(400);
  });

  it('DELETE cancella a cascata (Rate → Pricing → Season) e ritorna la stagione', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Da cancellare', startDate: '2029-06-01', endDate: '2029-09-30' })
      .expect(201);
    const seasonId = created.body.id as string;
    const pricing = await prisma.forTenant(s1, (tx) => tx.pricing.findFirst({ where: { seasonId } }));
    // semina una Rate catch-all DIRETTAMENTE in DB per esercitare la cascata (nessuna dipendenza da /api/rates)
    await prisma.forTenant(s1, (tx) =>
      tx.rate.create({ data: { establishmentId: s1, pricingId: pricing!.id, price: 20 } }),
    );

    const del = await request(app.getHttpServer()).delete(`/api/seasons/${seasonId}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(seasonId);

    const ratesLeft = await prisma.forTenant(s1, (tx) => tx.rate.count({ where: { pricingId: pricing!.id } }));
    const pricingLeft = await prisma.forTenant(s1, (tx) => tx.pricing.count({ where: { seasonId } }));
    const seasonLeft = await prisma.forTenant(s1, (tx) => tx.season.count({ where: { id: seasonId } }));
    expect([ratesLeft, pricingLeft, seasonLeft]).toEqual([0, 0, 0]);
  });

  it('DELETE di una stagione inesistente → 404', async () => {
    await request(app.getHttpServer())
      .delete('/api/seasons/99999999-9999-9999-9999-999999999999').set(...bearer(token1)).expect(404);
  });
});
