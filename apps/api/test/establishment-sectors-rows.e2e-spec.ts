import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['sr.admin@e2e.test', 'sr.staff@e2e.test'];
const MISSING = '00000000-0000-4000-8000-0000000000ff';

describe('Establishment sectors + rows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let sectorId: string;
  let rowId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'SR A' } })).id;
    await createUser(prisma, { email: 'sr.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'sr.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'sr.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'sr.staff@e2e.test', 'pw-staff-1');
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

  // --- Settori ---
  it('POST /sectors staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(staffT)).send({ name: 'X', kind: 'grid' }).expect(403);
  });

  it('POST /sectors kind non valido → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'X', kind: 'bogus' }).expect(400);
  });

  it('POST /sectors admin → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'Centro', kind: 'grid' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ name: 'Centro', kind: 'grid', rows: [] }));
    sectorId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(struct.body.sectors.map((s: { name: string }) => s.name)).toContain('Centro');
  });

  it('POST /sectors nome duplicato (case-insensitive) → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'centro', kind: 'special' }).expect(409);
  });

  it('PATCH /sectors/:id rinomina → 200', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).send({ name: 'Centro Mare' }).expect(200);
    expect(res.body.name).toBe('Centro Mare');
  });

  it('DELETE /sectors/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  // --- File ---
  it('POST /rows staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(staffT)).send({ sectorId, label: 'Fila 1' }).expect(403);
  });

  it('POST /rows sectorId inesistente → 404', async () => {
    await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(adminT)).send({ sectorId: MISSING, label: 'Fila 1' }).expect(404);
  });

  it('POST /rows admin → 201 e appare nel settore', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(adminT)).send({ sectorId, label: 'Fila 1' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ label: 'Fila 1', umbrellas: [] }));
    rowId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const sec = struct.body.sectors.find((s: { id: string }) => s.id === sectorId);
    expect(sec.rows.map((r: { label: string }) => r.label)).toContain('Fila 1');
  });

  it('DELETE /sectors con file → 409', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).expect(409);
  });

  it('DELETE /rows/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  it('DELETE /rows con ombrelloni → 409, poi vuota → 200', async () => {
    const umb = await prisma.forTenant(s1, (tx) =>
      tx.umbrella.create({ data: { establishmentId: s1, rowId, umbrellaTypeId: null, label: 'SR-1', logicalOrder: 1 } }),
    );
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${rowId}`).set(...bearer(adminT)).expect(409);
    await prisma.forTenant(s1, (tx) => tx.umbrella.delete({ where: { id: umb.id } }));
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${rowId}`).set(...bearer(adminT)).expect(200);
  });

  it('DELETE /sectors vuoto → 200', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).expect(200);
  });
});
