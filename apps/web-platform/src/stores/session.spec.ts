import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from './session';
import * as http from '@/lib/http';
import { TOKEN_KEY } from '@/lib/authToken';

describe('session store (platform)', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.restoreAllMocks(); });

  it('login superuser → autenticato, token salvato', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 'tok', user: { id: 'su', email: 's@p.test', role: Role.Superuser, establishmentId: null } } as any);
    const s = useSessionStore();
    await s.login('s@p.test', 'pw');
    expect(s.authenticated).toBe(true);
    expect(s.role).toBe(Role.Superuser);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok');
  });

  it('login NON-superuser (admin di lido) → rifiutato, nessun token, non autenticato', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 'tok', user: { id: 'a', email: 'a@lido.test', role: Role.Admin, establishmentId: 'e-1' } } as any);
    const s = useSessionStore();
    await expect(s.login('a@lido.test', 'pw')).rejects.toThrow();
    expect(s.authenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('rehydrate: senza token → no-op non autenticato', async () => {
    const spy = vi.spyOn(http, 'apiFetch');
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rehydrate: token presente ma /me non-superuser → logout, non autenticato', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ id: 'a', email: 'a@lido.test', role: Role.Admin, establishmentId: 'e-1' } as any);
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
