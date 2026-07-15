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
    const res = await apiFetch<CustomerAuthResponse>('/customer/activate', {
      method: 'POST',
      body: JSON.stringify({ enrollmentToken, pin }),
    });
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    await loadMe();
  }

  async function refresh(): Promise<boolean> {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await apiFetch<CustomerAuthResponse>('/customer/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: rt }),
      });
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
