import { createQueryClient } from '@coralyn/data-layer';
import { router } from '@/router';
import { useSessionStore } from '@/stores/session';

// D-037 / AUD-014: un 401 su una sessione attiva (query o mutation) chiude la sessione e rimanda al
// login, invece di lasciare la console aperta su dati che il server rifiuta di rinfrescare. Fino al
// 2026-07-25 questa app non aveva NESSUNA gestione globale del 401, benché D-037 risultasse chiusa.
// La regola e il cablaggio alle cache globali vivono in @coralyn/data-layer; qui l'app fornisce solo
// il proprio router e il proprio store.
export const queryClient = createQueryClient({ getSession: () => useSessionStore(), router });
