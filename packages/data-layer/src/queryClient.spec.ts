import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { useQuery, useMutation } from '@tanstack/vue-query';
import { createQueryClient, QUERY_DEFAULTS } from './queryClient';
import { ApiError } from './http';
import { mountHook } from './test/host';

// Il cablaggio della politica 401 alle cache globali non era coperto da nulla, in nessuna delle due
// app: gli spec di onApiError provavano la REGOLA, mai che fosse effettivamente agganciata — e
// soprattutto mai che fosse agganciata anche alla MutationCache. Togliere `mutationCache` da
// createQueryClient lasciava verdi tutti i test di entrambe le app.
function makeWiring() {
  const session = { authenticated: true, logout: vi.fn() };
  const router = { currentRoute: { value: { name: 'customers', fullPath: '/customers' } }, push: vi.fn() };
  return { session, router, client: createQueryClient({ getSession: () => session, router }) };
}

describe('createQueryClient', () => {
  it('un 401 su una QUERY chiude la sessione e rimanda al login', async () => {
    const { session, router, client } = makeWiring();
    mountHook(
      () => useQuery({ queryKey: ['x'], queryFn: () => Promise.reject(new ApiError(401, '/x')), retry: false }),
      client,
    );
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(session.logout).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/customers' } });
  });

  it('un 401 su una MUTATION chiude la sessione e rimanda al login', async () => {
    const { session, router, client } = makeWiring();
    const { api } = mountHook(
      () => useMutation({ mutationFn: () => Promise.reject(new ApiError(401, '/x')) }),
      client,
    );
    await expect(api().mutateAsync(undefined)).rejects.toThrow();
    await flushPromises();

    expect(session.logout).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/customers' } });
  });

  it('un errore non-401 non tocca la sessione', async () => {
    const { session, router, client } = makeWiring();
    mountHook(
      () => useQuery({ queryKey: ['y'], queryFn: () => Promise.reject(new ApiError(500, '/y')), retry: false }),
      client,
    );
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(session.logout).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('applica la taratura condivisa (staleTime 30s, retry 1, niente refetch sul focus)', () => {
    const { client } = makeWiring();
    expect(client.getDefaultOptions().queries).toMatchObject(QUERY_DEFAULTS.queries);
  });
});
