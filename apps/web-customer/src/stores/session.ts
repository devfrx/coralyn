import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { CustomerAuthResponse, CustomerMeDTO } from '@coralyn/contracts';
import { apiFetch, setRefreshHandler } from '@/lib/http';
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from '@/lib/authToken';

export const useSessionStore = defineStore('session', () => {
  const me = ref<CustomerMeDTO | null>(null);
  const authenticated = computed(() => me.value !== null);

  async function loadMe(): Promise<void> {
    me.value = await apiFetch<CustomerMeDTO>('/customer/me');
  }

  async function activate(enrollmentToken: string, pin: string): Promise<void> {
    // Pubblica/token-establishing: un 401 qui è terminale, non deve innescare un refresh.
    const res = await apiFetch<CustomerAuthResponse>(
      '/customer/activate',
      { method: 'POST', body: JSON.stringify({ enrollmentToken, pin }) },
      { retryOn401: false },
    );
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    await loadMe();
  }

  // Single-flight: N chiamanti concorrenti (es. 401 simultanei da più richieste dati)
  // condividono UNA sola round-trip di refresh — il backend rileva theft/reuse e revoca
  // l'intera catena se lo stesso refresh token viene presentato due volte in parallelo.
  let refreshInFlight: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  }

  async function doRefresh(): Promise<boolean> {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      // Gestisce i token stessi: un 401 (token scaduto/revocato/riusato — vedi
      // customer-session.service.ts) è terminale, MAI un trigger di refresh ricorsivo.
      const res = await apiFetch<CustomerAuthResponse>(
        '/customer/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken: rt }) },
        { retryOn401: false },
      );
      setAccessToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  /** Teardown puramente locale. NON chiama `/customer/logout`: si usa quando la sessione è già
   *  morta lato server (401 terminale, rehydrate fallita) e non c'è nulla da revocare. */
  function clearSession(): void {
    clearTokens();
    me.value = null;
  }

  /** Uscita esplicita del bagnante. Revoca la sessione lato server PRIMA di dimenticare il refresh
   *  token: senza questa chiamata quel token resterebbe valido fino alla sua scadenza (120 giorni)
   *  su un dispositivo che l'utente crede di aver abbandonato — ed è esattamente lo scenario del
   *  telefono prestato o dello smarrimento. La revoca è best-effort: se fallisce (rete giù, token
   *  già revocato) il teardown locale avviene comunque, altrimenti l'utente resterebbe dentro. */
  async function logout(): Promise<void> {
    const rt = getRefreshToken();
    if (rt) {
      try {
        // `retryOn401: false` come activate/refresh: gestisce i token stessi, un 401 è terminale.
        await apiFetch<void>(
          '/customer/logout',
          { method: 'POST', body: JSON.stringify({ refreshToken: rt }) },
          { retryOn401: false },
        );
      } catch {
        /* la sessione locale finisce comunque */
      }
    }
    clearSession();
  }

  async function rehydrate(): Promise<void> {
    if (!getRefreshToken()) return;
    try {
      await loadMe();
    } catch {
      clearSession();
    }
  }

  // D-037: l'http interceptor usa questi due su 401. Su fallimento terminale si azzera lo stato
  // locale (il server ha già invalidato tutto); a portare via l'utente pensa CustomerShell, che
  // osserva `authenticated`.
  setRefreshHandler({ refresh, onAuthFailure: clearSession });

  return { me, authenticated, activate, refresh, logout, clearSession, rehydrate };
});
