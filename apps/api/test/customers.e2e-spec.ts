import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';

describe('Customers (e2e) isolamento per tenant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // allineato a main.ts
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'E2E A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'E2E B' } })).id;
    await createUser(prisma, {
      email: 'admin.s1@e2e.test',
      password: 'pw-s1',
      role: Role.admin,
      establishmentId: s1,
    });
    await createUser(prisma, {
      email: 'admin.s2@e2e.test',
      password: 'pw-s2',
      role: Role.admin,
      establishmentId: s2,
    });
    token1 = await login(app, 'admin.s1@e2e.test', 'pw-s1');
    token2 = await login(app, 'admin.s2@e2e.test', 'pw-s2');
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
    await prisma.user.deleteMany({
      where: { email: { in: ['admin.s1@e2e.test', 'admin.s2@e2e.test'] } },
    });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  it('richiede autenticazione: senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/customers').expect(401);
  });

  it('crea un cliente per s1 e non lo mostra a s2', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Mario', lastName: 'Rossi' })
      .expect(201);

    const resS1 = await request(app.getHttpServer())
      .get('/api/customers')
      .set(...bearer(token1))
      .expect(200);
    expect(resS1.body).toHaveLength(1);

    const resS2 = await request(app.getHttpServer())
      .get('/api/customers')
      .set(...bearer(token2))
      .expect(200);
    expect(resS2.body).toHaveLength(0);
  });

  it('crea un cliente coi contatti e li ritorna nel DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({
        firstName: 'Anna',
        lastName: 'Bianchi',
        phone: '+39 333 1234567',
        email: 'anna.bianchi@email.it',
        notes: 'Cliente storica',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      firstName: 'Anna',
      lastName: 'Bianchi',
      phone: '+39 333 1234567',
      email: 'anna.bianchi@email.it',
      notes: 'Cliente storica',
    });
    expect(res.body.id).toBeDefined();
  });

  it('GET /:id ritorna il cliente al proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Carlo', lastName: 'Verdi' })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/customers/${id}`)
      .set(...bearer(token1))
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ id, firstName: 'Carlo', lastName: 'Verdi' }));

    await request(app.getHttpServer())
      .get(`/api/customers/${id}`)
      .set(...bearer(token2))
      .expect(404);
  });

  it('PATCH /:id aggiorna i contatti del proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Dora', lastName: 'Neri' })
      .expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .set(...bearer(token1))
      .send({ phone: '+39 340 0000000', notes: 'preferisce prima fila' })
      .expect(200);
    expect(patched.body).toMatchObject({
      id,
      phone: '+39 340 0000000',
      notes: 'preferisce prima fila',
    });

    await request(app.getHttpServer())
      .patch(`/api/customers/${id}`)
      .set(...bearer(token2))
      .send({ phone: '+39 111' })
      .expect(404);
  });

  it('rifiuta email malformata con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Eva', lastName: 'Gialli', email: 'non-una-email' })
      .expect(400);
  });

  it('tratta i contatti vuoti come assenti (come fa il form della scheda)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Senza', lastName: 'Contatti', phone: '', email: '', notes: '' })
      .expect(201);
    expect(created.body.phone).toBeUndefined();
    expect(created.body.email).toBeUndefined();
    expect(created.body.notes).toBeUndefined();

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.id}`)
      .set(...bearer(token1))
      .send({ phone: '  +39 333 1212121  ', email: '', notes: '' })
      .expect(200);
    expect(patched.body.phone).toBe('+39 333 1212121');
    expect(patched.body.email).toBeUndefined();
  });

  it('cancella un contatto esistente svuotando il campo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/customers')
      .set(...bearer(token1))
      .send({ firstName: 'Aveva', lastName: 'Email', email: 'aveva@email.it' })
      .expect(201);
    expect(created.body.email).toBe('aveva@email.it');

    const patched = await request(app.getHttpServer())
      .patch(`/api/customers/${created.body.id}`)
      .set(...bearer(token1))
      .send({ email: '' })
      .expect(200);
    expect(patched.body.email).toBeUndefined();
  });
});

