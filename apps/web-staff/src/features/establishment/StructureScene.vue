<script setup lang="ts">
import { computed, ref, onBeforeUpdate } from 'vue';
import type { StructureSectorDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import StructureGuidedSetup from './StructureGuidedSetup.vue';
import StructureRow from './StructureRow.vue';
import type { Selection } from './structureSelection';
import '@/styles/map-scene.css';
import '@/styles/structure-scene.css';

const props = defineProps<{
  sectors: StructureSectorDTO[];
  types: UmbrellaTypeDTO[];
  selectedSectorId: string | null;
  selection: Selection;
  selectMode: boolean;
  isAdmin: boolean;
}>();
const emit = defineEmits<{
  'select-sector': [id: string]; 'create-sector': [];
  'select-row': [id: string]; 'create-row': [sectorId: string];
  'select-umbrella': [id: string, additive: boolean]; 'create-umbrella': [rowId: string];
  'select-beach': []; 'toggle-select-mode': [];
  'row-generate': [id: string]; 'row-danger': [id: string];
}>();

const current = computed(() => props.sectors.find((s) => s.id === props.selectedSectorId) ?? props.sectors[0] ?? null);
const seats = (s: StructureSectorDTO): number => s.rows.reduce((n, r) => n + r.umbrellas.length, 0);

const totalRows = computed(() => props.sectors.reduce((n, s) => n + s.rows.length, 0));
const totalUmbrellas = computed(() => props.sectors.reduce((n, s) => n + seats(s), 0));
const showGuided = computed(() => totalUmbrellas.value === 0);
const guidedStep = computed<1 | 2 | 3>(() => {
  if (props.sectors.length === 0) return 1;
  if (totalRows.value === 0) return 2;
  return 3;
});
const firstSectorId = computed(() => props.sectors[0]?.id ?? null);
const firstRowId = computed(() => {
  for (const s of props.sectors) if (s.rows.length > 0) return s.rows[0].id;
  return null;
});
function handleGuidedAdvance(): void {
  if (guidedStep.value === 1) emit('create-sector');
  else if (guidedStep.value === 2 && firstSectorId.value) emit('create-row', firstSectorId.value);
  else if (guidedStep.value === 3 && firstRowId.value) emit('select-row', firstRowId.value);
}

// Roving tabindex APG per i tab settore: un solo tab nel tab-order (il selezionato), frecce con
// wrap + Home/End spostano fuoco e selezione (attivazione automatica, coerente col click).
const tabRefs = ref<(HTMLButtonElement | null)[]>([]);
onBeforeUpdate(() => { tabRefs.value = []; }); // niente ref stantii se i settori cambiano
function setTabRef(el: unknown, i: number): void {
  tabRefs.value[i] = el as HTMLButtonElement | null;
}
function onTabKeydown(e: KeyboardEvent, i: number) {
  const n = props.sectors.length;
  let next: number;
  if (e.key === 'ArrowRight') next = (i + 1) % n;
  else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  else return;
  e.preventDefault();
  emit('select-sector', props.sectors[next].id);
  tabRefs.value[next]?.focus();
}
</script>

<template>
  <div class="map-stage flex min-h-[560px] flex-col overflow-hidden">
    <div class="map-sea" aria-hidden="true">
      <span class="map-sea-veil"></span><span class="map-sea-veil"></span><span class="map-sea-veil"></span>
      <span class="absolute right-3.5 top-2 text-[10px] font-bold tracking-[.14em] text-[var(--color-sea-ink)]">MARE</span>
    </div>
    <div class="map-shore" aria-hidden="true"></div>
    <div class="map-toolbar flex items-center gap-2 px-4 py-2.5">
      <div class="flex items-center gap-2" role="tablist" aria-label="Settori">
        <button v-for="(s, i) in sectors" :key="s.id" type="button" role="tab" :aria-selected="current?.id === s.id"
          :tabindex="current?.id === s.id ? 0 : -1" :ref="(el) => setTabRef(el, i)"
          class="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          :class="current?.id === s.id ? 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'border-transparent text-[var(--color-text-2nd)]'"
          @click="emit('select-sector', s.id)" @keydown="onTabKeydown($event, i)">
          {{ s.name }} <span class="ml-1 text-[11.5px] font-semibold text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">{{ seats(s) }} posti</span>
        </button>
      </div>
      <button v-if="isAdmin" type="button" data-testid="ghost-sector"
        class="rounded-full border-[1.5px] border-dashed border-[var(--color-border-input)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-brand)] hover:bg-[var(--color-coral-050)] hover:text-[var(--color-brand-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="emit('create-sector')">+ Settore</button>
      <button v-if="isAdmin" type="button" data-testid="select-mode" :aria-pressed="selectMode"
        class="ml-auto rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :class="selectMode ? 'border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]' : 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text-2nd)]'"
        @click="emit('toggle-select-mode')">Seleziona</button>
    </div>
    <div class="st-sand flex-1 overflow-auto" data-testid="scene-sand" @click.self="emit('select-beach')">
      <StructureGuidedSetup v-if="showGuided" :step="guidedStep" @advance="handleGuidedAdvance" />
      <template v-if="current">
        <div class="st-sector-cap">
          <span class="st-eyebrow">{{ current.name }} · {{ current.kind === 'special' ? 'speciali' : 'griglia' }}</span>
          <span class="st-sub">{{ current.rows.length }} file · {{ seats(current) }} ombrelloni · le file più in alto sono più vicine al mare</span>
        </div>
        <StructureRow v-for="r in current.rows" :key="r.id" class="map-row-in" :row="r" :sector-name="current.name"
          :types="types" :selection="selection" :is-admin="isAdmin"
          @select-row="(id) => emit('select-row', id)" @select-umbrella="(id, add) => emit('select-umbrella', id, add)"
          @create-umbrella="(rid) => emit('create-umbrella', rid)"
          @row-generate="(id) => emit('row-generate', id)" @row-danger="(id) => emit('row-danger', id)" />
        <button v-if="isAdmin" type="button" class="st-ghost-row focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          data-testid="ghost-row" @click="emit('create-row', current.id)">
          <span class="grid size-6 place-items-center rounded-[8px] border-[1.5px] border-dashed border-current text-sm">+</span>
          Nuova fila — etichetta e, se vuoi, genera subito gli ombrelloni
        </button>
      </template>
    </div>
  </div>
</template>
