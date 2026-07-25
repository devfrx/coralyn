import type { RouteLocationRaw } from 'vue-router';
import { ApiError } from './http';

/** La sola superficie dello store di sessione che serve qui. Tipata strutturalmente perché il
 *  package non conosce Pinia né gli store delle app che lo usano. */
export interface SessionLike {
  authenticated: boolean;
  logout(): void;
}

/** Idem per il router: `handleUnauthorized` non importa il router di nessuna app. */
export interface RouterLike {
  currentRoute: { value: { name: unknown; fullPath: string } };
  push(to: RouteLocationRaw): unknown;
}

/**
 * D-037 — gestione globale del `401` per le app a **sessione semplice**: `web-staff` (gestionale
 * operatore) e `web-platform` (console superuser).
 *
 * Su un 401 di una sessione **attiva** (token scaduto/invalido mentre l'utente opera), chiude la
 * sessione e rimanda al login, preservando la rotta corrente in `?redirect`. Nessuna delle due app
 * ha refresh token — D-026 non è stato esteso né allo staff né al superuser: niente rotazione, solo
 * logout + redirect pulito, al posto dello stato d'errore per-vista.
 *
 * `web-customer` **non** usa questa funzione: il canale cliente ha rotazione silenziosa
 * single-flight (ADR-0049) e il ritorno all'attivazione lo decide `CustomerShell` osservando
 * `authenticated`, così il suo interceptor resta ignaro del router.
 *
 * Un 401 **senza** sessione attiva è gestito localmente e qui è no-op:
 * - login con credenziali errate (l'utente non è ancora autenticato → LoginView mostra l'errore);
 * - `rehydrate` di un token scaduto all'avvio (ha già il suo try/catch → logout).
 * Anche sulla rotta di login è no-op, per non innescare un loop di redirect.
 *
 * Storia che vale la pena non perdere: fino al 2026-07-25 questa regola esisteva in **due copie**,
 * e D-037 risultava chiusa benché `web-platform` non fosse mai stata nominata nei tre aggiornamenti
 * che l'avevano chiusa (AUD-014). Ora la copia è una sola, e i sei test che la vincolano valgono per
 * entrambe le app invece che per una.
 */
export function handleUnauthorized(error: unknown, session: SessionLike, router: RouterLike): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (!session.authenticated) return;
  if (router.currentRoute.value.name === 'login') return;

  const redirect = router.currentRoute.value.fullPath;
  session.logout();
  router.push({ name: 'login', query: redirect && redirect !== '/' ? { redirect } : {} });
}
