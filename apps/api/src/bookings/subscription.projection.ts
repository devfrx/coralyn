import type { Booking } from '@prisma/client';
import type { SubscriptionListItemDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta un abbonamento nell'elemento dell'elenco campagna (con anzianità e flag rinnovato). */
export function toSubscriptionListItemDTO(
  b: Booking,
  seniority: number,
  renewed: boolean,
): SubscriptionListItemDTO {
  return {
    id: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    packageId: b.packageId ?? undefined,
    startDate: formatDbDate(b.startDate),
    endDate: formatDbDate(b.endDate),
    totalPrice: Number(b.totalPrice),
    seniority,
    renewed,
  };
}
