-- Occupazione a intervalli (D-013 sospensione spec 1/2, ADR-0046). Fase EXPAND: crea BookingCoverage,
-- backfill 1:1 dai Booking, rillocca trigger minuti + EXCLUDE constraint sulla coverage. Il vecchio
-- booking_no_overlap e le colonne Booking.slotStartMin/slotEndMin RESTANO (rimossi in fase CONTRACT).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Tabella
CREATE TABLE "BookingCoverage" (
  "id"              UUID    NOT NULL,
  "bookingId"       UUID    NOT NULL,
  "establishmentId" UUID    NOT NULL,
  "umbrellaId"      UUID    NOT NULL,
  "startDate"       DATE    NOT NULL,
  "endDate"         DATE    NOT NULL,
  "slotStartMin"    INTEGER NOT NULL DEFAULT 0,
  "slotEndMin"      INTEGER NOT NULL DEFAULT 0,
  "status"          "BookingStatus" NOT NULL,
  CONSTRAINT "BookingCoverage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingCoverage_bookingId_idx" ON "BookingCoverage"("bookingId");
CREATE INDEX "BookingCoverage_establishmentId_startDate_endDate_idx" ON "BookingCoverage"("establishmentId","startDate","endDate");
CREATE INDEX "BookingCoverage_umbrellaId_idx" ON "BookingCoverage"("umbrellaId");
ALTER TABLE "BookingCoverage" ADD CONSTRAINT "BookingCoverage_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingCoverage" ADD CONSTRAINT "BookingCoverage_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Backfill 1:1 PRIMA di abilitare RLS sulla coverage (come pattern Equipment: gli INSERT avvengono
--    senza policy, poi si abilita). Booking NO FORCE per leggerlo (coralyn_app NOBYPASSRLS, GUC non impostata).
ALTER TABLE "Booking" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "BookingCoverage"
  ("id","bookingId","establishmentId","umbrellaId","startDate","endDate","slotStartMin","slotEndMin","status")
SELECT gen_random_uuid(), b."id", b."establishmentId", b."umbrellaId", b."startDate", b."endDate",
       b."slotStartMin", b."slotEndMin", b."status"
FROM "Booking" b;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;

-- 3) RLS tenant-isolation sulla coverage (dopo il backfill)
ALTER TABLE "BookingCoverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingCoverage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingCoverage"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

-- 4) Trigger DB-autoritativo minuti: legge la fascia della prenotazione madre a ogni INSERT/cambio bookingId.
CREATE OR REPLACE FUNCTION coverage_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME;
BEGIN
  SELECT t."startTime", t."endTime" INTO s, e
  FROM "Booking" b JOIN "TimeSlot" t ON t.id = b."timeSlotId"
  WHERE b.id = NEW."bookingId";
  IF s IS NULL THEN
    RAISE EXCEPTION 'Booking % o fascia inesistente per la coverage', NEW."bookingId";
  END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coverage_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "bookingId" ON "BookingCoverage"
  FOR EACH ROW EXECUTE FUNCTION coverage_fill_slot_minutes();

-- 5) Trigger di propagazione stato: Booking.status → tutte le sue coverage (il partial WHERE vive qui).
CREATE OR REPLACE FUNCTION coverage_sync_status() RETURNS trigger AS $$
BEGIN
  UPDATE "BookingCoverage" SET "status" = NEW."status" WHERE "bookingId" = NEW."id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER booking_sync_coverage_status_trg
  AFTER UPDATE OF "status" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION coverage_sync_status();

-- 6) EXCLUDE constraint sulla coverage: semantica IDENTICA a booking_no_overlap (ADR-0037).
ALTER TABLE "BookingCoverage" ADD CONSTRAINT coverage_no_overlap EXCLUDE USING gist (
  "umbrellaId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&,
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&
) WHERE (status = 'confirmed');
