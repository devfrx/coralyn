import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUtente, login } from './helpers/seed-auth';
import { cleanMappaTenant, seedMappaTenant, type MappaSeedIds } from './helpers/seed-mappa';

describe('Mappa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let ids: MappaSeedIds;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.stabilimento.create({ data: { nome: 'Mappa A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'Mappa B' } })).id;
    await createUtente(prisma, { email: 'admin.m1@e2e.test', password: 'pw1', ruolo: Ruolo.admin, stabilimentoId: s1 });
    await createUtente(prisma, { email: 'admin.m2@e2e.test', password: 'pw2', ruolo: Ruolo.admin, stabilimentoId: s2 });
    token1 = await login(app, 'admin.m1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.m2@e2e.test', 'pw2');
    ids = await seedMappaTenant(prisma, s1); // struttura solo per s1
  });

  afterAll(async () => {
    await cleanMappaTenant(prisma, s1);
    await cleanMappaTenant(prisma, s2);
    await prisma.utente.deleteMany({ where: { email: { in: ['admin.m1@e2e.test', 'admin.m2@e2e.test'] } } });
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/mappa').expect(401);
  });

  it('ritorna la struttura seedata al proprietario (s1)', async () => {
    const res = await request(app.getHttpServer()).get('/api/mappa').set(...bearer(token1)).expect(200);
    expect(res.body.tipologie).toEqual([{ id: ids.tipologiaId, nome: 'Palma', ordine: 1, icona: 'palmtree' }]);
    expect(res.body.fasce.map((f: { id: string }) => f.id)).toEqual([ids.fasciaMat, ids.fasciaPom]);
    expect(res.body.settori).toHaveLength(1);
    const ombrelloni = res.body.settori[0].file[0].ombrelloni;
    // ordinamento per ordineLogico: '1' prima di '2'
    expect(ombrelloni.map((o: { etichetta: string }) => o.etichetta)).toEqual(['1', '2']);
    // statoPerFascia: tutto libero, chiavi = id fasce
    expect(ombrelloni[0].statoPerFascia).toEqual({ [ids.fasciaMat]: 'libero', [ids.fasciaPom]: 'libero' });
    expect(ombrelloni[0].tipologiaId).toBe(ids.tipologiaId);
    expect(ombrelloni[1].tipologiaId).toBeNull();
  });

  it('isolamento: s2 non vede la struttura di s1', async () => {
    const res = await request(app.getHttpServer()).get('/api/mappa').set(...bearer(token2)).expect(200);
    expect(res.body.settori).toEqual([]);
    expect(res.body.tipologie).toEqual([]);
    expect(res.body.fasce).toEqual([]);
  });

  it('echeggia la data richiesta', async () => {
    const res = await request(app.getHttpServer()).get('/api/mappa?data=2026-07-15').set(...bearer(token1)).expect(200);
    expect(res.body.data).toBe('2026-07-15');
  });

  it('senza data usa oggi (yyyy-mm-dd)', async () => {
    const res = await request(app.getHttpServer()).get('/api/mappa').set(...bearer(token1)).expect(200);
    expect(res.body.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rifiuta una data malformata con 400', async () => {
    await request(app.getHttpServer()).get('/api/mappa?data=15-07-2026').set(...bearer(token1)).expect(400);
  });
});
