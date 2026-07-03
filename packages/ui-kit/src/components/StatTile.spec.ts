import { describe, it, expect } from 'vitest';
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
