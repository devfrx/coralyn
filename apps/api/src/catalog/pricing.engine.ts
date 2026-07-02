import type { BookingType } from '@coralyn/contracts';

/** Contesto di una prenotazione da prezzare (posizione gia risolta a settore/fila). */
export interface PricingContext {
  type: BookingType;
  sectorId: string;
  rowId: string;
  packageId: string | null;
  timeSlotId: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd (daily: == startDate)
}

/** Una Rate "piatta" gia caricata dal DB (Decimal->number, Date->ISO). Dimensione null = wildcard. */
export interface RateRow {
  id: string;            // id della Rate DB (ignorato dall'engine; serve alla provenienza B2)
  type: BookingType | null;
  sectorId: string | null;
  rowId: string | null;
  packageId: string | null;
  timeSlotId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  price: number;
}

export type PriceResult =
  | { ok: true; totalPrice: number; rate: RateRow }
  | { ok: false; reason: 'NO_RATE' };

/** La rate e applicabile se ogni dimensione specificata (non-null) combacia col contesto. */
function isApplicable(ctx: PricingContext, r: RateRow): boolean {
  if (r.type !== null && r.type !== ctx.type) return false;
  if (r.sectorId !== null && r.sectorId !== ctx.sectorId) return false;
  if (r.rowId !== null && r.rowId !== ctx.rowId) return false;
  if (r.packageId !== null && r.packageId !== ctx.packageId) return false;
  if (r.timeSlotId !== null && r.timeSlotId !== ctx.timeSlotId) return false;
  if (r.periodStart !== null) {
    if (r.periodEnd === null) return false; // periodo malformato -> ignora la rate
    // confronto lessicografico = cronologico per ISO yyyy-mm-dd
    if (!(ctx.startDate >= r.periodStart && ctx.endDate <= r.periodEnd)) return false;
  }
  return true;
}

/** Vettore di specificita, dalla dimensione piu dominante (ADR-0032): true (specifica) batte false (wildcard). */
function specificity(r: RateRow): boolean[] {
  return [
    r.periodStart !== null, // 1. periodo
    r.rowId !== null,       // 2. fila
    r.sectorId !== null,    // 3. settore
    r.packageId !== null,   // 4. pacchetto
    r.timeSlotId !== null,  // 5. fascia
    r.type !== null,        // 6. tipo
  ];
}

/** >0 se `a` piu specifica di `b`, <0 se meno, 0 se firma di pari specificita. */
function compareSpecificity(a: RateRow, b: RateRow): number {
  const sa = specificity(a);
  const sb = specificity(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] ? 1 : -1;
  }
  return 0;
}

/** Giorni inclusivi tra due date ISO (UTC, mai metodi locali - ADR-0031). */
function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Risolve la Rate applicabile piu specifica (precedenza esplicita ADR-0032) e calcola il prezzo.
 * Puro: nessuna dipendenza Nest/DB. `rates` = Rate del Pricing della stagione attiva.
 */
export function resolvePrice(ctx: PricingContext, rates: RateRow[]): PriceResult {
  const applicable = rates.filter((r) => isApplicable(ctx, r));
  if (applicable.length === 0) return { ok: false, reason: 'NO_RATE' };

  let best = applicable[0];
  for (let i = 1; i < applicable.length; i++) {
    // >0 -> piu specifica vince; ==0 (firma pari, prevenuta dall'unique index) -> si tiene la prima.
    if (compareSpecificity(applicable[i], best) > 0) best = applicable[i];
  }

  const days = daysInclusive(ctx.startDate, ctx.endDate);
  const totalPrice = ctx.type === 'subscription' ? round2(best.price) : round2(best.price * days);
  return { ok: true, totalPrice, rate: best };
}