describe('Customers erasure (e2e) — GDPR D-024', () => {
  const CONFLICT_MSG = 'Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.';
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let adminT: string;
  let staffT: string;
  let otherT: string;
  let ids: MapSeedIds;
  let adminId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'DEL A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'DEL B' } })).id;
    await createUser(prisma, { email: 'del.admin@e2e.test', password: 'pw-admin', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'del.staff@e2e.test', password: 'pw-staff', role: Role.staff, establishmentId: s1 });
    await createUser(prisma, { email: 'del.other@e2e.test', password: 'pw-other', role: Role.admin, establishmentId: s2 });
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'del.admin@e2e.test' } })).id;
    adminT = await login(app, 'del.admin@e2e.test', 'pw-admin');
    staffT = await login(app, 'del.staff@e2e.test', 'pw-staff');
    otherT = await login(app, 'del.other@e2e.test', 'pw-other');

    ids = await seedMapTenant(prisma, s1);
    await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanPricingTenant(prisma, s1);
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['del.admin@e2e.test', 'del.staff@e2e.test', 'del.other@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('staff (non-admin) → 403; anonimo → 401', async () => {
    const c = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Guard', lastName: 'Test' } }),
    );
    await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).set(...bearer(staffT)).expect(403);
    await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).expect(401);
  });

  it('cliente senza prenotazioni → 200 { outcome: "deleted" }; poi GET /customers non lo elenca', async () => {
    const c = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Senza', lastName: 'Prenotazioni' } }),
    );
    const res = await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).set(...bearer(adminT)).expect(200);
    expect(res.body).toEqual({ outcome: 'deleted' });

    const list = await request(app.getHttpServer()).get('/api/customers').set(...bearer(adminT)).expect(200);
    expect(list.body.find((x: { id: string }) => x.id === c.id)).toBeUndefined();
  });

  it('cliente con SOLA prenotazione passata (confirmed, endDate < oggi) → 200 { outcome: "anonymized" }; GET /customers non lo elenca; la prenotazione resta con "Cliente rimosso"', async () => {
    const c = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Storico', lastName: 'Passato' } }),
    );
    const booking = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(adminT))
      .send({ customerId: c.id, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-05-05' })
      .expect(201);
    expect(booking.body.status).toBe('confirmed');

    const res = await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).set(...bearer(adminT)).expect(200);
    expect(res.body).toEqual({ outcome: 'anonymized' });

    const list = await request(app.getHttpServer()).get('/api/customers').set(...bearer(adminT)).expect(200);
    expect(list.body.find((x: { id: string }) => x.id === c.id)).toBeUndefined();

    const anonymized = await prisma.forTenant(s1, (tx) => tx.customer.findFirst({ where: { id: c.id } }));
    expect(anonymized).toEqual(expect.objectContaining({
      firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null, anonymizedBy: adminId,
    }));
    expect(anonymized?.anonymizedAt).toBeInstanceOf(Date);

    // la prenotazione esiste ancora e risolve al cliente ora "Cliente rimosso"
    const stillThere = await prisma.forTenant(s1, (tx) => tx.booking.findFirst({ where: { id: booking.body.id } }));
    expect(stillThere).not.toBeNull();
  });

  it('cliente con prenotazione confirmed endDate >= oggi → 409 (messaggio verbatim)', async () => {
    const c = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Attivo', lastName: 'Futuro' } }),
    );
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(adminT))
      .send({ customerId: c.id, umbrellaId: ids.u2, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-09-20' })
      .expect(201);

    const res = await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).set(...bearer(adminT)).expect(409);
    expect(res.body.message).toBe(CONFLICT_MSG);
  });

  it('cliente di un ALTRO tenant → 404 (isolamento)', async () => {
    const c = await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Isolato', lastName: 'Tenant' } }),
    );
    await request(app.getHttpServer()).delete(`/api/customers/${c.id}`).set(...bearer(otherT)).expect(404);
  });
});
