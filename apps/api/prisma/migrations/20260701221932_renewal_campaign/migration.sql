-- CreateTable
CREATE TABLE "RenewalCampaign" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "originSeasonId" UUID NOT NULL,
    "destinationSeasonId" UUID NOT NULL,
    "deadline" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenewalCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenewalCampaign_establishmentId_idx" ON "RenewalCampaign"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalCampaign_establishmentId_destinationSeasonId_key" ON "RenewalCampaign"("establishmentId", "destinationSeasonId");

-- AddForeignKey
ALTER TABLE "RenewalCampaign" ADD CONSTRAINT "RenewalCampaign_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalCampaign" ADD CONSTRAINT "RenewalCampaign_originSeasonId_fkey" FOREIGN KEY ("originSeasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalCampaign" ADD CONSTRAINT "RenewalCampaign_destinationSeasonId_fkey" FOREIGN KEY ("destinationSeasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera).
ALTER TABLE "RenewalCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RenewalCampaign" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RenewalCampaign"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
