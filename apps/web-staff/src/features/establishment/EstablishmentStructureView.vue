<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, Drawer, Skeleton, EmptyState, useDelayedLoading } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useEstablishmentStructure } from './useEstablishmentStructure';
import StructureScene from './StructureScene.vue';
import BeachPanel from './panels/BeachPanel.vue';
import SectorPanel from './panels/SectorPanel.vue';
import SectorCreatePanel from './panels/SectorCreatePanel.vue';
import RowPanel from './panels/RowPanel.vue';
import RowCreatePanel from './panels/RowCreatePanel.vue';
import UmbrellaPanel from './panels/UmbrellaPanel.vue';
import UmbrellaCreatePanel from './panels/UmbrellaCreatePanel.vue';
import MultiPanel from './panels/MultiPanel.vue';
import { findUmbrella, type Selection } from './structureSelection';

const session = useSessionStore();
const router = useRouter();
const isAdmin = computed(() => session.role === Role.Admin);
const { data, isLoading } = useEstablishmentStructure();
const skeletonVisible = useDelayedLoading(() => isLoading.value);

const selection = ref<Selection>({ kind: 'beach' });
const selectMode = ref(false);
const selectedSectorId = ref<string | null>(null);
watch(() => data.value?.sectors, (sectors) => {
  if (!selectedSectorId.value && sectors?.length) selectedSectorId.value = sectors[0].id;
}, { immediate: true });

const counts = computed(() => {
  const s = data.value?.sectors ?? [];
  const rows = s.reduce((n, x) => n + x.rows.length, 0);
  const umbrellas = s.reduce((n, x) => n + x.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: s.length, rows, umbrellas, types: data.value?.umbrellaTypes.length ?? 0 };
});

const isDesktop = useMediaQuery('(min-width: 1024px)');
const drawerOpen = computed({
  get: () => !isDesktop.value && selection.value.kind !== 'beach',
  set: (v: boolean) => { if (!v) selection.value = { kind: 'beach' }; },
});

// Pannello Settore: risolve il settore selezionato dall'albero via id ad ogni refetch. Se sparisce
// (es. eliminato da un'altra scheda, o la sua stessa delete invalida la query prima dell'onSuccess
// locale) il pannello ricade sulla Spiaggia.
const selectedSector = computed(() => {
  if (selection.value.kind !== 'sector' || !data.value) return null;
  return data.value.sectors.find((s) => s.id === (selection.value as { kind: 'sector'; id: string }).id) ?? null;
});
watch(selectedSector, (sec) => { if (selection.value.kind === 'sector' && !sec) reset(); });

// Pannello Fila: risolve la fila (e il settore che la contiene) dall'albero via id, stesso pattern
// del settore sopra — fallback a Spiaggia se sparisce (delete altrove o dalla sua stessa delete).
const selectedRow = computed(() => {
  if (selection.value.kind !== 'row' || !data.value) return null;
  const id = (selection.value as { kind: 'row'; id: string }).id;
  for (const sec of data.value.sectors) {
    const row = sec.rows.find((r) => r.id === id);
    if (row) return { row, sector: sec };
  }
  return null;
});
watch(selectedRow, (r) => { if (selection.value.kind === 'row' && !r) reset(); });

// Pannello Ombrellone: risolve ombrellone+fila+settore dall'albero via id, stesso pattern
// di risoluzione per id di Settore/Fila sopra — fallback a Spiaggia se sparisce.
const selectedUmbrella = computed(() => {
  if (selection.value.kind !== 'umbrella' || !data.value) return null;
  return findUmbrella(data.value, (selection.value as { kind: 'umbrella'; id: string }).id);
});
watch(selectedUmbrella, (u) => { if (selection.value.kind === 'umbrella' && !u) reset(); });

// Pannello Multi-selezione: risolve le etichette dall'albero via id (stesso pattern findUmbrella
// riusato per ciascun id selezionato), per i chip nel pannello e per l'aria-live sul conteggio.
const multiLabels = computed(() => {
  if (selection.value.kind !== 'multi' || !data.value) return [];
  const ids = (selection.value as { kind: 'multi'; ids: string[] }).ids;
  return ids.map((id) => findUmbrella(data.value!, id)?.umbrella.label ?? id);
});

const createUmbrellaRow = computed(() => {
  if (selection.value.kind !== 'create-umbrella' || !data.value) return null;
  const rowId = (selection.value as { kind: 'create-umbrella'; rowId: string }).rowId;
  for (const sec of data.value.sectors) {
    const row = sec.rows.find((r) => r.id === rowId);
    if (row) return row;
  }
  return null;
});

const createRowSector = computed(() => {
  if (selection.value.kind !== 'create-row' || !data.value) return null;
  const sectorId = (selection.value as { kind: 'create-row'; sectorId: string }).sectorId;
  return data.value.sectors.find((s) => s.id === sectorId) ?? null;
});

