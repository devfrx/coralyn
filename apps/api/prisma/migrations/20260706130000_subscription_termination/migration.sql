-- Disdetta anticipata abbonamento (D-013): chiusura anticipata + rimborso.
ALTER TABLE "Booking" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "terminationReason" TEXT;
ALTER TABLE "Booking" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
