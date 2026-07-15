// Util di data pura, timezone-safe (mirror di apps/web-staff/src/lib/dates.ts).
// Serve ad AbsenceReleaseModal per il vincolo min = max(oggi, inizio abbonamento).

/** "Oggi" nel fuso Europe/Rome come `yyyy-mm-dd` (en-CA formatta già ISO). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
