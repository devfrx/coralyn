import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UmbrellaCell from './UmbrellaCell.vue';

const base = {
  label: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, mattina prenotato, pomeriggio libero',
  morningState: 'booked' as const,
  afternoonState: 'free' as const,
};

describe('UmbrellaCell', () => {
  it('è un button con aria-label testuale completa', () => {
    const btn = mount(UmbrellaCell, { props: base }).get('button');
    expect(btn.attributes('aria-label')).toContain('mattina prenotato');
    expect(btn.attributes('aria-label')).toContain('pomeriggio libero');
  });
  it('mostra l\'etichetta', () => {
    expect(mount(UmbrellaCell, { props: base }).text()).toContain('8');
  });
  it('emette select al click', async () => {
    const w = mount(UmbrellaCell, { props: base });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeTruthy();
  });
  it('riflette la selezione (aria-pressed + ring)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, selected: true } });
    const btn = w.get('button');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.classes()).toContain('outline');
  });
});
