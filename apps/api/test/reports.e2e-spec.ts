import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let t1: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'RPT A' } })).id;
    await createUser(prisma, { email: 'rpt.s1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    t1 = await login(app, 'rpt.s1@e2e.test', 'pw1');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: 'rpt.s1@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('200 con la forma del summary e default period=week', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/summary')
      .set(...bearer(t1))
      .expect(200);
    expect(res.body.period).toBe('week');
    expect(res.body.kpis).toHaveProperty('revenue');
    expect(res.body.kpis).toHaveProperty('outstanding');
    expect(res.body.kpis).toHaveProperty('occupancyPct');
    expect(res.body.kpis).toHaveProperty('activeSubscriptions');
    expect(Array.isArray(res.body.revenueSeries)).toBe(true);
    expect(res.body.revenueSeries).toHaveLength(7);
    expect(Array.isArray(res.body.expiringRenewals)).toBe(true);
  });

  it('period invalido → 400', async () => {
    await request(app.getHttpServer())
      .get('/api/reports/summary?period=year')
      .set(...bearer(t1))
      .expect(400);
  });

  it('senza campagna rinnovi aperta → expiringRenewals vuoto', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/summary')
      .set(...bearer(t1))
      .expect(200);
    expect(res.body.expiringRenewals).toEqual([]);
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).get('/api/reports/summary').expect(401);
  });
});
