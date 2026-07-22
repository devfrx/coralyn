import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StructureScene from './StructureScene.vue';
import type { StructureSectorDTO } from '@coralyn/contracts';

const SECTORS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
      { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' },
    ] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
];
const base = { sectors: SECTORS, types: [], selectedSectorId: 's-1', selection: { kind: 'beach' } as const, selectMode: false, isAdmin: true };

const SECTORS_NO_ROWS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
];

const SECTORS_ROWS_NO_UMBRELLAS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
];

describe('StructureScene', () => {
  it('rende tab settori con conteggio posti e celle della fila', () => {
    const w = mount(StructureScene, { props: base });
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('2 posti');
    expect(w.findAll('[data-testid="scene-cell"]')).toHaveLength(2);
    expect(w.text()).toContain('FILA');
  });

  it('click cella → select-umbrella; shift+click → additive true', async () => {
    const w = mount(StructureScene, { props: base });
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    expect(w.emitted('select-umbrella')![0]).toEqual(['u-1', false]);
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    expect(w.emitted('select-umbrella')![1]).toEqual(['u-2', true]);
  });

  it('ghost: cella + → create-umbrella(rowId); fascia → create-row(sectorId); tab + → create-sector', async () => {
    const w = mount(StructureScene, { props: base });
    await w.find('[data-testid="ghost-cell"]').trigger('click');
    expect(w.emitted('create-umbrella')![0]).toEqual(['r-1']);
    await w.find('[data-testid="ghost-row"]').trigger('click');
    expect(w.emitted('create-row')![0]).toEqual(['s-1']);
    await w.find('[data-testid="ghost-sector"]').trigger('click');
    expect(w.emitted('create-sector')).toBeTruthy();
  });

  it('staff (isAdmin false): niente ghost né toggle Seleziona', () => {
    const w = mount(StructureScene, { props: { ...base, isAdmin: false } });
    expect(w.find('[data-testid="ghost-cell"]').exists()).toBe(false);
    expect(w.find('[data-testid="ghost-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="select-mode"]').exists()).toBe(false);
  });

  it('selezione: cella selected, multi evidenzia tutte le sue celle', () => {
    const w = mount(StructureScene, { props: { ...base, selection: { kind: 'multi', ids: ['u-1', 'u-2'] } } });
    const pressed = w.findAll('[data-testid="scene-cell"] button[aria-pressed="true"]');
    expect(pressed).toHaveLength(2);
  });

  it('spiaggia vuota → 3 passi; il passo attivo emette create-sector', async () => {
    const w = mount(StructureScene, { props: { ...base, sectors: [], selectedSectorId: null } });
    expect(w.text()).toContain('Costruiamo la tua spiaggia');
    expect(w.findAll('[data-testid="guided-step"]')).toHaveLength(3);
    await w.find('[data-testid="guided-step-active"]').trigger('click');
    expect(w.emitted('create-sector')).toBeTruthy();
  });

  it('settori senza file in tutto l\'albero → passo attivo 2, passo 1 completato; click → create-row col primo sectorId', async () => {
    const w = mount(StructureScene, { props: { ...base, sectors: SECTORS_NO_ROWS, selectedSectorId: 's-2' } });
    expect(w.text()).toContain('Costruiamo la tua spiaggia');
    const active = w.find('[data-testid="guided-step-active"]');
    expect(active.exists()).toBe(true);
    expect(active.text()).toContain('Aggiungi una fila');
    expect(w.findAll('[data-testid="guided-step-done"]')).toHaveLength(1);
    await active.trigger('click');
    expect(w.emitted('create-row')![0]).toEqual(['s-1']);
  });

  it('file senza ombrelloni in tutto l\'albero → passo attivo 3, passi 1-2 completati; click → select-row con la prima rowId', async () => {
    const w = mount(StructureScene, { props: { ...base, sectors: SECTORS_ROWS_NO_UMBRELLAS, selectedSectorId: 's-1' } });
    const active = w.find('[data-testid="guided-step-active"]');
    expect(active.exists()).toBe(true);
    expect(active.text()).toContain('Genera gli ombrelloni');
    expect(w.findAll('[data-testid="guided-step-done"]')).toHaveLength(2);
    await active.trigger('click');
    expect(w.emitted('select-row')![0]).toEqual(['r-1']);
  });

  it('albero con almeno un ombrellone → guidato non renderizzato, corpo normale sì', () => {
    const w = mount(StructureScene, { props: base });
    expect(w.find('[data-testid="guided-step"]').exists()).toBe(false);
    expect(w.findAll('[data-testid="scene-cell"]')).toHaveLength(2);
  });

  it('guidato visibile con settori presenti: sector-cap e ghost-row del settore corrente coesistono', () => {
    const w = mount(StructureScene, { props: { ...base, sectors: SECTORS_NO_ROWS, selectedSectorId: 's-1' } });
    expect(w.find('[data-testid="guided-step-active"]').exists()).toBe(true);
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('0 file');
    expect(w.find('[data-testid="ghost-row"]').exists()).toBe(true);
  });
});
