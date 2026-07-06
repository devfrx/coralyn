// Util di data pure e timezone-safe per la navigazione operativa (activeDate).
// Fonte unica del "oggi operativo" (Europe/Rome, coerente ADR-0031).

/** Sposta una data ISO `yyyy-mm-dd` di `n` giorni (aritmetica in UTC → DST-safe). */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Oggi" nel fuso Europe/Rome come `yyyy-mm-dd` (en-CA formatta già ISO). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