function onSelectSector(id: string) { selectedSectorId.value = id; selection.value = { kind: 'sector', id }; }
function onSelectUmbrella(id: string, additive: boolean) {
  if (selectMode.value || additive) {
    const ids = selection.value.kind === 'multi' ? [...selection.value.ids] : selection.value.kind === 'umbrella' ? [selection.value.id] : [];
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    selection.value = next.length === 0 ? { kind: 'beach' } : next.length === 1 ? { kind: 'umbrella', id: next[0] } : { kind: 'multi', ids: next };
    if (additive && !selectMode.value) selectMode.value = true;
  } else selection.value = { kind: 'umbrella', id };
}
function reset() { selection.value = { kind: 'beach' }; selectMode.value = false; }
function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value && selection.value.kind === 'multi') selection.value = { kind: 'beach' };
}

// Esc globale: chiude qualunque pannello aperto (utile in particolare per uscire dalla
// selezione multipla senza dover ri-cliccare il toggle «Seleziona»).
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') reset(); }
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <section class="flex h-full flex-col px-[26px] pb-[30px] pt-[22px]">
    <button class="mb-3 flex items-center gap-1 self-start text-[13px] font-semibold text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="router.push('/establishment')">
      <Icon name="chevron-left" :size="15" />Stabilimento
    </button>
    <div class="mb-4 flex items-baseline gap-3.5">
      <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">Struttura della spiaggia</h2>
      <span v-if="data" class="text-[12.5px] text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">
        {{ counts.sectors }} settori · {{ counts.rows }} file · {{ counts.umbrellas }} ombrelloni · {{ counts.types }} tipologie
      </span>
    </div>

    <div v-if="skeletonVisible" aria-busy="true" class="flex flex-col gap-3">
      <Skeleton variant="block" height="56px" />
      <Skeleton variant="block" height="380px" />
    </div>

    <EmptyState v-else-if="!isLoading && !data" message="Struttura non disponibile." />

    <div v-else-if="data" class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] lg:grid-cols-[1fr_320px]">
      <StructureScene :sectors="data.sectors" :types="data.umbrellaTypes" :selected-sector-id="selectedSectorId"
        :selection="selection" :select-mode="selectMode" :is-admin="isAdmin"
        @select-sector="onSelectSector" @create-sector="selection = { kind: 'create-sector' }"
        @select-row="(id) => selection = { kind: 'row', id }" @create-row="(sid) => selection = { kind: 'create-row', sectorId: sid }"
        @select-umbrella="onSelectUmbrella" @create-umbrella="(rid) => selection = { kind: 'create-umbrella', rowId: rid }"
        @select-beach="reset" @toggle-select-mode="toggleSelectMode"
        @row-generate="(id) => selection = { kind: 'row', id }" @row-danger="(id) => selection = { kind: 'row', id }" />

      <aside v-if="isDesktop" data-testid="inspector" class="min-w-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-raised)]" aria-label="Ispettore">
        <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
        <SectorPanel v-else-if="selection.kind === 'sector' && selectedSector" :sector="selectedSector" :is-admin="isAdmin" @close="reset" />
        <SectorCreatePanel v-else-if="selection.kind === 'create-sector'" @created="(id) => selectedSectorId = id" @close="reset" />
        <RowPanel v-else-if="selection.kind === 'row' && selectedRow" :row="selectedRow.row" :sector-name="selectedRow.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="reset" />
        <RowCreatePanel v-else-if="selection.kind === 'create-row' && createRowSector" :sector-id="createRowSector.id" :sector-name="createRowSector.name" :types="data.umbrellaTypes" @close="reset" />
        <UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row-label="selectedUmbrella.row.label" :sector-name="selectedUmbrella.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="reset" />
        <UmbrellaCreatePanel v-else-if="selection.kind === 'create-umbrella' && createUmbrellaRow" :row-id="createUmbrellaRow.id" :row-label="createUmbrellaRow.label" :types="data.umbrellaTypes" @close="reset" />
        <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" @close="reset" />
      </aside>
      <Drawer v-else v-model:open="drawerOpen" title="Ispettore">
        <div data-testid="inspector">
          <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
          <SectorPanel v-else-if="selection.kind === 'sector' && selectedSector" :sector="selectedSector" :is-admin="isAdmin" @close="reset" />
          <SectorCreatePanel v-else-if="selection.kind === 'create-sector'" @created="(id) => selectedSectorId = id" @close="reset" />
          <RowPanel v-else-if="selection.kind === 'row' && selectedRow" :row="selectedRow.row" :sector-name="selectedRow.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="reset" />
          <RowCreatePanel v-else-if="selection.kind === 'create-row' && createRowSector" :sector-id="createRowSector.id" :sector-name="createRowSector.name" :types="data.umbrellaTypes" @close="reset" />
          <UmbrellaPanel v-else-if="selection.kind === 'umbrella' && selectedUmbrella" :umbrella="selectedUmbrella.umbrella" :row-label="selectedUmbrella.row.label" :sector-name="selectedUmbrella.sector.name" :types="data.umbrellaTypes" :is-admin="isAdmin" @close="reset" />
          <UmbrellaCreatePanel v-else-if="selection.kind === 'create-umbrella' && createUmbrellaRow" :row-id="createUmbrellaRow.id" :row-label="createUmbrellaRow.label" :types="data.umbrellaTypes" @close="reset" />
          <MultiPanel v-else-if="selection.kind === 'multi'" :ids="selection.ids" :labels="multiLabels" :types="data.umbrellaTypes" @close="reset" />
        </div>
      </Drawer>
    </div>
  </section>
</template>
