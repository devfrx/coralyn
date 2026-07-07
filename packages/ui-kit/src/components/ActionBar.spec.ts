import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ActionBar from './ActionBar.vue';

describe('ActionBar', () => {
  it('rende i figli in un flex row con default (align=end, gap=sm, no wrap)', () => {
    const w = mount(ActionBar, { slots: { default: '<button>A</button><button>B</button>' } });
    const cls = w.get('div').classes().join(' ');
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-end');
    expect(cls).toContain('gap-1.5');
    expect(cls).toContain('flex-nowrap');
    expect(w.findAll('button')).toHaveLength(2);
  });

  it('applica align e gap dalle prop', () => {
    const w = mount(ActionBar, { props: { align: 'between', gap: 'md' }, slots: { default: '<i/>' } });
    const cls = w.get('div').classes().join(' ');
    expect(cls).toContain('justify-between');
    expect(cls).toContain('gap-2.5');
  });

  it('applica justify-start con align=start', () => {
    const w = mount(ActionBar, { props: { align: 'start' }, slots: { default: '<i/>' } });
    expect(w.get('div').classes().join(' ')).toContain('justify-start');
  });

  it('consente il wrap con :wrap', () => {
    const w = mount(ActionBar, { props: { wrap: true }, slots: { default: '<i/>' } });
    expect(w.get('div').classes().join(' ')).toContain('flex-wrap');
  });
});
