import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError, setRefreshHandler } from './http';
import { setAccessToken, setRefreshToken } from './authToken';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('apiFetch — interceptor 401 (D-037)', () => {
  it('401 → refresh riuscito → ritenta una volta e ritorna il dato', async () => {
    setAccessToken('old'); setRefreshToken('r1');
    const onFailure = vi.fn();
    setRefreshHandler({
      refresh: async () => { setAccessToken('new'); return true; },
      onAuthFailure: onFailure,
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const out = await apiFetch<{ ok: boolean }>('/customer/me/subscriptions');
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('401 → refresh fallito → onAuthFailure + ApiError', async () => {
    setAccessToken('old'); setRefreshToken('r1');
    const onFailure = vi.fn();
    setRefreshHandler({ refresh: async () => false, onAuthFailure: onFailure });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    await expect(apiFetch('/customer/me/subscriptions')).rejects.toBeInstanceOf(ApiError);
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
