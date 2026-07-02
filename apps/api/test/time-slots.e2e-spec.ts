import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

describe('TimeSlots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Slot A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Slot B' } })).id;
    await createUser(prisma, { email: 'admin.ts1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.ts2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.ts1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.ts2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1); // crea Mattina + Pomeriggio (2 fasce) + struttura
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.booking.deleteMany({});
      await tx.rate.deleteMany({});
      await tx.pricing.deleteMany({});
      await tx.season.deleteMany({});
    });
    await cleanMapTenant(prisma, s1);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.ts1@e2e.test', 'admin.ts2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('GET elenca le fasce con orari "HH:MM" ordinate per sortOrder', async () => {
    const res = await request(app.getHttpServer()).get('/api/time-slots').set(...bearer(token1)).expect(200);
    expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Mattina', 'Pomeriggio']);
    expect(res.body[0]).toMatchObject({ name: 'Mattina', startTime: '08:00', endTime: '13:00' });
  });

  it('POST crea una fascia "Giornata intera" sovrapposta (overlap AMMESSO) e appende in coda', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Giornata intera', startTime: '08:00', endTime: '19:00' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 });
  });

  it('POST con startTime >= endTime → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Invalida', startTime: '13:00', endTime: '08:00' }).expect(400);
  });

  it('POST con orario malformato → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Bad', startTime: '8:00', endTime: '19:00' }).expect(400);
  });

  it('PATCH aggiorna nome e orari', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Serale', startTime: '17:00', endTime: '19:00' }).expect(201);
    const patched = await request(app.getHttpServer())
      .patch(`/api/time-slots/${created.body.id}`).set(...bearer(token1))
      .send({ name: 'Sera', endTime: '20:00' }).expect(200);
    expect(patched.body).toMatchObject({ name: 'Sera', startTime: '17:00', endTime: '20:00' });
    // pulizia
    await request(app.getHttpServer()).delete(`/api/time-slots/${created.body.id}`).set(...bearer(token1)).expect(200);
  });

  it('PATCH che invaliderebbe l’ordine (start>=end) → 400', async () => {
    await request(app.getHttpServer())
      .patch(`/api/time-slots/${ids.slotMorning}`).set(...bearer(token1))
      .send({ startTime: '14:00' }).expect(400); // Mattina finisce alle 13:00
  });

  it('DELETE di una fascia referenziata da una tariffa → 409', async () => {
    // crea stagione+pricing e una tariffa che usa slotAfternoon
    const seasonId = (await request(app.getHttpServer())
      .post('/api/seasons').set(...bearer(token1))
      .send({ name: 'Estate 2029', startDate: '2029-06-01', endDate: '2029-09-30' })).body.id;
    const rate = await request(app.getHttpServer())
      .post('/api/rates').set(...bearer(token1))
      .send({ seasonId, timeSlotId: ids.slotAfternoon, price: 20, unit: 'day' }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${ids.slotAfternoon}`).set(...bearer(token1)).expect(409);
    // pulizia tariffa+stagione (lascia le 2 fasce base)
    await request(app.getHttpServer()).delete(`/api/rates/${rate.body.id}`).set(...bearer(token1)).expect(200);
    await request(app.getHttpServer()).delete(`/api/seasons/${seasonId}`).set(...bearer(token1)).expect(200);
  });

  it('DELETE dell’ultima fascia rimasta → 409', async () => {
    // s2 non ha fasce: creane esattamente una e prova a eliminarla
    const only = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token2))
      .send({ name: 'Unica', startTime: '08:00', endTime: '19:00' }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${only.body.id}`).set(...bearer(token2)).expect(409);
    // pulizia s2
    await prisma.forTenant(s2, async (tx) => { await tx.timeSlot.deleteMany({}); });
  });

  it('DELETE riuscita quando non referenziata e non è l’ultima', async () => {
    const extra = await request(app.getHttpServer())
      .post('/api/time-slots').set(...bearer(token1))
      .send({ name: 'Temporanea', startTime: '10:00', endTime: '12:00' }).expect(201);
    const del = await request(app.getHttpServer())
      .delete(`/api/time-slots/${extra.body.id}`).set(...bearer(token1)).expect(200);
    expect(del.body.id).toBe(extra.body.id);
  });

  it('DELETE inesistente/cross-tenant → 404', async () => {
    await request(app.getHttpServer())
      .delete(`/api/time-slots/${ids.slotMorning}`).set(...bearer(token2)).expect(404); // di s1, visto da s2
  });

  it('isolamento: s2 non vede le fasce di s1', async () => {
    const list = await request(app.getHttpServer()).get('/api/time-slots').set(...bearer(token2)).expect(200);
    expect(list.body).toEqual([]);
  });
});
