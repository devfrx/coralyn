import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Role, type UserDTO, type LoginResponse } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { getToken, setToken, clearToken } from '@/lib/authToken';
import { todayIso } from '@/lib/dates';

export const useSessionStore = defineStore('session', () => {
  // Utente autenticato (null = sessione assente). I dati di identità derivano da qui.
  const user = ref<UserDTO | null>(null);
  const activeDate = ref<string>(todayIso()); // ISO yyyy-mm-dd — default: oggi operativo (Europe/Rome)
  const authenticated = computed<boolean>(() => user.value !== null);
  const establishmentId = computed<string>(() => user.value?.establishmentId ?? '');
  // Nome stabilimento dell'utente, esposto da /auth/me (UserDTO.establishmentName).
  const establishmentName = computed<string>(() => user.value?.establishmentName ?? '');
  const role = computed<Role>(() => user.value?.role ?? Role.Staff);
  const userEmail = computed<string>(() => user.value?.email ?? '');

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // web-staff è il gestionale di stabilimento: un superuser di piattaforma ha credenziali
    // valide ma NON deve entrare qui (la sua superficie è web-platform). D-045.
    if (res.user.role === Role.Superuser) {
      throw new Error('Accesso riservato al personale dello stabilimento');
    }
    setToken(res.accessToken);
    user.value = res.user;
  }

  function logout(): void {
    clearToken();
    user.value = null;
  }

  /** All'avvio: se c'è un token persistito, lo valida via /me e reidrata la sessione. */
  async function rehydrate(): Promise<void> {
    if (!getToken()) return;
    try {
      const me = await apiFetch<UserDTO>('/auth/me');
      // Difesa in profondità: un token superuser non deve dare sessione qui. D-045.
      if (me.role === Role.Superuser) {
        logout();
        return;
      }
      user.value = me;
    } catch {
      logout();
    }
  }

  return {
    user,
    activeDate,
    establishmentName,
    authenticated,
    establishmentId,
    role,
    userEmail,
    login,
    logout,
    rehydrate,
  };
});
