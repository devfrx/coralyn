import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

/**
 * Backstop DB delle invarianti di stato dell'abbonamento (P2-007, radice R3 dell'audit). Le tre
 * invarianti — una sola sospensione APERTA, una sola assenza ATTIVA per giorno, un solo rinnovo
 * CONFERMATO per origine — vivevano solo in TypeScript, ripetute in 13 siti con 3 formulazioni
 * diverse. Le guardie applicative restano la prima linea (danno un 409 leggibile); qui si bypassa
 * l'app e si scrive direttamente su Prisma per provare che il DB chiude la finestra read-then-write
 * che quelle guardie, da sole, non coprono — la stessa dottrina di coverage_no_overlap (ADR-0037).
 *
 * Perché conta: due sospensioni aperte lasciano `reactivate` (che fa `.find`, quindi ne chiude UNA)
 * a bloccare per sempre release e disdetta con un 422 che l'interfaccia non sa risolvere.
 *
 * Metà dei test qui asserisce il NEGATIVO — che l'indice NON scatti su una sospensione chiusa, su
 * un'assenza annullata, su un rinnovo annullato. Sono i casi che distinguono un indice PARZIALE
 * corretto da un unique pieno, che vieterebbe flussi di dominio legittimi (annulla-e-rifai).
 */
