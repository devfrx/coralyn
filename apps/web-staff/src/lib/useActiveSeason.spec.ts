import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useActiveSeason } from './useActiveSeason';

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountHook() {
  let api!: ReturnType<typeof useActiveSeason>;
  const Host = defineComponent({
    setup() {
      api = useActiveSeason();
      return () => h('div');
    },
  });
  mountApp(Host);
  return { api: () => api };
}

describe('useActiveSeason', () => {
  it('espone il nome della stagione attiva dall\'overview (seed MSW: Estate 2026)', async () => {
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().name.value).toBe('Estate 2026');
  });

  it('name = null quando nessuna stagione copre oggi (activeSeason null)', async () => {
    server.use(
      http.get('/api/establishment/overview', () =>
        HttpResponse.json({
          establishment: { id: 'e-1', name: 'Lido' },
          activeSeason: null,
          timeSlots: [],
          structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
          team: [],
        }),
      ),
    );
    const { api } = mountHook();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(api().name.value).toBeNull();
  });
});
