import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { Role, type LoginResponse, type UserDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { clearToken, getToken, setToken } from '@/lib/authToken';

export const useSessionStore = defineStore('session', () => {
  const user = ref<UserDTO | null>(null);

  const authenticated = computed(() => user.value !== null);
  const role = computed<Role | null>(() => user.value?.role ?? null);
  const userEmail = computed(() => user.value?.email ?? '');

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    // Questa app è SOLO per il distributore: un utente di lido ha credenziali valide ma NON deve entrare.
    if (res.user.role !== Role.Superuser) {
      throw new Error('Accesso riservato agli operatori della piattaforma');
    }
    setToken(res.accessToken);
    user.value = res.user;
  }

  function logout(): void { clearToken(); user.value = null; }

  async function rehydrate(): Promise<void> {
    if (!getToken()) return;
    try {
      const me = await apiFetch<UserDTO>('/auth/me');
      // Difesa in profondità: un token non-superuser non deve dare sessione qui.
      if (me.role !== Role.Superuser) { logout(); return; }
      user.value = me;
    } catch {
      logout();
    }
  }

  return { user, authenticated, role, userEmail, login, logout, rehydrate };
});
