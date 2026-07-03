import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

/**
 * Test a livello DB dell'EXCLUDE constraint booking_no_overlap (D-030, ADR-0037). Inserisce
 * prenotazioni DIRETTAMENTE (bypassando il check applicativo del service) per esercitare il solo
 * constraint: prova che la rete di sicurezza DB regge anche se l'app fosse aggirata.
 */
describe('Booking overlap EXCLUDE constraint (e2e, DB-level)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let ids: MapSeedIds;
  let customerId: string;
  let fullDaySlot: string; // Giorno Intero 08-19 (fascia diversa, orari che coprono Mattina)

  const D = new Date('2026-07-15T00:00:00Z');

  // Inserisce una prenotazione confermata bypassando il service (trigger popola i minuti).
  const insert = (over: {
    umbrellaId: string; timeSlotId: string; startDate: Date; endDate: Date; status?: 'confirmed' | 'cancelled';
  }) =>
    prisma.forTenant(s1, (tx) =>
      tx.booking.create({
        data: {
          establishmentId: s1,
          customerId,
          umbrellaId: over.umbrellaId,
          timeSlotId: over.timeSlotId,
          startDate: over.startDate,
          endDate: over.endDate,
          type: 'daily',
          status: over.status ?? 'confirmed',
          totalPrice: 10,
        },
      }),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Overlap DB' } })).id;
    ids = await seedMapTenant(prisma, s1);
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'C', lastName: 'D' } }),
      )
    ).id;
    fullDaySlot = (
      await prisma.forTenant(s1, (tx) =>
        tx.timeSlot.create({
          data: {
            establishmentId: s1,
            name: 'Giorno Intero',
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T19:00:00Z'),
            sortOrder: 9,
          },
        }),
      )
    ).id;
  });

  afterEach(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('il trigger popola slotStartMin/slotEndMin dalla fascia (Mattina 08-13 → 480/780)', async () => {
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: b.id } }));
    expect(row.slotStartMin).toBe(480);
    expect(row.slotEndMin).toBe(780);
  });

  it('il trigger converte anche Pomeriggio 13-19 → 780/1140 e Giorno Intero 08-19 → 480/1140', async () => {
    const pm = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D });
    const fd = await insert({ umbrellaId: ids.u2, timeSlotId: fullDaySlot, startDate: D, endDate: D });
    const pmRow = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: pm.id } }));
    const fdRow = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: fd.id } }));
    expect([pmRow.slotStartMin, pmRow.slotEndMin]).toEqual([780, 1140]);
    expect([fdRow.slotStartMin, fdRow.slotEndMin]).toEqual([480, 1140]);
  });

  it('il trigger RICALCOLA i minuti su UPDATE OF timeSlotId (esercita l\'intero trigger, non solo INSERT)', async () => {
    // Mattina 08-13 → 480/780; cambiando la fascia a Pomeriggio 13-19 il trigger deve ricalcolare 780/1140.
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await prisma.forTenant(s1, (tx) =>
      tx.booking.update({ where: { id: b.id }, data: { timeSlotId: ids.slotAfternoon } }),
    );
    const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: b.id } }));
    expect([row.slotStartMin, row.slotEndMin]).toEqual([780, 1140]);
  });

  it('stessa fascia, stesso ombrellone, date sovrapposte → rifiutato (violazione 23P01 booking_no_overlap)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).rejects.toThrow(/booking_no_overlap|23P01|exclusion/i);
  });

  it('Giorno Intero (08-19) vs Mattina (08-13), stesso ombrellone/data → rifiutato (semantica oraria, non timeSlotId)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: fullDaySlot, startDate: D, endDate: D }),
    ).rejects.toThrow(/booking_no_overlap|23P01|exclusion/i);
  });

  it('fasce contigue (Mattina 08-13 + Pomeriggio 13-19), stesso ombrellone/data → accettate (semiaperto)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D }),
    ).resolves.toBeDefined();
  });

  it('una prenotazione CANCELLATA non blocca una nuova sovrapposta (partial WHERE status=confirmed)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D, status: 'cancelled' });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).resolves.toBeDefined();
  });
});
