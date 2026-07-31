import { describe, expect, it } from 'vitest';
import type { StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';
import { applyMove, isCompatible, moveTargets, positionOptions, targetIndex, type CellRect } from './umbrellaMove';

// Misure prese dal CSS vero: in `structure-scene.css` la regola `.st-cells` ha `gap: 9px` e la cella
// è 40x40 come la regola `.st-ghost-cell`. Scriverle qui rende i numeri dei test leggibili come una
// pianta. I rimandi citano il SELETTORE e non il numero di riga: D-074 ha aggiunto sette righi di
// commento a quel file e i numeri, che erano esatti, hanno smesso di esserlo tutti insieme.
const SIZE = 40;
const GAP = 9;
const STEP = SIZE + GAP;

/** Cella alla colonna `col` della riga visiva `line`. */
function cell(col: number, line: number): CellRect {
  const left = col * STEP;
  const top = line * STEP;
  return { left, right: left + SIZE, top, bottom: top + SIZE };
}

/** Riga singola da tre celle: metà orizzontali a 20, 69, 118. */
const THREE = [cell(0, 0), cell(1, 0), cell(2, 0)];
/** Due righe visive da tre celle: la seconda parte a y=49 e finisce a y=89. */
const WRAPPED = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1), cell(2, 1)];

describe('isCompatible', () => {
  it.each([
    ['grid', 'grid', true],
    ['special', 'special', true],
    ['grid', 'special', false],
    ['special', 'grid', false],
  ] as const)('%s → %s = %s', (from, to, expected) => {
    expect(isCompatible(from, to)).toBe(expected);
  });
});

describe('targetIndex', () => {
  it('fila vuota → 0, l’unica posizione che esiste', () => {
    expect(targetIndex([], { x: 500, y: 500 })).toBe(0);
  });

  describe('riga singola', () => {
    it.each([
      ['prima di tutte', 5, 0],
      ['sulla prima metà della cella 0', 15, 0],
      ['oltre la metà della cella 0', 25, 1],
      ['oltre la metà della cella 1', 70, 2],
      ['oltre l’ultima cella', 300, 3],
    ])('%s → %i', (_label, x, expected) => {
      expect(targetIndex(THREE, { x, y: 20 })).toBe(expected);
    });

    it('esattamente sulla metà: conta come oltrepassata, niente punto morto', () => {
      expect(targetIndex(THREE, { x: 20, y: 20 })).toBe(1);
    });
  });

  describe('sopra e sotto la fila', () => {
    it('sopra la prima riga: la X decide comunque', () => {
      expect(targetIndex(THREE, { x: 300, y: -400 })).toBe(3);
      expect(targetIndex(THREE, { x: 5, y: -400 })).toBe(0);
    });

    it('sotto l’ultima riga: si aggancia all’ultima e la X decide', () => {
      expect(targetIndex(WRAPPED, { x: 5, y: 900 })).toBe(3);
      expect(targetIndex(WRAPPED, { x: 300, y: 900 })).toBe(6);
    });
  });

  // `.st-cells` è flex-wrap: appena la fila è lunga le righe visive sono più d'una, e l'indice di
  // cella smette di avere relazione con la posizione orizzontale. È il caso che un test su una
  // riga sola non vedrebbe mai.
  describe('flex-wrap su più righe', () => {
    it('seconda riga, prima di tutte → 3 e non 0', () => {
      expect(targetIndex(WRAPPED, { x: 5, y: 60 })).toBe(3);
    });

    it('seconda riga, in mezzo → l’offset della riga si somma alla X', () => {
      expect(targetIndex(WRAPPED, { x: 70, y: 60 })).toBe(5);
    });

    it('seconda riga, oltre l’ultima → 6, la coda della fila', () => {
      expect(targetIndex(WRAPPED, { x: 300, y: 60 })).toBe(6);
    });

    it('fine della prima riga e inizio della seconda sono lo STESSO punto d’inserimento', () => {
      expect(targetIndex(WRAPPED, { x: 300, y: 20 })).toBe(3);
      expect(targetIndex(WRAPPED, { x: 5, y: 60 })).toBe(3);
    });

    it('nel gap fra le due righe: si sceglie la più vicina, non si cade nel vuoto', () => {
      // gap [40, 49]: y=43 dista 3 dalla prima e 6 dalla seconda → prima riga.
      expect(targetIndex(WRAPPED, { x: 300, y: 43 })).toBe(3);
      // y=46 dista 6 dalla prima e 3 dalla seconda → seconda riga.
      expect(targetIndex(WRAPPED, { x: 5, y: 46 })).toBe(3);
      // Stesso indice per ragioni opposte: qui la X separa i due casi.
      expect(targetIndex(WRAPPED, { x: 300, y: 46 })).toBe(6);
    });

    it('ultima riga incompleta: la coda è la lunghezza della fila', () => {
      const incomplete = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1)];
      expect(targetIndex(incomplete, { x: 300, y: 60 })).toBe(4);
      expect(targetIndex(incomplete, { x: 5, y: 60 })).toBe(3);
    });
  });
});

