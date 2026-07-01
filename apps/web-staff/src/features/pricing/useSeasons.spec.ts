import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useSeasons, useCreateSeason } from './useSeasons';

const Probe = defineComponent({
  setup() {
    const q = useSeasons();
    const m = useCreateSeason();
    return () =>
      h('div', [
        h('span', { class: 'names' }, (q.data.value ?? []).map((s) => s.name).join(',')),
        h('button', { onClick: () => m.mutate({ name: 'Estate 2027', startDate: '2027-06-01', endDate: '2027-09-15' }) }, 'add'),
      ]);
  },
});

describe('useSeasons', () => {
  it('legge le stagioni dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.find('.names').text()).toContain('Estate 2026');
  });

  it('crea una stagione e invalida la lista', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.find('.names').text()).toContain('Estate 2027');
  });
});
