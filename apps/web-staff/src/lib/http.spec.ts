import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch } from './http';

afterEach(() => vi.restoreAllMocks());

describe('apiFetch', () => {
  it('aggiunge X-Stabilimento-Id e ritorna il json', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await apiFetch<{ ok: boolean }>('/clienti', { tenantId: 'tenant-123' });
    expect(data).toEqual({ ok: true });
    const [, init] = spy.mock.calls[0];
    expect(new Headers(init?.headers).get('X-Stabilimento-Id')).toBe('tenant-123');
  });

  it('lancia su risposta non ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(apiFetch('/clienti', { tenantId: 't' })).rejects.toThrow();
  });
});
