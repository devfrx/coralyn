import { createQueryClient } from '@coralyn/data-layer';
import { router } from '@/router';
import { useSessionStore } from '@/stores/session';

// D-037: un 401 su una sessione attiva (query o mutation) chiude la sessione e rimanda al login,
// invece di lasciare che ogni vista mostri il proprio stato d'errore. La regola e il cablaggio alle
// cache globali vivono in @coralyn/data-layer; qui l'app fornisce solo il proprio router e il
// proprio store. `getSession` è un thunk: Pinia non è ancora installata quando questo modulo viene
// valutato.
export const queryClient = createQueryClient({ getSession: () => useSessionStore(), router });
