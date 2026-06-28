import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import OmbrelloneCell from './OmbrelloneCell.vue';

const base = {
  etichetta: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, mattina prenotato, pomeriggio libero',
  statoMattina: 'prenotato' as const,
  statoPomeriggio: 'libero' as const,
};

describe('OmbrelloneCell', () => {
  it('è un button con aria-label testuale completa', () => {
    const btn = mount(OmbrelloneCell, { props: base }).get('button');
    expect(btn.attributes('aria-label')).toContain('mattina prenotato');
    expect(btn.attributes('aria-label')).toContain('pomeriggio libero');
  });
  it('mostra l\'etichetta', () => {
    expect(mount(OmbrelloneCell, { props: base }).text()).toContain('8');
  });
  it('emette select al click', async () => {
    const w = mount(OmbrelloneCell, { props: base });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeTruthy();
  });
  it('riflette la selezione (aria-pressed + ring)', () => {
    const w = mount(OmbrelloneCell, { props: { ...base, selezionato: true } });
    const btn = w.get('button');
    expect(btn.attributes('aria-pressed')).toBe('true');
    expect(btn.classes()).toContain('outline');
  });
});
