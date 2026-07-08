import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO al cedente per una cessione (D-013). residualDays = |[effectiveDate, end]|.
 * suggested = totalPrice × residualDays / plannedDays, clampato al residuo incassato
 * (amountCollected − refundedAmount). NON autoritativo: l'operatore sovrascrive; il server valida i bound.
 * Pre-compila anche collectedFromNew (handover pulito → amountCollected invariato).
 */
export function suggestedCessionRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected' | 'refundedAmount'>,
  effectiveDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const residualDays = dayDiff(effectiveDate, b.endDate) + 1; // |[effectiveDate, end]| inclusivo
  if (residualDays <= 0) return 0;
  const raw = round2(b.totalPrice * clamp(residualDays / plannedDays, 0, 1));
  const residual = b.amountCollected - (b.refundedAmount ?? 0);
  return clamp(raw, 0, Math.max(residual, 0));
}
