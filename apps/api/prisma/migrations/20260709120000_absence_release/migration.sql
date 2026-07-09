-- CreateEnum
CREATE TYPE "AbsenceReleaseSource" AS ENUM ('operator', 'customer');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "absenceConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AbsenceRelease" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "source" "AbsenceReleaseSource" NOT NULL DEFAULT 'operator',
    "canceledAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceRelease_bookingId_idx" ON "AbsenceRelease"("bookingId");

-- CreateIndex
CREATE INDEX "AbsenceRelease_establishmentId_idx" ON "AbsenceRelease"("establishmentId");

-- AddForeignKey
ALTER TABLE "AbsenceRelease" ADD CONSTRAINT "AbsenceRelease_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceRelease" ADD CONSTRAINT "AbsenceRelease_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingSuspension/BookingTransfer). Nessun backfill: tabella vuota.
ALTER TABLE "AbsenceRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AbsenceRelease" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AbsenceRelease"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
