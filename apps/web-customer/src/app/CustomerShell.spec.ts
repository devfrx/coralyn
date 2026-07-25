import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import CustomerShell from './CustomerShell.vue';
import { useSessionStore } from '@/stores/session';

const Stub = { template: '<div />' };

/** Stesse rotte e stessi `meta.public` del router reale (router/index.ts). */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/attiva', name: 'activation', component: Stub, meta: { public: true, bare: true } },
      { path: '/abbonamenti', name: 'my-subscriptions', component: Stub },
      { path: '/privacy', name: 'privacy', component: Stub, meta: { public: true } },
    ],
  });
}

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
});

async function mountAt(path: string) {
  const session = useSessionStore();
  session.me = { customerId: 'c1', firstName: 'Mario', lastName: 'Rossi', establishmentName: 'Lido' };
  const router = makeRouter();
  await router.push(path);
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount(CustomerShell, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }], router] } });
  return { session, router };
}

describe('CustomerShell — uscita dalla sessione (AUD-010)', () => {
  it('sessione finita su rotta protetta → torna all’attivazione', async () => {
    const { session, router } = await mountAt('/abbonamenti');
    expect(router.currentRoute.value.name).toBe('my-subscriptions');

    // 401 terminale: l'interceptor chiama onAuthFailure → clearSession. Senza il redirect il
    // bagnante resterebbe su una pagina che dice «Non hai abbonamenti attivi».
    session.clearSession();
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('activation');
  });

  it('sessione finita su /privacy (pubblica) → resta dov’è', async () => {
    const { session, router } = await mountAt('/privacy');
    session.clearSession();
    await flushPromises();
    // L'informativa del bagnante deve restare leggibile senza sessione (ADR-0055).
    expect(router.currentRoute.value.name).toBe('privacy');
  });
});
