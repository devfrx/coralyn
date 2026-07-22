<script setup lang="ts">
import { UmbrellaCell, IconButton } from '@coralyn/ui-kit';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import type { Selection } from './structureSelection';

const props = defineProps<{
  row: StructureRowDTO;
  sectorName: string;
  types: UmbrellaTypeDTO[];
  selection: Selection;
  isAdmin: boolean;
}>();
const emit = defineEmits<{
  'select-row': [id: string];
  'select-umbrella': [id: string, additive: boolean];
  'create-umbrella': [rowId: string];
  'row-generate': [id: string];
  'row-danger': [id: string];
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
</script>

<template>
  <div class="st-row" :class="rowSelected() ? 'st-row-sel' : ''" data-testid="scene-row">
    <div class="pt-[7px]">
      <button type="button" class="st-rail-name focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :aria-label="`${row.label}, settore ${sectorName}`" @click="emit('select-row', row.id)">{{ row.label.toUpperCase() }}</button>
      <div class="st-rail-count">{{ row.umbrellas.length }} {{ row.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</div>
      <div v-if="isAdmin" class="st-rail-actions">
        <IconButton icon="zap" label="Genera ombrelloni" variant="ghost" size="sm" data-testid="rail-generate" @click="emit('row-generate', row.id)" />
        <IconButton icon="trash-2" label="Svuota o elimina fila" variant="danger" size="sm" data-testid="rail-danger" @click="emit('row-danger', row.id)" />
      </div>
    </div>
    <div class="st-cells">
      <span v-for="u in row.umbrellas" :key="u.id" data-testid="scene-cell">
        <UmbrellaCell :label="u.label" :ariaLabel="`Ombrellone ${u.label}, ${row.label}, settore ${sectorName}`"
          :type-icon="typeIcon(u.umbrellaTypeId)" :selected="isSelected(u.id)"
          @select="emit('select-umbrella', u.id, ($event as MouseEvent | undefined)?.shiftKey ?? false)" />
      </span>
      <button v-if="isAdmin" type="button" class="st-ghost-cell focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        data-testid="ghost-cell" :aria-label="`Aggiungi ombrellone alla fila ${row.label}`" @click="emit('create-umbrella', row.id)">+</button>
      <p v-if="row.umbrellas.length === 0" class="py-1 text-xs text-[var(--color-text-muted)]">Nessun ombrellone: aggiungi col «+» o genera dalla fila.</p>
    </div>
  </div>
</template>
