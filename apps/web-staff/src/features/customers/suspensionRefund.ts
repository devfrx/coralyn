import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO per una sospensione (D-013). suspendedDays = R − S = |[S, R-1]|.
 * suggested = totalPrice × suspendedDays / plannedDays, clampato al residuo incassato
 * (amountCollected − refundedAmount). NON autoritativo: l'operatore sovrascrive; il server valida i bound.
 */
export function suggestedSuspensionRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected' | 'refundedAmount'>,
  startDate: string,
  returnDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const suspendedDays = dayDiff(startDate, returnDate); // R − S
  if (suspendedDays <= 0) return 0;
  const raw = round2(b.totalPrice * clamp(suspendedDays / plannedDays, 0, 1));
  const residual = b.amountCollected - (b.refundedAmount ?? 0);
  return clamp(raw, 0, Math.max(residual, 0));
}
