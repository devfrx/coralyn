import { describe, expect, it } from 'vitest';
import type { StructureSectorDTO } from '@coralyn/contracts';
import { applyMove, isCompatible, targetIndex, type CellRect } from './umbrellaMove';

// Misure prese dal CSS vero: `.st-cells` ha `gap: 9px` (structure-scene.css:17) e la cella è 40x40
// come `.st-ghost-cell` (:18). Scriverle qui rende i numeri dei test leggibili come una pianta.
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
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
      { id: 'r-1', label: 'F1', sortOrder: 1, umbrellas: [umb('A'), umb('B'), umb('C')] },
      { id: 'r-2', label: 'F2', sortOrder: 2, umbrellas: [umb('D'), umb('E')] },
    ] },
    { id: 's-2', name: 'Levante', sortOrder: 2, kind: 'grid', rows: [
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
