import { describe, it, expect, afterEach } from 'vitest';
import { mount, enableAutoUnmount } from '@vue/test-utils';
import type { SectorKind, StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import StructureRow from './StructureRow.vue';
import type { Selection } from './structureSelection';
import type { UmbrellaDrag } from './umbrellaMove';

enableAutoUnmount(afterEach);

const ROW: StructureRowDTO = {
  id: 'r-1', label: 'Fila 1', sortOrder: 1,
  umbrellas: [
    { id: 'u-1', label: 'A1', umbrellaTypeId: null },
    { id: 'u-2', label: 'A2', umbrellaTypeId: null },
    { id: 'u-3', label: 'A3', umbrellaTypeId: null },
  ],
};

interface RowProps {
  row: StructureRowDTO; sectorName: string; sectorKind: SectorKind; types: UmbrellaTypeDTO[];
  selection: Selection; selectMode: boolean; canManage: boolean; canDrag: boolean;
  dragging: UmbrellaDrag | null;
}
const base: RowProps = {
  row: ROW, sectorName: 'Centro', sectorKind: 'grid', types: [],
  selection: { kind: 'beach' }, selectMode: false, canManage: true, canDrag: true, dragging: null,
};

function mountRow(over: Partial<RowProps> = {}) {
  return mount(StructureRow, { props: { ...base, ...over } });
}

/**
 * jsdom restituisce rettangoli a ZERO: senza questo stub ogni cella starebbe in (0,0,0,0), la
 * geometria non verrebbe esercitata e i test direbbero verde per la ragione sbagliata — indice 0
 * sempre, qualunque sia il puntatore. Le misure sono quelle vere: cella 40px, gap 9px.
 */
function layout(w: ReturnType<typeof mountRow>): void {
  w.findAll('[data-testid="scene-cell"]').forEach((c, i) => {
    const left = i * 49;
    c.element.getBoundingClientRect = () =>
      ({ left, right: left + 40, top: 0, bottom: 40, x: left, y: 0, width: 40, height: 40, toJSON: () => ({}) }) as DOMRect;
  });
}

/** Trascinamento in arrivo da un'altra fila dello stesso settore. */
const FROM_ELSEWHERE: UmbrellaDrag = { umbrellaId: 'u-9', fromRowId: 'r-9', kind: 'grid' };
/** Trascinamento della prima cella di QUESTA fila. */
const FROM_HERE: UmbrellaDrag = { umbrellaId: 'u-1', fromRowId: 'r-1', kind: 'grid' };

describe('StructureRow — maniglia', () => {
  it('c’è una maniglia per ombrellone, e sta FUORI da scene-cell', () => {
    const w = mountRow();
    expect(w.findAll('[data-testid="drag-handle"]')).toHaveLength(3);
    // Il presidio che protegge le oltre 20 asserzioni che indicizzano questo selettore per
    // posizione: dentro la cella dev'esserci un solo bottone, quello dell'ombrellone.
    expect(w.findAll('[data-testid="scene-cell"] button')).toHaveLength(3);
    expect(w.findAll('[data-testid="scene-cell"] [data-testid="drag-handle"]')).toHaveLength(0);
  });

  it('non è focalizzabile e non è annunciata: non esiste equivalente da tastiera', () => {
    const handle = mountRow().find('[data-testid="drag-handle"]');
    expect(handle.element.tagName).toBe('SPAN');
    expect(handle.attributes('aria-hidden')).toBe('true');
    expect(handle.attributes('tabindex')).toBeUndefined();
    expect(handle.attributes('draggable')).toBe('true');
  });

  it('in modalità «Seleziona» la maniglia non si rende: lì ogni clic è additivo', () => {
    expect(mountRow({ selectMode: true }).findAll('[data-testid="drag-handle"]')).toHaveLength(0);
  });

  it('senza permesso di gestione non si rende', () => {
    expect(mountRow({ canManage: false }).findAll('[data-testid="drag-handle"]')).toHaveLength(0);
  });

  it('sotto lg non si rende, ma le celle restano: l’assenza è mirata', () => {
    const w = mountRow({ canDrag: false });
    expect(w.findAll('[data-testid="drag-handle"]')).toHaveLength(0);
    expect(w.findAll('[data-testid="scene-cell"]')).toHaveLength(3);
  });

  it('dragstart annuncia quale ombrellone e da quale fila', async () => {
    const w = mountRow();
    await w.findAll('[data-testid="drag-handle"]')[1].trigger('dragstart');
    expect(w.emitted('umbrella-drag-start')![0]).toEqual(['u-2', 'r-1']);
  });

  it('dragend chiude il trascinamento', async () => {
    const w = mountRow();
    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragend');
    expect(w.emitted('umbrella-drag-end')).toHaveLength(1);
  });
});

describe('StructureRow — rilascio', () => {
  it('da un’altra fila: l’indice esce dalla geometria, non dall’ordine DOM', async () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    // x=70 ha superato le metà di A1 (20) e A2 (69), non quella di A3 (118).
    await w.find('.st-cells').trigger('drop', { clientX: 70, clientY: 20 });
    expect(w.emitted('move-umbrella')![0]).toEqual(['u-9', 'r-1', 2]);
  });

  it('dalla STESSA fila: l’ombrellone trascinato non conta nel calcolo', async () => {
    const w = mountRow({ dragging: FROM_HERE });
    layout(w);
    // Escluso A1, restano le metà 69 e 118: x=70 ne ha superata una sola.
    await w.find('.st-cells').trigger('drop', { clientX: 70, clientY: 20 });
    expect(w.emitted('move-umbrella')![0]).toEqual(['u-1', 'r-1', 1]);
  });

  it('dragover segna il bersaglio, e il segno tiene conto della cella trascinata', async () => {
    const w = mountRow({ dragging: FROM_HERE });
    layout(w);
    await w.find('.st-cells').trigger('dragover', { clientX: 70, clientY: 20 });
    // Posizione 1 fra gli ALTRI, ma A1 è ancora reso: la barra va prima della terza cella.
    expect(w.findAll('.st-cell-slot')[2].classes()).toContain('st-drop-before');
    expect(w.find('.st-row').classes()).toContain('st-row-drop');
    expect(w.findAll('.st-cell-slot')[0].classes()).toContain('st-cell-dragged');
  });

  it('kind incompatibile: nessun rilascio, il server non deve nemmeno essere disturbato', async () => {
    const w = mountRow({ sectorKind: 'special', dragging: FROM_ELSEWHERE });
    layout(w);
    await w.find('.st-cells').trigger('dragover', { clientX: 70, clientY: 20 });
    await w.find('.st-cells').trigger('drop', { clientX: 70, clientY: 20 });
    expect(w.emitted('move-umbrella')).toBeUndefined();
    expect(w.find('.st-row').classes()).not.toContain('st-row-drop');
  });

  it('in modalità «Seleziona» il rilascio non passa', async () => {
    const w = mountRow({ selectMode: true, dragging: FROM_ELSEWHERE });
    layout(w);
    await w.find('.st-cells').trigger('drop', { clientX: 70, clientY: 20 });
    expect(w.emitted('move-umbrella')).toBeUndefined();
  });

  it('uscendo davvero il segno si toglie; passando da una cella all’altra no', async () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    const cells = w.find('.st-cells');
    await cells.trigger('dragover', { clientX: 70, clientY: 20 });
    // relatedTarget interno = si sta solo attraversando il contenitore.
    await cells.trigger('dragleave', { relatedTarget: w.findAll('[data-testid="scene-cell"]')[0].element });
    expect(w.find('.st-row').classes()).toContain('st-row-drop');
    await cells.trigger('dragleave', { relatedTarget: null });
    expect(w.find('.st-row').classes()).not.toContain('st-row-drop');
  });

  it('quando il trascinamento finisce altrove il segno sparisce comunque', async () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    await w.find('.st-cells').trigger('dragover', { clientX: 70, clientY: 20 });
    expect(w.find('.st-row').classes()).toContain('st-row-drop');
    // `dragend` scatta sulla SORGENTE: qui arriva solo l'azzeramento della prop.
    await w.setProps({ dragging: null });
    expect(w.find('.st-row').classes()).not.toContain('st-row-drop');
  });
});
