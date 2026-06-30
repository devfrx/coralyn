-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('day', 'period');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "packageId" UUID;

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "equipment" JSONB NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pricing" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,

    CONSTRAINT "Pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rate" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "pricingId" UUID NOT NULL,
    "type" "BookingType",
    "sectorId" UUID,
    "rowId" UUID,
    "packageId" UUID,
    "timeSlotId" UUID,
    "periodStart" DATE,
    "periodEnd" DATE,
    "price" DECIMAL(10,2) NOT NULL,
    "unit" "RateUnit" NOT NULL,

    CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Package_establishmentId_idx" ON "Package"("establishmentId");

-- CreateIndex
CREATE INDEX "Season_establishmentId_idx" ON "Season"("establishmentId");

-- CreateIndex
CREATE INDEX "Pricing_establishmentId_idx" ON "Pricing"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Pricing_seasonId_key" ON "Pricing"("seasonId");

-- CreateIndex
CREATE INDEX "Rate_establishmentId_idx" ON "Rate"("establishmentId");

-- CreateIndex
CREATE INDEX "Rate_pricingId_idx" ON "Rate"("pricingId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pricing" ADD CONSTRAINT "Pricing_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pricing" ADD CONSTRAINT "Pricing_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "Pricing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "Row"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera) sulle nuove tabelle tenant-scoped.
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Package"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Season" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Season"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Pricing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pricing" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Pricing"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Rate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rate"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

-- Firma unica delle dimensioni della Rate. NULLS NOT DISTINCT (Postgres 16): due regole con la
-- stessa identica firma (anche con wildcard NULL) sono duplicate -> niente pareggio di specificita'
-- a runtime (ADR-0032). Index raw: Prisma @@unique non emette NULLS NOT DISTINCT.
CREATE UNIQUE INDEX "Rate_signature_key" ON "Rate"
  ("pricingId", "type", "sectorId", "rowId", "packageId", "timeSlotId", "periodStart", "periodEnd")
  NULLS NOT DISTINCT;
