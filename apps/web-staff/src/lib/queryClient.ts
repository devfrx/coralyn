import { QueryClient, QueryCache, MutationCache } from '@tanstack/vue-query';
import { router } from '@/router';
import { useSessionStore } from '@/stores/session';
import { handleUnauthorized } from './onApiError';

// D-037: un 401 su una sessione attiva (query o mutation) chiude la sessione e rimanda al
// login, invece di lasciare che ogni vista mostri il proprio stato d'errore. La logica pura
// vive in onApiError.ts; qui la si aggancia alle cache globali di TanStack Query.
const onError = (error: unknown) => handleUnauthorized(error, useSessionStore(), router);

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
