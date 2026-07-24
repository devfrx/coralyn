/**
 * URL dell'informativa che il BAGNANTE legge, pubblicata da `web-customer` per uno specifico lido
 * (deep-link, così il testo legale vive in un solo posto — ADR-0055).
 *
 * Restituisce stringa vuota se `VITE_WEB_CUSTOMER_URL` non è configurata: il chiamante deve
 * nascondere il link.
 *
 * NIENTE fallback a percorso relativo. Un percorso relativo resta sull'origin di `web-staff`, dove
 * vive un documento DIVERSO (l'informativa agli operatori, titolare = Coralyn, ADR-0056):
 * l'operatore crederebbe di vedere l'anteprima di ciò che legge il suo cliente e vedrebbe invece la
 * policy che riguarda sé stesso. L'informativa del bagnante vive su un'altra app: senza il suo
 * origin non è linkabile, e fingere il contrario è peggio che non offrire il link.
 */
export function privacyPreviewUrl(establishmentId: string): string {
  const base = (import.meta.env.VITE_WEB_CUSTOMER_URL ?? '').trim().replace(/\/$/, '');
  if (!base) return '';
  return `${base}/privacy?e=${establishmentId}`;
}
