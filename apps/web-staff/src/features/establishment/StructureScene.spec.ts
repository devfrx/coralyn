import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import StructureScene from './StructureScene.vue';
import type { StructureSectorDTO } from '@coralyn/contracts';

// Idempotente con i test che chiamano già w.unmount() — vedi il commento esteso in
// EstablishmentStructureView.spec.ts (obbligatorio negli spec che montano con attachTo).
enableAutoUnmount(afterEach);

const SECTORS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
      { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' },
    ] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [] },
];
const base = { sectors: SECTORS, types: [], selectedSectorId: 's-1', selection: { kind: 'beach' } as const, selectMode: false, canManage: true, canDrag: true };

const SECTORS_NO_ROWS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [] },
];

const SECTORS_ROWS_NO_UMBRELLAS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [] },
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

  it('staff (canManage false): niente ghost né toggle Seleziona', () => {
    const w = mount(StructureScene, { props: { ...base, canManage: false } });
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

  it('tablist APG: contiene solo i tab; roving tabindex sul selezionato', () => {
    const w = mount(StructureScene, { props: base });
    const tablist = w.find('[role="tablist"]');
    expect(tablist.findAll('button')).toHaveLength(2); // solo i 2 settori: ghost e Seleziona fuori
    const tabs = w.findAll('[role="tab"]');
    expect(tabs[0].attributes('tabindex')).toBe('0');  // s-1 selezionato
    expect(tabs[1].attributes('tabindex')).toBe('-1');
  });

  it('D-057: i tab controllano la sabbia (aria-controls) e la sabbia è il tabpanel etichettato dal tab attivo', () => {
    const w = mount(StructureScene, { props: base });
    const sand = w.find('[data-testid="scene-sand"]');
    expect(sand.attributes('role')).toBe('tabpanel');
    expect(sand.attributes('id')).toBe('st-tabpanel');
    expect(sand.attributes('aria-labelledby')).toBe('st-tab-s-1');
    const tabs = w.findAll('[role="tab"]');
    expect(tabs[0].attributes('id')).toBe('st-tab-s-1');
    expect(tabs[0].attributes('aria-controls')).toBe('st-tabpanel');
    expect(tabs[1].attributes('aria-controls')).toBe('st-tabpanel');
  });

  it('D-057: senza settori la sabbia non è un tabpanel orfano', () => {
    const w = mount(StructureScene, { props: { ...base, sectors: [], selectedSectorId: null } });
    const sand = w.find('[data-testid="scene-sand"]');
    expect(sand.attributes('role')).toBeUndefined();
    expect(sand.attributes('aria-labelledby')).toBeUndefined();
  });

  it('tablist APG: frecce con wrap e Home/End spostano selezione e fuoco', async () => {
    const w = mount(StructureScene, { props: base, attachTo: document.body });
    const tabs = w.findAll('[role="tab"]');
    await tabs[0].trigger('keydown', { key: 'ArrowRight' });
    expect(w.emitted('select-sector')![0]).toEqual(['s-2']);
    expect(document.activeElement).toBe(tabs[1].element);
    await tabs[1].trigger('keydown', { key: 'ArrowRight' }); // wrap → primo
    expect(w.emitted('select-sector')![1]).toEqual(['s-1']);
    await tabs[0].trigger('keydown', { key: 'End' });
    expect(w.emitted('select-sector')![2]).toEqual(['s-2']);
    expect(document.activeElement).toBe(tabs[1].element);
    w.unmount();
  });
});

// La sabbia rende UN SOLO settore per volta (`current`), quindi le file di un altro settore non
// sono nel DOM e nessun rilascio puo' raggiungerle: senza la molla lo spostamento fra settori
// sarebbe capacita' dell'API senza alcun percorso nel prodotto.
const SECTORS_SPRING: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [{ id: 'u-1', label: 'A1', umbrellaTypeId: null }] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [] },
  { id: 's-3', name: 'Levante', sortOrder: 3, kind: 'grid', hasDedicatedRates: false, rows: [
    { id: 'r-3', label: 'Fila 3', sortOrder: 1, umbrellas: [] },
  ] },
];
const springBase = { ...base, sectors: SECTORS_SPRING };

// Gemella del presidio su «prima linea» in MapView.spec.ts. È la dichiarazione che l'ordine delle
// file non è un elenco ma una distanza dal mare: da D-038 quell'ordine si cambia con un gesto,
// quindi la promessa è verificabile a runtime e va verificata. Copertura precedente: zero righe.
describe('StructureScene — la semantica dell’ordine è dichiarata', () => {
  it('la didascalia del settore lega l’ordine delle file alla distanza dal mare', () => {
    const w = mount(StructureScene, { props: base });
    // Sulla frase, non sulla punteggiatura: è la CLAIM a dover restare, non la sua forma esatta.
    expect(w.get('.st-sector-cap').text()).toMatch(/più in alto.*più vicine al mare/);
  });

  it('la didascalia c’è per ogni settore aperto, non solo per il primo', () => {
    const w = mount(StructureScene, { props: { ...base, selectedSectorId: 's-2' } });
    expect(w.get('.st-sector-cap').text()).toMatch(/più in alto.*più vicine al mare/);
  });
});

