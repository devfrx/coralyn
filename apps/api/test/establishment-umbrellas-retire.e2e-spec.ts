import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

// Collaudo integrato del ritiro ombrellone (D-055): guardia prenotazioni attive/future, sgancio dalla
// struttura con snapshot in retired, sblocco via disdetta, label riusabile dopo il ritiro, restore con
// guardia clash label e ricomparsa in struttura, blocco prenotazione su ritirato.
// Calendario e2e congelato: «oggi» = 2026-07-15 (jest-frozen-calendar.setup.ts). Tutte le date sono
// letterali dentro la stagione seed [2026-05-01, 2026-09-30].

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['retire.admin@e2e.test', 'retire.staff@e2e.test'];

describe('Establishment umbrellas retire (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let rowId: string;
  let rt1: string; // prenotazione confermata FUTURA (2026-07-20): blocca il ritiro
  let rt2: string; // prenotazione confermata PASSATA (2026-07-10): non blocca il ritiro
  let rt3: string; // nessuno storico
  let timeSlotId: string;
  let customerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'RETIRE A' } })).id;
    await createUser(prisma, { email: 'retire.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'retire.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'retire.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'retire.staff@e2e.test', 'pw-staff-1');

    await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Retire', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'F1', sortOrder: 1 } });
      rowId = row.id;
      rt1 = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'RT-1', logicalOrder: 1 } })).id;
      rt2 = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'RT-2', logicalOrder: 2 } })).id;
      rt3 = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'RT-3', logicalOrder: 3 } })).id;

      const timeSlot = await tx.timeSlot.create({
        data: {
          establishmentId: s1,
          name: 'Mattina',
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T13:00:00Z'),
          sortOrder: 1,
        },
      });
      timeSlotId = timeSlot.id;
      const customer = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } });
      customerId = customer.id;

      await tx.booking.create({
        data: {
          establishmentId: s1,
          customerId: customer.id,
          umbrellaId: rt1,
          timeSlotId: timeSlot.id,
          startDate: new Date('2026-07-20'),
          endDate: new Date('2026-07-20'),
          type: 'daily',
          status: 'confirmed',
          totalPrice: 28,
        },
      });
      await tx.booking.create({
        data: {
          establishmentId: s1,
          customerId: customer.id,
          umbrellaId: rt2,
          timeSlotId: timeSlot.id,
          startDate: new Date('2026-07-10'),
          endDate: new Date('2026-07-10'),
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
      await tx.row.deleteMany({ where: { establishmentId: s1 } });
      await tx.sector.deleteMany({ where: { establishmentId: s1 } });
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('403 per staff su retire/restore', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt3}/retire`).set(...bearer(staffT)).expect(403);
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt3}/restore`).set(...bearer(staffT)).send({ rowId }).expect(403);
  });

  it('GET retired accessibile allo staff → 200 (D-060: risoluzione label storiche in Prenotazioni/Rinnovi)', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/umbrellas/retired').set(...bearer(staffT)).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('retire di RT-1 (prenotazione futura confermata) → 409', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt1}/retire`).set(...bearer(adminT)).expect(409);
    expect(res.body.message).toBe('Ombrellone con prenotazioni attive o future: disdici prima di ritirare.');
  });

  it('retire di RT-2 (solo storico passato) → 201: sparisce dalla struttura, appare in retired con snapshot', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt2}/retire`).set(...bearer(adminT)).expect(201);

    const structure = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(JSON.stringify(structure.body)).not.toContain(rt2);

    const retired = await request(app.getHttpServer()).get('/api/establishment/umbrellas/retired').set(...bearer(adminT)).expect(200);
    expect(retired.body).toEqual([expect.objectContaining({ id: rt2, label: 'RT-2', retiredFrom: 'Retire · F1' })]);
  });

  it('la disdetta sblocca: cancella la prenotazione di RT-1 → retire 201', async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.updateMany({ where: { umbrellaId: rt1 }, data: { status: 'cancelled' } }));
    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt1}/retire`).set(...bearer(adminT)).expect(201);
  });

  it('label riusabile: POST /establishment/umbrellas con label RT-2 → 201 (indice parziale al lavoro)', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT))
      .send({ label: 'RT-2', rowId, umbrellaTypeId: null }).expect(201);
    expect(res.body.label).toBe('RT-2');
    expect(res.body.id).not.toBe(rt2);
  });

  it('restore con label occupata da un attivo → 409', async () => {
    const res = await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt2}/restore`).set(...bearer(adminT))
      .send({ rowId }).expect(409);
    expect(res.body.message).toBe('Esiste già un ombrellone attivo con questa etichetta: rinominalo prima di ripristinare.');
  });

  it('restore in una fila valida → 201 e riappare in struttura; retired non lo elenca più', async () => {
    // Prima elimina il duplicato attivo RT-2 (non ha storico → delete 200), poi il vecchio RT-2 può tornare.
    const structureBefore = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const activeRt2Id = (structureBefore.body.sectors as { rows: { umbrellas: { id: string; label: string }[] }[] }[])
      .flatMap((s) => s.rows.flatMap((r) => r.umbrellas))
      .find((u) => u.label === 'RT-2')!.id;
    await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${activeRt2Id}`).set(...bearer(adminT)).expect(200);

    await request(app.getHttpServer()).post(`/api/establishment/umbrellas/${rt2}/restore`).set(...bearer(adminT))
      .send({ rowId }).expect(201);

    const structure = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(JSON.stringify(structure.body)).toContain(rt2);

    const retired = await request(app.getHttpServer()).get('/api/establishment/umbrellas/retired').set(...bearer(adminT)).expect(200);
    expect(retired.body.some((u: { id: string }) => u.id === rt2)).toBe(false);
  });

  it('creare una prenotazione su un ritirato → 422', async () => {
    // RT-1 è tuttora ritirato (mai ripristinato in questa suite).
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(adminT))
      .send({ customerId, umbrellaId: rt1, timeSlotId, type: 'daily', startDate: '2026-07-25' }).expect(422);
  });
});
