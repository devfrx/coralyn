import type { PrismaService } from '../../src/prisma/prisma.service';

/** Inserisce un Booking confermato + la sua coverage 1:1, bypassando il service (per test DB-level).
 *  I minuti della coverage li riempie il trigger; lo status della coverage = quello del booking. */
export async function insertBookingWithCoverage(
  prisma: PrismaService,
  tenantId: string,
  data: {
    establishmentId: string; customerId: string; umbrellaId: string; timeSlotId: string;
    startDate: Date; endDate: Date; status?: 'confirmed' | 'cancelled';
  },
) {
  const status = data.status ?? 'confirmed';
  return prisma.forTenant(tenantId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        establishmentId: data.establishmentId, customerId: data.customerId,
        umbrellaId: data.umbrellaId, timeSlotId: data.timeSlotId,
        startDate: data.startDate, endDate: data.endDate, type: 'daily', status, totalPrice: 10,
      },
    });
    await tx.bookingCoverage.create({
      data: {
        bookingId: booking.id, establishmentId: data.establishmentId, umbrellaId: data.umbrellaId,
        startDate: data.startDate, endDate: data.endDate, status,
      },
    });
    return booking;
  });
}
