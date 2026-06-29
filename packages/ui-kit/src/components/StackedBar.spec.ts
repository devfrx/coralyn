import { mount } from '@vue/test-utils';
import StackedBar from './StackedBar.vue';
import { it, expect } from 'vitest';
it('renderizza un segmento per voce con label e percentuale', () => {
  const w = mount(StackedBar, { props: { segments: [{ pct: 60, color: 'var(--color-state-abbonato)', label: 'Abbonato' }, { pct: 40, color: 'var(--color-state-libero)', label: 'Libero' }] } });
  expect(w.text()).toContain('Abbonato');
  expect(w.text()).toContain('60%');
});
