-- CreateTable
CREATE TABLE "CustomerEnrollmentToken" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinAttempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEnrollmentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "enrollmentTokenId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "rotatedFromId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEnrollmentToken_tokenHash_key" ON "CustomerEnrollmentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerEnrollmentToken_customerId_idx" ON "CustomerEnrollmentToken"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEnrollmentToken_establishmentId_idx" ON "CustomerEnrollmentToken"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_refreshTokenHash_key" ON "CustomerSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

-- CreateIndex
CREATE INDEX "CustomerSession_enrollmentTokenId_idx" ON "CustomerSession"("enrollmentTokenId");

-- AddForeignKey
ALTER TABLE "CustomerEnrollmentToken" ADD CONSTRAINT "CustomerEnrollmentToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEnrollmentToken" ADD CONSTRAINT "CustomerEnrollmentToken_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
