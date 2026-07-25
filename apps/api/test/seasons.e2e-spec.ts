import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

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
    app = await createTestApp(moduleRef);
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
        await tx.renewalCampaign.deleteMany({});
        await tx.rentalTariff.deleteMany({});
        await tx.rentalItem.deleteMany({});
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

  // Season è referenziata da QUATTRO FK RESTRICT (Pricing, RenewalCampaign ×2, RentalTariff). La
  // cascata applicativa ne conosce una sola: le altre affioravano come P2003 → 500 (P1-002/AUD-008).
  const makeSeason = async (name: string, year: number): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name, startDate: `${year}-06-01`, endDate: `${year}-09-30` })
      .expect(201);
    return res.body.id as string;
  };

  it('DELETE di una stagione con tariffe noleggio → 409 (non 500)', async () => {
    const seasonId = await makeSeason('Con noleggi', 2031);
    await prisma.forTenant(s1, async (tx) => {
      const item = await tx.rentalItem.create({
        data: { establishmentId: s1, name: 'Pedalò' },
      });
      await tx.rentalTariff.create({
        data: { establishmentId: s1, rentalItemId: item.id, seasonId, label: 'Ora', price: 15, sortOrder: 1 },
      });
    });
    const res = await request(app.getHttpServer()).delete(`/api/seasons/${seasonId}`).set(...bearer(token1)).expect(409);
    // Il messaggio NOMINA la dipendenza: è la guardia del service, non il backstop generico del
    // filtro Prisma (che direbbe «collegata ad altri dati» senza dire a cosa).
    expect(res.body.message).toBe('Stagione in uso da campagne di rinnovo o tariffe noleggio: non eliminabile.');
  });

  it('DELETE di una stagione usata da una campagna di rinnovo → 409 (non 500)', async () => {
    const origin = await makeSeason('Origine campagna', 2032);
    const destination = await makeSeason('Destinazione campagna', 2033);
    await prisma.forTenant(s1, (tx) =>
      tx.renewalCampaign.create({
        data: {
          establishmentId: s1,
          originSeasonId: origin,
          destinationSeasonId: destination,
          deadline: new Date('2033-05-01T00:00:00Z'),
        },
      }),
    );
    await request(app.getHttpServer()).delete(`/api/seasons/${origin}`).set(...bearer(token1)).expect(409);
    await request(app.getHttpServer()).delete(`/api/seasons/${destination}`).set(...bearer(token1)).expect(409);
  });

  it('DELETE di una stagione inesistente → 404', async () => {
    await request(app.getHttpServer())
      .delete('/api/seasons/99999999-9999-9999-9999-999999999999').set(...bearer(token1)).expect(404);
  });
});
