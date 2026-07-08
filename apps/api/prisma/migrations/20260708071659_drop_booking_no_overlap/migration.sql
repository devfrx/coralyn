-- Fase CONTRACT (ADR-0046): l'occupazione vive ora su BookingCoverage. Rimuovi il vecchio percorso su
-- Booking per non avere doppia sorgente di verità.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_no_overlap;
DROP TRIGGER IF EXISTS booking_fill_slot_minutes_trg ON "Booking";
DROP FUNCTION IF EXISTS booking_fill_slot_minutes();
ALTER TABLE "Booking" DROP COLUMN "slotStartMin";
ALTER TABLE "Booking" DROP COLUMN "slotEndMin";
