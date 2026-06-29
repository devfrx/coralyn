import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Badge from './Badge.vue';

describe('Badge', () => {
  it('rende il contenuto dello slot', () => {
    const w = mount(Badge, { slots: { default: 'Attivo' } });
    expect(w.text()).toContain('Attivo');
  });

  it('tone accent applica bg-[var(--color-accent-tint)]', () => {
    const w = mount(Badge, { props: { tone: 'accent' } });
    expect(w.classes().join(' ')).toContain('bg-[var(--color-accent-tint)]');
  });
});
