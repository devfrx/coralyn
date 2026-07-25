import type { RouteLocationRaw } from 'vue-router';
import { ApiError } from './http';

interface SessionLike {
  authenticated: boolean;
  logout(): void;
}

interface RouterLike {
  currentRoute: { value: { name: unknown; fullPath: string } };
  push(to: RouteLocationRaw): unknown;
}

/**
 * D-037 — gestione globale del `401` per **web-platform** (console superuser).
 *
 * ⚠️ Gemello volontario di `web-staff/src/lib/onApiError.ts`, non un'astrazione condivisa: le due
 * app hanno ciascuna il proprio `ApiError` (`./http`), quindi una versione unica dovrebbe farsi
 * iniettare il tipo. La duplicazione segue quella già esistente di `http`/`toasts`/`queryClient`/
 * `useQueryResource`; unificarle è una decisione strutturale, non un effetto collaterale di questo
 * fix. Se cambi la regola qui, cambiala anche là.
 *
 * D-037 era marcata CHIUSA senza che web-platform fosse mai stata nominata nei tre aggiornamenti
 * che l'hanno chiusa (AUD-014): fino a questo file un 401 qui non produceva NULLA — né logout né
 * redirect — e la console restava aperta su dati che il server rifiutava di rinfrescare.
 *
 * Su un 401 di una sessione **attiva** (token scaduto/invalido mentre l'utente opera),
 * chiude la sessione e rimanda al login, preservando la rotta corrente in `?redirect`.
 * Nemmeno il superuser ha refresh token: niente rotazione, solo logout + redirect pulito,
 * al posto dello stato d'errore per-vista.
 *
 * Un 401 **senza** sessione attiva è gestito localmente e qui è no-op:
 * - login con credenziali errate (l'utente non è ancora autenticato → LoginView mostra l'errore);
 * - `rehydrate` di un token scaduto all'avvio (ha già il suo try/catch → logout).
 * Anche sulla rotta di login è no-op, per non innescare un loop di redirect.
 */
export function handleUnauthorized(error: unknown, session: SessionLike, router: RouterLike): void {
  if (!(error instanceof ApiError) || error.status !== 401) return;
  if (!session.authenticated) return;
  if (router.currentRoute.value.name === 'login') return;

  const redirect = router.currentRoute.value.fullPath;
  session.logout();
  router.push({ name: 'login', query: redirect && redirect !== '/' ? { redirect } : {} });
}
