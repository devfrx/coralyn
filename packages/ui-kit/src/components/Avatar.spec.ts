import { mount } from '@vue/test-utils';
import Avatar from './Avatar.vue';
import { it, expect } from 'vitest';
it('mostra le iniziali e applica la size', () => {
  const w = mount(Avatar, { props: { iniziali: 'MR', size: 'lg' } });
  expect(w.text()).toBe('MR');
  expect(w.attributes('style')).toContain('60px');
});
