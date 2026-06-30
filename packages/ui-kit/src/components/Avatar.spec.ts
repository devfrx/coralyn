import { mount } from '@vue/test-utils';
import Avatar from './Avatar.vue';
import { it, expect } from 'vitest';
it('mostra le initials e applica la size', () => {
  const w = mount(Avatar, { props: { initials: 'MR', size: 'lg' } });
  expect(w.text()).toBe('MR');
  expect(w.attributes('style')).toContain('60px');
});
