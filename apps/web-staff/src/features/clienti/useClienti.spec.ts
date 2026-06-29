import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useCliente } from './useClienti';

const Probe = defineComponent({
  setup() {
    const q = useCliente('c-1');
    return () => h('div', q.data.value ? `${q.data.value.nome} ${q.data.value.cognome}` : 'loading');
  },
});

describe('useCliente', () => {
  it('legge il cliente per id dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Mario Rossi');
  });
});
