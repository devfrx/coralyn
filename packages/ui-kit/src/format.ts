/** Formatta un importo come valuta EUR ("€ " + due decimali). Generico: nessun dominio. */
export function formatEuro(amount: number): string {
  return `€ ${amount.toFixed(2)}`;
}

/** Iniziali maiuscole delle prime 2 parole di un nome (es. "Mario Rossi" → "MR"). */
export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Intervallo date: la data singola se coincidono, altrimenti "start → end". */
export function dateRange(start: string, end: string): string {
  return start === end ? start : `${start} → ${end}`;
}
