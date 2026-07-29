import { describe, expect, it } from 'vitest';
import { isCompatible, targetIndex, type CellRect } from './umbrellaMove';

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
