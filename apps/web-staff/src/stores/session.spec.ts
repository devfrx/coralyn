import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from './session';
import { getToken, setToken, clearToken } from '@/lib/authToken';
import { MOCK_TOKEN } from '@/mocks/server';

beforeEach(() => {
  setActivePinia(createPinia());
  clearToken();
});

describe('session store', () => {
  it('parte non autenticato', () => {
    const s = useSessionStore();
    expect(s.authenticated).toBe(false);
    expect(s.user).toBeNull();
  });

  it('login salva token + user e popola i derivati', async () => {
    const s = useSessionStore();
    await s.login('admin@coralyn.dev', 'coralyn-admin');
    expect(s.authenticated).toBe(true);
    expect(getToken()).toBe(MOCK_TOKEN);
    expect(s.userEmail).toBe('admin@coralyn.dev');
    expect(s.establishmentId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('login errato propaga 401 e resta non autenticato', async () => {
    const s = useSessionStore();
    await expect(s.login('admin@coralyn.dev', 'sbagliata')).rejects.toMatchObject({ status: 401 });
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('logout pulisce token e utente', async () => {
    const s = useSessionStore();
    await s.login('admin@coralyn.dev', 'coralyn-admin');
    s.logout();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('rehydrate con token valido ripristina la sessione da /me', async () => {
    setToken(MOCK_TOKEN);
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(true);
    expect(s.userEmail).toBe('admin@coralyn.dev');
  });

  it('rehydrate con token invalido fa logout', async () => {
    setToken('token-scaduto');
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });
});
