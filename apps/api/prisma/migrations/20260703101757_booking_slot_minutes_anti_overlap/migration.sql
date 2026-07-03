-- Anti-overlap a livello DB (D-030, ADR-0037).
-- Occupazione oraria denormalizzata su Booking (minuti-dalla-mezzanotte), DB-autoritativa via trigger,
-- + EXCLUDE constraint gist allineato semanticamente al controllo applicativo (booking.availability.ts).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Colonne NOT NULL con DEFAULT 0 (segnaposto). Il DEFAULT soddisfa NOT NULL per le righe esistenti
--    (corrette subito dal backfill) e allinea il DB allo schema Prisma @default(0). Il trigger
--    sovrascrive sempre il valore ad ogni INSERT: lo 0 non è mai osservato per righe vive.
ALTER TABLE "Booking" ADD COLUMN "slotStartMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "slotEndMin" INTEGER NOT NULL DEFAULT 0;

-- 2) Backfill sotto RLS: coralyn_app è NOBYPASSRLS e possiede Booking/TimeSlot con FORCE RLS; senza
--    NO FORCE la UPDATE/SELECT leggerebbe 0 righe (GUC app.current_tenant non impostata in migrate deploy).
--    Corregge lo 0 delle prenotazioni esistenti coi minuti reali della loro fascia.
ALTER TABLE "Booking" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "TimeSlot" NO FORCE ROW LEVEL SECURITY;

UPDATE "Booking" b SET
  "slotStartMin" = EXTRACT(HOUR FROM t."startTime")::int * 60 + EXTRACT(MINUTE FROM t."startTime")::int,
  "slotEndMin"   = EXTRACT(HOUR FROM t."endTime")::int   * 60 + EXTRACT(MINUTE FROM t."endTime")::int
FROM "TimeSlot" t
WHERE t.id = b."timeSlotId";

ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TimeSlot" FORCE ROW LEVEL SECURITY;

-- 3) Trigger DB-autoritativo: popola i minuti dalla fascia referenziata a ogni INSERT o cambio timeSlotId.
--    (L'app NON scrive queste colonne: la garanzia è DB-autoritativa, indipendente da bug applicativi.)
CREATE OR REPLACE FUNCTION booking_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME;
BEGIN
  SELECT "startTime", "endTime" INTO s, e FROM "TimeSlot" WHERE id = NEW."timeSlotId";
  IF s IS NULL THEN
    RAISE EXCEPTION 'TimeSlot % inesistente per la prenotazione', NEW."timeSlotId";
  END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "timeSlotId" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_fill_slot_minutes();

-- 4) EXCLUDE constraint: stessa semantica del controllo applicativo (ADR-0013 / booking.availability.ts).
--    daterange '[]' = date inclusive (dateRangesOverlap); int4range '[)' = fasce semiaperte (slotsOverlap);
--    partial WHERE status='confirmed' = solo le confermate bloccano (le cancellate no).
ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap EXCLUDE USING gist (
  "umbrellaId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&,
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&
) WHERE (status = 'confirmed');
