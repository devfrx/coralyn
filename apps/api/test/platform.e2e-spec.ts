import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { createTestApp } from './helpers/create-test-app';

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
  let mailer: FakeMailerService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);

    // Un lido "host" per lo staff (superuser è cross-tenant, establishmentId null).
    hostEstId = (await prisma.establishment.create({ data: { name: 'PLATFORM HOST' } })).id;
    await createUser(prisma, { email: SUPER_EMAIL, password: 'pw-super-1', role: Role.superuser, establishmentId: null });
    await createUser(prisma, { email: STAFF_EMAIL, password: 'pw-staff-1', role: Role.staff, establishmentId: hostEstId });
    superT = await login(app, SUPER_EMAIL, 'pw-super-1');
    staffT = await login(app, STAFF_EMAIL, 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.platformAuditLog.deleteMany({ where: { targetEstablishmentId: createdEstId } });
    await prisma.credentialSetupToken.deleteMany({ where: { user: { email: NEW_ADMIN_EMAIL } } });
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

  it('superuser: crea un lido + primo admin → 201 SENZA password; l’admin la imposta via invito e fa login', async () => {
    mailer.reset();
    const res = await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Lido Nuovo', adminEmail: NEW_ADMIN_EMAIL })
      .expect(201);
    expect(res.body.adminEmail).toBe(NEW_ADMIN_EMAIL);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(typeof res.body.expiresAt).toBe('string');
    expect(res.body.establishment).toEqual(expect.objectContaining({ name: 'Lido Nuovo', suspendedAt: null, umbrellas: 0 }));
    createdEstId = res.body.establishment.id;

    const raw = mailer.last().rawToken;
    expect(mailer.last().purpose).toBe('invite');
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'admin-nuova-pw-1' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(200);
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
    expect(res.body[0]).toHaveProperty('setupComplete');
    expect(typeof res.body[0].setupComplete).toBe('boolean');
    const item = res.body.find((e: { id: string }) => e.id === createdEstId);
    expect(item).toEqual(expect.objectContaining({ name: 'Lido Nuovo', umbrellas: 0, staffUsersActive: 1, occupancyPctToday: 0, setupComplete: false }));
  });

  it('suspend → il nuovo admin non fa più login (401); reactivate → torna a fare login (200)', async () => {
    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/suspend`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(401);

    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/reactivate`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(200);
  });

  it('getOne di un id inesistente → 404', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments/00000000-0000-4000-8000-000000000999').set(...bearer(superT)).expect(404);
  });

  it('reset-admin-password: emette invito reset; la vecchia password smette di funzionare al redeem', async () => {
    mailer.reset();
    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/reset-admin-password`).set(...bearer(superT)).expect(201);
    expect(mailer.last().purpose).toBe('reset');
    expect(mailer.last().to).toBe(NEW_ADMIN_EMAIL);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'admin-reset-pw-2' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-reset-pw-2' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: 'admin-nuova-pw-1' }).expect(401);
  });

  it('PlatformAuditLog registra create + suspend + reactivate del lido', async () => {
    const logs = await prisma.platformAuditLog.findMany({ where: { targetEstablishmentId: createdEstId }, orderBy: { createdAt: 'asc' } });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['create_establishment', 'suspend_establishment', 'reactivate_establishment', 'reset_admin_password']));
  });
});
