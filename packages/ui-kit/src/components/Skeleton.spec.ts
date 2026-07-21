import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Skeleton from './Skeleton.vue';

describe('Skeleton', () => {
  it('default line: aria-hidden, radius sm, altezza 0.75em, larghezza 100%', () => {
    const w = mount(Skeleton);
    const el = w.find('[data-test="skeleton"]');
    expect(el.exists()).toBe(true);
    expect(el.attributes('aria-hidden')).toBe('true');
    expect(el.classes()).toContain('rounded-[var(--radius-sm)]');
    expect(el.attributes('style')).toContain('height: 0.75em');
    expect(el.attributes('style')).toContain('width: 100%');
  });

  it('circle: radius full e 32px di lato', () => {
    const w = mount(Skeleton, { props: { variant: 'circle' } });
    const el = w.find('[data-test="skeleton"]');
    expect(el.classes()).toContain('rounded-[var(--radius-full)]');
    expect(el.attributes('style')).toContain('width: 32px');
    expect(el.attributes('style')).toContain('height: 32px');
  });

  it('block: 64px di altezza, larghezza piena', () => {
    const w = mount(Skeleton, { props: { variant: 'block' } });
    expect(w.find('[data-test="skeleton"]').attributes('style')).toContain('height: 64px');
  });

  it('width/height espliciti vincono sui default', () => {
    const w = mount(Skeleton, { props: { width: '120px', height: '18px' } });
    const style = w.find('[data-test="skeleton"]').attributes('style');
    expect(style).toContain('width: 120px');
    expect(style).toContain('height: 18px');
  });

  it('porta la classe shimmer e il bg token', () => {
    const el = mount(Skeleton).find('[data-test="skeleton"]');
    expect(el.classes()).toContain('skeleton-sheen');
    expect(el.classes()).toContain('bg-[var(--color-skeleton)]');
  });
});
