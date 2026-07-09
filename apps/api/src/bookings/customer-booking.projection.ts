import type { Booking, BookingSuspension } from '@prisma/client';
import type { AbsenceReleaseDTO, CustomerBookingDTO, SuspensionDTO, TransferDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

export interface CustomerBookingEnrichment {
  umbrellaLabel: string;
  seasonName?: string;
  packageName?: string;
  sectorName?: string;
  seniority?: number;
  renewed?: boolean;
  prelazione?: { destinationSeasonName: string; deadline: string };
  suspensions?: SuspensionDTO[];
  transfers?: TransferDTO[];
  absenceConsentAt?: string | null;
  absenceReleases?: AbsenceReleaseDTO[];
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
    refundedAmount: Number(b.refundedAmount),
    terminatedAt: b.terminatedAt ? b.terminatedAt.toISOString() : undefined,
    terminationReason: b.terminationReason ?? undefined,
    suspensions: e.suspensions ?? [],
    transfers: e.transfers ?? [],
    absenceConsentAt: e.absenceConsentAt ?? null,
    absenceReleases: e.absenceReleases ?? [],
    umbrellaLabel: e.umbrellaLabel,
    packageName: e.packageName,
    sectorName: e.sectorName,
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

/** Proietta una riga BookingSuspension nel DTO della Scheda. endDate NULL = aperta (in corso). */
export function toSuspensionDTO(s: BookingSuspension): SuspensionDTO {
  return {
    id: s.id,
    startDate: formatDbDate(s.startDate),
    endDate: s.endDate ? formatDbDate(s.endDate) : undefined,
    refundedAmount: Number(s.refundedAmount),
    reason: s.reason ?? undefined,
    reactivatedAt: s.reactivatedAt ? s.reactivatedAt.toISOString() : undefined,
  };
}
