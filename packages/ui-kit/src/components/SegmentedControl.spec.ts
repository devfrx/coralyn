import { mount } from '@vue/test-utils';
import SegmentedControl from './SegmentedControl.vue';
import { it, expect } from 'vitest';
it('seleziona ed emette', async () => {
  const w = mount(SegmentedControl, { props: { modelValue: 'a', options: [{value:'a',label:'A'},{value:'b',label:'B'}] } });
  const tabs = w.findAll('[role="radio"]');
  expect(tabs[0].attributes('aria-checked')).toBe('true');
  await tabs[1].trigger('click');
  expect(w.emitted('update:modelValue')![0]).toEqual(['b']);
});
