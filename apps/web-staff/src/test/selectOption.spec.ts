import { describe, it, expect } from 'vitest';
import { defineComponent, ref } from 'vue';
import { Select, Option } from '@coralyn/ui-kit';
import { mountApp, selectOption } from './utils';

const Host = defineComponent({
  components: { Select, Option },
  setup() { const v = ref(''); return { v }; },
  template: `<Select v-model="v" data-test="host-select">
    <Option value="">Nessuno</Option><Option value="p1">Primo</Option>
  </Select><p data-test="out">{{ v }}</p>`,
});

describe('selectOption helper', () => {
  it('seleziona per label e aggiorna il modello, round-trip del vuoto compreso', async () => {
    const w = mountApp(Host);
    await selectOption(w.get('[data-test="host-select"]'), 'Primo');
    expect(w.get('[data-test="out"]').text()).toBe('p1');
    await selectOption(w.get('[data-test="host-select"]'), 'Nessuno');
    expect(w.get('[data-test="out"]').text()).toBe('');
  });
});
