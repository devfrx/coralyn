import type { Booking } from '@prisma/client';
import type { BookingStatus, RenewalWindowItemDTO, RenewalWindowState } from '@coralyn/contracts';
import { dateRangesOverlap } from './booking.availability';

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

/**
 * Stato della finestra di prelazione di un avente-diritto (derivato lazy, ADR-0034). Fonte UNICA
 * condivisa da renewal-campaigns.service (vista Rinnovi) e dalla Scheda Cliente: le due viste non
 * possono divergere. `today == deadline` → ancora aperta (giorno-scadenza incluso).
 */
export function computeRenewalWindowState(
  renewals: { status: BookingStatus; startDate: Date; endDate: Date }[],
  destStart: Date,
  destEnd: Date,
  deadlineIso: string,
  todayIso: string,
): RenewalWindowState {
  const exercised = renewals.some(
    (r) => r.status === 'confirmed' && dateRangesOverlap(r.startDate, r.endDate, destStart, destEnd),
  );
  if (exercised) return 'exercised';
  return todayIso > deadlineIso ? 'expired' : 'open';
}
