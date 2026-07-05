import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['u.admin@e2e.test', 'u.admin2@e2e.test', 'u.staff@e2e.test', 'u.new@e2e.test', 'u.other@e2e.test'];

describe('Establishment users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: FakeMailerService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let adminId: string;
  let admin2Id: string;
  let staffId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);

    s1 = (await prisma.establishment.create({ data: { name: 'USERS A' } })).id;
    await createUser(prisma, { email: 'u.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'u.admin2@e2e.test', password: 'pw-admin-2', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'u.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.admin@e2e.test' } })).id;
    admin2Id = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.admin2@e2e.test' } })).id;
    staffId = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.staff@e2e.test' } })).id;
    adminT = await login(app, 'u.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'u.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    const created = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
    await prisma.credentialSetupToken.deleteMany({ where: { userId: { in: created.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { name: { in: ['USERS A', 'USERS B'] } } });
    await app.close();
  });

  it('staff → 403 sulla create (role-guard)', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(staffT)).send({ email: 'u.new@e2e.test', role: 'staff' }).expect(403);
  });

  it('role "superuser" → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.new@e2e.test', role: 'superuser' }).expect(400);
  });

  it('admin invita uno staff → 201, compare nell’overview, NON fa login finché non fa redeem', async () => {
    mailer.reset();
    const res = await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.new@e2e.test', role: 'staff' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ email: 'u.new@e2e.test', role: 'staff', disabledAt: null }));

    const overview = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(adminT)).expect(200);
    expect(overview.body.team.find((m: { email: string }) => m.email === 'u.new@e2e.test')).toEqual(expect.objectContaining({ role: 'staff', disabledAt: null }));

    expect(mailer.last().purpose).toBe('invite');
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.new@e2e.test', password: 'staff-scelta-1' }).expect(401);

    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: mailer.last().rawToken, password: 'staff-scelta-1' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.new@e2e.test', password: 'staff-scelta-1' }).expect(200);
  });

  it('email duplicata → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.staff@e2e.test', role: 'staff' }).expect(409);
  });

  it('self-disable → 422', async () => {
    await request(app.getHttpServer()).patch(`/api/establishment/users/${adminId}`).set(...bearer(adminT)).send({ disabled: true }).expect(422);
  });

  it('admin disabilita lo staff → 200, disabledAt valorizzato, e quello staff non fa più login (401)', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT)).send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(401);
    await request(app.getHttpServer()).patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(200);
  });

  it('disabilitare un admin non-ultimo → 200 (l’altro admin resta)', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
  });
});
