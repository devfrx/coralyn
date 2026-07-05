import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const SUPER_EMAIL = 'su@platform.test';
const STAFF_EMAIL = 'staff@platform.test';
const NEW_ADMIN_EMAIL = 'new.admin@platform.test';

describe('Platform Console (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hostEstId: string;
  let superT: string;
  let staffT: string;
  let createdEstId: string;
  let tempPassword: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // Un lido "host" per lo staff (superuser è cross-tenant, establishmentId null).
    hostEstId = (await prisma.establishment.create({ data: { name: 'PLATFORM HOST' } })).id;
    await createUser(prisma, { email: SUPER_EMAIL, password: 'pw-super-1', role: Role.superuser, establishmentId: null });
    await createUser(prisma, { email: STAFF_EMAIL, password: 'pw-staff-1', role: Role.staff, establishmentId: hostEstId });
    superT = await login(app, SUPER_EMAIL, 'pw-super-1');
    staffT = await login(app, STAFF_EMAIL, 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.platformAuditLog.deleteMany({ where: { targetEstablishmentId: createdEstId } });
    await prisma.user.deleteMany({ where: { email: { in: [SUPER_EMAIL, STAFF_EMAIL, NEW_ADMIN_EMAIL] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [hostEstId, createdEstId].filter(Boolean) } } });
    await app.close();
  });

  it('staff → 403 sulla lista (role-guard superuser)', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments').set(...bearer(staffT)).expect(403);
  });

  it('anonimo → 401', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments').expect(401);
  });

  it('superuser: crea un lido + primo admin → 201 con password temporanea; il nuovo admin fa login', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Lido Nuovo', adminEmail: NEW_ADMIN_EMAIL })
      .expect(201);
    expect(res.body.adminEmail).toBe(NEW_ADMIN_EMAIL);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect(res.body.establishment).toEqual(expect.objectContaining({ name: 'Lido Nuovo', suspendedAt: null, umbrellas: 0 }));
    createdEstId = res.body.establishment.id;
    tempPassword = res.body.temporaryPassword;

    // il nuovo admin può autenticarsi con la password temporanea
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(200);
  });

  it('email admin duplicata → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Altro Lido', adminEmail: NEW_ADMIN_EMAIL })
      .expect(409);
  });

  it('la lista mostra il lido creato con metriche PII-free', async () => {
    const res = await request(app.getHttpServer()).get('/api/platform/establishments').set(...bearer(superT)).expect(200);
    const item = res.body.find((e: { id: string }) => e.id === createdEstId);
    expect(item).toEqual(expect.objectContaining({ name: 'Lido Nuovo', umbrellas: 0, staffUsersActive: 1, occupancyPctToday: 0 }));
  });

  it('suspend → il nuovo admin non fa più login (401); reactivate → torna a fare login (200)', async () => {
    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/suspend`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(401);

    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/reactivate`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(200);
  });

  it('getOne di un id inesistente → 404', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments/00000000-0000-4000-8000-000000000999').set(...bearer(superT)).expect(404);
  });

  it('PlatformAuditLog registra create + suspend + reactivate del lido', async () => {
    const logs = await prisma.platformAuditLog.findMany({ where: { targetEstablishmentId: createdEstId }, orderBy: { createdAt: 'asc' } });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['create_establishment', 'suspend_establishment', 'reactivate_establishment']));
  });
});
