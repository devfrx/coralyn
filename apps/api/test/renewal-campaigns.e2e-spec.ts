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

describe('Renewal campaigns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;
  let season2026: string;
  let season2027: string;

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Campaign A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Campaign B' } })).id;
    await createUser(prisma, { email: 'admin.rc1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.rc2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.rc1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.rc2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1);
    const seed = await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
    season2026 = seed.seasonId;
    season2027 = seed.season2027Id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.renewalCampaign.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.rc1@e2e.test', 'admin.rc2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const mkUmbrella = (label: string, order: number) =>
    prisma.forTenant(s1, (tx) =>
      tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: order } }),
    );

  const mkCustomer = (firstName: string) =>
    prisma.forTenant(s1, (tx) => tx.customer.create({ data: { establishmentId: s1, firstName, lastName: 'Test' } }));

  describe('open', () => {
    it('felice: 201 con originSeasonId/destinationSeasonId/deadline', async () => {
      const res = await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201);
      expect(res.body.originSeasonId).toBeTruthy();
      expect(res.body.destinationSeasonId).toBeTruthy();
      expect(res.body.deadline).toBe('2099-12-31');
      expect(res.body.originSeasonId).not.toBe(res.body.destinationSeasonId);

      // cleanup per non lasciare una campagna aperta che sporca gli altri test 'open'
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${res.body.id}`).set(...bearer(token1)).expect(200);
    });

    it('validazione: origine = destinazione (stessa stagione) → 422', async () => {
      await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2026, deadline: '2099-12-31' }).expect(422);
    });

    it('validazione: destinazione precedente all\'origine → 422', async () => {
      await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2027, destinationSeasonId: season2026, deadline: '2099-12-31' }).expect(422);
    });

    it('validazione: stagione inesistente → 422', async () => {
      await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: '00000000-0000-0000-0000-0000000000ff', deadline: '2099-12-31' }).expect(422);
    });

    it('duplicato → 409 sulla stessa destinazione', async () => {
      const first = await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201);
      await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(409);
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${first.body.id}`).set(...bearer(token1)).expect(200);
    });

    it('open con destinazione che si SOVRAPPONE all\'origine → 422 (invariante rinnovo-safe)', async () => {
      // Origine [05-01, 09-30], destinazione [09-01, 12-31]: dest.startDate <= origin.endDate → rifiutata.
      const { originId, destId } = await prisma.forTenant(s1, async (tx) => {
        const origin = await tx.season.create({
          data: { establishmentId: s1, name: 'Ovl origine', startDate: new Date('2029-05-01T00:00:00Z'), endDate: new Date('2029-09-30T00:00:00Z') },
        });
        const dest = await tx.season.create({
          data: { establishmentId: s1, name: 'Ovl dest', startDate: new Date('2029-09-01T00:00:00Z'), endDate: new Date('2029-12-31T00:00:00Z') },
        });
        return { originId: origin.id, destId: dest.id };
      });
      await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: originId, destinationSeasonId: destId, deadline: '2029-04-01' }).expect(422);
    });
  });

  describe('get / finestre / close', () => {
    let campaignId: string;
    let custSenior: string;
    let custJunior: string;
    let srcSeniorId: string; // anzianità 2: abbonamento 2025 rinnovato a 2026
    let srcJuniorId: string; // anzianità 1: abbonamento 2026 diretto

    beforeAll(async () => {
      custSenior = (await mkCustomer('Senior')).id;
      custJunior = (await mkCustomer('Junior')).id;

      // Anzianità del "senior": una stagione 2025 dedicata (non nel seed condiviso) rinnovata a 2026,
      // cosi' srcSeniorId (il rinnovo 2026) ha seniority 2 nel calcolo della catena.
      await prisma.forTenant(s1, async (tx) => {
        const season2025 = await tx.season.create({
          data: { establishmentId: s1, name: 'Estate 2025 (rc-test)', startDate: new Date('2025-05-01T00:00:00Z'), endDate: new Date('2025-09-30T00:00:00Z') },
        });
        const pricing2025 = await tx.pricing.create({ data: { establishmentId: s1, seasonId: season2025.id } });
        await tx.rate.create({ data: { establishmentId: s1, pricingId: pricing2025.id, type: 'subscription', price: 750 } });
      });
      const uSenior2025 = (await mkUmbrella('rc-senior-2025', 200)).id;
      const uJunior = (await mkUmbrella('rc-junior', 202)).id;

      // Il renew riusa lo stesso umbrellaId della sorgente (nessun conflitto: stagioni diverse).
      const src2025 = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custSenior, umbrellaId: uSenior2025, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2025-07-01' }).expect(201);
      const renewed2026 = await request(app.getHttpServer()).post(`/api/bookings/${src2025.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2026 }).expect(201);
      srcSeniorId = renewed2026.body.id; // seniority 2 nella stagione 2026 (origine della campagna)

      // Abbonamento "junior" 2026 diretto, sull'ombrellone dedicato: seniority 1.
      const juniorRes = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custJunior, umbrellaId: uJunior, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2026-07-01' }).expect(201);
      srcJuniorId = juniorRes.body.id;

      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;
    });

    afterAll(async () => {
      // Se la campagna e' ancora aperta (alcuni test la chiudono), la ripuliamo per non sporcare 'open'.
      await prisma.forTenant(s1, (tx) => tx.renewalCampaign.deleteMany({ where: { id: campaignId } }));
    });

    it('finestre non vuote, state open, seniority>=1', async () => {
      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      expect(res.body.windows.length).toBeGreaterThan(0);
      for (const w of res.body.windows) {
        expect(w.state).toBe('open');
        expect(w.seniority).toBeGreaterThanOrEqual(1);
      }
      const senior = res.body.windows.find((w: { sourceBookingId: string }) => w.sourceBookingId === srcSeniorId);
      const junior = res.body.windows.find((w: { sourceBookingId: string }) => w.sourceBookingId === srcJuniorId);
      expect(senior).toBeTruthy();
      expect(junior).toBeTruthy();
    });

    it('ordinamento per anzianità desc con due abbonati di anzianità diversa', async () => {
      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      const seniorities = res.body.windows.map((w: { seniority: number }) => w.seniority);
      const sorted = [...seniorities].sort((a: number, b: number) => b - a);
      expect(seniorities).toEqual(sorted); // lista non-crescente per anzianità

      const senior = res.body.windows.find((w: { sourceBookingId: string }) => w.sourceBookingId === srcSeniorId);
      const junior = res.body.windows.find((w: { sourceBookingId: string }) => w.sourceBookingId === srcJuniorId);
      expect(senior.seniority).toBe(2);
      expect(junior.seniority).toBe(1);
      expect(res.body.windows.indexOf(senior)).toBeLessThan(res.body.windows.indexOf(junior));
    });

    it('exercised: dopo il renew della sorgente verso la destinazione, la sua finestra e\' exercised', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${srcJuniorId}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(201);

      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      const w = res.body.windows.find((x: { sourceBookingId: string }) => x.sourceBookingId === srcJuniorId);
      expect(w.state).toBe('exercised');
    });

    it('expired: campagna con deadline passata → finestra non rinnovata expired', async () => {
      // Chiude la campagna 'open' corrente per aprirne una expired sulla stessa destinazione.
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${campaignId}`).set(...bearer(token1)).expect(200);

      const expiredCampaign = await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2000-01-01' }).expect(201);

      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      const w = res.body.windows.find((x: { sourceBookingId: string }) => x.sourceBookingId === srcSeniorId);
      expect(w.state).toBe('expired');

      campaignId = expiredCampaign.body.id;
    });

    // Nota: NestJS tratta un ritorno controller `null` come "nessun body" (isNil → response.send()
    // senza argomenti): la risposta e' 200 con body vuoto, non la stringa JSON 'null'. supertest
    // esposi quindi `res.body` come `{}` (niente da parsare) e `res.text` come stringa vuota.
    it('get → nessun corpo quando non esiste campagna per la destinazione', async () => {
      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2026}`).set(...bearer(token1)).expect(200);
      expect(res.text).toBe('');
    });

    it('close: 200 { ok:true }, poi get → nessun corpo', async () => {
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${campaignId}`).set(...bearer(token1)).expect(200)
        .then((r) => expect(r.body).toEqual({ ok: true }));
      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      expect(res.text).toBe('');
    });

    it('delete id inesistente → 404', async () => {
      await request(app.getHttpServer()).delete('/api/renewal-campaigns/99999999-9999-9999-9999-999999999999').set(...bearer(token1)).expect(404);
    });

    it('delete id malformato → 404 (niente 500)', async () => {
      await request(app.getHttpServer()).delete('/api/renewal-campaigns/not-a-uuid').set(...bearer(token1)).expect(404);
    });

    it('delete cross-tenant → 404', async () => {
      const created = await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201);
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${created.body.id}`).set(...bearer(token2)).expect(404);
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${created.body.id}`).set(...bearer(token1)).expect(200);
    });

    // Chiude un gap di copertura del Task 4: la scadenza è inclusiva (today == deadline → ancora 'open'),
    // ma nessun test lo esercitava esplicitamente con la data odierna reale.
    it('boundary: deadline == oggi → finestra ancora open (scadenza inclusiva)', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
      const boundaryCampaign = await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
        .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: today }).expect(201);

      const res = await request(app.getHttpServer()).get(`/api/renewal-campaigns?destinationSeasonId=${season2027}`).set(...bearer(token1)).expect(200);
      const w = res.body.windows.find((x: { sourceBookingId: string }) => x.sourceBookingId === srcSeniorId);
      expect(w.state).toBe('open');

      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${boundaryCampaign.body.id}`).set(...bearer(token1)).expect(200);
    });
  });

  describe('hold di prelazione (D-011)', () => {
    let custA: string;
    let custB: string;
    let uX: string;
    let campaignId: string;

    beforeAll(async () => {
      custA = (await mkCustomer('HoldA')).id;
      custB = (await mkCustomer('HoldB')).id;
      uX = (await mkUmbrella('rc-hold-uX', 300)).id;

      // A: abbonamento 2026 su uX/Mattina (avente-diritto della campagna 2026→2027).
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custA, umbrellaId: uX, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2026-07-01' }).expect(201);
    });

    afterEach(async () => {
      // Ogni test gestisce la propria campagna (aperta/chiusa/scaduta): la ripuliamo per isolare i casi.
      if (campaignId) {
        await prisma.forTenant(s1, (tx) => tx.renewalCampaign.deleteMany({ where: { id: campaignId } }));
      }
    });

    it('hold attivo: campagna aperta → B non può prenotare uX/Mattina in 2027 → 409', async () => {
      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;

      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custB, umbrellaId: uX, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2027-07-01' })
        .expect(409);
      expect(res.body.message).toBe('Ombrellone riservato per prelazione');
    });

    it('il proprio rinnovo non è bloccato dal proprio hold: A rinnova uX verso 2027 → 201', async () => {
      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;

      const srcA = await prisma.forTenant(s1, (tx) =>
        tx.booking.findFirst({ where: { customerId: custA, umbrellaId: uX, type: 'subscription', status: 'confirmed' } }),
      );
      const renewed = await request(app.getHttpServer()).post(`/api/bookings/${srcA!.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: season2027 }).expect(201);

      // Cleanup: annulla il rinnovo per non lasciare uX occupato in 2027 per gli altri test del blocco.
      await request(app.getHttpServer()).delete(`/api/bookings/${renewed.body.id}`).set(...bearer(token1)).expect(200);
    });

    it('rilascio lazy: campagna scaduta (deadline 2000-01-01) → B prenota uX in 2027 → 201', async () => {
      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2000-01-01' }).expect(201)
      ).body.id;

      const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custB, umbrellaId: uX, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2027-07-01' })
        .expect(201);

      // Cleanup: libera uX/2027 per gli altri test del blocco.
      await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    });

    it('chiusura libera: campagna aperta → DELETE → B prenota uX in 2027 → 201', async () => {
      const opened = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;
      await request(app.getHttpServer()).delete(`/api/renewal-campaigns/${opened}`).set(...bearer(token1)).expect(200);

      const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custB, umbrellaId: uX, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2027-07-01' })
        .expect(201);

      // Cleanup: libera uX/2027 per gli altri test del blocco.
      await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    });

    it('isolamento: l\'hold del tenant1 non tocca il tenant2', async () => {
      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;

      // Struttura minima indipendente per s2 (nessuna campagna, nessun conflitto): deve prenotare liberamente.
      const idsS2 = await seedMapTenant(prisma, s2);
      await seedPricingTenant(prisma, s2, { afternoonSlotId: idsS2.slotAfternoon });
      const custS2 = await prisma.forTenant(s2, (tx) =>
        tx.customer.create({ data: { establishmentId: s2, firstName: 'S2Cust', lastName: 'Test' } }),
      );

      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token2))
        .send({ customerId: custS2.id, umbrellaId: idsS2.u1, timeSlotId: idsS2.slotMorning, type: 'subscription', startDate: '2027-07-01' })
        .expect(201);

      await prisma.forTenant(s2, (tx) => tx.booking.deleteMany({}));
      await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
      await cleanPricingTenant(prisma, s2);
      await cleanMapTenant(prisma, s2);
    });

    it('fascia diversa non è bloccata: A tiene Mattina, B prenota uX/Pomeriggio in 2027 → 201', async () => {
      campaignId = (
        await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(token1))
          .send({ originSeasonId: season2026, destinationSeasonId: season2027, deadline: '2099-12-31' }).expect(201)
      ).body.id;

      const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send({ customerId: custB, umbrellaId: uX, timeSlotId: ids.slotAfternoon, type: 'subscription', startDate: '2027-07-01' })
        .expect(201);

      // Cleanup: libera uX/2027/Pomeriggio per gli altri test del blocco.
      await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    });
  });
});
