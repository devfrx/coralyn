import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch } from './http';
import { setToken, clearToken } from './authToken';

afterEach(() => {
  vi.restoreAllMocks();
  clearToken();
});

describe('apiFetch', () => {
  it('aggiunge Authorization: Bearer dal token (e non X-Stabilimento-Id)', async () => {
    setToken('jwt-abc');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await apiFetch<{ ok: boolean }>('/clienti');
    expect(data).toEqual({ ok: true });
    const [, init] = spy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-abc');
    expect(headers.get('X-Stabilimento-Id')).toBeNull();
  });

  it('senza token non invia Authorization', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await apiFetch('/clienti');
    const [, init] = spy.mock.calls[0];
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
  });

  it('lancia un ApiError con lo status su risposta non ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 401 }));
    await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 401 });
  });

  it('risolve a null su body vuoto 200 (es. GET /renewal-campaigns senza campagna)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await expect(apiFetch('/renewal-campaigns?destinationDate=2027-05-01')).resolves.toBeNull();
  });

  it('risolve a null su risposta 204 No Content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/qualcosa')).resolves.toBeNull();
  });

  it('continua a parsare un body JSON normale', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'camp-1' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(apiFetch('/renewal-campaigns?destinationDate=2027-05-01')).resolves.toEqual({ id: 'camp-1' });
  });
});
