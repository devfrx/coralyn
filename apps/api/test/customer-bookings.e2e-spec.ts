import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Customer bookings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let t1: string;
  let t2: string;
  let ids: MapSeedIds;
  let seasonAId: string; // 2026
  let seasonBId: string; // 2027 (per il rinnovo)
  let customerId: string;
  let emptyCustomerId: string;
  let umbrellaId2: string;
  let pcId: string;
  let pricingPackageId: string;
  let packCustomerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'CB A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'CB B' } })).id;
    await createUser(prisma, { email: 'cb.s1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'cb.s2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    t1 = await login(app, 'cb.s1@e2e.test', 'pw1');
    t2 = await login(app, 'cb.s2@e2e.test', 'pw2');

    // Catalogo minimo per s1 (mappa + listino, riusando gli helper condivisi dai test bookings.e2e-spec).
    ids = await seedMapTenant(prisma, s1);
    const pricing = await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
    seasonAId = pricing.seasonId;
    seasonBId = pricing.season2027Id;
    pricingPackageId = pricing.packageId;

    await prisma.forTenant(s1, async (tx) => {
      const cust = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } });
      customerId = cust.id;
      const empty = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Nessuna', lastName: 'Prenotazione' } });
      emptyCustomerId = empty.id;
      // Ombrellone dedicato ai casi prelazione, per non collidere con Mario/A12 (anti-overlap/hold).
      const u2 = await tx.umbrella.create({
        data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label: 'A13', logicalOrder: 99 },
      });
      umbrellaId2 = u2.id;
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.renewalCampaign.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['cb.s1@e2e.test', 'cb.s2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('ritorna [] per un cliente senza prenotazioni', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${emptyCustomerId}/bookings`)
      .set(...bearer(t1))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('ritorna il mix arricchito (umbrellaLabel/seasonName), ordinato desc; la subscription ha seniority/renewed', async () => {
    // daily nel 2026, su un ombrellone dedicato per non collidere con altri test.
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-10' }).expect(201);
    // subscription nel 2026 (durata = stagione) su un ombrellone diverso.
    const sub = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId: ids.u2, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2026-06-15' }).expect(201);
    // rinnovo nel 2027 → seniority 2, renewed=true sull'origine.
    const renewal = await request(app.getHttpServer()).post(`/api/bookings/${sub.body.id}/renew`).set(...bearer(t1))
      .send({ destinationSeasonId: seasonBId }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`)
      .set(...bearer(t1))
      .expect(200);
    expect(res.body).toHaveLength(3);
    // ordinati per startDate desc: rinnovo 2027 → sub 2026 → daily 2026-07-10.
    expect(res.body[0].startDate >= res.body[1].startDate).toBe(true);
    expect(res.body[1].startDate >= res.body[2].startDate).toBe(true);
    expect(res.body.find((b: { id: string }) => b.id === renewal.body.id).umbrellaLabel).toBe('2');
    const origin = res.body.find((b: { id: string }) => b.id === sub.body.id);
    expect(origin.umbrellaLabel).toBe('2');
    expect(origin.seasonName).toBe('Estate 2026');
    expect(origin.sectorName).toBe('Centro');
    expect(origin.type).toBe('subscription');
    expect(origin.seniority).toBe(1);
    expect(origin.renewed).toBe(true);
    const renewalRow = res.body.find((b: { previousBookingId?: string }) => b.previousBookingId === sub.body.id);
    expect(renewalRow.seniority).toBe(2);
    expect(renewalRow.renewed).toBe(false);
    // il daily non ha campi da subscription
    const daily = res.body.find((b: { type: string }) => b.type === 'daily');
    expect(daily.umbrellaLabel).toBe('1');
    expect(daily.sectorName).toBe('Centro');
    expect(daily.seniority).toBeUndefined();
    expect(daily.renewed).toBeUndefined();
  });

  it('arricchisce packageName (se presente) e sectorName; packageName assente senza pacchetto', async () => {
    await prisma.forTenant(s1, async (tx) => {
      const c = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Pack', lastName: 'Test' } });
      packCustomerId = c.id;
    });
    const withPkg = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: packCustomerId, umbrellaId: umbrellaId2, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-07-05', packageId: pricingPackageId }).expect(201);
    const noPkg = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: packCustomerId, umbrellaId: umbrellaId2, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-07-06' }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/customers/${packCustomerId}/bookings`).set(...bearer(t1)).expect(200);
    const rowWith = res.body.find((b: { id: string }) => b.id === withPkg.body.id);
    const rowNo = res.body.find((b: { id: string }) => b.id === noPkg.body.id);
    expect(rowWith.packageName).toBe('Standard');
    expect(rowWith.sectorName).toBe('Centro');
    expect(rowNo.packageName).toBeUndefined();
    expect(rowNo.sectorName).toBe('Centro');
  });

  it('mostra anche una prenotazione cancellata', async () => {
    const daily = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-01' }).expect(201);
    await request(app.getHttpServer()).delete(`/api/bookings/${daily.body.id}`).set(...bearer(t1)).expect(200);
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`).set(...bearer(t1)).expect(200);
    const cancelled = res.body.find((b: { id: string }) => b.id === daily.body.id);
    expect(cancelled).toBeDefined();
    expect(cancelled.status).toBe('cancelled');
  });

  it('isolamento tenant: il cliente di s1 è invisibile a s2 → []', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`).set(...bearer(t2)).expect(200);
    expect(res.body).toEqual([]);
  });

  it('valorizza prelazione sulla subscription con campagna APERTA; assente se scaduta/esercitata', async () => {
    // Cliente fresco per isolare gli stati (evita interferenze coi test precedenti).
    await prisma.forTenant(s1, async (tx) => {
      const c = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Prela', lastName: 'Test' } });
      pcId = c.id;
    });
    const sub = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: pcId, umbrellaId: umbrellaId2, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2026-06-15' }).expect(201);
    const subId = sub.body.id;

    // Campagna origine 2026 → dest 2027, deadline FUTURA.
    await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(t1))
      .send({ originSeasonId: seasonAId, destinationSeasonId: seasonBId, deadline: '2099-01-01' }).expect(201);

    let res = await request(app.getHttpServer()).get(`/api/customers/${pcId}/bookings`).set(...bearer(t1)).expect(200);
    let origin = res.body.find((b: { id: string }) => b.id === subId);
    expect(origin.prelazione).toBeDefined();
    expect(origin.prelazione.destinationSeasonName).toBe('Estate 2027');
    expect(origin.prelazione.deadline).toBe('2099-01-01');

    // Esercitata: dopo il rinnovo verso 2027 → prelazione assente.
    await request(app.getHttpServer()).post(`/api/bookings/${subId}/renew`).set(...bearer(t1))
      .send({ destinationSeasonId: seasonBId }).expect(201);
    res = await request(app.getHttpServer()).get(`/api/customers/${pcId}/bookings`).set(...bearer(t1)).expect(200);
    origin = res.body.find((b: { id: string }) => b.id === subId);
    expect(origin.prelazione).toBeUndefined();
  });
});
