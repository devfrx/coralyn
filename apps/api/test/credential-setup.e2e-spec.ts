import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { CredentialSetupService } from '../src/credential/credential-setup.service';
import { createUser } from './helpers/seed-auth';

const EMAIL = 'redeem.admin@platform.test';

describe('Credential setup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: FakeMailerService;
  let credentials: CredentialSetupService;
  let estId: string;
  let userId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);
    credentials = app.get(CredentialSetupService);
    estId = (await prisma.establishment.create({ data: { name: 'REDEEM HOST' } })).id;
    await createUser(prisma, { email: EMAIL, password: 'unusable-initial', role: Role.admin, establishmentId: estId });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).id;
  });

  afterAll(async () => {
    await prisma.credentialSetupToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.establishment.deleteMany({ where: { id: estId } });
    await app.close();
  });

  it('GET context: token valido → email+purpose; POST redeem → 204; poi login con la nuova password', async () => {
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'invite', userId);
    const raw = mailer.last().rawToken;

    const ctx = await request(app.getHttpServer()).get(`/api/auth/credential-setup/${raw}`).expect(200);
    expect(ctx.body).toEqual({ email: EMAIL, purpose: 'invite' });

    await request(app.getHttpServer()).post('/api/auth/login').send({ email: EMAIL, password: 'la-nuova-password' }).expect(401);

    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'la-nuova-password' }).expect(204);

    await request(app.getHttpServer()).post('/api/auth/login').send({ email: EMAIL, password: 'la-nuova-password' }).expect(200);
  });

  it('token già consumato → GET 404 e POST 404', async () => {
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'invite', userId);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'altra-password-1' }).expect(204);
    await request(app.getHttpServer()).get(`/api/auth/credential-setup/${raw}`).expect(404);
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'altra-password-2' }).expect(404);
  });

  it('token inesistente → 404; password troppo corta → 400', async () => {
    await request(app.getHttpServer()).get('/api/auth/credential-setup/nope').expect(404);
    mailer.reset();
    await credentials.issueAndSend(userId, EMAIL, 'reset', userId);
    const raw = mailer.last().rawToken;
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: raw, password: 'corta' }).expect(400);
  });
});
