import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import Topbar from './Topbar.vue';
import { useSessionStore } from '@/stores/session';

const Blank = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/map', name: 'map', component: Blank, meta: { title: 'Mappa', usesDate: true } },
      { path: '/bookings', name: 'bookings', component: Blank, meta: { title: 'Prenotazioni', usesDate: true } },
      { path: '/customers', name: 'customers', component: Blank, meta: { title: 'Clienti' } },
    ],
  });
}

async function mountAt(path: string) {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(path);
  await router.isReady();
  const w = mount(Topbar, { global: { plugins: [router] } });
  return w;
}

describe('Topbar — navigazione data', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('su /map il navigatore data è visibile e il label mostra activeDate formattata', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    expect(w.find('[data-testid="date-nav"]').exists()).toBe(true);
    expect(w.text()).toContain('lug'); // "lun 6 lug 2026" (it-IT), case-insensitive sul mese
  });

  it('la freccia › incrementa activeDate di 1 giorno', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    await w.find('[aria-label="Giorno successivo"]').trigger('click');
    expect(s.activeDate).toBe('2026-07-07');
  });

  it('la freccia ‹ decrementa activeDate di 1 giorno', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    await w.find('[aria-label="Giorno precedente"]').trigger('click');
    expect(s.activeDate).toBe('2026-07-05');
  });

  it('il picker imposta activeDate alla data scelta (salto arbitrario)', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    const input = w.find('input[type="date"]');
    await input.setValue('2026-09-20');
    await input.trigger('change');
    expect(s.activeDate).toBe('2026-09-20');
  });

  it('su /customers (senza usesDate) il navigatore data è NASCOSTO', async () => {
    const w = await mountAt('/customers');
    expect(w.find('[data-testid="date-nav"]').exists()).toBe(false);
  });

  it('il bottone hamburger (visibile solo < lg) emette open-nav al click', async () => {
    const w = await mountAt('/customers');
    const burger = w.find('button[aria-label="Apri menu"]');
    expect(burger.exists()).toBe(true);
    expect(burger.classes()).toContain('lg:hidden');
    await burger.trigger('click');
    expect(w.emitted('open-nav')).toBeTruthy();
  });
});
