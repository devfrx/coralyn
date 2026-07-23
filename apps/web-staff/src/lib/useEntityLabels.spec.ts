import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useEntityLabels } from './useEntityLabels';

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountHook() {
  let api!: ReturnType<typeof useEntityLabels>;
  const Host = defineComponent({
    setup() {
      api = useEntityLabels();
      return () => h('div');
    },
  });
  const w = mountApp(Host);
  return { w, api: () => api };
}

describe('useEntityLabels', () => {
  it('customerName: risolve cliente seedato, fallback all\'id se non trovato', async () => {
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    // Seed di default (server.ts): c-1 = Mario Rossi.
    expect(api().customerName('c-1')).toBe('Mario Rossi');
    expect(api().customerName('non-esiste')).toBe('non-esiste');
  });

  it('umbrellaLabel: risolve id ombrellone seedato dalla mappa, undefined se assente', async () => {
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    // Seed mappa (mocks/data/seed.ts): o-1 nel settore Centro, label "1".
    expect(api().umbrellaLabel.value.get('o-1')).toBe('1');
    expect(api().umbrellaLabel.value.get('non-esiste')).toBeUndefined();
  });

  it('umbrellaLabel: risolve anche un ombrellone RITIRATO (storico, D-060) e lo espone in retiredUmbrellaIds', async () => {
    server.use(
      http.get('/api/establishment/umbrellas/retired', () =>
        HttpResponse.json([{ id: 'o-rit', label: 'R7', umbrellaTypeId: null, retiredAt: '2026-06-27T10:00:00.000Z', retiredFrom: 'Centro · Fila 1' }]),
      ),
    );
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().umbrellaLabel.value.get('o-rit')).toBe('R7');
    expect(api().retiredUmbrellaIds.value.has('o-rit')).toBe(true);
    // Gli attivi della day-map non sono "ritirati".
    expect(api().retiredUmbrellaIds.value.has('o-1')).toBe(false);
  });

  it('packageName: risolve nome pacchetto da id iniettato via MSW', async () => {
    server.use(
      http.get('/api/packages', () =>
        HttpResponse.json([{ id: 'pkg-x', name: 'Deluxe', equipment: [{ equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 4 }] }]),
      ),
    );
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().packageName.value.get('pkg-x')).toBe('Deluxe');
  });

  it('packageName: risolve anche un pacchetto ARCHIVIATO (storico prenotazioni, spec §2)', async () => {
    server.use(
      http.get('/api/packages', ({ request }) => {
        const all = [{ id: 'pkg-arch', name: 'Ritirato', equipment: [], archived: true }];
        const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
        return HttpResponse.json(includeArchived ? all : all.filter((p) => !p.archived));
      }),
    );
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().packageName.value.get('pkg-arch')).toBe('Ritirato');
  });
});
