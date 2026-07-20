-- CreateTable
CREATE TABLE "RentalItem" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "RentalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalTariff" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "rentalItemId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMinutes" INTEGER,
    "sortOrder" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "RentalTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "rentalItemId" UUID NOT NULL,
    "rentalTariffId" UUID NOT NULL,
    "customerId" UUID,
    "units" INTEGER NOT NULL DEFAULT 1,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "amountCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod",
    "collectionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalItem_establishmentId_idx" ON "RentalItem"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalItem_establishmentId_name_key" ON "RentalItem"("establishmentId", "name");

-- CreateIndex
CREATE INDEX "RentalTariff_establishmentId_idx" ON "RentalTariff"("establishmentId");

-- CreateIndex
CREATE INDEX "RentalTariff_rentalItemId_seasonId_idx" ON "RentalTariff"("rentalItemId", "seasonId");

-- CreateIndex
CREATE INDEX "Rental_establishmentId_idx" ON "Rental"("establishmentId");

-- CreateIndex
CREATE INDEX "Rental_rentalItemId_idx" ON "Rental"("rentalItemId");

-- CreateIndex
CREATE INDEX "Rental_establishmentId_startAt_idx" ON "Rental"("establishmentId", "startAt");

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTariff" ADD CONSTRAINT "RentalTariff_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTariff" ADD CONSTRAINT "RentalTariff_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalTariff" ADD CONSTRAINT "RentalTariff_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_rentalTariffId_fkey" FOREIGN KEY ("rentalTariffId") REFERENCES "RentalTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera).
ALTER TABLE "RentalItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RentalItem"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "RentalTariff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalTariff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RentalTariff"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Rental" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rental" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rental"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
