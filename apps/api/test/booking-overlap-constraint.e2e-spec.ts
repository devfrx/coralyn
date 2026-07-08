import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';
import { isBookingOverlapExclusion } from '../src/bookings/booking.errors';

/**
 * Test a livello DB dell'EXCLUDE constraint coverage_no_overlap (D-030, ADR-0037/ADR-0046). Inserisce
 * prenotazioni + coverage DIRETTAMENTE (bypassando il check applicativo del service) per esercitare il
 * solo constraint: prova che la rete di sicurezza DB regge anche se l'app fosse aggirata.
 *
 * Fase CONTRACT: l'occupazione vive ora SOLO su BookingCoverage — Booking non ha più
 * slotStartMin/slotEndMin né booking_no_overlap (rimossi in questa fase).
 */
describe('BookingCoverage overlap EXCLUDE constraint (e2e, DB-level)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let ids: MapSeedIds;
  let customerId: string;
  let fullDaySlot: string; // Giorno Intero 08-19 (fascia diversa, orari che coprono Mattina)

  const D = new Date('2026-07-15T00:00:00Z');

  // Inserisce un Booking confermato + la sua coverage 1:1, bypassando il service (trigger popola i minuti
  // della coverage).
  const insert = (over: {
    umbrellaId: string; timeSlotId: string; startDate: Date; endDate: Date; status?: 'confirmed' | 'cancelled';
  }) =>
    insertBookingWithCoverage(prisma, s1, {
      establishmentId: s1,
      customerId,
      umbrellaId: over.umbrellaId,
      timeSlotId: over.timeSlotId,
      startDate: over.startDate,
      endDate: over.endDate,
      status: over.status,
    });

  // Legge la coverage 1:1 di un booking (assunzione dei test: 1 coverage per booking in questa fase).
  const coverageOf = (bookingId: string) =>
    prisma.forTenant(s1, (tx) => tx.bookingCoverage.findFirstOrThrow({ where: { bookingId } }));

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

  it('il trigger popola slotStartMin/slotEndMin della coverage dalla fascia (Mattina 08-13 → 480/780)', async () => {
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const coverageRow = await coverageOf(b.id);
    expect(coverageRow.slotStartMin).toBe(480);
    expect(coverageRow.slotEndMin).toBe(780);
  });

  it('il trigger converte anche Pomeriggio 13-19 → 780/1140 e Giorno Intero 08-19 → 480/1140', async () => {
    const pm = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D });
    const fd = await insert({ umbrellaId: ids.u2, timeSlotId: fullDaySlot, startDate: D, endDate: D });
    const pmCoverage = await coverageOf(pm.id);
    const fdCoverage = await coverageOf(fd.id);
    expect([pmCoverage.slotStartMin, pmCoverage.slotEndMin]).toEqual([780, 1140]);
    expect([fdCoverage.slotStartMin, fdCoverage.slotEndMin]).toEqual([480, 1140]);
  });

  it("il trigger RICALCOLA i minuti su UPDATE OF bookingId (esercita l'intero trigger, non solo INSERT)", async () => {
    // La coverage punta a un booking Mattina 08-13 → 480/780. Ripuntando la coverage a un booking
    // Pomeriggio 13-19 (via UPDATE OF "bookingId") il trigger deve ricalcolare 780/1140.
    const morningBooking = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const afternoonBooking = await insert({ umbrellaId: ids.u2, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D });
    const coverageRow = await coverageOf(morningBooking.id);

    await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.update({ where: { id: coverageRow.id }, data: { bookingId: afternoonBooking.id } }),
    );

    const updated = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findFirstOrThrow({ where: { id: coverageRow.id } }),
    );
    expect([updated.slotStartMin, updated.slotEndMin]).toEqual([780, 1140]);
  });

  it('il trigger NON scatta su UPDATE di colonne diverse da bookingId (i minuti restano intatti)', async () => {
    // Mattina 08-13 → 480/780. Un update che NON tocca bookingId (es. status, come cancel) non deve
    // ricalcolare né azzerare i minuti: il trigger è scoped a OF "bookingId".
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const coverageRow = await coverageOf(b.id);

    await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.update({ where: { id: coverageRow.id }, data: { status: 'cancelled' } }),
    );

    const updated = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findFirstOrThrow({ where: { id: coverageRow.id } }),
    );
    expect([updated.slotStartMin, updated.slotEndMin]).toEqual([480, 780]);
  });

  it('stessa fascia, stesso ombrellone, date sovrapposte → rifiutato (violazione 23P01 coverage_no_overlap)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
  });

  it('Giorno Intero (08-19) vs Mattina (08-13), stesso ombrellone/data → rifiutato (semantica oraria, non timeSlotId)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: fullDaySlot, startDate: D, endDate: D }),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
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

  it("isBookingOverlapExclusion riconosce l'errore REALE del constraint (pin del mapping 23P01→409)", async () => {
    // Il mapping è ormai backstop di sola race (create e renew pre-validano), quindi non è più
    // raggiungibile via API in modo deterministico: pinniamo il rilevatore DIRETTAMENTE contro
    // l'errore Prisma reale prodotto dal constraint, così un cambio di forma dell'errore lo rompe subito.
    // NB fase di transizione: finché il vecchio booking_no_overlap (su Booking) coesiste col nuovo
    // coverage_no_overlap, è booking_no_overlap a scattare per primo (l'INSERT su Booking precede quello
    // sulla coverage nella stessa transazione in insertBookingWithCoverage) — questo test pinna quindi
    // l'errore REALE POST-DROP e torna verde solo dopo la migration di Step 4 (matcher già puntato a
    // coverage_no_overlap da Step 1).
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    let caught: unknown;
    try {
      await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isBookingOverlapExclusion(caught)).toBe(true);
  });
});
