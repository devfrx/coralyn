-- DropForeignKey
ALTER TABLE "Umbrella" DROP CONSTRAINT "Umbrella_rowId_fkey";

-- DropIndex
DROP INDEX "Umbrella_establishmentId_label_key";

-- AlterTable
ALTER TABLE "Umbrella" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retiredFrom" TEXT,
ALTER COLUMN "rowId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "Row"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unicità label SOLO tra gli attivi (D-055): indice unico parziale, invisibile al DSL Prisma.
CREATE UNIQUE INDEX "Umbrella_establishmentId_label_active_key"
  ON "Umbrella" ("establishmentId", "label")
  WHERE "retiredAt" IS NULL;
