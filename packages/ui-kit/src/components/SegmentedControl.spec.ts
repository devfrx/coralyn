import { mount } from '@vue/test-utils';
import SegmentedControl from './SegmentedControl.vue';
import { describe, it, expect } from 'vitest';

describe('SegmentedControl', () => {
  it('seleziona ed emette', async () => {
    const w = mount(SegmentedControl, { props: { modelValue: 'a', options: [{value:'a',label:'A'},{value:'b',label:'B'}] } });
    const tabs = w.findAll('[role="radio"]');
    expect(tabs[0].attributes('aria-checked')).toBe('true');
    await tabs[1].trigger('click');
    expect(w.emitted('update:modelValue')![0]).toEqual(['b']);
  });

  it('rende l\'hint secondario quando presente', () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'a', options: [{ value: 'a', label: 'Centro', hint: '82%' }, { value: 'b', label: 'Levante' }] },
    });
    const hints = w.findAll('[data-test="seg-hint"]');
    expect(hints).toHaveLength(1);
    expect(hints[0].text()).toBe('82%');
  });

  it('senza hint: nessuno span extra', () => {
    const w = mount(SegmentedControl, {
      props: { modelValue: 'a', options: [{ value: 'a', label: 'Centro' }] },
    });
    expect(w.find('[data-test="seg-hint"]').exists()).toBe(false);
  });
});
