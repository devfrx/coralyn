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
});
