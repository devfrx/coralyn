import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['lp.admin@e2e.test', 'lp.staff@e2e.test'];

describe('Establishment legal profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'LEGAL PROFILE A' } })).id;
    await createUser(prisma, { email: 'lp.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'lp.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'lp.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'lp.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    const created = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
    await prisma.credentialSetupToken.deleteMany({ where: { userId: { in: created.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishmentLegalProfile.deleteMany({ where: { establishmentId: s1 } });
    await prisma.establishment.deleteMany({ where: { name: 'LEGAL PROFILE A' } });
    await app.close();
  });

  it('admin: PUT poi GET round-trip', async () => {
    const put = await request(app.getHttpServer())
      .put('/api/establishment/legal-profile')
      .set(...bearer(adminT))
      .send({ legalName: 'Lido Acme Srl', contactEmail: 'info@acme.it', dpoNominated: false })
      .expect(200);
    expect(put.body.legalName).toBe('Lido Acme Srl');

    const get = await request(app.getHttpServer())
      .get('/api/establishment/legal-profile')
      .set(...bearer(adminT))
      .expect(200);
    expect(get.body.contactEmail).toBe('info@acme.it');
  });

  it('staff → 403', async () => {
    await request(app.getHttpServer())
      .put('/api/establishment/legal-profile')
      .set(...bearer(staffT))
      .send({ legalName: 'x' })
      .expect(403);
  });

  it('email malformata → 400', async () => {
    await request(app.getHttpServer())
      .put('/api/establishment/legal-profile')
      .set(...bearer(adminT))
      .send({ contactEmail: 'non-una-email' })
      .expect(400);
  });
});
