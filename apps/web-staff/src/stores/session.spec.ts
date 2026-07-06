import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from './session';
import { getToken, setToken, clearToken } from '@/lib/authToken';
import { MOCK_TOKEN, server } from '@/mocks/server';
import { todayIso } from '@/lib/dates';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';

beforeEach(() => {
  setActivePinia(createPinia());
  clearToken();
});

describe('session store', () => {
  it('activeDate parte da oggi (todayIso), non da una data fissa', () => {
    const s = useSessionStore();
    expect(s.activeDate).toBe(todayIso());
    expect(s.activeDate).not.toBe('2026-06-27');
  });

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
    expect(s.establishmentName).toBe('Lido Maestrale');
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
    // dopo logout, il nome derivato dalla sessione torna vuoto (non resta 'Lido Maestrale')
    expect(s.establishmentName).toBe('');
  });

  it('rehydrate con token valido ripristina la sessione da /me', async () => {
    setToken(MOCK_TOKEN);
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(true);
    expect(s.userEmail).toBe('admin@coralyn.dev');
    expect(s.establishmentName).toBe('Lido Maestrale');
  });

  it('rehydrate con token invalido fa logout', async () => {
    setToken('token-scaduto');
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('login di un superuser è rifiutato: throw, nessun token, non autenticato (D-045)', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: MOCK_TOKEN,
          user: { id: 'su-1', email: 'super@coralyn.dev', role: Role.Superuser, establishmentId: null, establishmentName: null },
        }),
      ),
    );
    const s = useSessionStore();
    await expect(s.login('super@coralyn.dev', 'coralyn-super')).rejects.toThrow();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('rehydrate con token di un superuser fa logout (D-045)', async () => {
    setToken(MOCK_TOKEN);
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'su-1', email: 'super@coralyn.dev', role: Role.Superuser, establishmentId: null, establishmentName: null }),
      ),
    );
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });
});
