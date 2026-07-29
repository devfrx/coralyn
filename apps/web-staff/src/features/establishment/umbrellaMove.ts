import type { SectorKind } from '@coralyn/contracts';

/**
 * Il minimo di un rettangolo che serve a decidere dove cade il puntatore. Un `DOMRect` vero
 * soddisfa questo tipo per struttura: è ristretto apposta, perché è ciò che rende la funzione
 * chiamabile dai test con oggetti letterali.
 *
 * ⚠️ Non è una preferenza di stile: `environment: 'jsdom'` (`vitest.config.ts:23`) restituisce
 * rettangoli a zero, `grep -rn "getBoundingClientRect" apps/web-staff/src packages/ui-kit/src` dà
 * zero righe e non esiste alcun test di browser in questo repo (nessun playwright/cypress in alcun
 * `package.json`). Iniettare i rect è l'UNICO modo di provare la geometria.
 */
export interface CellRect { top: number; bottom: number; left: number; right: number }

/**
 * Destinazione ammessa: una fila il cui settore ha lo STESSO `kind`. Mai `grid → special`, mai il
 * contrario. Il vincolo è di dominio e non tecnico — un ombrellone «fuori griglia» e uno di fila
 * regolare non sono intercambiabili nella scena, e la Mappa li rende in due blocchi distinti
 * discriminando proprio su `kind`. È il gemello della guardia 4 del server, che risponde 422: qui
 * serve solo a non offrire un bersaglio che verrebbe rifiutato.
 */
export function isCompatible(from: SectorKind, to: SectorKind): boolean {
  return from === to;
}

interface VisualLine { indices: number[]; top: number; bottom: number }

/**
 * Raggruppa gli indici per riga VISIVA. `.st-cells` è `display:flex; flex-wrap:wrap; gap:9px`
 * (`structure-scene.css:17`), quindi una fila lunga occupa più righe e l'indice di cella non ha
 * relazione con la posizione orizzontale. I rect arrivano in ordine DOM, che per un flex row-wrap
 * è l'ordine di lettura: basta spezzare dove una cella comincia sotto la fine della precedente.
 */
function visualLines(rects: readonly CellRect[]): VisualLine[] {
  const lines: VisualLine[] = [];
  let current: number[] = [0];
  const push = (indices: number[]): void => {
    let top = Infinity;
    let bottom = -Infinity;
    for (const i of indices) {
      if (rects[i].top < top) top = rects[i].top;
      if (rects[i].bottom > bottom) bottom = rects[i].bottom;
    }
    lines.push({ indices, top, bottom });
  };
  for (let i = 1; i < rects.length; i++) {
    if (rects[i].top >= rects[current[current.length - 1]].bottom) {
      push(current);
      current = [];
    }
    current.push(i);
  }
  push(current);
  return lines;
}

/**
 * Indice 0-based a cui l'ombrellone finirebbe rilasciando il puntatore in `pointer`.
 *
 * ⚠️ `rects` sono i rettangoli delle SOLE celle, filtrati dal chiamante: `.st-cells` contiene anche
 * figli che celle non sono — la ghost «+» (`StructureRow.vue:49-50`) e il `<p>` «Nessun ombrellone»
 * (`:51`) — quindi l'indice del figlio DOM non è l'indice dell'ombrellone.
 *
 * ⚠️ E sono i rect della fila di destinazione SENZA l'ombrellone che si sta trascinando. Con
 * quella esclusione il numero che esce è già il `position` che l'API vuole: l'indice FINALE, che
 * vale identico dentro la stessa fila e fra file diverse.
 *
 * Il puntatore ha «oltrepassato» una cella quando ne ha superato la metà orizzontale; la parità
 * esatta conta come oltrepassata, così il bersaglio non ha un punto morto largo zero in cui il
 * risultato dipende dall'arrotondamento del browser.
 */
export function targetIndex(rects: readonly CellRect[], pointer: { x: number; y: number }): number {
  if (rects.length === 0) return 0;

  // La riga che contiene la Y; se la Y cade sopra la prima, sotto l'ultima o nel gap di 9px fra
  // due, si sceglie la più vicina — un rilascio lì dentro è ordinario e non deve cadere nel vuoto.
  const lines = visualLines(rects);
  let line = lines[0];
  let best = Infinity;
  for (const candidate of lines) {
    const distance = pointer.y < candidate.top ? candidate.top - pointer.y
      : pointer.y > candidate.bottom ? pointer.y - candidate.bottom
        : 0;
    if (distance < best) { best = distance; line = candidate; }
  }

  let passed = 0;
  for (const i of line.indices) {
    if (pointer.x >= (rects[i].left + rects[i].right) / 2) passed++;
  }
  // Gli indici di una riga sono contigui per costruzione, quindi il primo indice della riga è
  // l'offset da cui contare.
  return line.indices[0] + passed;
}
