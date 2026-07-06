import type { Booking } from '@prisma/client';
import type { BookingDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una riga Booking nel DTO condiviso (Decimal→number, Date→yyyy-mm-dd). */
export function toBookingDTO(b: Booking): BookingDTO {
  return {
    id: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    startDate: formatDbDate(b.startDate),
    endDate: formatDbDate(b.endDate),
    type: b.type,
    status: b.status,
    totalPrice: Number(b.totalPrice),
    paymentStatus: b.paymentStatus,
    amountCollected: Number(b.amountCollected),
    paymentMethod: b.paymentMethod ?? undefined,
    collectionDate: b.collectionDate ? formatDbDate(b.collectionDate) : undefined,
    packageId: b.packageId ?? undefined,
    previousBookingId: b.previousBookingId ?? undefined,
    refundedAmount: Number(b.refundedAmount),
    terminatedAt: b.terminatedAt ? b.terminatedAt.toISOString() : undefined,
    terminationReason: b.terminationReason ?? undefined,
  };
}
