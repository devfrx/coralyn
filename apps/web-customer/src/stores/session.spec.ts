import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from './session';
import * as http from '@/lib/http';
import { getAccessToken, getRefreshToken } from '@/lib/authToken';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.restoreAllMocks(); });

describe('session store — activate/refresh/logout/rehydrate', () => {
  it('activate: persiste access+refresh e carica me', async () => {
    vi.spyOn(http, 'apiFetch')
      .mockResolvedValueOnce({ accessToken: 'a1', refreshToken: 'r1' }) // POST /customer/activate
      .mockResolvedValueOnce({ customerId: 'c1', firstName: 'Mario', lastName: 'Rossi', establishmentName: 'Lido' }); // GET /customer/me
    const s = useSessionStore();
    await s.activate('enroll-tok', '1234');
    expect(getAccessToken()).toBe('a1');
    expect(getRefreshToken()).toBe('r1');
    expect(s.authenticated).toBe(true);
    expect(s.me?.firstName).toBe('Mario');
  });

  it('refresh: rotea i token e ritorna true', async () => {
    localStorage.setItem('coralyn.customer.refresh.token', 'r1');
    vi.spyOn(http, 'apiFetch').mockResolvedValueOnce({ accessToken: 'a2', refreshToken: 'r2' });
    const s = useSessionStore();
    const ok = await s.refresh();
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('a2');
    expect(getRefreshToken()).toBe('r2');
  });

  it('refresh: senza refresh token persistito ritorna false senza chiamare apiFetch', async () => {
    const spy = vi.spyOn(http, 'apiFetch');
    const s = useSessionStore();
    const ok = await s.refresh();
    expect(ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('logout: pulisce i token e lo stato me', async () => {
    vi.spyOn(http, 'apiFetch')
      .mockResolvedValueOnce({ accessToken: 'a1', refreshToken: 'r1' })
      .mockResolvedValueOnce({ customerId: 'c1', firstName: 'Mario', lastName: 'Rossi', establishmentName: 'Lido' });
    const s = useSessionStore();
    await s.activate('enroll-tok', '1234');
    s.logout();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(s.authenticated).toBe(false);
    expect(s.me).toBeNull();
  });

  it('rehydrate: senza refresh token persistito non chiama /me', async () => {
    const spy = vi.spyOn(http, 'apiFetch');
    const s = useSessionStore();
    await s.rehydrate();
    expect(spy).not.toHaveBeenCalled();
    expect(s.authenticated).toBe(false);
  });
});
