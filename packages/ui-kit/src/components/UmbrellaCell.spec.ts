import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UmbrellaCell from './UmbrellaCell.vue';

const base = {
  label: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, Mattina Prenotato, Pomeriggio Libero',
  slotStates: ['booked', 'free'] as const,
};

describe('UmbrellaCell (Tessera)', () => {
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
  it('inoltra il MouseEvent nativo su select (per rilevare shift+clic a monte)', async () => {
    const w = mount(UmbrellaCell, { props: { ...base } });
    await w.get('button').trigger('click', { shiftKey: true });
    const payload = w.emitted('select')![0][0] as MouseEvent;
    expect(payload).toBeInstanceOf(MouseEvent);
    expect(payload.shiftKey).toBe(true);
  });
  it('riflette la selezione (aria-pressed + ring)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, selected: true } });
    const btn = w.get('button');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.classes()).toContain('outline');
  });
  it('N=1: una sola colonna piena', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-free)']);
  });
  it('fasce tutte uguali: uniforme anche per N=3', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'daily', 'daily'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-daily)']);
  });
  it('N=3 misti: una colonna per fascia NELL\'ORDINE delle fasce (prima a sinistra)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['free', 'daily', 'booked'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.fills).toEqual([
      'var(--color-state-free)', 'var(--color-state-daily)', 'var(--color-state-booked)',
    ]);
  });
  it('slotStates vuoto: non lancia, tratta come una fascia libera', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: [] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-free)']);
  });
  it('la fascia coperta è una colonna col colore neutro', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['daily', 'covered'] } });
    expect(w.vm.uniform).toBe(false);
    expect(w.vm.fills).toEqual(['var(--color-state-daily)', 'var(--color-state-covered)']);
  });
  it('N=1 coperta: colonna piena neutra', () => {
    const w = mount(UmbrellaCell, { props: { ...base, slotStates: ['covered'] } });
    expect(w.vm.uniform).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-state-covered)']);
  });
  it('dimmed: il wrapper si attenua (filtro legenda)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, dimmed: true } });
    expect(w.classes()).toContain('opacity-25');
  });
  it('found: il button porta l\'animazione di impulso (ricerca)', () => {
    const w = mount(UmbrellaCell, { props: { ...base, found: true } });
    expect(w.get('button').attributes('class')).toContain('cell-found');
  });
  it('typeIcon: rende il marcatore tipologia', () => {
    const w = mount(UmbrellaCell, { props: { ...base, typeIcon: 'palmtree' } });
    expect(w.find('[data-test="type-badge"]').exists()).toBe(true);
  });
  it('senza slotStates → resa «rest»: fill sabbia neutra e ink editor', () => {
    const w = mount(UmbrellaCell, { props: { label: 'A1', ariaLabel: 'Ombrellone A1' } });
    expect(w.vm.rest).toBe(true);
    expect(w.vm.fills).toEqual(['var(--color-warm-025)']);
  });
  it('slotStates presente → rest false, resa stato invariata', () => {
    const w = mount(UmbrellaCell, { props: { label: 'A1', ariaLabel: 'x', slotStates: ['free', 'daily'] } });
    expect(w.vm.rest).toBe(false);
    expect(w.vm.fills).toEqual(['var(--color-state-free)', 'var(--color-state-daily)']);
  });
});
