import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['bulk.admin@e2e.test', 'bulk.staff@e2e.test'];

describe('Establishment umbrellas bulk (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let freeId: string;     // eliminabile
  let bookedId: string;   // protetto da booking
  let typeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'BULK A' } })).id;
    await createUser(prisma, { email: 'bulk.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'bulk.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'bulk.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'bulk.staff@e2e.test', 'pw-staff-1');

    await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Bulk', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'F1', sortOrder: 1 } });
      typeId = (await tx.umbrellaType.create({ data: { establishmentId: s1, name: 'Gazebo', sortOrder: 1 } })).id;
      freeId = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'BK-1', logicalOrder: 1 } })).id;
      bookedId = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'BK-2', logicalOrder: 2 } })).id;

      // Prenotazione minima su bookedId (pattern da bookings.e2e-spec.ts: customer + timeSlot + booking confermata).
      const timeSlot = await tx.timeSlot.create({
        data: {
          establishmentId: s1,
          name: 'Mattina',
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T13:00:00Z'),
          sortOrder: 1,
        },
      });
      const customer = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } });
      await tx.booking.create({
        data: {
          establishmentId: s1,
          customerId: customer.id,
          umbrellaId: bookedId,
          timeSlotId: timeSlot.id,
          startDate: new Date('2026-07-15'),
          endDate: new Date('2026-07-15'),
          type: 'daily',
          status: 'confirmed',
          totalPrice: 28,
        },
      });
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.booking.deleteMany({ where: { establishmentId: s1 } });
      await tx.customer.deleteMany({ where: { establishmentId: s1 } });
      await tx.umbrella.deleteMany({ where: { establishmentId: s1 } });
      await tx.timeSlot.deleteMany({ where: { establishmentId: s1 } });
      await tx.umbrellaType.deleteMany({ where: { establishmentId: s1 } });
      await tx.row.deleteMany({ where: { establishmentId: s1 } });
      await tx.sector.deleteMany({ where: { establishmentId: s1 } });
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('bulk-delete senza token → 401', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').send({ ids: [freeId] }).expect(401);
  });

  it('bulk-delete staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(staffT)).send({ ids: [freeId] }).expect(403);
  });

  it('bulk-delete ids vuoto → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(adminT)).send({ ids: [] }).expect(400);
  });

  it('bulk-assign-type tipologia estranea → 422', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-assign-type').set(...bearer(adminT))
      .send({ ids: [freeId], umbrellaTypeId: '00000000-0000-4000-8000-0000000000ff' }).expect(422);
  });

  it('bulk-assign-type admin → 201 { updated }', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-assign-type').set(...bearer(adminT))
      .send({ ids: [freeId, bookedId], umbrellaTypeId: typeId }).expect(201);
    expect(res.body).toEqual({ updated: 2 });
  });

  it('bulk-delete admin → 201: elimina il libero, salta il prenotato', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(adminT))
      .send({ ids: [freeId, bookedId] }).expect(201);
    expect(res.body).toEqual({ deleted: 1, skipped: 1 });
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const labels = struct.body.sectors.flatMap((s: { rows: { umbrellas: { label: string }[] }[] }) => s.rows.flatMap((r) => r.umbrellas.map((u) => u.label)));
    expect(labels).not.toContain('BK-1');
    expect(labels).toContain('BK-2');
  });
});
