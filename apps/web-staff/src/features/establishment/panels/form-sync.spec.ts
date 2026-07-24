import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import SectorPanel from './SectorPanel.vue';
import RowPanel from './RowPanel.vue';
import UmbrellaPanel from './UmbrellaPanel.vue';

enableAutoUnmount(afterEach);

const TYPES: UmbrellaTypeDTO[] = [{ id: 'typ-1', name: 'Gazebo', sortOrder: 1, icon: 'palmtree' }];
const input = (w: ReturnType<typeof mountApp>, testid: string) =>
  (w.find(`[data-testid="${testid}"]`).element as HTMLInputElement).value;

// I pannelli dell'ispettore non sono key-ati: la stessa istanza riceve via props sia i refetch
// (oggetti NUOVI con lo STESSO id — ogni mutation invalida la query struttura) sia i cambi di
// selezione (id diverso). Il sync del form deve scattare solo nel secondo caso: un watch
// sull'identità oggetto azzererebbe le bozze dell'utente a ogni refetch.
describe('pannelli form — sync per id, non per identità oggetto', () => {
  it('UmbrellaPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(UmbrellaPanel, { props: {
      umbrella: { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      rowLabel: 'Fila 1', sectorName: 'Centro', types: TYPES, isAdmin: true,
    } });
    await w.find('[data-testid="umbrella-label"]').setValue('A1-bozza');
    await w.setProps({ umbrella: { id: 'u-1', label: 'A1', umbrellaTypeId: null } }); // refetch: oggetto nuovo, stesso id
    expect(input(w, 'umbrella-label')).toBe('A1-bozza');
    await w.setProps({ umbrella: { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' } }); // entità diversa
    expect(input(w, 'umbrella-label')).toBe('A2');
    expect(w.get('[data-testid="umbrella-type"]').text()).toContain('Gazebo');
  });

  it('RowPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(RowPanel, { props: {
      row: { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
      sectorName: 'Centro', types: TYPES, isAdmin: true,
    } });
    await w.find('[data-testid="row-label"]').setValue('Fila 1-bozza');
    await w.setProps({ row: { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] } });
    expect(input(w, 'row-label')).toBe('Fila 1-bozza');
    await w.setProps({ row: { id: 'r-2', label: 'Fila 2', sortOrder: 2, umbrellas: [] } });
    expect(input(w, 'row-label')).toBe('Fila 2');
  });

  it('SectorPanel: refetch stesso id → bozza preservata; id diverso → form resettato', async () => {
    const w = mountApp(SectorPanel, { props: {
      sector: { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] }, isAdmin: true,
    } });
    await w.find('[data-testid="sector-name"]').setValue('Centro-bozza');
    await w.setProps({ sector: { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] } });
    expect(input(w, 'sector-name')).toBe('Centro-bozza');
    await w.setProps({ sector: { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] } });
    expect(input(w, 'sector-name')).toBe('Speciali');
    expect(w.get('[data-testid="sector-kind"]').text()).toContain('Speciali: posti fuori griglia');
  });
});
