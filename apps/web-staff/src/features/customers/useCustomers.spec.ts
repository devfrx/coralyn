import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useCustomer, useUpdateCustomer } from './useCustomers';

const Probe = defineComponent({
  setup() {
    const q = useCustomer('c-1');
    return () => h('div', q.data.value ? `${q.data.value.firstName} ${q.data.value.lastName}` : 'loading');
  },
});

const EditProbe = defineComponent({
  setup() {
    const q = useCustomer('c-1');
    const m = useUpdateCustomer('c-1');
    return () => h('div', [
      h('span', q.data.value?.phone ?? '-'),
      h('button', { onClick: () => m.mutate({ phone: '+39 000' }) }, 'save'),
    ]);
  },
});

describe('useCustomer', () => {
  it('legge il cliente per id dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Mario Rossi');
  });

  it('modifica il cliente e invalida il dettaglio', async () => {
    const w = mountApp(EditProbe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('+39 000');
  });
});
