import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

/** yyyy-mm-dd @ mezzanotte UTC, con offset in giorni rispetto a `todayIso`. */
function isoPlusDays(todayIso: string, delta: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let t1: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'RPT A' } })).id;
    await createUser(prisma, { email: 'rpt.s1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    t1 = await login(app, 'rpt.s1@e2e.test', 'pw1');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'rpt.s1@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('200 con la forma del summary e default period=week', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/summary')
      .set(...bearer(t1))
      .expect(200);
    expect(res.body.period).toBe('week');
    expect(res.body.kpis).toHaveProperty('revenue');
    expect(res.body.kpis).toHaveProperty('outstanding');
    expect(res.body.kpis).toHaveProperty('occupancyPct');
    expect(res.body.kpis).toHaveProperty('activeSubscriptions');
    expect(Array.isArray(res.body.revenueSeries)).toBe(true);
    expect(res.body.revenueSeries).toHaveLength(7);
    expect(Array.isArray(res.body.expiringRenewals)).toBe(true);
  });

  it('period invalido → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/reports/summary?period=year')
      .set(...bearer(t1))
      .expect(400);
  });

  it('senza campagna rinnovi aperta → expiringRenewals vuoto', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/summary')
      .set(...bearer(t1))
      .expect(200);
    expect(res.body.expiringRenewals).toEqual([]);
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).get('/api/reports/summary').expect(401);
  });

  // --- Tenant separato per i casi seminati (non disturba le asserzioni empty-tenant sopra). ---
  describe('KPI incasso: week vs season (dati seminati)', () => {
    let s2: string;
    let t2: string;
    let map: MapSeedIds;
    let todayIso: string;

    beforeAll(async () => {
      s2 = (await prisma.establishment.create({ data: { name: 'RPT B' } })).id;
      await createUser(prisma, { email: 'rpt.s2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
      t2 = await login(app, 'rpt.s2@e2e.test', 'pw2');
      map = await seedMapTenant(prisma, s2);
      todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());

      const seasonStart = new Date(`${isoPlusDays(todayIso, -30)}T00:00:00Z`);
      const seasonEnd = new Date(`${isoPlusDays(todayIso, 30)}T00:00:00Z`);
      const todayDate = new Date(`${todayIso}T00:00:00Z`);
      const tenDaysAgo = new Date(`${isoPlusDays(todayIso, -10)}T00:00:00Z`);

      const custId = await prisma.forTenant(s2, async (tx) => {
        await tx.season.create({
          data: { establishmentId: s2, name: 'Stagione corrente', startDate: seasonStart, endDate: seasonEnd },
        });
        const cust = await tx.customer.create({
          data: { establishmentId: s2, firstName: 'Rev', lastName: 'Test' },
        });
        return cust.id;
      });
      // Prenotazione con incasso OGGI (rientra sia in week sia in season). Insert diretto + coverage
      // (helper Task 1): dopo la migrate le letture d'occupazione (mappa/report) leggono da BookingCoverage.
      const b1 = await insertBookingWithCoverage(prisma, s2, {
        establishmentId: s2, customerId: custId, umbrellaId: map.u1, timeSlotId: map.slotMorning,
        startDate: todayDate, endDate: todayDate,
      });
      // Prenotazione con incasso 10 giorni fa (FUORI dalla week, DENTRO la season).
      const b2 = await insertBookingWithCoverage(prisma, s2, {
        establishmentId: s2, customerId: custId, umbrellaId: map.u2, timeSlotId: map.slotMorning,
        startDate: tenDaysAgo, endDate: tenDaysAgo,
      });
      // Campi di incasso non coperti dall'helper (type/totalPrice fissi lì): completati con update diretto.
      await prisma.forTenant(s2, async (tx) => {
        await tx.booking.update({
          where: { id: b1.id },
          data: { totalPrice: 100, paymentStatus: 'paid', amountCollected: 100, paymentMethod: 'cash', collectionDate: todayDate },
        });
        await tx.booking.update({
          where: { id: b2.id },
          data: { totalPrice: 40, paymentStatus: 'paid', amountCollected: 40, paymentMethod: 'cash', collectionDate: tenDaysAgo },
        });
      });
    });

    afterAll(async () => {
      await prisma.forTenant(s2, (tx) => tx.booking.deleteMany({}));
      await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
      await prisma.forTenant(s2, (tx) => tx.season.deleteMany({}));
      await cleanMapTenant(prisma, s2);
      await prisma.user.deleteMany({ where: { email: 'rpt.s2@e2e.test' } });
      await prisma.establishment.deleteMany({ where: { id: s2 } });
    });

    it('period=week → solo l\'incasso di oggi; period=season → l\'intera stagione (strettamente maggiore)', async () => {
      const week = await request(app.getHttpServer())
        .get('/api/reports/summary?period=week')
        .set(...bearer(t2))
        .expect(200);
      expect(week.body.kpis.revenue).toBe(100);

      const season = await request(app.getHttpServer())
        .get('/api/reports/summary?period=season')
        .set(...bearer(t2))
        .expect(200);
      expect(season.body.kpis.revenue).toBe(140);
      expect(season.body.kpis.revenue).toBeGreaterThan(week.body.kpis.revenue);
    });
  });

  // --- Selezione campagna: con una scaduta + una aperta, il report deve mostrare l'APERTA. ---
  describe('getActiveCampaign: sceglie la campagna aperta, non quella scaduta (dati seminati)', () => {
    let s3: string;
    let t3: string;
    let map: MapSeedIds;
    let todayIso: string;

    beforeAll(async () => {
      s3 = (await prisma.establishment.create({ data: { name: 'RPT C' } })).id;
      await createUser(prisma, { email: 'rpt.s3@e2e.test', password: 'pw3', role: Role.admin, establishmentId: s3 });
      t3 = await login(app, 'rpt.s3@e2e.test', 'pw3');
      map = await seedMapTenant(prisma, s3);
      todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());

      // Stagione di ORIGINE nel passato (per gli aventi-diritto abbonati confermati).
      const originStart = new Date(`${isoPlusDays(todayIso, -60)}T00:00:00Z`);
      const originEnd = new Date(`${isoPlusDays(todayIso, -40)}T00:00:00Z`);
      // Due stagioni di DESTINAZIONE distinte (unique [establishmentId, destinationSeasonId]).
      const destAStart = new Date(`${isoPlusDays(todayIso, 10)}T00:00:00Z`);
      const destAEnd = new Date(`${isoPlusDays(todayIso, 40)}T00:00:00Z`);
      const destBStart = new Date(`${isoPlusDays(todayIso, 50)}T00:00:00Z`);
      const destBEnd = new Date(`${isoPlusDays(todayIso, 80)}T00:00:00Z`);
      // Deadline: campagna SCADUTA (deadline -5, la più vicina) vs APERTA (deadline +20).
      const expiredDeadline = new Date(`${isoPlusDays(todayIso, -5)}T00:00:00Z`);
      const openDeadline = new Date(`${isoPlusDays(todayIso, 20)}T00:00:00Z`);

      const { originId, destAId, destBId, custId } = await prisma.forTenant(s3, async (tx) => {
        const origin = await tx.season.create({
          data: { establishmentId: s3, name: 'Origine', startDate: originStart, endDate: originEnd },
        });
        const destA = await tx.season.create({
          data: { establishmentId: s3, name: 'Dest scaduta', startDate: destAStart, endDate: destAEnd },
        });
        const destB = await tx.season.create({
          data: { establishmentId: s3, name: 'Dest aperta', startDate: destBStart, endDate: destBEnd },
        });
        const cust = await tx.customer.create({
          data: { establishmentId: s3, firstName: 'Rinnovo', lastName: 'Cliente' },
        });
        return { originId: origin.id, destAId: destA.id, destBId: destB.id, custId: cust.id };
      });
      // Abbonato CONFERMATO nella stagione di origine → avente-diritto per entrambe le campagne.
      // Insert diretto + coverage (helper Task 1): mantiene l'invariante 1:1 anche se questo booking
      // è nel passato e non entra nelle letture d'occupazione "oggi" (map/report).
      const sub = await insertBookingWithCoverage(prisma, s3, {
        establishmentId: s3, customerId: custId, umbrellaId: map.u1, timeSlotId: map.slotMorning,
        startDate: originStart, endDate: originEnd,
      });
      await prisma.forTenant(s3, async (tx) => {
        await tx.booking.update({
          where: { id: sub.id },
          data: { type: 'subscription', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800 },
        });
        // Campagna SCADUTA (deadline più vicina → verrebbe scelta senza il filtro di apertura).
        await tx.renewalCampaign.create({
          data: {
            establishmentId: s3,
            originSeasonId: originId,
            destinationSeasonId: destAId,
            deadline: expiredDeadline,
          },
        });
        // Campagna APERTA (deadline futura).
        await tx.renewalCampaign.create({
          data: {
            establishmentId: s3,
            originSeasonId: originId,
            destinationSeasonId: destBId,
            deadline: openDeadline,
          },
        });
      });
    });

    afterAll(async () => {
      await prisma.forTenant(s3, (tx) => tx.renewalCampaign.deleteMany({}));
      await prisma.forTenant(s3, (tx) => tx.booking.deleteMany({}));
      await prisma.forTenant(s3, (tx) => tx.customer.deleteMany({}));
      await prisma.forTenant(s3, (tx) => tx.season.deleteMany({}));
      await cleanMapTenant(prisma, s3);
      await prisma.user.deleteMany({ where: { email: 'rpt.s3@e2e.test' } });
      await prisma.establishment.deleteMany({ where: { id: s3 } });
    });

    it('surfaces la finestra della campagna APERTA (expiringRenewals non vuoto), con la deadline futura', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set(...bearer(t3))
        .expect(200);
      expect(res.body.expiringRenewals.length).toBeGreaterThan(0);
      // La deadline mostrata è quella della campagna APERTA (futura), non della scaduta.
      expect(res.body.expiringRenewals[0].deadline).toBe(isoPlusDays(todayIso, 20));
    });
  });

  // --- «Da incassare» (outstanding): un abbonamento DISDETTO (terminatedAt) resta status='confirmed'
  //     ma il suo residuo NON è più esigibile → non deve contribuire all'outstanding (§4.3). ---
  describe('KPI da incassare (outstanding): esclude i disdetti (dati seminati)', () => {
    let s4: string;
    let t4: string;
    let map: MapSeedIds;
    let todayIso: string;

    beforeAll(async () => {
      s4 = (await prisma.establishment.create({ data: { name: 'RPT D' } })).id;
      await createUser(prisma, { email: 'rpt.s4@e2e.test', password: 'pw4', role: Role.admin, establishmentId: s4 });
      t4 = await login(app, 'rpt.s4@e2e.test', 'pw4');
      map = await seedMapTenant(prisma, s4);
      todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());

      const spanStart = new Date(`${isoPlusDays(todayIso, -30)}T00:00:00Z`);
      const spanEnd = new Date(`${isoPlusDays(todayIso, 30)}T00:00:00Z`);

      const custId = await prisma.forTenant(s4, async (tx) => {
        const cust = await tx.customer.create({ data: { establishmentId: s4, firstName: 'Out', lastName: 'Standing' } });
        return cust.id;
      });
      // Abbonamento ATTIVO, pagato a metà: residuo esigibile = 500 - 200 = 300.
      const bActive = await insertBookingWithCoverage(prisma, s4, {
        establishmentId: s4, customerId: custId, umbrellaId: map.u1, timeSlotId: map.slotMorning,
        startDate: spanStart, endDate: spanEnd,
      });
      // Abbonamento DISDETTO, pagato a metà: stesso residuo 300, ma terminatedAt ≠ null → NON esigibile.
      const bTerm = await insertBookingWithCoverage(prisma, s4, {
        establishmentId: s4, customerId: custId, umbrellaId: map.u2, timeSlotId: map.slotMorning,
        startDate: spanStart, endDate: spanEnd,
      });
      await prisma.forTenant(s4, async (tx) => {
        await tx.booking.update({
          where: { id: bActive.id },
          data: { type: 'subscription', totalPrice: 500, paymentStatus: 'partial', amountCollected: 200 },
        });
        await tx.booking.update({
          where: { id: bTerm.id },
          data: { type: 'subscription', totalPrice: 500, paymentStatus: 'partial', amountCollected: 200, terminatedAt: new Date() },
        });
      });
    });

    afterAll(async () => {
      await prisma.forTenant(s4, (tx) => tx.booking.deleteMany({}));
      await prisma.forTenant(s4, (tx) => tx.customer.deleteMany({}));
      await cleanMapTenant(prisma, s4);
      await prisma.user.deleteMany({ where: { email: 'rpt.s4@e2e.test' } });
      await prisma.establishment.deleteMany({ where: { id: s4 } });
    });

    it('outstanding conta solo il residuo dell\'abbonamento attivo, non del disdetto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/summary')
        .set(...bearer(t4))
        .expect(200);
      expect(res.body.kpis.outstanding).toBe(300);
    });
  });
});
