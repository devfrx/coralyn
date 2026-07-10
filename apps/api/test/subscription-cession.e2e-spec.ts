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

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Subscription cession (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let adminToken: string;
  let staffToken: string;
  let otherTenantAdminToken: string;
  let ids: MapSeedIds;
  let customerAId: string; // titolare originario
  let customerBId: string; // subentrante
  let customerBFullName: string;
  let umbrellaSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'Cession A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Cession B' } })).id;
    await createUser(prisma, { email: 'cession.admin1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'cession.staff1@e2e.test', password: 'pws1', role: Role.staff, establishmentId: s1 });
    await createUser(prisma, { email: 'cession.admin2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    adminToken = await login(app, 'cession.admin1@e2e.test', 'pw1');
    staffToken = await login(app, 'cession.staff1@e2e.test', 'pws1');
    otherTenantAdminToken = await login(app, 'cession.admin2@e2e.test', 'pw2');

    ids = await seedMapTenant(prisma, s1);
    await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });

    await prisma.forTenant(s1, async (tx) => {
      const a = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } });
      customerAId = a.id;
      const b = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Luca', lastName: 'Bianchi' } });
      customerBId = b.id;
      customerBFullName = `${b.firstName} ${b.lastName}`;
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({
      where: { email: { in: ['cession.admin1@e2e.test', 'cession.staff1@e2e.test', 'cession.admin2@e2e.test'] } },
    });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  /** Abbonamento full-season 2026 (2026-05-01 → 2026-09-30) confermato per A, su ombrellone dedicato,
   *  con totalPrice/amountCollected 1000 impostati direttamente (bypassa il listino demo da 800). */
  const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
    umbrellaSeq += 1;
    const label = `C${umbrellaSeq}`;
    const u = await prisma.forTenant(s1, (tx) =>
      tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 200 + umbrellaSeq } }),
    );
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .set(...bearer(adminToken))
      .send({ customerId: customerAId, umbrellaId: u.id, timeSlotId: ids.slotMorning, type: 'subscription', startDate: '2026-07-01' })
      .expect(201);
    const id = res.body.id as string;
    // Forza totalPrice/amountCollected a 1000/1000 come richiesto dal brief (ADR-0047 money scenario).
    await prisma.forTenant(s1, (tx) =>
      tx.booking.update({ where: { id }, data: { totalPrice: 1000, amountCollected: 1000, paymentStatus: 'paid' } }),
    );
    return { id, umbrellaId: u.id };
  };

  it('admin happy: cede l’abbonamento a B — money netto, paymentStatus, refundedAmount invariato', async () => {
    const { id, umbrellaId } = await makeSub();
    // Baseline refundedAmount NON-ZERO (75): un default a 0 non distinguerebbe "la cessione lo lascia
    // intatto" da "la cessione lo azzera per errore". reconcileCessionPayment vincola refundToPrevious
    // ≤ amountCollected (non ≤ residuo) e non legge mai refundedAmount, quindi la transfer resta valida.
    await prisma.forTenant(s1, (tx) => tx.booking.update({ where: { id }, data: { refundedAmount: 75 } }));
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 500, collectedFromNew: 500 })
      .expect(200);

    expect(res.body.customerId).toBe(customerBId);
    expect(res.body.amountCollected).toBe(1000);
    expect(res.body.paymentStatus).toBe('paid');
    // Invariante chiave ADR-0047: la cessione non deve MAI toccare refundedAmount.
    expect(res.body.refundedAmount).toBe(75);

    // GET /customers/B/bookings → l'abbonamento c'è, con transfers[] { newCustomerId, refundToPrevious }
    const bRes = await request(app.getHttpServer())
      .get(`/api/customers/${customerBId}/bookings`)
      .set(...bearer(adminToken))
      .expect(200);
    const onB = bRes.body.find((x: { id: string }) => x.id === id);
    expect(onB).toBeDefined();
    expect(onB.transfers).toEqual(
      expect.arrayContaining([expect.objectContaining({ newCustomerId: customerBId, refundToPrevious: 500 })]),
    );

    // GET /customers/A/bookings → l'abbonamento non è più tra le prenotazioni di A (customerId è cambiato)
    const aRes = await request(app.getHttpServer())
      .get(`/api/customers/${customerAId}/bookings`)
      .set(...bearer(adminToken))
      .expect(200);
    expect(aRes.body.find((x: { id: string }) => x.id === id)).toBeUndefined();

    // GET /customers/A/ceded-subscriptions → 1 riga con newCustomerName e refundToPrevious
    const cededRes = await request(app.getHttpServer())
      .get(`/api/customers/${customerAId}/ceded-subscriptions`)
      .set(...bearer(adminToken))
      .expect(200);
    expect(cededRes.body).toHaveLength(1);
    expect(cededRes.body[0].bookingId).toBe(id);
    expect(cededRes.body[0].newCustomerName).toBe(customerBFullName);
    expect(cededRes.body[0].refundToPrevious).toBe(500);

    // Occupazione invariata: la mappa mostra ancora l'ombrellone occupato ('season') nello span,
    // la coverage/booking non è toccata dalla cessione (solo customerId + money cambiano).
    const map = await request(app.getHttpServer())
      .get('/api/map?date=2026-07-20')
      .set(...bearer(adminToken))
      .expect(200);
    const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === umbrellaId);
    expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
  });

  it('occupazione invariata: la mappa mostra ancora "season" sull’ombrellone dopo la cessione', async () => {
    const { id, umbrellaId } = await makeSub();
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(200);

    const map = await request(app.getHttpServer())
      .get('/api/map?date=2026-07-20')
      .set(...bearer(adminToken))
      .expect(200);
    const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === umbrellaId);
    expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
  });

  it('403: staff (non admin) su transfer', async () => {
    const { id } = await makeSub();
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(staffToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(403);
  });

  it('404: transfer su id inesistente', async () => {
    await request(app.getHttpServer())
      .post('/api/bookings/00000000-0000-0000-0000-0000000000ff/transfer')
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(404);
  });

  it('422: effectiveDate fuori dallo span dell’abbonamento', async () => {
    const { id } = await makeSub();
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-10-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(422);
    expect(res.body.message).toBe('Data di cessione non valida');
  });

  it('422: newCustomerId coincide col titolare attuale', async () => {
    const { id } = await makeSub();
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerAId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(422);
    expect(res.body.message).toBe('Il subentrante coincide col titolare attuale');
  });

  it('422: OVER_TOTAL (netto incassato supera il totale)', async () => {
    const { id } = await makeSub();
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 1 })
      .expect(422);
    expect(res.body.message).toBe('Il netto incassato supera il totale');
  });

  it('409: sospensione aperta sull’abbonamento → transfer rifiutato', async () => {
    const { id } = await makeSub();
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/suspend`)
      .set(...bearer(adminToken))
      .send({ startDate: '2026-07-20', reason: 'Rientro incerto' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(adminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(409);
    expect(res.body.message).toBe('Sospensione aperta: riattiva prima di cedere');
  });

  it('RLS: admin di un altro tenant che fa transfer sull’id → 404 (invisibile)', async () => {
    const { id } = await makeSub();
    await request(app.getHttpServer())
      .post(`/api/bookings/${id}/transfer`)
      .set(...bearer(otherTenantAdminToken))
      .send({ newCustomerId: customerBId, effectiveDate: '2026-07-15', refundToPrevious: 0, collectedFromNew: 0 })
      .expect(404);
  });
});
