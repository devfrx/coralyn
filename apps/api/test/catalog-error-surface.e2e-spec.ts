import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/create-test-app';
import { createUser, login } from './helpers/seed-auth';

/**
 * D-050: un id non-UUID sui controller catalog (:id preso come stringa grezza, senza
 * ParseUUIDPipe) raggiunge Prisma e generava P2023 -> 500. Il PrismaExceptionFilter
 * (APP_FILTER globale in AppModule, task precedente) mappa P2023 -> 400. Questa suite
 * prova end-to-end che il filtro e' attivo: senza di esso questi casi sarebbero 500.
 */
describe('Catalog error-surface — id malformato → 400 (D-050)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sid: string;
  let token: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
  const BAD = 'not-a-uuid';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);
    sid = (await prisma.establishment.create({ data: { name: 'Cat ErrSurface' } })).id;
    await createUser(prisma, {
      email: 'admin.caterr@e2e.test', password: 'pw', role: Role.admin, establishmentId: sid,
    });
    token = await login(app, 'admin.caterr@e2e.test', 'pw');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { establishmentId: sid } });
    await prisma.establishment.delete({ where: { id: sid } });
    await app.close();
  });

  // Body minimi validi presi dai DTO reali (dto/update-*.dto.ts), tutti i campi sono
  // opzionali: l'obiettivo e' che il body passi la validazione e la richiesta arrivi
  // al lookup Prisma sull'id malformato, cosi' il 400 e' isolato al path P2023.
  const cases: Array<[string, 'patch' | 'post' | 'delete', string, object | undefined]> = [
    ['equipment-types PATCH', 'patch', `/api/equipment-types/${BAD}`, { name: 'x' }],
    ['equipment-types archive', 'post', `/api/equipment-types/${BAD}/archive`, undefined],
    ['equipment-types restore', 'post', `/api/equipment-types/${BAD}/restore`, undefined],
    ['equipment-types DELETE', 'delete', `/api/equipment-types/${BAD}`, undefined],
    ['packages PATCH', 'patch', `/api/packages/${BAD}`, { name: 'x' }],
    ['packages archive', 'post', `/api/packages/${BAD}/archive`, undefined],
    ['packages restore', 'post', `/api/packages/${BAD}/restore`, undefined],
    ['packages DELETE', 'delete', `/api/packages/${BAD}`, undefined],
    ['rates PATCH', 'patch', `/api/rates/${BAD}`, { price: 10 }],
    ['rates DELETE', 'delete', `/api/rates/${BAD}`, undefined],
    ['seasons DELETE', 'delete', `/api/seasons/${BAD}`, undefined],
    ['time-slots PATCH', 'patch', `/api/time-slots/${BAD}`, { name: 'x' }],
    ['time-slots DELETE', 'delete', `/api/time-slots/${BAD}`, undefined],
  ];

  it.each(cases)('%s → 400', async (_name, method, url, body) => {
    const req = request(app.getHttpServer())[method](url).set(...bearer(token));
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(400);
  });
});
