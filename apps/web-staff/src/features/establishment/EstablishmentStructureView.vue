<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, Drawer, Skeleton, EmptyState, ConfirmDialog, useDelayedLoading } from '@coralyn/ui-kit';
import type { MoveUmbrellaInput } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useEstablishmentStructure, useMoveUmbrella } from './useEstablishmentStructure';
import StructureScene from './StructureScene.vue';
import InspectorPanels from './InspectorPanels.vue';
import { findUmbrella, type Selection } from './structureSelection';
import { applyMove } from './umbrellaMove';

const session = useSessionStore();
const router = useRouter();
const canManage = computed(() => session.hasPermission(Permission.StructureManage));
const { data, isLoading, dataUpdatedAt } = useEstablishmentStructure();
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

// Spostamento per trascinamento (D-038). L'anteprima ottimistica si fa QUI e non nel data-layer:
// `mutationResource` restituisce l'oggetto `useMutation` intero, quindi lo stato della mutation è
// già leggibile. Senza anteprima la cella resta ferma fino alla risposta del server e poi salta.
const moveUmbrella = useMoveUmbrella();
/**
 * L'anteprima regge finché l'ALBERO non ha recepito QUELLO spostamento, non finché la mutation è
 * pendente. `isPending` cade quando risponde il POST, ma la rilettura della struttura è ancora in
 * volo e `useQuery` conserva il dato precedente durante un refetch di background: nella finestra
 * fra le due risposte la cella tornava al punto di partenza e poi risaltava — un rimbalzo, peggiore
 * del salto singolo che l'anteprima doveva evitare.
 *
 * `treeAtWrite` è la fotografia di `dataUpdatedAt` — l'istante dell'ultima rilettura riuscita —
 * scattata quando la scrittura viene accettata. Cattura l'albero PRIMA della scrittura per un
 * fatto interno all'ordine dei callback di TanStack Query: l'`onSettled` di `mutationResource` (dove
 * l'invalidazione PARTE) viene atteso prima che gli osservatori notifichino il successo, quindi
 * prima di questo `onSuccess` — ma la sua promise è scartata di proposito (vedi il commento in
 * `useQueryResource.ts`), perciò quando questo `onSuccess` legge `dataUpdatedAt` la rilettura è
 * solo partita, non atterrata. Se quella promise venisse un domani attesa lì, questo `onSuccess`
 * scatterebbe solo dopo l'atterraggio, e la fotografia diventerebbe silenziosamente «l'albero dopo»
 * invece che «prima».
 *
 * La finestra vale finché quella fotografia combacia, cioè finché a schermo c'è ancora lo STESSO
 * albero su cui l'anteprima è stata calcolata: si chiude alla prima rilettura che atterra con un
 * `dataUpdatedAt` diverso da questa fotografia — nella pratica la prima dopo la scrittura.
 * L'assunzione che regge davvero questa condizione non è che l'orologio non torni indietro, ma che
 * due letture riuscite consecutive non atterrino nello STESSO millisecondo: se accadesse il
 * timestamp non cambierebbe e la finestra resterebbe aperta un giro in più — benigno, perché in
 * quel giro l'albero a schermo contiene già lo spostamento. E non si riapre, perché la fotografia
 * non viene ri-scattata se non alla scrittura successiva.
 *
 * ⚠️ Legare la finestra a `isFetching` invece che a questa fotografia sembrava equivalente e non lo
 * era: `isSuccess` non torna mai falso e `isFetching` è vero per QUALUNQUE rilettura, comprese
 * quelle delle altre diciassette mutazioni di `structureKeys`. Per il resto della sessione ogni
 * rilettura riapplicava lo spostamento vecchio a un albero che nel frattempo era cambiato sotto —
 * bastava eliminare un ombrellone che lo precedeva perché `applyMove` producesse uno scambio.
 *
 * ⚠️ La fotografia si scatta nell'`onSuccess` della singola `mutate()`, non in un `watch`:
 * query-core la esegue dentro la stessa notifica che porta `isPending` a falso e prima di
 * aggiornare i ref letti di qui, quindi non c'è ordine di flush di Vue da cui dipendere. Vale
 * perché la vista che possiede la mutation è anche quella che rende l'anteprima: se si smontasse
 * non ci sarebbe più nessuna anteprima da tenere.
 */
const treeAtWrite = ref<number | null>(null);
const moveSettling = computed(() => moveUmbrella.isPending.value
  || (treeAtWrite.value !== null && dataUpdatedAt.value === treeAtWrite.value));
const previewSectors = computed(() => {
  const sectors = data.value?.sectors ?? [];
  const vars = moveUmbrella.variables.value;
  if (!moveSettling.value || !vars) return sectors;
  return applyMove(sectors, vars.id, vars.rowId, vars.position);
});

