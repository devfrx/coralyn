-- CreateEnum
CREATE TYPE "SectorKind" AS ENUM ('grid', 'special');

-- AlterTable
ALTER TABLE "Sector" ADD COLUMN     "kind" "SectorKind" NOT NULL DEFAULT 'grid';
