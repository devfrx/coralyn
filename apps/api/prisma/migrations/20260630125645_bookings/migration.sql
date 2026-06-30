-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('daily', 'periodic', 'subscription');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partial', 'paid');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'transfer', 'other');

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "establishmentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "umbrellaId" UUID NOT NULL,
    "timeSlotId" UUID NOT NULL,
    "previousBookingId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "extras" JSONB,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "amountCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod",
    "collectionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_establishmentId_idx" ON "Booking"("establishmentId");

-- CreateIndex
CREATE INDEX "Booking_umbrellaId_idx" ON "Booking"("umbrellaId");

-- CreateIndex
CREATE INDEX "Booking_establishmentId_startDate_endDate_idx" ON "Booking"("establishmentId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_umbrellaId_fkey" FOREIGN KEY ("umbrellaId") REFERENCES "Umbrella"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_previousBookingId_fkey" FOREIGN KEY ("previousBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS tenant_isolation (Prisma non la genera) sulla nuova tabella tenant-scoped.
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Booking"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
