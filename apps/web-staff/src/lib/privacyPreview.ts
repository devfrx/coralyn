/** URL dell'informativa pubblicata da web-customer per un lido (deep-link, no duplicazione). */
export function privacyPreviewUrl(establishmentId: string): string {
  const base = (import.meta.env.VITE_WEB_CUSTOMER_URL ?? '').replace(/\/$/, '');
  return `${base}/privacy?e=${establishmentId}`;
}
