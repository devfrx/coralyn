import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query';
import { handleUnauthorized, type SessionLike, type RouterLike } from './onApiError';

/** Taratura TanStack condivisa dalle TRE app: era identica in tre `queryClient.ts` distinti, e
 *  cambiare politica di freschezza voleva dire ricordarsi di cambiarla tre volte. */
export const QUERY_DEFAULTS = { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } };

/**
 * `QueryClient` con la politica 401 agganciata alle cache globali (query **e** mutation): un 401 su
 * una sessione attiva chiude la sessione e rimanda al login, invece di lasciare che ogni vista
 * mostri il proprio stato d'errore. La logica pura vive in `onApiError.ts`; qui la si aggancia.
 *
 * `getSession` è un **thunk**, non un valore: `useSessionStore()` richiede Pinia già installata, e
 * questo modulo viene valutato prima di `app.use(createPinia())`. Risolverlo alla creazione
 * lancerebbe in avvio.
 *
 * Solo per le app a sessione semplice. `web-customer` costruisce il proprio `QueryClient` con
 * `QUERY_DEFAULTS` e senza questa politica: il suo 401 è già gestito dal refresh (ADR-0049).
 */
export function createQueryClient(opts: { getSession: () => SessionLike; router: RouterLike }): QueryClient {
  const onError = (error: unknown) => handleUnauthorized(error, opts.getSession(), opts.router);
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: QUERY_DEFAULTS,
  });
}
