import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('Rentals (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let s1: string; let t1: string;
  let itemId: string; let otherItemId: string; let tariffId: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
  const srv = () => app.getHttpServer();

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(m); prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rentals TX' } })).id;
    await createUser(prisma, { email: 'a.rx1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    t1 = await login(app, 'a.rx1@e2e.test', 'pw1');

    const today = new Date(); const y = today.getUTCFullYear();
    await prisma.forTenant(s1, (tx) => tx.season.create({ data: {
      establishmentId: s1, name: `Stag ${y}`,
      startDate: new Date(Date.UTC(y, 0, 1)), endDate: new Date(Date.UTC(y, 11, 31)) } }));

    itemId = (await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Pedalò', stock: 3 })).body.id;
    otherItemId = (await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Canoa' })).body.id;
    tariffId = (await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
      .send({ label: '1 ora', price: 8, durationMinutes: 60, sortOrder: 1 })).body.id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.rental.deleteMany({}); await tx.rentalTariff.deleteMany({});
      await tx.season.deleteMany({}); await tx.rentalItem.deleteMany({});
    });
    await prisma.user.deleteMany({ where: { email: { in: ['a.rx1@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1] } } });
    await app.close();
  });

  it('checkout: prezzo = price×units (snapshot), stato active', async () => {
    const r = await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: tariffId, units: 2 }).expect(201);
    expect(r.body).toMatchObject({ status: 'active', units: 2, totalPrice: 16, paymentStatus: 'unpaid' });
  });

  it('checkout 422: tariffa di altro articolo / archiviata', async () => {
    await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: otherItemId, rentalTariffId: tariffId }).expect(422);
  });

  it('checkout 400: units<1 (validazione DTO, @Min(1))', async () => {
    await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: tariffId, units: 0 }).expect(400);
  });

  it('checkout 422: customerId inesistente nel tenant', async () => {
    await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: tariffId, customerId: '00000000-0000-4000-8000-000000000000' }).expect(422);
  });

  it('return idempotente; cancel 409 se incassato; payment riusa resolvePayment', async () => {
    const r = (await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: tariffId })).body;
    await request(srv()).patch(`/api/rentals/${r.id}/return`).set(...bearer(t1)).expect(200);
    await request(srv()).patch(`/api/rentals/${r.id}/return`).set(...bearer(t1)).expect(200); // idempotente
    await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1))
      .send({ amountCollected: 8, paymentMethod: 'cash' }).expect(200)
      .then((x) => expect(x.body.paymentStatus).toBe('paid'));
    await request(srv()).patch(`/api/rentals/${r.id}/cancel`).set(...bearer(t1)).expect(409); // incassato
  });

  it('payment 422 OVER_TOTAL / METHOD_REQUIRED; 409 su annullato', async () => {
    const r = (await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: tariffId })).body;
    await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 999 }).expect(422);
    await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 8 }).expect(422); // metodo
    await request(srv()).patch(`/api/rentals/${r.id}/cancel`).set(...bearer(t1)).expect(200);
    await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 8, paymentMethod: 'cash' }).expect(409);
  });

  it('GET ?date: elenco del giorno + availability (out somma solo attivi, available = stock-out)', async () => {
    // Articolo/tariffa dedicati per un conteggio deterministico, indipendente dallo stato
    // lasciato dai test precedenti su itemId (che ha già noleggi attivi/restituiti/annullati).
    const qItemId = (await request(srv()).post('/api/rental-items').set(...bearer(t1))
      .send({ name: 'Sup', stock: 4 })).body.id;
    const qTariffId = (await request(srv()).post(`/api/rental-items/${qItemId}/tariffs`).set(...bearer(t1))
      .send({ label: '1 ora', price: 5, durationMinutes: 60, sortOrder: 1 })).body.id;

    // 2 unità attive
    await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: qItemId, rentalTariffId: qTariffId, units: 2 }).expect(201);
    // 1 unità restituita (non conta in "out")
    const returned = (await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: qItemId, rentalTariffId: qTariffId, units: 1 })).body;
    await request(srv()).patch(`/api/rentals/${returned.id}/return`).set(...bearer(t1)).expect(200);
    // 1 unità annullata (non conta in "out")
    const cancelled = (await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: qItemId, rentalTariffId: qTariffId, units: 1 })).body;
    await request(srv()).patch(`/api/rentals/${cancelled.id}/cancel`).set(...bearer(t1)).expect(200);

    const res = await request(srv()).get('/api/rentals').set(...bearer(t1)).expect(200);
    expect(Array.isArray(res.body.rentals)).toBe(true);
    const av = res.body.availability.find((a: { rentalItemId: string }) => a.rentalItemId === qItemId);
    // stock=4, out conta solo le 2 unità attive (restituita/annullata escluse) → available=4-2=2
    expect(av).toMatchObject({ rentalItemId: qItemId, stock: 4, out: 2, available: 2 });
  });

  it('checkout 422 se la tariffa non è della stagione attiva', async () => {
    // Crea una stagione PASSATA e una sua tariffa: la resolveSeasonWithin(oggi) risolve la stagione CORRENTE,
    // quindi tariff.seasonId ≠ season.id → 422 (stesso 422 del ramo "nessuna stagione", esercitato in modo deterministico).
    const py = new Date().getUTCFullYear() - 1;
    const pastSeason = await prisma.forTenant(s1, (tx) => tx.season.create({ data: {
      establishmentId: s1, name: `Stag ${py}`,
      startDate: new Date(Date.UTC(py, 0, 1)), endDate: new Date(Date.UTC(py, 11, 31)) } }));
    const pastTariff = await prisma.forTenant(s1, (tx) => tx.rentalTariff.create({ data: {
      establishmentId: s1, rentalItemId: itemId, seasonId: pastSeason.id, label: 'vecchia', price: 4, sortOrder: 9 } }));
    await request(srv()).post('/api/rentals').set(...bearer(t1))
      .send({ rentalItemId: itemId, rentalTariffId: pastTariff.id }).expect(422);
  });
});
