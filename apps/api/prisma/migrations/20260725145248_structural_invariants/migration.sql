-- Presidi strutturali di Fase E (audit 2026-07-25 §4.17-18; findings P2-005, P2-007, P9-004).
--
-- Radice R3 dell'audit: «l'invariante vive nel codice applicativo perche' il posto dove dichiararla
-- una volta sola e' vuoto». Il principio corretto era gia' stabilito (ADR-0037/ADR-0046: guardia
-- applicativa primaria, DB backstop della race) e applicato benissimo all'anti-overlap — ma non era
-- stato esteso a nient'altro. Questa migration lo estende, senza spostare la prima linea di difesa:
-- le guardie dei service restano, e continuano a produrre 409/422 leggibili. Qui si chiude la sola
-- finestra che una read-then-write non puo' chiudere da se'.
--
-- Nessuna nuova tabella => nessuna policy RLS da appendere: Booking, BookingSuspension,
-- AbsenceRelease e BookingCoverage sono gia' tutte ENABLE + FORCE con `tenant_isolation`.

-- 1) Validita' degli intervalli (gemelli di coverage_range_valid, Fase D) --------------------------
-- La Fase D aveva messo il CHECK sulla sola BookingCoverage, com'era prescritto. Le stesse due
-- colonne su Booking e BookingSuspension restavano senza presidio: `terminate` TRONCA Booking.endDate
-- a partire da una data d'ingresso, ed e' esattamente la forma di codice in cui il difetto del carve
-- era gia' nato due volte.
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_range_valid CHECK ("startDate" <= "endDate");

-- Su BookingSuspension endDate e' NULLABLE (NULL = sospensione APERTA, da riattivare). Non serve
-- un OR esplicito: in SQL un CHECK e' violato solo se l'espressione e' FALSE, e `x <= NULL` e' NULL.
-- Le aperte passano, gli intervalli invertiti no.
ALTER TABLE "BookingSuspension"
  ADD CONSTRAINT suspension_range_valid CHECK ("startDate" <= "endDate");

-- 2) Invarianti di stato dell'abbonamento — indici unici PARZIALI (P2-007) ------------------------
-- Il dominio dichiara impossibili tre stati; il DB non ne impediva nessuno. Stessa tecnica gia' in
-- uso per Umbrella_establishmentId_label_active_key (D-055): il DSL Prisma non modella gli indici
-- parziali, quindi vivono qui e nello schema sono solo commentati.
--
-- Il predicato parziale NON e' un dettaglio di ottimizzazione: e' la differenza fra proibire uno
-- stato impossibile e proibire un flusso di dominio legittimo. Un unique pieno vieterebbe di
-- ri-sospendere dopo una riattivazione, di ri-registrare un'assenza annullata, di ri-rinnovare dopo
-- un annullo. I casi negativi sono asseriti in subscription-invariants-constraint.e2e-spec.ts.
--
-- Nessuno dei tre porta establishmentId in testa, e non e' una dimenticanza: sono tutti chiavati su
-- un id di Booking, che appartiene per costruzione a un solo tenant. L'indice e' gia' tenant-scoped.

-- Una sola sospensione APERTA per abbonamento. Due aperte lasciano `reactivate` (che fa `.find`,
-- quindi ne chiude UNA sola) a bloccare per sempre release e disdetta con un 422 che l'interfaccia
-- non sa risolvere: e' lo stato terminale, non un fastidio.
CREATE UNIQUE INDEX "BookingSuspension_bookingId_open_key"
  ON "BookingSuspension" ("bookingId")
  WHERE "endDate" IS NULL;

-- Una sola assenza ATTIVA per (abbonamento, giorno). Le annullate non occupano il giorno.
CREATE UNIQUE INDEX "AbsenceRelease_bookingId_date_active_key"
  ON "AbsenceRelease" ("bookingId", "date")
  WHERE "canceledAt" IS NULL;

-- Un solo rinnovo CONFERMATO per abbonamento di origine. Serve ANCHE da indice di lettura per le due
-- query su previousBookingId (bookings.service.ts: guardia del doppio rinnovo, e il set `renewedIds`
-- di listSubscriptions): entrambe filtrano status='confirmed', quindi il predicato dell'indice le
-- copre. Per questo P9-004 chiedeva 3 indici compositi e qui ne nascono 2: il terzo sarebbe stato
-- ridondante con questo, non dimenticato.
CREATE UNIQUE INDEX "Booking_previousBookingId_confirmed_key"
  ON "Booking" ("previousBookingId")
  WHERE "previousBookingId" IS NOT NULL AND "status" = 'confirmed';

