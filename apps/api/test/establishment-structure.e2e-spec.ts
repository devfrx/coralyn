import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['str.admin@e2e.test', 'str.staff@e2e.test'];

describe('Establishment structure + umbrella-types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let typeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'STRUCT A' } })).id;
    await createUser(prisma, { email: 'str.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'str.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'str.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'str.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.umbrellaType.deleteMany({ where: { establishmentId: s1 } }));
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('GET /structure staff → 403', async () => {
    await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(staffT)).expect(403);
  });

  it('GET /structure admin → 200 forma corretta (vuota all’inizio)', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(res.body).toEqual({ sectors: [], umbrellaTypes: [] });
  });

  it('POST tipologia staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(staffT)).send({ name: 'X', icon: 'umbrella' }).expect(403);
  });

  it('POST tipologia icona non valida → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'X', icon: 'bogus' }).expect(400);
  });

  it('POST admin crea tipologia → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'Palma', icon: 'palmtree' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ name: 'Palma', icon: 'palmtree', sortOrder: expect.any(Number) }));
    typeId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(struct.body.umbrellaTypes.map((t: { name: string }) => t.name)).toContain('Palma');
  });

  it('POST nome duplicato → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'Palma', icon: 'leaf' }).expect(409);
  });

  it('POST nome duplicato case-insensitive → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'PALMA', icon: 'leaf' }).expect(409);
  });

  it('DELETE tipologia in uso → 409, poi libera → 200', async () => {
    // crea un settore/fila/ombrellone che usa la tipologia (via prisma diretto, dentro forTenant per RLS FORCE:
    // struttura editor CRUD arriva negli slice 2/3)
    const { sectorId, rowId, umbrellaId } = await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Centro', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'Fila 1', sortOrder: 1 } });
      const umb = await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, umbrellaTypeId: typeId, label: 'STR-1', logicalOrder: 1 } });
      return { sectorId: sector.id, rowId: row.id, umbrellaId: umb.id };
    });
    await request(app.getHttpServer()).delete(`/api/establishment/umbrella-types/${typeId}`).set(...bearer(adminT)).expect(409);
    await prisma.forTenant(s1, async (tx) => {
      await tx.umbrella.delete({ where: { id: umbrellaId } });
      await tx.row.delete({ where: { id: rowId } });
      await tx.sector.delete({ where: { id: sectorId } });
    });
    await request(app.getHttpServer()).delete(`/api/establishment/umbrella-types/${typeId}`).set(...bearer(adminT)).expect(200);
  });

  // Hardening: :id malformato deve dare 400 pulito (ParseUUIDPipe), non 500 da Prisma P2023.
  // Coerente con la validazione @IsUUID dei body dei DTO.
  describe('param :id malformato → 400 (non 500)', () => {
    const BAD = 'not-a-uuid';
    it('DELETE /sectors/:id', async () => {
      await request(app.getHttpServer()).delete(`/api/establishment/sectors/${BAD}`).set(...bearer(adminT)).expect(400);
    });
    it('PATCH /sectors/:id', async () => {
      await request(app.getHttpServer()).patch(`/api/establishment/sectors/${BAD}`).set(...bearer(adminT)).send({ name: 'X' }).expect(400);
    });
    it('DELETE /rows/:id', async () => {
      await request(app.getHttpServer()).delete(`/api/establishment/rows/${BAD}`).set(...bearer(adminT)).expect(400);
    });
    it('PATCH /rows/:id', async () => {
      await request(app.getHttpServer()).patch(`/api/establishment/rows/${BAD}`).set(...bearer(adminT)).send({ label: 'X' }).expect(400);
    });
    it('DELETE /umbrellas/:id', async () => {
      await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${BAD}`).set(...bearer(adminT)).expect(400);
    });
    it('PATCH /umbrellas/:id', async () => {
      await request(app.getHttpServer()).patch(`/api/establishment/umbrellas/${BAD}`).set(...bearer(adminT)).send({ label: 'X' }).expect(400);
    });
    it('DELETE /umbrella-types/:id', async () => {
      await request(app.getHttpServer()).delete(`/api/establishment/umbrella-types/${BAD}`).set(...bearer(adminT)).expect(400);
    });
    it('PATCH /umbrella-types/:id', async () => {
      await request(app.getHttpServer()).patch(`/api/establishment/umbrella-types/${BAD}`).set(...bearer(adminT)).send({ name: 'X' }).expect(400);
    });
  });
});
