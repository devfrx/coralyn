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
  layoutAt(w, w.findAll('[data-testid="scene-cell"]').map((_, i): [number, number] => [i * 49, 0]));
}

/** Lo stesso, con l'angolo di ogni cella dato per esteso: serve alle geometrie che vanno a capo. */
function layoutAt(w: ReturnType<typeof mountRow>, at: [number, number][]): void {
  w.findAll('[data-testid="scene-cell"]').forEach((c, i) => {
    const [left, top] = at[i];
    c.element.getBoundingClientRect = () =>
      ({ left, right: left + 40, top, bottom: top + 40, x: left, y: top, width: 40, height: 40, toJSON: () => ({}) }) as DOMRect;
  });
}

/**
 * `trigger` costruisce l'evento e lo butta via: `defaultPrevented` si legge solo sull'oggetto vero.
 * `cancelable` e' obbligatorio, altrimenti `preventDefault` e' un no-op e l'asserzione sarebbe verde
 * per la ragione sbagliata.
 */
function dispatchDragOver(w: ReturnType<typeof mountRow>, clientX: number, clientY: number): Event {
  const e = new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX, clientY });
  w.find('.st-cells').element.dispatchEvent(e);
  return e;
}

/** Trascinamento in arrivo da un'altra fila dello stesso settore. */
const FROM_ELSEWHERE: UmbrellaDrag = { umbrellaId: 'u-9', fromRowId: 'r-9', kind: 'grid' };
/** Trascinamento della prima cella di QUESTA fila. */
const FROM_HERE: UmbrellaDrag = { umbrellaId: 'u-1', fromRowId: 'r-1', kind: 'grid' };
/** Trascinamento dell'ULTIMA cella di questa fila: l'indice della barra di coda e il suo coincidono. */
const LAST_FROM_HERE: UmbrellaDrag = { umbrellaId: 'u-3', fromRowId: 'r-1', kind: 'grid' };

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
    expect(w.findAll('[data-testid="scene-cell"]')[0].classes()).toContain('st-cell-dragged');
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

describe('StructureRow — il rilascio sotto le celle', () => {
  it('la banda della ghost «+» chiede la CODA, non la testa della riga sopra', async () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    // Celle tutte sulla prima riga (bottom 40). y=60 e' la banda che la ghost «+» apre andando a
    // capo da sola: zona di rilascio senza una cella dentro. x=5 sta a sinistra di ogni meta', ed e'
    // il punto esatto in cui ripiegare sulla riga sopra farebbe uscire la TESTA della fila.
    await w.find('.st-cells').trigger('drop', { clientX: 5, clientY: 60 });
    expect(w.emitted('move-umbrella')![0]).toEqual(['u-9', 'r-1', 3]);
  });

  it('la barra mostra lo stesso posto che il rilascio scrive', async () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    const cells = w.find('.st-cells');
    await cells.trigger('dragover', { clientX: 5, clientY: 60 });
    expect(w.findAll('.st-cell-slot')[2].classes()).toContain('st-drop-after');
    await cells.trigger('drop', { clientX: 5, clientY: 60 });
    expect(w.emitted('move-umbrella')![0][2]).toBe(3);
  });

  it('la cella trascinata sola sull’ultima riga: rilasciarla dov’è la lascia in coda', async () => {
    const w = mountRow({ dragging: LAST_FROM_HERE });
    layoutAt(w, [[0, 0], [49, 0], [0, 49]]);
    // A3 e' esclusa dai rect ma occupa ancora la sua riga: sotto i superstiti (bottom 40) c'e' solo
    // lei, e rilasciarla dov'e' gia' non deve mandarla in testa.
    await w.find('.st-cells').trigger('drop', { clientX: 5, clientY: 60 });
    expect(w.emitted('move-umbrella')![0]).toEqual(['u-3', 'r-1', 2]);
  });
});

describe('StructureRow — la firma del bersaglio valido', () => {
  it('su una fila compatibile il dragover è cancellato: senza, il browser non emette mai drop', () => {
    const w = mountRow({ dragging: FROM_ELSEWHERE });
    layout(w);
    expect(dispatchDragOver(w, 70, 20).defaultPrevented).toBe(true);
  });

  it('su un kind incompatibile NON è cancellato: quella fila non è un bersaglio', () => {
    const w = mountRow({ sectorKind: 'special', dragging: FROM_ELSEWHERE });
    layout(w);
    expect(dispatchDragOver(w, 70, 20).defaultPrevented).toBe(false);
  });
});

describe('StructureRow — la barra di coda', () => {
  it('trascinando l’ultima cella la barra c’è, e non sbiadisce insieme alla cella', async () => {
    const w = mountRow({ dragging: LAST_FROM_HERE });
    layout(w);
    // Escluso A3 restano le meta' 20 e 69: x=200 le supera entrambe, quindi la coda.
    await w.find('.st-cells').trigger('dragover', { clientX: 200, clientY: 20 });
    const slots = w.findAll('.st-cell-slot');
    expect(slots[2].classes()).toContain('st-drop-after');
    // Le due classi non stanno piu' sullo stesso elemento: `opacity: .4` sullo slot si applicherebbe
    // anche al suo `::after`, cioe' alla barra.
    expect(slots[2].classes()).not.toContain('st-cell-dragged');
    expect(w.findAll('[data-testid="scene-cell"]')[2].classes()).toContain('st-cell-dragged');
  });
});
