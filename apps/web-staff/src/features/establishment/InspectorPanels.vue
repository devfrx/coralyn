<script setup lang="ts">
import type { EstablishmentStructureDTO, StructureRowDTO, StructureSectorDTO } from '@coralyn/contracts';
import BeachPanel from './panels/BeachPanel.vue';
import SectorPanel from './panels/SectorPanel.vue';
import SectorCreatePanel from './panels/SectorCreatePanel.vue';
import RowPanel from './panels/RowPanel.vue';
import RowCreatePanel from './panels/RowCreatePanel.vue';
import UmbrellaPanel from './panels/UmbrellaPanel.vue';
import UmbrellaCreatePanel from './panels/UmbrellaCreatePanel.vue';
import MultiPanel from './panels/MultiPanel.vue';
import type { findUmbrella, Selection } from './structureSelection';

// Il ramo unico dei pannelli dell'ispettore: montato DUE volte dalla shell (aside desktop e
// Drawer mobile) — la duplicazione del v-if nei due rami è stata la causa del bug «ramo Drawer
// dimenticato». La risoluzione per-id resta nella shell (serve anche ai watch di fallback).
const props = defineProps<{
  data: EstablishmentStructureDTO;
  selection: Selection;
  canManage: boolean;
  /** `isPending` dello spostamento, che la shell possiede: scende fin qui solo per spegnere il
   *  bottone «Sposta» mentre la scrittura è in volo (D-071). */
  movePending: boolean;
  selectedSector: StructureSectorDTO | null;
  selectedRow: { row: StructureRowDTO; sector: StructureSectorDTO } | null;
  selectedUmbrella: ReturnType<typeof findUmbrella>;
  createRowSector: StructureSectorDTO | null;
  createUmbrellaRow: StructureRowDTO | null;
  multiLabels: string[];
}>();
const emit = defineEmits<{
  close: [];
  created: [id: string];
  /** Stessa firma di `StructureScene.vue`, così la shell aggancia i due canali dello spostamento
   *  allo STESSO handler e la disclosure sul prezzo non ha un secondo esemplare (D-071). */
  'move-umbrella': [umbrellaId: string, rowId: string, position: number];
}>();

// L'id lo mette qui la risoluzione già fatta dalla shell: il pannello conosce sé stesso, non il
// proprio identificativo nell'albero.
function onUmbrellaMove(rowId: string, position: number): void {
  if (props.selectedUmbrella) emit('move-umbrella', props.selectedUmbrella.umbrella.id, rowId, position);
}
</script>

<template>
  <BeachPanel v-if="selection.kind === 'beach'" :data="data" :can-manage="canManage" />
  <SectorPanel v-else-if="selection.kind === 'sector' && selectedSector" :sector="selectedSector" :can-manage="canManage" @close="emit('close')" />
  <SectorCreatePanel v-else-if="selection.kind === 'create-sector'" @created="(id) => emit('created', id)" @close="emit('close')" />
  <RowPanel v-else-if="selection.kind === 'row' && selectedRow" :row="selectedRow.row" :sector-name="selectedRow.sector.name" :types="data.umbrellaTypes" :can-manage="canManage" :focus="selection.focus" @close="emit('close')" />
  <RowCreatePanel v-else-if="selection.kind === 'create-row' && createRowSector" :sector-id="createRowSector.id" :sector-name="createRowSector.name" :types="data.umbrellaTypes" @close="emit('close')" />
  <UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row="selectedUmbrella.row" :sector="selectedUmbrella.sector" :sectors="data.sectors" :types="data.umbrellaTypes" :can-manage="canManage" :move-pending="movePending" @close="emit('close')" @move="onUmbrellaMove" />
  <UmbrellaCreatePanel v-else-if="selection.kind === 'create-umbrella' && createUmbrellaRow" :row-id="createUmbrellaRow.id" :row-label="createUmbrellaRow.label" :types="data.umbrellaTypes" @close="emit('close')" />
  <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" :can-manage="canManage" @close="emit('close')" />
</template>
