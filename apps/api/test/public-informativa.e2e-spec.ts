import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { FakeMailerService } from './helpers/fake-mailer';
import { createTestApp } from './helpers/create-test-app';
import { createEstablishment } from './helpers/create-establishment';

describe('Public informativa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: TenantId;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = await createEstablishment(prisma, 'PUBLIC INFORMATIVA A');
  });

  afterAll(async () => {
    await prisma.establishmentLegalProfile.deleteMany({ where: { establishmentId: s1 } });
    await prisma.establishment.deleteMany({ where: { name: 'PUBLIC INFORMATIVA A' } });
    await app.close();
  });

  it('GET pubblico senza token → 200 con establishmentName e legalName (null se non compilato)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/public/informativa/${s1}`)
      .expect(200);
    expect(res.body.establishmentName).toBeDefined();
    expect(res.body).toHaveProperty('legalName');
  });

  it('id valido ma inesistente → 404', async () => {
    await request(app.getHttpServer())
      .get('/api/public/informativa/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });

  it('id non-UUID → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/public/informativa/not-a-uuid')
      .expect(400);
  });
});
