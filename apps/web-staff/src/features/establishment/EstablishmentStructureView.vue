<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, Drawer, Skeleton, EmptyState, useDelayedLoading } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useEstablishmentStructure } from './useEstablishmentStructure';
import StructureScene from './StructureScene.vue';
import BeachPanel from './panels/BeachPanel.vue';
import type { Selection } from './structureSelection';

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

// Stadio 1 (Task 8): i pannelli Settore/Fila/Ombrellone/Multi/Create arrivano nei Task 9-12.
// Il placeholder mostra `selection.kind`, tranne per l'ombrellone dove mostra la sua etichetta
// (crumb «A1»…) — è l'unico caso in cui il vecchio test di navigazione ha un'aspettativa leggibile.
const placeholderLabel = computed(() => {
  const s = selection.value;
  if (s.kind !== 'umbrella' || !data.value) return s.kind;
  for (const sec of data.value.sectors) for (const r of sec.rows) { const u = r.umbrellas.find((x) => x.id === s.id); if (u) return u.label; }
  return s.kind;
});
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
        <!-- I pannelli Settore/Fila/Ombrellone/Multi/Create arrivano nei Task 9-12 -->
        <div v-else class="p-[18px] text-[12.5px] text-[var(--color-text-muted)]" data-testid="panel-placeholder">{{ placeholderLabel }}</div>
      </aside>
      <Drawer v-else v-model:open="drawerOpen" title="Ispettore">
        <div data-testid="inspector">
          <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
          <div v-else class="p-[18px] text-[12.5px] text-[var(--color-text-muted)]" data-testid="panel-placeholder">{{ placeholderLabel }}</div>
        </div>
      </Drawer>
    </div>
  </section>
</template>
