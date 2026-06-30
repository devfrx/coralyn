-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'staff', 'superuser');

-- CreateTable
CREATE TABLE "Establishment" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "establishmentId" UUID,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UmbrellaType" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "icon" TEXT,

    CONSTRAINT "UmbrellaType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Row" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "sectorId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Umbrella" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "rowId" UUID NOT NULL,
    "umbrellaTypeId" UUID,
    "label" TEXT NOT NULL,
    "logicalOrder" INTEGER NOT NULL,
    "presentationPosition" JSONB,

    CONSTRAINT "Umbrella_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_establishmentId_idx" ON "Customer"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_establishmentId_idx" ON "User"("establishmentId");

-- CreateIndex
CREATE INDEX "UmbrellaType_establishmentId_idx" ON "UmbrellaType"("establishmentId");

-- CreateIndex
CREATE INDEX "TimeSlot_establishmentId_idx" ON "TimeSlot"("establishmentId");

-- CreateIndex
CREATE INDEX "Sector_establishmentId_idx" ON "Sector"("establishmentId");

-- CreateIndex
CREATE INDEX "Row_establishmentId_idx" ON "Row"("establishmentId");

-- CreateIndex
CREATE INDEX "Row_sectorId_idx" ON "Row"("sectorId");

-- CreateIndex
CREATE INDEX "Umbrella_establishmentId_idx" ON "Umbrella"("establishmentId");

-- CreateIndex
CREATE INDEX "Umbrella_rowId_idx" ON "Umbrella"("rowId");

-- CreateIndex
CREATE UNIQUE INDEX "Umbrella_establishmentId_label_key" ON "Umbrella"("establishmentId", "label");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmbrellaType" ADD CONSTRAINT "UmbrellaType_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Row" ADD CONSTRAINT "Row_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Row" ADD CONSTRAINT "Row_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "Row"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_umbrellaTypeId_fkey" FOREIGN KEY ("umbrellaTypeId") REFERENCES "UmbrellaType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera) su tutte le tabelle tenant-scoped.
-- Establishment (root) e User (login pre-tenant, ADR-0026) NON hanno RLS.
ALTER TABLE "Customer"     ENABLE ROW LEVEL SECURITY; ALTER TABLE "Customer"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "UmbrellaType" ENABLE ROW LEVEL SECURITY; ALTER TABLE "UmbrellaType" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TimeSlot"     ENABLE ROW LEVEL SECURITY; ALTER TABLE "TimeSlot"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "Sector"       ENABLE ROW LEVEL SECURITY; ALTER TABLE "Sector"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "Row"          ENABLE ROW LEVEL SECURITY; ALTER TABLE "Row"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "Umbrella"     ENABLE ROW LEVEL SECURITY; ALTER TABLE "Umbrella"     FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Customer"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
CREATE POLICY tenant_isolation ON "UmbrellaType"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
CREATE POLICY tenant_isolation ON "TimeSlot"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
CREATE POLICY tenant_isolation ON "Sector"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
CREATE POLICY tenant_isolation ON "Row"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
CREATE POLICY tenant_isolation ON "Umbrella"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
