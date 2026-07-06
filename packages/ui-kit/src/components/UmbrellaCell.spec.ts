import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UmbrellaCell from './UmbrellaCell.vue';

const base = {
  label: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, Mattina Prenotato, Pomeriggio Libero',
  slotStates: ['booked', 'free'] as const,
};

describe('UmbrellaCell', () => {
  it('è un button con aria-label testuale completa', () => {
    const btn = mount(UmbrellaCell, { props: { ...base } }).get('button');
    expect(btn.attributes('aria-label')).toContain('Mattina Prenotato');
    expect(btn.attributes('aria-label')).toContain('Pomeriggio Libero');
  });
  it("mostra l'etichetta", () => {
    expect(mount(UmbrellaCell, { props: { ...base } }).text()).toContain('8');
  });
  it('emette select al click', async () => {
    const w = mount(UmbrellaCell, { props: { ...base } });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeTruthy();
  });
  it('riflette la selezione (aria-pressed + ring)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, selected: true } });
    const btn = w.get('button');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.classes()).toContain('outline');
  });
  it('N=1: tinta piena (nessun conic-gradient)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-free)');
  });
  it('fasce tutte uguali: tinta piena (nessun conic-gradient anche per N=3)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'daily', 'daily'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-daily)');
  });
  it('N=3 stati misti: conic-gradient a spicchi (un colore per fascia)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free', 'daily', 'booked'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.bg).toContain('conic-gradient');
    expect(w.vm.bg).toContain('var(--color-state-free)');
    expect(w.vm.bg).toContain('var(--color-state-daily)');
    expect(w.vm.bg).toContain('var(--color-state-booked)');
  });
  it('slotStates vuoto: non lancia, tratta come una fascia libera', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: [] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.bg).toBe('var(--color-state-free)');
  });
});
