import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant } from './helpers/seed-map';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const isoPlus = (delta: number): string => {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

describe('Establishment overview (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let t1: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'EST A' } })).id;
    await seedMapTenant(prisma, s1);
    await prisma.forTenant(s1, async (tx) => {
      await tx.package.create({ data: { establishmentId: s1, name: 'Standard' } });
      await tx.season.create({ data: { establishmentId: s1, name: 'Stagione Corrente', startDate: new Date(`${isoPlus(-10)}T00:00:00Z`), endDate: new Date(`${isoPlus(10)}T00:00:00Z`) } });
    });
    await createUser(prisma, { email: 'est.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'est.staff@e2e.test', password: 'pw2', role: Role.staff, establishmentId: s1 });
    await createUser(prisma, { email: 'est.super@e2e.test', password: 'pw3', role: Role.superuser, establishmentId: null });
    t1 = await login(app, 'est.admin@e2e.test', 'pw1');

    s2 = (await prisma.establishment.create({ data: { name: 'EST B' } })).id;
    await seedMapTenant(prisma, s2);
    await createUser(prisma, { email: 'est.b@e2e.test', password: 'pw4', role: Role.admin, establishmentId: s2 });
  });

  afterAll(async () => {
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.forTenant(s1, async (tx) => { await tx.package.deleteMany({}); await tx.season.deleteMany({}); });
    await prisma.user.deleteMany({ where: { email: { in: ['est.admin@e2e.test', 'est.staff@e2e.test', 'est.super@e2e.test', 'est.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).get('/api/establishment/overview').expect(401);
  });

  it('200 con nome, stagione attiva, conteggi struttura isolati, fasce ordinate', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t1)).expect(200);
    expect(res.body.establishment).toEqual({ id: s1, name: 'EST A' });
    expect(res.body.activeSeason).toMatchObject({ name: 'Stagione Corrente' });
    expect(res.body.structure).toEqual({ sectors: 1, umbrellas: 2, types: 1, packages: 1 });
    expect(res.body.timeSlots.map((t: { name: string }) => t.name)).toEqual(['Mattina', 'Pomeriggio']);
  });

  it('team: solo utenti del tenant (superuser escluso), admin-first', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t1)).expect(200);
    const emails = res.body.team.map((m: { email: string }) => m.email);
    expect(emails).toEqual(['est.admin@e2e.test', 'est.staff@e2e.test']);
    expect(res.body.team[0].role).toBe('admin');
  });
});

describe('Establishment overview — off-season → activeSeason null (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3: string;
  let t3: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s3 = (await prisma.establishment.create({ data: { name: 'EST C' } })).id;
    await prisma.forTenant(s3, async (tx) => {
      await tx.season.create({ data: { establishmentId: s3, name: 'Stagione Passata', startDate: new Date(`${isoPlus(-60)}T00:00:00Z`), endDate: new Date(`${isoPlus(-30)}T00:00:00Z`) } });
    });
    await createUser(prisma, { email: 'est.c@e2e.test', password: 'pw5', role: Role.admin, establishmentId: s3 });
    t3 = await login(app, 'est.c@e2e.test', 'pw5');
  });

  afterAll(async () => {
    await prisma.forTenant(s3, async (tx) => { await tx.season.deleteMany({}); });
    await prisma.user.deleteMany({ where: { email: 'est.c@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s3 } });
    await app.close();
  });

  it('nessuna stagione copre oggi → activeSeason null', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t3)).expect(200);
    expect(res.body.activeSeason).toBeNull();
  });
});
