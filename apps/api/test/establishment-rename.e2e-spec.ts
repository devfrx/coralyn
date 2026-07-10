import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Establishment rename (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let adminT: string;
  let staffT: string;
  let superT: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'REN A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'REN B' } })).id;
    await createUser(prisma, { email: 'ren.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'ren.staff@e2e.test', password: 'pw2', role: Role.staff, establishmentId: s1 });
    await createUser(prisma, { email: 'ren.super@e2e.test', password: 'pw3', role: Role.superuser, establishmentId: null });
    adminT = await login(app, 'ren.admin@e2e.test', 'pw1');
    staffT = await login(app, 'ren.staff@e2e.test', 'pw2');
    superT = await login(app, 'ren.super@e2e.test', 'pw3');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ['ren.admin@e2e.test', 'ren.staff@e2e.test', 'ren.super@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').send({ name: 'X' }).expect(401);
  });

  it('staff → 403 (role-guard)', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(staffT)).send({ name: 'Hack' }).expect(403);
  });

  it('superuser → 403 (nessun ruolo tenant, ADR-0039)', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(superT)).send({ name: 'Hack' }).expect(403);
  });

  it('nome vuoto → 400', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(adminT)).send({ name: '' }).expect(400);
  });

  it('admin rinomina → 200 e persiste (isolato da s2)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/establishment').set(...bearer(adminT)).send({ name: 'Lido Rinominato' }).expect(200);
    expect(res.body).toEqual({ id: s1, name: 'Lido Rinominato' });
    const overview = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(adminT)).expect(200);
    expect(overview.body.establishment.name).toBe('Lido Rinominato');
    const b = await prisma.establishment.findUniqueOrThrow({ where: { id: s2 } });
    expect(b.name).toBe('REN B'); // s2 intatto
  });
});
