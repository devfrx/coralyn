-- AlterEnum
ALTER TYPE "PlatformAction" ADD VALUE 'reset_admin_password';

-- CreateEnum
CREATE TYPE "CredentialTokenPurpose" AS ENUM ('invite', 'reset');

-- CreateTable
CREATE TABLE "CredentialSetupToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "CredentialTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialSetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialSetupToken_tokenHash_key" ON "CredentialSetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CredentialSetupToken_userId_idx" ON "CredentialSetupToken"("userId");

-- CreateIndex
CREATE INDEX "CredentialSetupToken_expiresAt_idx" ON "CredentialSetupToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CredentialSetupToken" ADD CONSTRAINT "CredentialSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
