-- DropForeignKey
ALTER TABLE "Umbrella" DROP CONSTRAINT "Umbrella_rowId_fkey";

-- AddForeignKey
ALTER TABLE "Umbrella" ADD CONSTRAINT "Umbrella_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "Row"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
