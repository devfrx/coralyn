-- CreateTable
CREATE TABLE "EstablishmentLegalProfile" (
    "establishmentId" UUID NOT NULL,
    "legalName" TEXT,
    "registeredAddress" TEXT,
    "vatOrTaxId" TEXT,
    "contactEmail" TEXT,
    "pec" TEXT,
    "legalRepresentative" TEXT,
    "dataRightsContact" TEXT,
    "dpoNominated" BOOLEAN NOT NULL DEFAULT false,
    "dpoContact" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstablishmentLegalProfile_pkey" PRIMARY KEY ("establishmentId")
);

-- AddForeignKey
ALTER TABLE "EstablishmentLegalProfile" ADD CONSTRAINT "EstablishmentLegalProfile_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (Prisma non la genera): isolamento per tenant, come le altre tabelle tenant-scoped.
ALTER TABLE "EstablishmentLegalProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EstablishmentLegalProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EstablishmentLegalProfile"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
