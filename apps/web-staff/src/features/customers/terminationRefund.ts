import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO per una disdetta anticipata (D-013). NON autoritativo: è una
 * convenienza UI che l'operatore sovrascrive (policy del lido). `effectiveDate` = primo giorno
 * di posto libero. suggested = clamp(amountCollected − totalPrice × giorniGoduti/giorniPianificati).
 */
export function suggestedRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected'>,
  effectiveDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const servedDays = dayDiff(b.startDate, effectiveDate);
  const frac = clamp(servedDays / plannedDays, 0, 1);
  const earned = round2(b.totalPrice * frac);
  return clamp(round2(b.amountCollected - earned), 0, b.amountCollected);
}
