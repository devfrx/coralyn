import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StatTile from './StatTile.vue';

describe('StatTile', () => {
  it('rende value e label', () => {
    const w = mount(StatTile, { props: { value: '€ 540.00', label: 'Saldo' } });
    expect(w.text()).toContain('€ 540.00');
    expect(w.text()).toContain('Saldo');
  });

  it('default (value-first, tone default): il valore usa il colore testo standard', () => {
    const w = mount(StatTile, { props: { value: '10', label: 'X' } });
    expect(w.html()).toContain('text-[var(--color-text)]');
  });

  it('tone accent colora il valore col brand', () => {
    const w = mount(StatTile, { props: { value: '10', label: 'X', tone: 'accent' } });
    expect(w.html()).toContain('text-[var(--color-brand-ink)]');
  });

  it('layout label-first mette la label prima del valore nel DOM', () => {
    const w = mount(StatTile, { props: { value: 'V', label: 'L', layout: 'label-first' } });
    const html = w.html();
    expect(html.indexOf('L')).toBeLessThan(html.indexOf('V'));
  });
});

describe('StatTile — loading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dopo il delay il valore è uno skeleton, la label resta reale, aria-busy sul tile', async () => {
    const w = mount(StatTile, { props: { label: 'Ombrelloni', loading: true } });
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false); // pre-delay
    await vi.advanceTimersByTimeAsync(150);
    await w.vm.$nextTick();
    expect(w.find('[data-test="skeleton"]').exists()).toBe(true);
    expect(w.text()).toContain('Ombrelloni');
    expect(w.attributes('aria-busy')).toBe('true');
  });

  it('senza loading rende il valore come sempre', () => {
    const w = mount(StatTile, { props: { label: 'File', value: '12' } });
    expect(w.text()).toContain('12');
    expect(w.find('[data-test="skeleton"]').exists()).toBe(false);
  });
});
