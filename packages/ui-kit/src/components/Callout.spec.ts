import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Callout from './Callout.vue';

describe('Callout', () => {
  it('rende il contenuto e lo slot icona', () => {
    const w = mount(Callout, {
      slots: { default: 'Prelazione aperta', icon: '<svg data-test="ic"></svg>' },
    });
    expect(w.text()).toContain('Prelazione aperta');
    expect(w.find('[data-test="ic"]').exists()).toBe(true);
  });

  it('tone di default (warm) usa i token coral', () => {
    const w = mount(Callout, { slots: { default: 'x' } });
    const cls = w.classes().join(' ');
    expect(cls).toContain('bg-[var(--color-coral-050)]');
    expect(cls).toContain('text-[var(--color-coral-700)]');
  });

  it('tone accent usa i token accent', () => {
    const w = mount(Callout, { props: { tone: 'accent' }, slots: { default: 'x' } });
    expect(w.classes().join(' ')).toContain('bg-[var(--color-accent-tint)]');
  });
});
