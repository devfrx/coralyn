import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Ruolo, type UtenteDTO, type LoginResponse } from '@driftly/contracts';
import { apiFetch } from '@/lib/http';
import { getToken, setToken, clearToken } from '@/lib/authToken';

export const useSessionStore = defineStore('session', () => {
  // Utente autenticato (null = sessione assente). I dati di identità derivano da qui.
  const utente = ref<UtenteDTO | null>(null);
  const dataAttiva = ref<string>('2026-06-27'); // ISO yyyy-mm-dd
  // Il nome stabilimento non è esposto dagli endpoint auth (UtenteDTO ha solo l'id):
  // resta un default finché un endpoint dedicato non lo fornirà.
  const nomeStabilimento = ref<string>('Lido Maestrale');

  const authenticated = computed<boolean>(() => utente.value !== null);
  const stabilimentoId = computed<string>(() => utente.value?.stabilimentoId ?? '');
  const ruolo = computed<Ruolo>(() => utente.value?.ruolo ?? Ruolo.Staff);
  const utenteEmail = computed<string>(() => utente.value?.email ?? '');

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.accessToken);
    utente.value = res.utente;
  }

  function logout(): void {
    clearToken();
    utente.value = null;
  }

  /** All'avvio: se c'è un token persistito, lo valida via /me e reidrata la sessione. */
  async function rehydrate(): Promise<void> {
    if (!getToken()) return;
    try {
      utente.value = await apiFetch<UtenteDTO>('/auth/me');
    } catch {
      logout();
    }
  }

  return {
    utente,
    dataAttiva,
    nomeStabilimento,
    authenticated,
    stabilimentoId,
    ruolo,
    utenteEmail,
    login,
    logout,
    rehydrate,
  };
});
