import type { PaymentStatus } from '@coralyn/contracts';

export type CessionPaymentResult =
  | { ok: true; newCollected: number; paymentStatus: PaymentStatus }
  | { ok: false; reason: 'BAD_REFUND' | 'BAD_COLLECT' | 'OVER_TOTAL' };

/** Confronto in centesimi interi: evita imprecisioni di virgola mobile (come booking.payment.ts). */
const cents = (n: number): number => Math.round(n * 100);

/**
 * Riconciliazione incasso della cessione (D-013, ADR-0047). Movimento netto su amountCollected
 * (− refundToPrevious + collectedFromNew), vincolato a [0, totalPrice]; paymentStatus derivato dal netto.
 * refundedAmount NON è toccato (la cessione è un TRASFERIMENTO, non una perdita di ricavo). Puro: nessuna
 * dipendenza Nest. Ritorna gli errori di bound come reason (il chiamante li mappa a 422).
 */
export function reconcileCessionPayment(
  amountCollected: number,
  totalPrice: number,
  refundToPrevious: number,
  collectedFromNew: number,
): CessionPaymentResult {
  if (!(refundToPrevious >= 0 && cents(refundToPrevious) <= cents(amountCollected))) return { ok: false, reason: 'BAD_REFUND' };
  if (!(collectedFromNew >= 0)) return { ok: false, reason: 'BAD_COLLECT' };
  const newCollected = amountCollected - refundToPrevious + collectedFromNew;
  if (cents(newCollected) > cents(totalPrice)) return { ok: false, reason: 'OVER_TOTAL' };
  const paymentStatus: PaymentStatus =
    cents(newCollected) === 0 ? 'unpaid' : cents(newCollected) === cents(totalPrice) ? 'paid' : 'partial';
  return { ok: true, newCollected, paymentStatus };
}
