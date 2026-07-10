import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['umb.admin@e2e.test', 'umb.staff@e2e.test'];
const MISSING = '00000000-0000-4000-8000-0000000000ff';

describe('Establishment umbrellas + generate (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let rowId: string;
  let umbId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'UMB A' } })).id;
    await createUser(prisma, { email: 'umb.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'umb.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'umb.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'umb.staff@e2e.test', 'pw-staff-1');

    rowId = await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Centro', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'Fila 1', sortOrder: 1 } });
      return row.id;
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.umbrella.deleteMany({ where: { establishmentId: s1 } });
      await tx.row.deleteMany({ where: { establishmentId: s1 } });
      await tx.sector.deleteMany({ where: { establishmentId: s1 } });
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  // --- Ombrelloni ---
  it('POST /umbrellas staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(staffT)).send({ rowId, label: 'X', umbrellaTypeId: null }).expect(403);
  });

  it('POST /umbrellas rowId inesistente → 404', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId: MISSING, label: 'X', umbrellaTypeId: null }).expect(404);
  });

  it('POST /umbrellas tipologia estranea → 422', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: 'X', umbrellaTypeId: MISSING }).expect(422);
  });

  it('POST /umbrellas admin → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: '1', umbrellaTypeId: null }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ label: '1', umbrellaTypeId: null }));
    umbId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const labels = struct.body.sectors.flatMap((s: { rows: { umbrellas: { label: string }[] }[] }) => s.rows.flatMap((r) => r.umbrellas.map((u) => u.label)));
    expect(labels).toContain('1');
  });

  it('POST /umbrellas etichetta duplicata → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: '1', umbrellaTypeId: null }).expect(409);
  });

  it('PATCH /umbrellas rinomina etichetta → 200', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/umbrellas/${umbId}`).set(...bearer(adminT)).send({ label: '1-bis' }).expect(200);
    expect(res.body.label).toBe('1-bis');
  });

  it('DELETE /umbrellas/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  it('DELETE /umbrellas admin → 200', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${umbId}`).set(...bearer(adminT)).expect(200);
  });

  // --- Generatore ---
  it('POST /umbrellas/generate staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(staffT)).send({ rowId, prefix: 'A', start: 1, count: 3, umbrellaTypeId: null }).expect(403);
  });

  it('POST /umbrellas/generate count fuori range → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 0, umbrellaTypeId: null }).expect(400);
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 61, umbrellaTypeId: null }).expect(400);
  });

  it('POST /umbrellas/generate admin → crea, poi salta le esistenti', async () => {
    const r1 = await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 3, umbrellaTypeId: null }).expect(201);
    expect(r1.body).toEqual(expect.objectContaining({ created: 3, skipped: 0 }));
    const r2 = await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 5, umbrellaTypeId: null }).expect(201);
    expect(r2.body).toEqual(expect.objectContaining({ created: 2, skipped: 3 }));
  });
});