describe('applyMove', () => {
  const umb = (id: string) => ({ id, label: id, umbrellaTypeId: null });
  const tree = (): StructureSectorDTO[] => [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('B'), umb('C')] },
      { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [umb('D'), umb('E')] },
    ] },
    { id: 's-2', name: 'Levante', sortOrder: 2, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-3', label: 'F3', sortOrder: 1, umbrellas: [umb('F')] },
    ] },
  ];
  const labels = (sectors: StructureSectorDTO[], rowId: string): string[] =>
    sectors.flatMap((s) => s.rows).find((r) => r.id === rowId)!.umbrellas.map((u) => u.id);

  /** Riordino atteso: `position` e' l'indice FINALE, esattamente come lo intende l'API. */
  function arrayMove(ids: string[], from: number, to: number): string[] {
    const out = [...ids];
    out.splice(to, 0, ...out.splice(from, 1));
    return out;
  }

  // La stessa proprieta' provata sul piano di scrittura del server: se le due semantiche
  // divergessero, l'anteprima mostrerebbe una disposizione che il refetch poi smentisce.
  it('stessa fila: ogni (da, a) coincide con un array-move, come lato server', () => {
    for (let from = 0; from < 3; from++) {
      for (let to = 0; to < 3; to++) {
        const moved = ['A', 'B', 'C'][from];
        expect({ from, to, seq: labels(applyMove(tree(), moved, 'r-1', to), 'r-1') })
          .toEqual({ from, to, seq: arrayMove(['A', 'B', 'C'], from, to) });
      }
    }
  });

  it('altra fila dello stesso settore: la fila d’origine perde l’ombrellone e la destinazione lo inserisce', () => {
    const after = applyMove(tree(), 'A', 'r-2', 1);
    expect(labels(after, 'r-1')).toEqual(['B', 'C']);
    expect(labels(after, 'r-2')).toEqual(['D', 'A', 'E']);
  });

  it('altro settore: l’ombrellone attraversa il confine', () => {
    const after = applyMove(tree(), 'B', 'r-3', 0);
    expect(labels(after, 'r-1')).toEqual(['A', 'C']);
    expect(labels(after, 'r-3')).toEqual(['B', 'F']);
  });

  it('in coda: la posizione oltre l’ultimo mette in fondo', () => {
    expect(labels(applyMove(tree(), 'D', 'r-1', 3), 'r-1')).toEqual(['A', 'B', 'C', 'D']);
  });

  it('id sconosciuto: albero invariato, l’anteprima non è il posto dove far fallire qualcosa', () => {
    const after = applyMove(tree(), 'ignoto', 'r-1', 0);
    expect(labels(after, 'r-1')).toEqual(['A', 'B', 'C']);
    expect(labels(after, 'r-2')).toEqual(['D', 'E']);
  });

  it('non muta l’albero in ingresso: la cache di TanStack non va scritta a mano', () => {
    const before = tree();
    applyMove(before, 'A', 'r-2', 0);
    expect(labels(before, 'r-1')).toEqual(['A', 'B', 'C']);
    expect(labels(before, 'r-2')).toEqual(['D', 'E']);
  });
});

describe('moveTargets', () => {
  const misto = (): StructureSectorDTO[] => [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [] },
      { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [] },
    ] },
    { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', hasDedicatedRates: false, rows: [
      { id: 'r-3', label: 'Palme', sortOrder: 1, umbrellas: [] },
    ] },
    { id: 's-3', name: 'Levante', sortOrder: 3, kind: 'grid', hasDedicatedRates: false, rows: [
      { id: 'r-4', label: 'F4', sortOrder: 1, umbrellas: [] },
    ] },
  ];

  it('offre solo le file dei settori con lo STESSO kind', () => {
    expect(moveTargets(misto(), 'grid').map((t) => t.id)).toEqual(['r-1', 'r-2', 'r-4']);
    expect(moveTargets(misto(), 'special').map((t) => t.id)).toEqual(['r-3']);
  });

  it('porta il nome del settore accanto a quello della fila, senza formattarli', () => {
    expect(moveTargets(misto(), 'special')).toEqual([{ id: 'r-3', label: 'Palme', sectorName: 'Speciali' }]);
  });

  it('un settore senza file non contribuisce nulla', () => {
    const vuoto: StructureSectorDTO[] = [
      { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: false, rows: [] },
    ];
    expect(moveTargets(vuoto, 'grid')).toEqual([]);
  });
});

describe('positionOptions', () => {
  const umb = (id: string) => ({ id, label: id, umbrellaTypeId: null });
  const row = (ids: string[]): StructureRowDTO => ({ id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: ids.map(umb) });

  // L'esclusione dell'ombrellone che si sposta è ciò che rende il numero prodotto GIÀ il `position`
  // che l'API vuole: l'indice FINALE (ADR-0065 §3), identico dentro la stessa fila e fra file diverse.
  it('nella propria fila: l’ombrellone non compare fra i vicini e le voci sono n', () => {
    expect(positionOptions(row(['A', 'B', 'C']), 'B')).toEqual([
      { position: 0, beforeLabel: 'A' },
      { position: 1, beforeLabel: 'C' },
      { position: 2, beforeLabel: null },
    ]);
  });

  it('in una fila che non lo contiene: n+1 voci, tutti i vicini restano', () => {
    expect(positionOptions(row(['A', 'B']), 'Z')).toEqual([
      { position: 0, beforeLabel: 'A' },
      { position: 1, beforeLabel: 'B' },
      { position: 2, beforeLabel: null },
    ]);
  });

  it('la coda è l’ULTIMA voce: l’elenco legge la fila da testa a coda', () => {
    const opts = positionOptions(row(['A', 'B']), 'Z');
    expect(opts[opts.length - 1].beforeLabel).toBeNull();
  });

  it('fila vuota, e fila col solo ombrellone da spostare: resta la sola coda, position 0', () => {
    expect(positionOptions(row([]), 'Z')).toEqual([{ position: 0, beforeLabel: null }]);
    expect(positionOptions(row(['A']), 'A')).toEqual([{ position: 0, beforeLabel: null }]);
  });

  it('la posizione della coda è sempre pari al numero di vicini rimasti', () => {
    for (const ids of [[], ['A'], ['A', 'B'], ['A', 'B', 'C']]) {
      const opts = positionOptions(row(ids), 'A');
      expect(opts[opts.length - 1].position).toBe(ids.filter((i) => i !== 'A').length);
    }
  });
});