-- 3) Indici compositi per le query reali (P9-004) -------------------------------------------------
-- Postgres non indicizza le FK. Senza questi, aprire una Scheda cliente faceva index scan su
-- establishmentId — cioe' TUTTE le prenotazioni del lido — per restituirne 5-30. establishmentId in
-- testa perche' la policy RLS lo mette nel predicato di ogni query, sempre.
--
-- Sono gli unici due oggetti di questa migration senza un test dedicato, e non e' una dimenticanza:
-- a differenza degli indici parziali (invisibili al DSL Prisma) questi due sono DICHIARATI in
-- schema.prisma, quindi a difenderli da una rimozione silenziosa c'e' gia' il drift detection di
-- Prisma. Un test di sola esistenza aggiungerebbe cerimonia senza coprire cio' che conta davvero —
-- che il planner li USI — e un'asserzione sul piano sarebbe instabile sui volumi di coralyn_test.
-- L'uso e' stato verificato a mano con EXPLAIN su 25.000 prenotazioni sintetiche: entrambi scelti,
-- e con essi Booking_previousBookingId_confirmed_key su tutte e due le query di rinnovo.
CREATE INDEX "Booking_establishmentId_customerId_idx" ON "Booking"("establishmentId", "customerId");
CREATE INDEX "Booking_establishmentId_collectionDate_idx" ON "Booking"("establishmentId", "collectionDate");

-- 4) BookingCoverage.umbrellaId: FK + autorita' del DB (P2-005) -----------------------------------
-- umbrellaId e' la PRIMA chiave di partizionamento di coverage_no_overlap, l'unico garante
-- anti-double-booking. Il gemello slotStartMin/slotEndMin, altrettanto denormalizzato, era reso
-- DB-autoritativo da un trigger fin dal 2026-07-08: l'asimmetria era che si era protetta la
-- denormalizzazione ORARIA e lasciata scoperta quella SPAZIALE. Una riga con l'ombrellone sbagliato
-- non e' un dato stantio: e' un posto occupato da nessuno e un posto libero che risulta occupato.
ALTER TABLE "BookingCoverage" ADD CONSTRAINT "BookingCoverage_umbrellaId_fkey"
  FOREIGN KEY ("umbrellaId") REFERENCES "Umbrella"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La funzione conserva il nome con cui e' registrata in ADR-0046 e nei piani del 2026-07-08 (che
-- sono storia e non si riscrivono); il suo contratto e' pero' ora piu' largo — eredita dal Booking
-- madre TUTTO cio' che la coverage denormalizza — ed e' aggiornato in ADR-0046 e data-model.md.
CREATE OR REPLACE FUNCTION coverage_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME; u UUID;
BEGIN
  SELECT t."startTime", t."endTime", b."umbrellaId" INTO s, e, u
  FROM "Booking" b JOIN "TimeSlot" t ON t.id = b."timeSlotId"
  WHERE b.id = NEW."bookingId";
  IF s IS NULL THEN
    RAISE EXCEPTION 'Booking % o fascia inesistente per la coverage', NEW."bookingId";
  END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  NEW."umbrellaId"   := u;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Il trigger va RICREATO, non basta CREATE OR REPLACE della funzione: cambia l'elenco `UPDATE OF`.
-- Senza "umbrellaId" nell'elenco, un UPDATE che tocca SOLO quella colonna non farebbe scattare il
-- trigger e sfuggirebbe all'autorita' del DB. Restano fuori dall'elenco le colonne che il carve
-- aggiorna (startDate/endDate) e status: su quelle il trigger non deve scattare, e infatti
-- booking-overlap-constraint.e2e-spec.ts lo asserisce.
DROP TRIGGER coverage_fill_slot_minutes_trg ON "BookingCoverage";
CREATE TRIGGER coverage_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "bookingId", "umbrellaId" ON "BookingCoverage"
  FOR EACH ROW EXECUTE FUNCTION coverage_fill_slot_minutes();
