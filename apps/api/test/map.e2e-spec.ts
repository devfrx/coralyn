import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';
import { createTestApp } from './helpers/create-test-app';

describe('Map (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MapSeedIds;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Map A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Map B' } })).id;
    await createUser(prisma, { email: 'admin.m1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.m2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    token1 = await login(app, 'admin.m1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.m2@e2e.test', 'pw2');
    ids = await seedMapTenant(prisma, s1); // struttura solo per s1
  });

  afterAll(async () => {
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.m1@e2e.test', 'admin.m2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/map').expect(401);
  });

  it('ritorna la struttura seedata al proprietario (s1)', async () => {
    const res = await request(app.getHttpServer()).get('/api/map').set(...bearer(token1)).expect(200);
    expect(res.body.umbrellaTypes).toEqual([{ id: ids.umbrellaTypeId, name: 'Palma', sortOrder: 1, icon: 'palmtree' }]);
    expect(res.body.timeSlots.map((s: { id: string }) => s.id)).toEqual([ids.slotMorning, ids.slotAfternoon]);
    expect(res.body.sectors).toHaveLength(1);
    const umbrellas = res.body.sectors[0].rows[0].umbrellas;
    // ordinamento per logicalOrder: '1' prima di '2'
    expect(umbrellas.map((u: { label: string }) => u.label)).toEqual(['1', '2']);
    // stateBySlot: tutto free, chiavi = id time slot
    expect(umbrellas[0].stateBySlot).toEqual({ [ids.slotMorning]: 'free', [ids.slotAfternoon]: 'free' });
    expect(umbrellas[0].umbrellaTypeId).toBe(ids.umbrellaTypeId);
    expect(umbrellas[1].umbrellaTypeId).toBeNull();
  });

  it('isolamento: s2 non vede la struttura di s1', async () => {
    const res = await request(app.getHttpServer()).get('/api/map').set(...bearer(token2)).expect(200);
    expect(res.body.sectors).toEqual([]);
    expect(res.body.umbrellaTypes).toEqual([]);
    expect(res.body.timeSlots).toEqual([]);
  });

  it('echeggia la data richiesta', async () => {
    const res = await request(app.getHttpServer()).get('/api/map?date=2026-07-15').set(...bearer(token1)).expect(200);
    expect(res.body.date).toBe('2026-07-15');
  });

  it('senza data usa oggi (yyyy-mm-dd)', async () => {
    const res = await request(app.getHttpServer()).get('/api/map').set(...bearer(token1)).expect(200);
    expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rifiuta una data malformata con 400', async () => {
    await request(app.getHttpServer()).get('/api/map?date=15-07-2026').set(...bearer(token1)).expect(400);
  });
});
