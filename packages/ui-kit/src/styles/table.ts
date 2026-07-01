/**
 * Classi standard di cella `<td>` per DataTable e tabelle custom (ADR-0033 §3.6). Coincidono
 * ESATTAMENTE con le classi oggi inline in BookingsView/RenewalsView/CustomersView/PricingView.
 * Non introdurre nuove classi CSS: solo costanti di stringa Tailwind riutilizzabili.
 */
export const TD = 'border-b border-[var(--color-border-row)] px-3.5 py-3.5';
export const TD_FIRST = 'border-b border-[var(--color-border-row)] px-[18px] py-3.5';
export const TD_RIGHT = 'border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right';
export const TD_NUM = 'tabular-nums';
