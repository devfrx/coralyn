-- CreateTable
CREATE TABLE "BookingSuspension" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "reactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSuspension_bookingId_idx" ON "BookingSuspension"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSuspension_establishmentId_idx" ON "BookingSuspension"("establishmentId");

-- AddForeignKey
ALTER TABLE "BookingSuspension" ADD CONSTRAINT "BookingSuspension_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSuspension" ADD CONSTRAINT "BookingSuspension_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingCoverage). Nessun backfill: tabella vuota.
ALTER TABLE "BookingSuspension" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingSuspension" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingSuspension"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
