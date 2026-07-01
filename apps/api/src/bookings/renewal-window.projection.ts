import type { Booking } from '@prisma/client';
import type { RenewalWindowItemDTO, RenewalWindowState } from '@coralyn/contracts';

export function toRenewalWindowItemDTO(
  b: Booking,
  seniority: number,
  state: RenewalWindowState,
): RenewalWindowItemDTO {
  return {
    sourceBookingId: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    packageId: b.packageId ?? undefined,
    seniority,
    state,
  };
}
