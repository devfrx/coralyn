import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import AppShell from './AppShell.vue';

const Blank = { template: '<div />' };
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/customers', name: 'customers', component: Blank, meta: { title: 'Clienti' } },
      { path: '/report', name: 'report', component: Blank, meta: { title: 'Report' } },
    ],
  });
}
async function mountShell() {
  const router = makeRouter();
  router.push('/customers');
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const w = mount(AppShell, {
    global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient }], router] },
    attachTo: document.body,
  });
  await flushPromises();
  return { w, router };
}
afterEach(() => { document.body.innerHTML = ''; });

describe('AppShell', () => {
  it('il click sull hamburger apre il NavDrawer', async () => {
    const { w } = await mountShell();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).toBeNull();
    await w.find('button[aria-label="Apri menu"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).not.toBeNull();
  });

  it('cambiare route chiude il NavDrawer', async () => {
    const { w, router } = await mountShell();
    await w.find('button[aria-label="Apri menu"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).not.toBeNull();
    await router.push('/report');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).toBeNull();
  });
});
