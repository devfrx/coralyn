import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUtente, login } from './helpers/seed-auth';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stabId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    stabId = (await prisma.stabilimento.create({ data: { nome: 'Auth E2E' } })).id;
    await createUtente(prisma, {
      email: 'admin.auth@e2e.test',
      password: 'segreto-1',
      ruolo: Ruolo.admin,
      stabilimentoId: stabId,
    });
    await createUtente(prisma, {
      email: 'super.auth@e2e.test',
      password: 'segreto-2',
      ruolo: Ruolo.superuser,
      stabilimentoId: null,
    });
  });

  afterAll(async () => {
    await prisma.utente.deleteMany({
      where: { email: { in: ['admin.auth@e2e.test', 'super.auth@e2e.test'] } },
    });
    await prisma.stabilimento.deleteMany({ where: { id: stabId } });
    await app.close();
  });

  it('login valido → 200 con accessToken e utente senza passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin.auth@e2e.test', password: 'segreto-1' })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.utente).toMatchObject({
      email: 'admin.auth@e2e.test',
      ruolo: 'admin',
      stabilimentoId: stabId,
    });
    expect(res.body.utente.passwordHash).toBeUndefined();
  });

  it('password errata → 401 generico', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin.auth@e2e.test', password: 'sbagliata' })
      .expect(401);
  });

  it('email sconosciuta → 401 (stesso esito)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nessuno@e2e.test', password: 'qualsiasi' })
      .expect(401);
  });

  it('email malformata → 400 (validazione)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'non-una-email', password: 'qualsiasi' })
      .expect(400);
  });

  it('GET /me con Bearer valido → profilo; senza/invalid token → 401', async () => {
    const token = await login(app, 'admin.auth@e2e.test', 'segreto-1');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ email: 'admin.auth@e2e.test', ruolo: 'admin' }));

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer non.valido')
      .expect(401);
  });

  it('superuser: token con stabilimentoId null; endpoint tenant-scoped → 400', async () => {
    const token = await login(app, 'super.auth@e2e.test', 'segreto-2');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((r) => expect(r.body.stabilimentoId).toBeNull());

    await request(app.getHttpServer())
      .get('/api/clienti')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