describe('Invarianti di stato abbonamento — indici unici parziali (e2e, DB-level)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let ids: MapSeedIds;
  let customerId: string;
  let subA: string; // abbonamento su u1
  let subB: string; // abbonamento su u2 (controllo: le invarianti sono PER abbonamento)

  const SEASON_START = new Date('2026-05-01T00:00:00Z');
  const SEASON_END = new Date('2026-09-30T00:00:00Z');
  const DAY = new Date('2026-07-20T00:00:00Z');

  // Asserisce anche SU QUALE TABELLA è scattato l'unique: senza, un unique diverso (o futuro)
  // farebbe passare il test per il motivo sbagliato — cfr. expectP2003 in rate-fk-restrict.
  //
  // ⚠️ Non si può asserire il NOME dell'indice, e non è una rinuncia alla precisione: sotto RLS
  // Postgres OMETTE il DETAIL della violazione (`Key (…)=(…) already exists`) a un utente che non
  // può vedere la riga in conflitto, e Prisma ricava `meta.target` proprio da lì → dentro forTenant
  // `target` è `null`, fuori è `["bookingId"]`. Il nome e — soprattutto — il PREDICATO parziale di
  // ciascun indice sono pinnati dall'ultimo test del file, che li legge da pg_indexes.
  const expectP2002 = async (op: Promise<unknown>, model: string) => {
    let caught: unknown;
    try {
      await op;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const err = caught as Prisma.PrismaClientKnownRequestError;
    expect(err.code).toBe('P2002');
    expect((err.meta as { modelName?: string } | undefined)?.modelName).toBe(model);
  };

  /** Crea un Booking abbonamento NUDO (nessuna coverage): qui si testano le tabelle di stato,
   *  non l'occupazione — senza coverage il constraint coverage_no_overlap non entra in gioco. */
  const createSubscription = (over: Partial<Prisma.BookingUncheckedCreateInput> = {}) =>
    prisma.forTenant(s1, (tx) =>
      tx.booking.create({
        data: {
          establishmentId: s1,
          customerId,
          umbrellaId: ids.u1,
          timeSlotId: ids.slotMorning,
          startDate: SEASON_START,
          endDate: SEASON_END,
          type: 'subscription',
          status: 'confirmed',
          totalPrice: 100,
          ...over,
        },
      }),
    );

  const createSuspension = (bookingId: string, startDate: Date, endDate: Date | null) =>
    prisma.forTenant(s1, (tx) =>
      tx.bookingSuspension.create({
        data: { bookingId, establishmentId: s1, startDate, endDate },
      }),
    );

  const createRelease = (bookingId: string, date: Date, canceledAt: Date | null) =>
    prisma.forTenant(s1, (tx) =>
      tx.absenceRelease.create({
        data: { bookingId, establishmentId: s1, date, canceledAt },
      }),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // bootstrap senza prefix né ValidationPipe: suite DB-level, nessuna request HTTP
    // (stesso pattern e stessa motivazione di booking-overlap-constraint / rate-fk-restrict).
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Invarianti abbonamento DB' } })).id;
    ids = await seedMapTenant(prisma, s1);
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'A', lastName: 'B' } }),
      )
    ).id;
  });

  beforeEach(async () => {
    subA = (await createSubscription()).id;
    subB = (await createSubscription({ umbrellaId: ids.u2 })).id;
  });

  afterEach(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.absenceRelease.deleteMany({});
      await tx.bookingSuspension.deleteMany({});
      await tx.booking.deleteMany({});
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  describe('una sola sospensione APERTA per abbonamento', () => {
    it('due sospensioni aperte sullo stesso abbonamento → rifiutate dal DB', async () => {
      await createSuspension(subA, new Date('2026-07-20T00:00:00Z'), null);
      await expectP2002(
        createSuspension(subA, new Date('2026-08-01T00:00:00Z'), null),
        'BookingSuspension',
      );
    });

    it('una sospensione CHIUSA non occupa lo slot: se ne può aprire una nuova', async () => {
      await createSuspension(subA, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-10T00:00:00Z'));
      await expect(
        createSuspension(subA, new Date('2026-07-20T00:00:00Z'), null),
      ).resolves.toBeDefined();
    });

    it("più sospensioni chiuse sullo stesso abbonamento restano possibili (l'indice è solo sulle aperte)", async () => {
      await createSuspension(subA, new Date('2026-06-01T00:00:00Z'), new Date('2026-06-10T00:00:00Z'));
      await expect(
        createSuspension(subA, new Date('2026-06-20T00:00:00Z'), new Date('2026-06-25T00:00:00Z')),
      ).resolves.toBeDefined();
    });

    it("l'invariante è PER abbonamento: due abbonamenti diversi possono avere ciascuno la propria aperta", async () => {
      await createSuspension(subA, new Date('2026-07-20T00:00:00Z'), null);
      await expect(
        createSuspension(subB, new Date('2026-07-20T00:00:00Z'), null),
      ).resolves.toBeDefined();
    });
  });

  describe('una sola assenza ATTIVA per (abbonamento, giorno)', () => {
    it('due assenze attive lo stesso giorno sullo stesso abbonamento → rifiutate dal DB', async () => {
      await createRelease(subA, DAY, null);
      await expectP2002(createRelease(subA, DAY, null), 'AbsenceRelease');
    });

    it("un'assenza ANNULLATA non occupa il giorno: la si può ri-registrare (flusso reale annulla-e-rifai)", async () => {
      await createRelease(subA, DAY, new Date('2026-07-16T10:00:00Z'));
      await expect(createRelease(subA, DAY, null)).resolves.toBeDefined();
    });

    it('giorni diversi sullo stesso abbonamento restano possibili', async () => {
      await createRelease(subA, DAY, null);
      await expect(createRelease(subA, new Date('2026-07-21T00:00:00Z'), null)).resolves.toBeDefined();
    });

    it('lo stesso giorno su abbonamenti diversi resta possibile', async () => {
      await createRelease(subA, DAY, null);
      await expect(createRelease(subB, DAY, null)).resolves.toBeDefined();
    });
  });

  describe('un solo rinnovo CONFERMATO per abbonamento di origine', () => {
    it('due rinnovi confermati della stessa origine → rifiutati dal DB', async () => {
      await createSubscription({ previousBookingId: subA });
      await expectP2002(
        createSubscription({ previousBookingId: subA }),
        'Booking',
      );
    });

    it('un rinnovo ANNULLATO non occupa lo slot: si può ri-rinnovare (flusso reale annulla-e-rifai)', async () => {
      await createSubscription({ previousBookingId: subA, status: 'cancelled' });
      await expect(createSubscription({ previousBookingId: subA })).resolves.toBeDefined();
    });

    it('origini diverse possono avere ciascuna il proprio rinnovo confermato', async () => {
      await createSubscription({ previousBookingId: subA });
      await expect(createSubscription({ previousBookingId: subB })).resolves.toBeDefined();
    });

    it("i non-rinnovi (previousBookingId NULL) non collidono fra loro: l'indice ignora i NULL", async () => {
      // Senza il predicato IS NOT NULL un unique su previousBookingId sarebbe comunque permissivo
      // sui NULL in Postgres, ma il predicato lo rende esplicito e tiene l'indice piccolo.
      await expect(createSubscription()).resolves.toBeDefined();
      await expect(createSubscription()).resolves.toBeDefined();
    });
  });

  describe('validità degli intervalli (CHECK)', () => {
    it('Booking con startDate > endDate → rifiutato dal DB (booking_range_valid)', async () => {
      await expect(
        createSubscription({
          startDate: new Date('2026-07-20T00:00:00Z'),
          endDate: new Date('2026-07-19T00:00:00Z'),
        }),
      ).rejects.toThrow(/booking_range_valid/i);
    });

    it('BookingSuspension con startDate > endDate → rifiutata dal DB (suspension_range_valid)', async () => {
      await expect(
        createSuspension(subA, new Date('2026-07-20T00:00:00Z'), new Date('2026-07-19T00:00:00Z')),
      ).rejects.toThrow(/suspension_range_valid/i);
    });

    it("una sospensione APERTA (endDate NULL) non viola il CHECK: in SQL il confronto con NULL non è FALSE", async () => {
      await expect(createSuspension(subA, new Date('2026-07-20T00:00:00Z'), null)).resolves.toBeDefined();
    });

    it('il CHECK ammette il caso degenere startDate = endDate (sospensione di un solo giorno)', async () => {
      await expect(
        createSuspension(subA, new Date('2026-07-20T00:00:00Z'), new Date('2026-07-20T00:00:00Z')),
      ).resolves.toBeDefined();
    });
  });

  describe('definizione degli indici', () => {
    // I test sopra provano che un unique SCATTA sulla tabella giusta; questo prova che a scattare è
    // l'indice giusto, col PREDICATO giusto. È la sola asserzione che rende rosso un indice
    // trasformato da parziale a pieno (o con la colonna del predicato cambiata) — un errore che i
    // casi positivi da soli non vedrebbero, perché continuerebbero a passare.
    it.each([
      [
        'BookingSuspension_bookingId_open_key',
        'CREATE UNIQUE INDEX "BookingSuspension_bookingId_open_key" ON public."BookingSuspension" USING btree ("bookingId") WHERE ("endDate" IS NULL)',
      ],
      [
        'AbsenceRelease_bookingId_date_active_key',
        'CREATE UNIQUE INDEX "AbsenceRelease_bookingId_date_active_key" ON public."AbsenceRelease" USING btree ("bookingId", date) WHERE ("canceledAt" IS NULL)',
      ],
      [
        'Booking_previousBookingId_confirmed_key',
        'CREATE UNIQUE INDEX "Booking_previousBookingId_confirmed_key" ON public."Booking" USING btree ("previousBookingId") WHERE (("previousBookingId" IS NOT NULL) AND (status = \'confirmed\'::"BookingStatus"))',
      ],
    ])('%s è unico, parziale e sul predicato atteso', async (name, definition) => {
      const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).toBe(definition);
    });
  });
});
