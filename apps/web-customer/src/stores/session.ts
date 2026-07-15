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

  function logout(): void {
    clearTokens();
    me.value = null;
  }

  async function rehydrate(): Promise<void> {
    if (!getRefreshToken()) return;
    try {
      await loadMe();
    } catch {
      logout();
    }
  }

  // D-037: l'http interceptor usa questi due su 401.
  setRefreshHandler({ refresh, onAuthFailure: logout });

  return { me, authenticated, activate, refresh, logout, rehydrate };
});
