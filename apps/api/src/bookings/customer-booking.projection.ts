import type { Booking } from '@prisma/client';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

export interface CustomerBookingEnrichment {
  umbrellaLabel: string;
  seasonName?: string;
  seniority?: number;
  renewed?: boolean;
  prelazione?: { destinationSeasonName: string; deadline: string };
}

/** Proietta una riga Booking nel DTO arricchito della Scheda Cliente (customerId omesso: implicito nella route). */
export function toCustomerBookingDTO(b: Booking, e: CustomerBookingEnrichment): CustomerBookingDTO {
  return {
    id: b.id,
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
    umbrellaLabel: e.umbrellaLabel,
    seasonName: e.seasonName,
    seniority: e.seniority,
    renewed: e.renewed,
    prelazione: e.prelazione,
  };
}

/**
 * Nome della stagione che contiene bookingStart (etichetta di raggruppamento, non semantica di dominio).
 * Tie-break deterministico su stagioni sovrapposte (possibile post-D-030): la più specifica = startDate più recente.
 */
export function resolveSeasonName(
  seasons: { name: string; startDate: Date; endDate: Date }[],
  bookingStart: Date,
): string | undefined {
  const containing = seasons.filter((s) => s.startDate <= bookingStart && bookingStart <= s.endDate);
  if (containing.length === 0) return undefined;
  return containing.reduce((a, b) => (b.startDate > a.startDate ? b : a)).name;
}
