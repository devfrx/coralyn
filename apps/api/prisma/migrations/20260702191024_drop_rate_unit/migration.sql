/*
  Warnings:

  - You are about to drop the column `unit` on the `Rate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Rate" DROP COLUMN "unit";

-- DropEnum
DROP TYPE "RateUnit";
