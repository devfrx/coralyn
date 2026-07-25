import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';
import { insertBookingWithCoverage } from './helpers/insert-booking-with-coverage';
import { createEstablishment } from './helpers/create-establishment';
import { isBookingOverlapExclusion } from '../src/bookings/booking.errors';
import type { TenantId } from '../src/tenant/tenant-id';

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
  let s1: TenantId;
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

  // Inserisce una coverage GREZZA, senza passare da insertBookingWithCoverage: serve a scrivere
  // combinazioni che l'helper (coerente per costruzione) non può produrre — umbrellaId divergente
  // dal booking madre, range invertito.
  const insertRawCoverage = (data: {
    bookingId: string; umbrellaId: string; startDate: Date; endDate: Date;
  }) =>
    prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.create({
        data: { ...data, establishmentId: s1, status: 'confirmed' },
      }),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // bootstrap senza ValidationPipe: suite DB-level, inserisce via insertBookingWithCoverage
    // direttamente su Prisma (nessuna request HTTP/supertest) — non c'è nemmeno il prefix 'api',
    // quindi non è lo stesso pattern "prefix+pipe senza pipe" degli altri due bootstrap manuali;
    // createTestApp() aggiungerebbe prefix+pipe inutilizzati senza alcun beneficio.
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = await createEstablishment(prisma, 'Overlap DB');
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

  it("il trigger RICALCOLA minuti E ombrellone su UPDATE OF bookingId (esercita l'intero trigger, non solo INSERT)", async () => {
    // La coverage punta a un booking Mattina 08-13 su u1 → 480/780. Ripuntandola a un booking
    // Pomeriggio 13-19 su u2 (via UPDATE OF "bookingId") il trigger deve ricalcolare 780/1140 e
    // portare con se' anche l'ombrellone: una coverage eredita dal Booking madre TUTTO cio' che
    // denormalizza, non solo l'orario. Senza il riallineamento di umbrellaId (P2-005) restava una
    // riga che occupa u1 per conto di una prenotazione che sta su u2 — la chiave di
    // partizionamento di coverage_no_overlap che punta alla partizione sbagliata.
    //
    // Il booking di destinazione sta su un'altra DATA di proposito: sulla stessa, la riga ripuntata
    // andrebbe a sovrapporsi alla coverage propria di quel booking e il DB la rifiuterebbe — che e'
    // il caso del test successivo, e prima di Fase E non accadeva proprio perche' la riga restava
    // (silenziosamente) sull'ombrellone sbagliato.
    const D2 = new Date('2026-07-16T00:00:00Z');
    const morningBooking = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const afternoonBooking = await insert({ umbrellaId: ids.u2, timeSlotId: ids.slotAfternoon, startDate: D2, endDate: D2 });
    const coverageRow = await coverageOf(morningBooking.id);

    await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.update({ where: { id: coverageRow.id }, data: { bookingId: afternoonBooking.id } }),
    );

    const updated = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findFirstOrThrow({ where: { id: coverageRow.id } }),
    );
    expect([updated.slotStartMin, updated.slotEndMin]).toEqual([780, 1140]);
    expect(updated.umbrellaId).toBe(ids.u2);
  });

  it('ripuntare una coverage su una prenotazione il cui posto e\' gia\' occupato ora e\' RIFIUTATO', async () => {
    // Il complemento del test precedente, e la prova che il riallineamento di umbrellaId serve
    // davvero all'anti-double-booking: qui la riga ripuntata finirebbe su u2 nello stesso giorno e
    // nella stessa fascia della coverage propria di afternoonBooking. Ora coverage_no_overlap lo
    // VEDE e rifiuta. Prima di Fase E la stessa update passava: la riga conservava umbrellaId = u1,
    // quindi il constraint la confrontava con la partizione sbagliata e non trovava conflitti —
    // lasciando u1 occupato da nessuno e u2 occupato due volte.
    const morningBooking = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const afternoonBooking = await insert({ umbrellaId: ids.u2, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D });
    const coverageRow = await coverageOf(morningBooking.id);

    await expect(
      prisma.forTenant(s1, (tx) =>
        tx.bookingCoverage.update({ where: { id: coverageRow.id }, data: { bookingId: afternoonBooking.id } }),
      ),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
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

  // --- umbrellaId DB-autoritativo (P2-005) ---------------------------------------------------
  // umbrellaId e' la PRIMA chiave di partizionamento di coverage_no_overlap, l'unico garante
  // anti-double-booking: una riga con l'ombrellone sbagliato non e' un dato stantio, e' occupazione
  // fantasma su un posto e un posto libero che risulta occupato. Il gemello slotStartMin/slotEndMin,
  // altrettanto denormalizzato, era gia' reso autoritativo da questo stesso trigger dal 2026-07-08:
  // l'asimmetria era che si era protetta la denormalizzazione ORARIA e lasciata scoperta quella
  // SPAZIALE. Ora il trigger le tratta insieme, e la FK dichiara la relazione che mancava.

  it('il trigger IGNORA un umbrellaId divergente in INSERT e impone quello della prenotazione madre', async () => {
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    // Coverage scritta a mano su u2 per un booking che sta su u1: prima di Fase E la riga restava
    // cosi' com'era, e occupava u2 (dove nessuno aveva prenotato) lasciando u1 rivendibile.
    const rogue = await insertRawCoverage({
      bookingId: b.id,
      umbrellaId: ids.u2,
      startDate: new Date('2026-07-16T00:00:00Z'),
      endDate: new Date('2026-07-16T00:00:00Z'),
    });
    expect(rogue.umbrellaId).toBe(ids.u1);
  });

  it('il trigger riporta a quello della prenotazione anche un UPDATE diretto di umbrellaId', async () => {
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const coverageRow = await coverageOf(b.id);

    await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.update({ where: { id: coverageRow.id }, data: { umbrellaId: ids.u2 } }),
    );

    const updated = await prisma.forTenant(s1, (tx) =>
      tx.bookingCoverage.findFirstOrThrow({ where: { id: coverageRow.id } }),
    );
    expect(updated.umbrellaId).toBe(ids.u1);
  });

  it("l'autorita' del trigger non e' aggirabile inserendo su un ombrellone di un altro tenant", async () => {
    // L'ombrellone di un altro lido non e' raggiungibile via RLS in lettura, ma un id e' solo un
    // uuid: senza il trigger nulla impediva di scriverlo nella colonna. Il trigger lo sovrascrive
    // e la FK, indipendentemente, rifiuterebbe un id inesistente.
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const alien = await createEstablishment(prisma, 'Altro lido');
    const alienIds = await seedMapTenant(prisma, alien);

    const rogue = await insertRawCoverage({
      bookingId: b.id,
      umbrellaId: alienIds.u1,
      startDate: new Date('2026-07-17T00:00:00Z'),
      endDate: new Date('2026-07-17T00:00:00Z'),
    });
    expect(rogue.umbrellaId).toBe(ids.u1);

    await cleanMapTenant(prisma, alien);
    await prisma.establishment.deleteMany({ where: { id: alien } });
  });

  it('la coverage dichiara la FK verso Umbrella (ON DELETE RESTRICT, gemella di quella di Booking)', async () => {
    // La FK non e' raggiungibile in scrittura finche' il trigger regge (impone sempre un id valido):
    // e' la dichiarazione della relazione — che mancava del tutto — e il backstop se il trigger
    // venisse rimosso da una migration futura. Qui si asserisce che ESISTA con la semantica giusta,
    // non un percorso di errore che oggi non si puo' raggiungere onestamente.
    const [fk] = await prisma.$queryRaw<{ definition: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = '"BookingCoverage"'::regclass AND conname = 'BookingCoverage_umbrellaId_fkey'
    `;
    expect(fk?.definition).toMatch(/FOREIGN KEY \("umbrellaId"\) REFERENCES "Umbrella"\(id\)/);
    expect(fk?.definition).toMatch(/ON DELETE RESTRICT/);
  });

  it('stessa fascia, stesso ombrellone, date sovrapposte → rifiutato (violazione 23P01 coverage_no_overlap)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).rejects.toThrow(/coverage_no_overlap|23P01|exclusion/i);
  });

  it('coverage_range_valid: una coverage con startDate > endDate → rifiutata dal DB (P1-001)', async () => {
    // Backstop strutturale del carve: l'aritmetica corretta vive in coverage.carve.ts, ma prima di
    // questo CHECK nulla vietava a un chiamante distratto di scrivere un range invertito — che il
    // driver riporta come data_exception non mappato (500). Ora e' impossibile per costruzione.
    //
    // Il booking madre ha un range VALIDO e solo la coverage e' invertita: da quando esiste anche
    // booking_range_valid (Fase E) un booking invertito verrebbe respinto PRIMA, e questo test
    // sarebbe passato per il constraint sbagliato — entrambi sono 23514 «check constraint».
    // Per lo stesso motivo l'asserzione nomina il constraint invece di accettare il codice generico.
    const b = await insert({
      umbrellaId: ids.u1,
      timeSlotId: ids.slotMorning,
      startDate: new Date('2026-07-19T00:00:00Z'),
      endDate: new Date('2026-07-20T00:00:00Z'),
    });
    await expect(
      insertRawCoverage({
        bookingId: b.id,
        umbrellaId: ids.u1,
        startDate: new Date('2026-07-20T00:00:00Z'),
        endDate: new Date('2026-07-19T00:00:00Z'),
      }),
    ).rejects.toThrow(/coverage_range_valid/i);
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
    // Post-CONTRACT: il vecchio booking_no_overlap (su Booking) è stato rimosso; l'unico garante è
    // coverage_no_overlap (su BookingCoverage) e questo test pinna direttamente quell'errore reale.
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
