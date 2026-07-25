import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query';
import { router } from '@/router';
import { useSessionStore } from '@/stores/session';
import { handleUnauthorized } from './onApiError';

// D-037 / AUD-014: un 401 su una sessione attiva (query o mutation) chiude la sessione e rimanda
// al login, invece di lasciare la console aperta su dati che il server rifiuta di rinfrescare.
// Fino a qui web-platform non aveva NESSUNA gestione globale del 401: la deferred D-037 risultava
// chiusa, ma nei tre aggiornamenti che l'hanno chiusa questa app non era mai stata nominata.
// La logica pura vive in onApiError.ts; qui la si aggancia alle cache globali di TanStack Query.
const onError = (error: unknown) => handleUnauthorized(error, useSessionStore(), router);

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
