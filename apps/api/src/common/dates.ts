/** Oggi come data di calendario nel fuso dello Stabilimento (Europe/Rome). ADR-0031. */
export function todayInRome(): string {
  // 'en-CA' produce il formato ISO yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

/** True se `s` è 'yyyy-mm-dd' E una data di calendario reale (no 2026-13-40). */
export function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Serializza una colonna @db.Date (mezzanotte UTC) in 'yyyy-mm-dd'. Mai metodi locali. */
export function formatDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Costruisce il valore da scrivere in una colonna @db.Date a partire da 'yyyy-mm-dd'. */
export function toDbDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
