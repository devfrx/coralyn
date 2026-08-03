import { describe, it, expect, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import BeachPanel from './BeachPanel.vue';

enableAutoUnmount(afterEach);

const DATA: EstablishmentStructureDTO = {
  sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [] }],
  umbrellaTypes: [],
};

describe('BeachPanel — l icona della tipologia si sceglie dal catalogo', () => {
  it('la form apre il picker, non una Select a tre voci', async () => {
    const w = mountApp(BeachPanel, { props: { data: DATA, canManage: true }, attachTo: document.body });
    await w.get('[data-testid="type-new"]').trigger('click');
    expect(w.find('[data-testid="icon-picker-trigger"]').exists()).toBe(true);
    expect(w.find('[data-testid="type-icon"]').exists()).toBe(false); // la Select non c'e' piu'
  });

  it('riaprendo in modifica NON riporta a ombrellone un icona fuori dai tre nomi vecchi', async () => {
    // Il ramo che lo Step 4 riscrive: se `openEdit` continuasse a normalizzare cio' che non
    // riconosce, riaprire una tipologia con `anchor` la riporterebbe a `umbrella`, e il salvataggio
    // successivo sovrascriverebbe la scelta dell'operatore senza dirglielo.
    const DATI = {
      ...DATA,
      umbrellaTypes: [{ id: 't-1', name: 'Gazebo', sortOrder: 1, icon: 'anchor' }],
    };
    const w = mountApp(BeachPanel, { props: { data: DATI, canManage: true }, attachTo: document.body });
    await w.get('[data-testid="type-edit"]').trigger('click');
    expect(w.get('[data-testid="icon-picker-trigger"]').text()).toContain('anchor');
  });
});
