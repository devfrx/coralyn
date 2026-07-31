import type { SectorKind, StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';

/**
 * Il minimo di un rettangolo che serve a decidere dove cade il puntatore. Un `DOMRect` vero
 * soddisfa questo tipo per struttura: è ristretto apposta, perché è ciò che rende la funzione
 * chiamabile dai test con oggetti letterali.
 *
 * ⚠️ Non è una preferenza di stile: `environment: 'jsdom'` (`apps/web-staff/vitest.config.ts:22`)
 * restituisce rettangoli a ZERO, e non esiste alcun test di browser in questo repo (nessun
 * playwright/cypress in alcun `package.json`). I rect vanno quindi forniti a mano: o iniettati in
 * una funzione pura come questa, o stubbati per elemento nel test del componente, come fa
 * `StructureRow.spec.ts` per `dropTarget`.
 *
 * ⚠️ Questo commento esibiva come prova un `grep -rn "getBoundingClientRect"` che «dà zero righe».
 * **Non è più vero, e ha smesso di esserlo nel commit successivo a questo**: `StructureRow.vue`
 * chiama `getBoundingClientRect` sulle celle vere per costruire questi rect, e due spec lo stubbano.
 * Corretto il 2026-07-30 rieseguendo il comando, non rileggendo la frase.
 */
export interface CellRect { top: number; bottom: number; left: number; right: number }

/**
 * Trascinamento in corso. Vive nello stato di `StructureScene` e scende come prop alle file, perche'
 * il `dataTransfer` non e' leggibile durante il `dragover` in nessun browser: li' si sa solo che
 * QUALCOSA sta arrivando, non cosa. Il `kind` e' quello del settore di PARTENZA, catturato al
 * `dragstart`: dopo un cambio di tab a molla il settore corrente e' un altro, e il vincolo di
 * compatibilita' va valutato sull'origine.
 */
export interface UmbrellaDrag { umbrellaId: string; fromRowId: string; kind: SectorKind }

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

/**
 * Applica lo spostamento all'albero della struttura, per l'ANTEPRIMA ottimistica: senza, la cella
 * non si muove affatto finche' il server non risponde, e poi salta.
 *
 * Riproduce la semantica dell'API invece di approssimarla: `position` e' l'indice FINALE nella fila
 * di destinazione, cioe' l'indice d'inserimento in una fila da cui l'ombrellone e' gia' uscito. Se
 * i due divergessero, l'anteprima mostrerebbe una disposizione che il refetch poi smentisce.
 *
 * Un id sconosciuto restituisce l'albero invariato: l'anteprima non e' il posto dove far fallire
 * qualcosa, e il server resta l'unica autorita' sull'esito.
 */
export function applyMove(
  sectors: readonly StructureSectorDTO[],
  umbrellaId: string,
  toRowId: string,
  position: number,
): StructureSectorDTO[] {
  const moved = sectors.flatMap((s) => s.rows).flatMap((r) => r.umbrellas).find((u) => u.id === umbrellaId);
  if (!moved) return [...sectors];
  return sectors.map((s) => ({
    ...s,
    rows: s.rows.map((r) => {
      const without = r.umbrellas.filter((u) => u.id !== umbrellaId);
      if (r.id !== toRowId) return without.length === r.umbrellas.length ? r : { ...r, umbrellas: without };
      return { ...r, umbrellas: [...without.slice(0, position), moved, ...without.slice(position)] };
    }),
  }));
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
 * ⚠️ `rects` sono i rettangoli delle SOLE celle, filtrati dal chiamante: in `StructureRow.vue` la
 * `.st-cells` contiene anche figli che celle non sono — la ghost «+» (`[data-testid="ghost-cell"]`)
 * e il `<p>` «Nessun ombrellone» della fila vuota — quindi l'indice del figlio DOM non è l'indice
 * dell'ombrellone. ⚠️ Qui c'erano due coordinate `file:riga`, giuste contro `main` e già scadute
 * nell'albero consegnato: sostituite il 2026-07-30 con àncore che non invecchiano.
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

/**
 * Le file su cui uno spostamento è ammesso: quelle di un settore con lo STESSO `kind`
 * (ADR-0065 §4), in ordine d'albero, **compresa la fila di partenza** — senza la quale il riordino
 * dentro la propria fila non esisterebbe.
 *
 * Restituisce dati e non testo: la formattazione «Settore · Fila» resta nel template, come in
 * `BeachPanel.vue` per il ripristino.
 *
 * ⚠️ Non è il gemello di `allRows` di `BeachPanel` e **non va unificata con essa**: `restore` non ha
 * alcuna guardia sul `kind` — `umbrellas.service.ts` chiama solo `assertRow`, che verifica la sola
 * esistenza della fila — quindi quella lista è senza filtro di proposito, ed è fedele al suo server.
 * L'asimmetria fra le due porte è registrata come D-075, e non è compito di questo modulo sanarla.
 */
export function moveTargets(
  sectors: readonly StructureSectorDTO[],
  fromKind: SectorKind,
): { id: string; label: string; sectorName: string }[] {
  return sectors
    .filter((s) => isCompatible(fromKind, s.kind))
    .flatMap((s) => s.rows.map((r) => ({ id: r.id, label: r.label, sectorName: s.name })));
}

/**
 * Le posizioni offribili nella fila di destinazione, calcolate sulla fila **privata**
 * dell'ombrellone che si sta spostando. Con quell'esclusione il numero prodotto è già il `position`
 * che l'API vuole — l'indice FINALE (ADR-0065 §3) — e vale identico dentro la stessa fila e fra file
 * diverse, senza un ramo che distingua i due casi.
 *
 * `beforeLabel === null` è la coda, ed è l'ULTIMA voce perché l'elenco legge la fila da testa a
 * coda. Esiste sempre: una fila vuota, o che contenga solo l'ombrellone da spostare, produce la sola
 * coda a `position` 0. Ciò rende l'elenco un ripiego sicuro quando una scelta memorizzata esce
 * dall'intervallo per una rilettura.
 */
export function positionOptions(
  row: StructureRowDTO,
  umbrellaId: string,
): { position: number; beforeLabel: string | null }[] {
  const without = row.umbrellas.filter((u) => u.id !== umbrellaId);
  return [
    ...without.map((u, i) => ({ position: i, beforeLabel: u.label })),
    { position: without.length, beforeLabel: null },
  ];
}
