import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { createUser, login } from './helpers/seed-auth';

describe('GET /api/establishment/setup-status (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;
  let estId: string;

  const ADMIN = 'setup-admin@e2e.test';
  const STAFF = 'setup-staff@e2e.test';
  const PASS = 'password-e2e';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    const est = await prisma.establishment.create({ data: { name: 'Lido Setup E2E' } });
    estId = est.id;
    await createUser(prisma, { email: ADMIN, password: PASS, role: 'admin', establishmentId: estId });
    await createUser(prisma, { email: STAFF, password: PASS, role: 'staff', establishmentId: estId });
    adminToken = await login(app, ADMIN, PASS);
    staffToken = await login(app, STAFF, PASS);
  });

  afterAll(async () => {
    // Cleanup in ordine FK-safe, tenant-scoped.
    await prisma.forTenant(estId, async (tx) => {
      await tx.rate.deleteMany();
      await tx.pricing.deleteMany();
      await tx.season.deleteMany();
      await tx.timeSlot.deleteMany();
      await tx.umbrella.deleteMany();
      await tx.row.deleteMany();
      await tx.sector.deleteMany();
    });
    await prisma.user.deleteMany({ where: { establishmentId: estId } });
    await prisma.establishment.delete({ where: { id: estId } });
    await app.close();
  });

  const get = (token: string) =>
    request(app.getHttpServer()).get('/api/establishment/setup-status').set('Authorization', `Bearer ${token}`);

  it('403 per lo staff (admin-only)', async () => {
    await get(staffToken).expect(403);
  });

  it('tenant vuoto: incompleto, primo passo structure', async () => {
    const res = await get(adminToken).expect(200);
    expect(res.body.complete).toBe(false);
    expect(res.body.firstIncompleteStep).toBe('structure');
    expect(res.body.structure).toEqual({ sectors: 0, rows: 0, activeUmbrellas: 0, complete: false });
  });

  it('progressione: struttura → fasce → stagione → tariffa fino a complete', async () => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

    // Struttura via API reali (stesso flusso del wizard).
    const sector = await auth(request(app.getHttpServer()).post('/api/establishment/sectors'))
      .send({ name: 'Centro', kind: 'grid' }).expect(201);
    const row = await auth(request(app.getHttpServer()).post('/api/establishment/rows'))
      .send({ sectorId: sector.body.id, label: 'Fila 1' }).expect(201);
    await auth(request(app.getHttpServer()).post('/api/establishment/umbrellas/generate'))
      .send({ rowId: row.body.id, prefix: '', start: 1, count: 3, umbrellaTypeId: null }).expect(201);

    let s = (await get(adminToken).expect(200)).body;
    expect(s.structure.complete).toBe(true);
    expect(s.firstIncompleteStep).toBe('timeSlots');

    await auth(request(app.getHttpServer()).post('/api/time-slots'))
      .send({ name: 'Giornata', startTime: '08:00', endTime: '19:00' }).expect(201);
    s = (await get(adminToken).expect(200)).body;
    expect(s.firstIncompleteStep).toBe('seasons');

    // Stagione PASSATA (endDate < 2026-07-15, calendario congelato): NON usable.
    const past = await auth(request(app.getHttpServer()).post('/api/seasons'))
      .send({ name: 'Primavera 2026', startDate: '2026-03-01', endDate: '2026-04-30' }).expect(201);
    s = (await get(adminToken).expect(200)).body;
    expect(s.seasons).toEqual({ usable: 0, complete: false });
    expect(s.firstIncompleteStep).toBe('seasons');

    // Tariffa sulla stagione passata: non completa rates (e seasons resta il primo buco).
    await auth(request(app.getHttpServer()).post('/api/rates'))
      .send({ seasonId: past.body.id, price: 10 }).expect(201);
    s = (await get(adminToken).expect(200)).body;
    expect(s.rates.complete).toBe(false);
    expect(s.firstIncompleteStep).toBe('seasons');

    // Stagione usable (contiene il 2026-07-15).
    const season = await auth(request(app.getHttpServer()).post('/api/seasons'))
      .send({ name: 'Estate Setup', startDate: '2026-06-01', endDate: '2026-09-15' }).expect(201);
    s = (await get(adminToken).expect(200)).body;
    expect(s.seasons).toEqual({ usable: 1, complete: true });
    expect(s.firstIncompleteStep).toBe('rates');
    expect(s.rates.hasCatchAll).toBe(false);

    // Catch-all sulla stagione usable → complete.
    await auth(request(app.getHttpServer()).post('/api/rates'))
      .send({ seasonId: season.body.id, price: 25 }).expect(201);
    s = (await get(adminToken).expect(200)).body;
    expect(s.rates).toEqual({ count: 1, hasCatchAll: true, complete: true });
    expect(s.complete).toBe(true);
    expect(s.firstIncompleteStep).toBeNull();
  });

  it('ombrelloni tutti ritirati: structure torna incompleta', async () => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
    const tree = (await auth(request(app.getHttpServer()).get('/api/establishment/structure')).expect(200)).body;
    const ids: string[] = tree.sectors.flatMap((se: any) => se.rows.flatMap((r: any) => r.umbrellas.map((u: any) => u.id)));
    for (const id of ids) {
      await auth(request(app.getHttpServer()).post(`/api/establishment/umbrellas/${id}/retire`)).expect(201);
    }
    const s = (await get(adminToken).expect(200)).body;
    expect(s.structure.activeUmbrellas).toBe(0);
    expect(s.structure.complete).toBe(false);
    expect(s.firstIncompleteStep).toBe('structure');
  });
});
