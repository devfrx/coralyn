/** True se `s` è "HH:MM" 24h reale (00:00–23:59). Gemello di isValidCalendarDate. */
export function isValidClockTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** "HH:MM" → valore da scrivere in @db.Time (round-trip UTC su base 1970, ADR-0031). */
export function toDbTime(s: string): Date {
  return new Date(`1970-01-01T${s}:00Z`);
}

/** Serializza una @db.Time (Date su base 1970) in "HH:MM" via UTC. Mai metodi locali. */
export function formatDbTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
