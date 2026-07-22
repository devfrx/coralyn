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
defineProps<{
  data: EstablishmentStructureDTO;
  selection: Selection;
  isAdmin: boolean;
  selectedSector: StructureSectorDTO | null;
  selectedRow: { row: StructureRowDTO; sector: StructureSectorDTO } | null;
  selectedUmbrella: ReturnType<typeof findUmbrella>;
  createRowSector: StructureSectorDTO | null;
  createUmbrellaRow: StructureRowDTO | null;
  multiLabels: string[];
}>();
const emit = defineEmits<{ close: []; created: [id: string] }>();
</script>

<template>
  <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
  <SectorPanel v-else-if="selection.kind === 'sector' && selectedSector" :sector="selectedSector" :is-admin="isAdmin" @close="emit('close')" />
  <SectorCreatePanel v-else-if="selection.kind === 'create-sector'" @created="(id) => emit('created', id)" @close="emit('close')" />
  <RowPanel v-else-if="selection.kind === 'row' && selectedRow" :row="selectedRow.row" :sector-name="selectedRow.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="emit('close')" />
  <RowCreatePanel v-else-if="selection.kind === 'create-row' && createRowSector" :sector-id="createRowSector.id" :sector-name="createRowSector.name" :types="data.umbrellaTypes" @close="emit('close')" />
  <UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row-label="selectedUmbrella.row.label" :sector-name="selectedUmbrella.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="emit('close')" />
  <UmbrellaCreatePanel v-else-if="selection.kind === 'create-umbrella' && createUmbrellaRow" :row-id="createUmbrellaRow.id" :row-label="createUmbrellaRow.label" :types="data.umbrellaTypes" @close="emit('close')" />
  <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" @close="emit('close')" />
</template>
