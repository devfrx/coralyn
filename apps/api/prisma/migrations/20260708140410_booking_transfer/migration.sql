-- CreateTable
CREATE TABLE "BookingTransfer" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "previousCustomerId" UUID NOT NULL,
    "newCustomerId" UUID NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "refundToPrevious" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "collectedFromNew" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingTransfer_bookingId_idx" ON "BookingTransfer"("bookingId");

-- CreateIndex
CREATE INDEX "BookingTransfer_establishmentId_idx" ON "BookingTransfer"("establishmentId");

-- CreateIndex
CREATE INDEX "BookingTransfer_previousCustomerId_idx" ON "BookingTransfer"("previousCustomerId");

-- AddForeignKey
ALTER TABLE "BookingTransfer" ADD CONSTRAINT "BookingTransfer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTransfer" ADD CONSTRAINT "BookingTransfer_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTransfer" ADD CONSTRAINT "BookingTransfer_previousCustomerId_fkey" FOREIGN KEY ("previousCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingTransfer" ADD CONSTRAINT "BookingTransfer_newCustomerId_fkey" FOREIGN KEY ("newCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingSuspension). Nessun backfill: tabella vuota.
ALTER TABLE "BookingTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingTransfer"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
