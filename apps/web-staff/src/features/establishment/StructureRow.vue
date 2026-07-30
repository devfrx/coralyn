<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UmbrellaCell, IconButton } from '@coralyn/ui-kit';
import type { SectorKind, StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import type { Selection } from './structureSelection';
import { isCompatible, targetIndex, type CellRect, type UmbrellaDrag } from './umbrellaMove';

const props = defineProps<{
  row: StructureRowDTO;
  sectorName: string;
  sectorKind: SectorKind;
  types: UmbrellaTypeDTO[];
  selection: Selection;
  selectMode: boolean;
  canManage: boolean;
  /** `false` sotto `lg`: il Drawer di reka-ui azzera i pointer-events e il gesto non esiste (D-071). */
  canDrag: boolean;
  dragging: UmbrellaDrag | null;
}>();
const emit = defineEmits<{
  'select-row': [id: string];
  'select-umbrella': [id: string, additive: boolean];
  'create-umbrella': [rowId: string];
  'row-generate': [id: string];
  'row-danger': [id: string];
  'umbrella-drag-start': [umbrellaId: string, rowId: string];
  'umbrella-drag-end': [];
  'move-umbrella': [umbrellaId: string, rowId: string, position: number];
}>();

function typeIcon(umbrellaTypeId: string | null): string | null {
  if (!umbrellaTypeId) return null;
  return props.types.find((t) => t.id === umbrellaTypeId)?.icon ?? 'umbrella';
}
function isSelected(id: string): boolean {
  const s = props.selection;
  return (s.kind === 'umbrella' && s.id === id) || (s.kind === 'multi' && s.ids.includes(id));
}
const rowSelected = (): boolean => props.selection.kind === 'row' && props.selection.id === props.row.id;

// --- Trascinamento (D-038) ---------------------------------------------------

/** Indice che verrebbe inviato all'API rilasciando ora. `null` = questa fila non e' il bersaglio. */
const dropIndex = ref<number | null>(null);

/** Posizione dell'ombrellone trascinato DENTRO questa fila, o -1 se arriva da un'altra. */
const draggedIndex = computed(() => {
  const d = props.dragging;
  if (!d || d.fromRowId !== props.row.id) return -1;
  return props.row.umbrellas.findIndex((u) => u.id === d.umbrellaId);
});

/** Il trascinamento e' finito (rilascio o Esc): il segno del bersaglio va tolto ovunque, non solo
 *  nella fila d'origine, perche' `dragend` scatta sulla sorgente e non sul bersaglio. */
watch(() => props.dragging, (d) => { if (!d) dropIndex.value = null; });

/** Il trascinamento accettabile da QUESTA fila, oppure null. Restituisce l'oggetto e non un
 *  booleano cosi' il narrowing arriva ai chiamanti. */
function acceptedDrag(): UmbrellaDrag | null {
  const d = props.dragging;
  if (!props.canManage || props.selectMode || !d) return null;
  return isCompatible(d.kind, props.sectorKind) ? d : null;
}

/**
 * Rettangoli delle SOLE celle, senza quella trascinata. Entrambi i filtri servono: `.st-cells`
 * contiene anche la ghost «+» e il `<p>` di fila vuota, e l'indice che l'API vuole e' quello
 * FINALE, cioe' calcolato su una fila da cui l'ombrellone e' gia' uscito.
 */
function cellRects(container: HTMLElement): CellRect[] {
  const skip = draggedIndex.value;
  return Array.from(container.querySelectorAll('[data-testid="scene-cell"]'))
    .filter((_, i) => i !== skip)
    .map((el) => el.getBoundingClientRect());
}

/**
 * L'indice che il rilascio scriverebbe ORA. Sta qui e non in `targetIndex` perche' e' conoscenza del
 * chiamante: la funzione pura vede solo i rect delle celle, ma la zona di rilascio e' `.st-cells`
 * intero, che di celle ne contiene anche zero in certe bande. `.st-cells` e' `flex-wrap: wrap`,
 * quindi la ghost «+» va a capo da sola quando le celle riempiono la
 * riga e apre una banda alta 40px senza una cella dentro; e la cella trascinata, esclusa dai rect ma
 * ancora in flusso, puo' essere l'unica dell'ultima riga visiva. In entrambi i casi `targetIndex`
 * ripiegherebbe sulla riga di celle piu' vicina — quella SOPRA — e con la X piccola ne uscirebbe la
 * TESTA della fila. Un puntatore sotto tutti i rect sta chiedendo la coda.
 *
 * Un solo posto per `dragover` e `drop`: se divergessero, la barra mostrerebbe un indice e il
 * rilascio ne scriverebbe un altro.
 */
function dropTarget(e: DragEvent): number {
  const rects = cellRects(e.currentTarget as HTMLElement);
  let lowest = -Infinity;
  for (const r of rects) if (r.bottom > lowest) lowest = r.bottom;
  if (e.clientY > lowest) return rects.length;
  return targetIndex(rects, { x: e.clientX, y: e.clientY });
}

function onDragStart(e: DragEvent, umbrellaId: string): void {
  // Firefox non avvia alcun trascinamento senza un payload; il dato vero viaggia nello stato del
  // componente perche' `dataTransfer` e' illeggibile durante il `dragover`.
  e.dataTransfer?.setData('text/plain', umbrellaId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  emit('umbrella-drag-start', umbrellaId, props.row.id);
}

function onDragOver(e: DragEvent): void {
  if (!acceptedDrag()) return;
  // Senza `preventDefault` il browser rifiuta il rilascio: e' la firma di «qui si puo' lasciare».
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropIndex.value = dropTarget(e);
}

function onDragLeave(e: DragEvent): void {
  // `dragleave` scatta anche passando da un figlio all'altro dentro lo stesso contenitore: il segno
  // si toglie solo uscendo davvero, altrimenti lampeggia a ogni cella attraversata.
  const to = e.relatedTarget as Node | null;
  if (to && (e.currentTarget as HTMLElement).contains(to)) return;
  dropIndex.value = null;
}

function onDrop(e: DragEvent): void {
  const drag = acceptedDrag();
  if (!drag) return;
  e.preventDefault();
  const position = dropTarget(e);
  dropIndex.value = null;
  emit('move-umbrella', drag.umbrellaId, props.row.id, position);
}

/** Dove disegnare la barra d'inserimento. `dropIndex` conta sugli ALTRI, la resa conta su tutti:
 *  se l'ombrellone trascinato e' in questa fila, oltre la sua posizione i due indici divergono. */
const markerAt = computed<number | null>(() => {
  const p = dropIndex.value;
  if (p === null) return null;
  return draggedIndex.value >= 0 && p >= draggedIndex.value ? p + 1 : p;
});

/**
 * Solo le barre d'inserimento, che sono `::before`/`::after` dello slot. Lo sbiadimento della cella
 * trascinata NON sta qui: quando si trascina l'ultimo ombrellone della fila `st-drop-after` e la
 * cella trascinata cadono sullo stesso indice, e `opacity: .4` sullo slot si applicherebbe anche al
 * suo `::after` — la barra di coda si dipingerebbe sbiadita proprio quando serve. Sta sulla cella.
 */
function slotClass(i: number): string[] {
  const out: string[] = [];
  if (markerAt.value === i) out.push('st-drop-before');
  if (markerAt.value === props.row.umbrellas.length && i === props.row.umbrellas.length - 1) out.push('st-drop-after');
  return out;
}
</script>

<template>
  <div class="st-row" :class="[rowSelected() ? 'st-row-sel' : '', dropIndex !== null ? 'st-row-drop' : '']" data-testid="scene-row">
    <div class="pt-[7px]">
      <button type="button" class="st-rail-name focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :aria-label="`${row.label}, settore ${sectorName}`" @click="emit('select-row', row.id)">{{ row.label.toUpperCase() }}</button>
      <div class="st-rail-count">{{ row.umbrellas.length }} {{ row.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</div>
      <div v-if="canManage" class="st-rail-actions">
        <IconButton icon="zap" label="Genera ombrelloni" variant="ghost" size="sm" data-testid="rail-generate" @click="emit('row-generate', row.id)" />
        <IconButton icon="trash-2" label="Svuota o elimina fila" variant="danger" size="sm" data-testid="rail-danger" @click="emit('row-danger', row.id)" />
      </div>
    </div>
    <div class="st-cells" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
      <!-- La cella resta il solo `<button>` dentro `[data-testid="scene-cell"]`: oltre 20 asserzioni
           indicizzano quel selettore per posizione, e un secondo bottone la' dentro le arrosserebbe
           tutte senza che una logica sia rotta. La maniglia e' quindi FUORI, sorella dello span. -->
      <span v-for="(u, i) in row.umbrellas" :key="u.id" class="st-cell-slot" :class="slotClass(i)">
        <span data-testid="scene-cell" :class="{ 'st-cell-dragged': draggedIndex === i }">
          <UmbrellaCell :label="u.label" :ariaLabel="`Ombrellone ${u.label}, ${row.label}, settore ${sectorName}`"
            :type-icon="typeIcon(u.umbrellaTypeId)" :selected="isSelected(u.id)"
            @select="emit('select-umbrella', u.id, ($event as MouseEvent | undefined)?.shiftKey ?? false)" />
        </span>
        <!-- Non focalizzabile e `aria-hidden`: non esiste equivalente da tastiera (spec §5.4), e
             annunciare una maniglia inerte prometterebbe un'interazione che non c'e'. Il caso
             scoperto e' tracciato in D-071, non nascosto. Il trascinamento sparisce in modalita'
             «Seleziona» perche' li' si sta costruendo una selezione multipla, e la selezione
             multipla trascinabile e' esclusa per decisione (ADR-0065 §1): offrire la maniglia
             prometterebbe un gesto che non esiste.
             ⚠️ Corretto il 2026-07-30: qui si leggeva che in «Seleziona» «un drag degenerato in clic
             TOGLIE dalla selezione». Non regge: la maniglia non ha alcun percorso verso la
             selezione. E' uno `<span>` senza `@click` e FUORI dal `<button>` della cella (sorella
             dello span che lo contiene), e nessun antenato fino a `.st-cells` ascolta il clic — la
             selezione passa solo per l'evento `select` di `UmbrellaCell`, cioe' per
             `onSelectUmbrella` nella vista.
             E sotto `lg` non si rende affatto: un'affordance inerte dove il puntatore e' morto e'
             peggio della sua assenza. -->
        <span v-if="canManage && !selectMode && canDrag" class="st-drag-handle" draggable="true" aria-hidden="true"
          data-testid="drag-handle" @dragstart="onDragStart($event, u.id)" @dragend="emit('umbrella-drag-end')"></span>
      </span>
      <button v-if="canManage" type="button" class="st-ghost-cell focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        data-testid="ghost-cell" :aria-label="`Aggiungi ombrellone alla fila ${row.label}`" @click="emit('create-umbrella', row.id)">+</button>
      <p v-if="row.umbrellas.length === 0" class="py-1 text-xs text-[var(--color-text-muted)]">Nessun ombrellone: aggiungi col «+» o genera dalla fila.</p>
    </div>
  </div>
</template>