function submitMove(vars: { id: string } & MoveUmbrellaInput): void {
  // Azzerato ad OGNI nuovo invio, non solo al montaggio: senza, un secondo spostamento lanciato
  // mentre la rilettura del primo (riuscito) è ancora in volo erediterebbe questa fotografia, e se
  // quel secondo spostamento venisse RESPINTO la finestra resterebbe aperta sulle sue `variables` —
  // un rifiuto travestito da anteprima ancora valida. Innocuo qui: da qui in poi la finestra è
  // tenuta da `isPending`, che si accende comunque per la durata di QUESTA mutation.
  treeAtWrite.value = null;
  moveUmbrella.mutate(vars, { onSuccess: () => { treeAtWrite.value = dataUpdatedAt.value; } });
}
/**
 * Disclosure, non blocco (spec §2.5). Se una tariffa nomina il settore di partenza o quello
 * d'arrivo, il prezzo dei RINNOVI cambia base — `renew()` ripassa dal pricing e risolve la
 * posizione corrente — e l'unica cosa scorretta sarebbe farlo in silenzio. Bloccare sarebbe
 * sbagliato nel merito: una tariffa «Settore A» *deve* smettere di coprire chi esce da A.
 *
 * La bandiera arriva con la struttura e non da `GET /rates`: là servirebbe `pricing.manage`, che
 * chi gestisce la struttura può non avere (D-063), e le tariffe sono per stagione mentre la
 * conseguenza è su una stagione futura.
 */
const pendingMove = ref<{ umbrellaId: string; label: string; rowId: string; position: number; from: string; to: string } | null>(null);

function onMoveUmbrella(umbrellaId: string, rowId: string, position: number): void {
  const origin = data.value ? findUmbrella(data.value, umbrellaId) : null;
  const destination = data.value?.sectors.find((s) => s.rows.some((r) => r.id === rowId)) ?? null;
  if (origin && destination && origin.sector.id !== destination.id
    && (origin.sector.hasDedicatedRates || destination.hasDedicatedRates)) {
    pendingMove.value = {
      umbrellaId, label: origin.umbrella.label, rowId, position,
      from: origin.sector.name, to: destination.name,
    };
    return;
  }
  submitMove({ id: umbrellaId, rowId, position });
}

function confirmMove(): void {
  const pending = pendingMove.value;
  if (!pending) return;
  pendingMove.value = null;
  submitMove({ id: pending.umbrellaId, rowId: pending.rowId, position: pending.position });
}

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
// selezione multipla senza dover ri-cliccare il toggle «Seleziona»). Se un ConfirmDialog (reka-ui,
// role="dialog"/"alertdialog") è aperto sopra il pannello, Esc deve annullare SOLO la conferma
// (gestito da reka-ui stesso) e non anche collassare pannello/selezione sottostanti.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
  reset();
}
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
      <StructureScene :sectors="previewSectors" :types="data.umbrellaTypes" :selected-sector-id="selectedSectorId"
        :selection="selection" :select-mode="selectMode" :can-manage="canManage" :can-drag="isDesktop"
        @select-sector="onSelectSector" @create-sector="selection = { kind: 'create-sector' }"
        @select-row="(id) => selection = { kind: 'row', id }" @create-row="(sid) => selection = { kind: 'create-row', sectorId: sid }"
        @select-umbrella="onSelectUmbrella" @create-umbrella="(rid) => selection = { kind: 'create-umbrella', rowId: rid }"
        @select-beach="reset" @toggle-select-mode="toggleSelectMode"
        @row-generate="(id) => selection = { kind: 'row', id, focus: 'generate' }" @row-danger="(id) => selection = { kind: 'row', id, focus: 'danger' }"
        @move-umbrella="onMoveUmbrella" />

      <aside v-if="isDesktop" data-testid="inspector" class="min-w-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-raised)]" aria-label="Ispettore">
        <InspectorPanels :data="data" :selection="selection" :can-manage="canManage"
          :selected-sector="selectedSector" :selected-row="selectedRow" :selected-umbrella="selectedUmbrella"
          :create-row-sector="createRowSector" :create-umbrella-row="createUmbrellaRow" :multi-labels="multiLabels"
          @close="reset" @created="(id) => selectedSectorId = id" />
      </aside>
      <Drawer v-else v-model:open="drawerOpen" title="Ispettore">
        <div data-testid="inspector">
          <InspectorPanels :data="data" :selection="selection" :can-manage="canManage"
            :selected-sector="selectedSector" :selected-row="selectedRow" :selected-umbrella="selectedUmbrella"
            :create-row-sector="createRowSector" :create-umbrella-row="createUmbrellaRow" :multi-labels="multiLabels"
            @close="reset" @created="(id) => selectedSectorId = id" />
        </div>
      </Drawer>
    </div>

    <!-- Nessun componente nuovo: è il ConfirmDialog di ui-kit con contenuto nello slot, come già
         fa ADR-0052 per il distruttivo. Il tono resta `default`: non si sta distruggendo nulla. -->
    <ConfirmDialog :open="pendingMove !== null" @update:open="(v: boolean) => { if (!v) pendingMove = null; }"
      title="Il prezzo dei rinnovi cambierà base" confirm-label="Sposta comunque" data-testid="move-disclosure"
      @confirm="confirmMove">
      <p v-if="pendingMove" class="text-[13px] leading-relaxed text-[var(--color-text-2nd)]">
        Il listino ha tariffe dedicate a «{{ pendingMove.from }}» o a «{{ pendingMove.to }}».
        Spostando l’ombrellone <strong>{{ pendingMove.label }}</strong> in «{{ pendingMove.to }}»,
        i <strong>rinnovi futuri</strong> saranno prezzati con le tariffe di «{{ pendingMove.to }}».
        Le prenotazioni già registrate non cambiano: il loro prezzo è uno snapshot scritto alla conferma.
      </p>
    </ConfirmDialog>
  </section>
</template>