describe('StructureScene — tab a molla (D-038)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function scene() {
    return mount(StructureScene, { props: springBase });
  }
  const grab = (w: ReturnType<typeof scene>) => w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');

  it('sostare su un tab compatibile lo apre, ma solo dopo l’attesa', async () => {
    const w = scene();
    await grab(w);
    await w.findAll('[role="tab"]')[2].trigger('dragover');
    expect(w.findAll('[role="tab"]')[2].classes()).toContain('st-tab-spring');
    expect(w.emitted('select-sector')).toBeUndefined();
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')![0]).toEqual(['s-3']);
  });

  it('su un settore di kind diverso la molla NON scatta: là nessun rilascio sarebbe legale', async () => {
    const w = scene();
    await grab(w);
    await w.findAll('[role="tab"]')[1].trigger('dragover'); // «Speciali»
    expect(w.findAll('[role="tab"]')[1].classes()).not.toContain('st-tab-spring');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('senza trascinamento in corso il tab resta un tab', async () => {
    const w = scene();
    await w.findAll('[role="tab"]')[2].trigger('dragover');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('il tab già aperto non scatta', async () => {
    const w = scene();
    await grab(w);
    await w.findAll('[role="tab"]')[0].trigger('dragover');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('uscendo prima dell’attesa la molla si annulla', async () => {
    const w = scene();
    await grab(w);
    await w.findAll('[role="tab"]')[2].trigger('dragover');
    await w.findAll('[role="tab"]')[2].trigger('dragleave');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('se il trascinamento finisce, la molla pendente non apre più nulla', async () => {
    const w = scene();
    await grab(w);
    await w.findAll('[role="tab"]')[2].trigger('dragover');
    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragend');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('il rilascio risale dalla fila alla scena', async () => {
    const w = scene();
    await grab(w);
    await w.find('.st-cells').trigger('drop', { clientX: 0, clientY: 0 });
    expect(w.emitted('move-umbrella')![0]).toEqual(['u-1', 'r-1', 0]);
  });

  it('il rilascio sul tab non scrive nulla, annulla il default, e la molla non sopravvive al dragend che segue', async () => {
    const w = scene();
    await grab(w);
    const tab = w.findAll('[role="tab"]')[2];
    await tab.trigger('dragover'); // arma la molla
    // `trigger` costruisce l'evento e lo butta via: `defaultPrevented` si legge solo sull'oggetto vero
    // (stesso accorgimento di `dispatchDragOver` in StructureRow.spec.ts).
    const event = new MouseEvent('drop', { bubbles: true, cancelable: true });
    tab.element.dispatchEvent(event);
    expect(w.emitted('move-umbrella')).toBeUndefined();
    expect(event.defaultPrevented).toBe(true);
    // `onTabDrop` non tocca `springTimer`/`springSectorId`: la pulizia arriva da `dragend`, che
    // scatta SEMPRE sulla sorgente a fine trascinamento (WHATWG), qui simulato per chiudere davvero
    // il cerchio invece di darlo per assunto.
    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragend');
    vi.advanceTimersByTime(1000);
    expect(tab.classes()).not.toContain('st-tab-spring');
    expect(w.emitted('select-sector')).toBeUndefined();
  });

  it('attraversare lo <span> «N posti» dentro il tab non annulla la molla; uscire davvero sì', async () => {
    const w = scene();
    await grab(w);
    const tab = w.findAll('[role="tab"]')[2];
    await tab.trigger('dragover');
    expect(tab.classes()).toContain('st-tab-spring');
    // Il figlio del bottone e' proprio lo <span> «N posti»: relatedTarget interno = non e' un'uscita.
    await tab.trigger('dragleave', { relatedTarget: tab.get('span').element });
    expect(tab.classes()).toContain('st-tab-spring');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')![0]).toEqual(['s-3']);
  });

  it('uscendo davvero dal tab (relatedTarget esterno) la molla si annulla', async () => {
    const w = scene();
    await grab(w);
    const tab = w.findAll('[role="tab"]')[2];
    await tab.trigger('dragover');
    await tab.trigger('dragleave', { relatedTarget: null });
    expect(tab.classes()).not.toContain('st-tab-spring');
    vi.advanceTimersByTime(1000);
    expect(w.emitted('select-sector')).toBeUndefined();
  });
});
