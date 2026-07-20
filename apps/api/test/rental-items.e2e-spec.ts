import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('RentalItems (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let s1: string; let s2: string; let t1: string; let t2: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(m); prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rent A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Rent B' } })).id;
    await createUser(prisma, { email: 'a.ri1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'a.ri2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    t1 = await login(app, 'a.ri1@e2e.test', 'pw1'); t2 = await login(app, 'a.ri2@e2e.test', 'pw2');
  });
  afterAll(async () => {
    for (const s of [s1, s2]) await prisma.forTenant(s, async (tx) => {
      await tx.rental.deleteMany({}); await tx.rentalTariff.deleteMany({}); await tx.rentalItem.deleteMany({});
    });
    await prisma.user.deleteMany({ where: { email: { in: ['a.ri1@e2e.test', 'a.ri2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const srv = () => app.getHttpServer();

  it('CRUD + unicità nome + isolamento tenant', async () => {
    const c = await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Pedalò', stock: 5 }).expect(201);
    expect(c.body).toMatchObject({ name: 'Pedalò', stock: 5 });
    const id = c.body.id as string;
    await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'pedalò' }).expect(409); // case-insensitive
    const upd = await request(srv()).patch(`/api/rental-items/${id}`).set(...bearer(t1)).send({ stock: null }).expect(200);
    expect(upd.body.stock).toBeNull();
    const listS2 = await request(srv()).get('/api/rental-items').set(...bearer(t2)).expect(200);
    expect(listS2.body.some((i: { id: string }) => i.id === id)).toBe(false);
    await request(srv()).patch(`/api/rental-items/${id}`).set(...bearer(t2)).send({ name: 'x' }).expect(404); // cross-tenant
  });

  it('archive/restore + delete guardato (409 se non archiviato) + delete 200 archiviato+0 noleggi', async () => {
    const c = await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Canoa' }).expect(201);
    const id = c.body.id as string;
    await request(srv()).delete(`/api/rental-items/${id}`).set(...bearer(t1)).expect(409); // non archiviato
    await request(srv()).post(`/api/rental-items/${id}/archive`).set(...bearer(t1)).expect(201);
    const arch = await request(srv()).get('/api/rental-items?includeArchived=true').set(...bearer(t1)).expect(200);
    expect(arch.body.find((i: { id: string; archived?: boolean }) => i.id === id).archived).toBe(true);
    await request(srv()).post(`/api/rental-items/${id}/restore`).set(...bearer(t1)).expect(201);
    await request(srv()).post(`/api/rental-items/${id}/archive`).set(...bearer(t1)).expect(201);
    await request(srv()).delete(`/api/rental-items/${id}`).set(...bearer(t1)).expect(200); // archiviato + 0 noleggi
  });
});
