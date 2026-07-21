<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Button, Card, DataTable, EmptyState, Modal, ConfirmDialog, Field, Input, Select, Icon, IconButton, ActionBar, formatEuro } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { RentalItemDTO, RentalTariffDTO } from '@coralyn/contracts';
import { useSeasons } from '@/features/pricing/useSeasons';
import {
  useAllRentalItems,
  useCreateRentalItem,
  useUpdateRentalItem,
  useArchiveRentalItem,
  useRestoreRentalItem,
  useDeleteRentalItem,
} from './useRentalItems';
import {
  useRentalTariffs,
  useCreateRentalTariff,
  useUpdateRentalTariff,
  useArchiveRentalTariff,
  useRestoreRentalTariff,
  useDeleteRentalTariff,
} from './useRentalTariffs';

// --- Stagioni (riuso: nessuna gestione CRUD qui, solo selettore per le tariffe) ---
const { data: seasons } = useSeasons();
const activeSeasonId = ref('');
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
// Seleziona la prima stagione appena arrivano i dati, se non ce n'è già una attiva.
watchEffect(() => {
  if (!activeSeasonId.value && (seasons.value?.length ?? 0) > 0) activeSeasonId.value = seasons.value![0].id;
});

// --- Catalogo articoli ---
const { data: itemsData } = useAllRentalItems(); // include archiviati (editor catalogo)
const createItem = useCreateRentalItem();
const updateItem = useUpdateRentalItem();
const archiveItem = useArchiveRentalItem();
const restoreItem = useRestoreRentalItem();
const deleteItem = useDeleteRentalItem();
const activeItems = computed(() => (itemsData.value ?? []).filter((i) => !i.archived));
const archivedItems = computed(() => (itemsData.value ?? []).filter((i) => i.archived));
const archivedItemsOpen = ref(false);

function stockLabel(stock: number | null): string {
  return stock == null ? 'Scorta illimitata' : `${stock} in scorta`;
}

// --- Selezione articolo per l'editor tariffe ---
const selectedItemId = ref<string | null>(null);
function selectItem(id: string) {
  selectedItemId.value = id;
}
const selectedItem = computed<RentalItemDTO | undefined>(() =>
  (itemsData.value ?? []).find((i) => i.id === selectedItemId.value),
);

// --- Modale articolo: crea/rinomina (nome + scorta opzionale svuotabile → null) ---
const itemModal = ref(false);
const editingItemId = ref<string | null>(null); // null = crea, valorizzato = modifica
const iName = ref('');
const iStock = ref(''); // stringa: '' → null (scorta illimitata)
function openCreateItem() {
  editingItemId.value = null;
  iName.value = '';
  iStock.value = '';
  itemModal.value = true;
}
function openEditItem(it: RentalItemDTO) {
  editingItemId.value = it.id;
  iName.value = it.name;
  iStock.value = it.stock == null ? '' : String(it.stock);
  itemModal.value = true;
}
function closeItemModal() {
  itemModal.value = false;
  editingItemId.value = null;
}
function submitItem() {
  if (!iName.value) return;
  const stock = iStock.value === '' ? null : Number(iStock.value);
  const input = { name: iName.value, stock };
  if (editingItemId.value) {
    updateItem.mutate({ id: editingItemId.value, input }, { onSuccess: () => closeItemModal() });
  } else {
    createItem.mutate(input, { onSuccess: () => closeItemModal() });
  }
}

// --- Editor tariffe stagionali per l'articolo selezionato ---
const getItemId = () => selectedItemId.value ?? '';
const getSeasonId = () => activeSeasonId.value;
const { data: tariffsData, isLoading: tariffsLoading } = useRentalTariffs(getItemId, getSeasonId);
const createTariff = useCreateRentalTariff(getItemId, getSeasonId);
const updateTariff = useUpdateRentalTariff(getItemId, getSeasonId);
const archiveTariff = useArchiveRentalTariff(getItemId, getSeasonId);
const restoreTariff = useRestoreRentalTariff(getItemId, getSeasonId);
const deleteTariff = useDeleteRentalTariff(getItemId, getSeasonId);
const activeTariffs = computed(() => (tariffsData.value ?? []).filter((t) => !t.archived));
const archivedTariffs = computed(() => (tariffsData.value ?? []).filter((t) => t.archived));
const archivedTariffsOpen = ref(false);

function durationLabel(minutes: number | null): string {
  return minutes == null ? '—' : `${minutes} min`;
}

const tariffCols: DataTableColumn[] = [
  { key: 'label', label: 'Tariffa' },
  { key: 'duration', label: 'Durata' },
  { key: 'price', label: 'Prezzo', align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// --- Modale tariffa: crea/modifica ---
const tariffModal = ref(false);
const editingTariffId = ref<string | null>(null); // null = crea, valorizzato = modifica
const tLabel = ref('');
const tPrice = ref('');
const tDuration = ref(''); // '' → null (nessuna durata)
const tOrder = ref(''); // '' → non inviato (ordine di default)
function resetTariffForm() {
  tLabel.value = '';
  tPrice.value = '';
  tDuration.value = '';
  tOrder.value = '';
}
function openCreateTariff() {
  editingTariffId.value = null;
  resetTariffForm();
  tariffModal.value = true;
}
function openEditTariff(t: RentalTariffDTO) {
  editingTariffId.value = t.id;
  tLabel.value = t.label;
  tPrice.value = String(t.price);
  tDuration.value = t.durationMinutes == null ? '' : String(t.durationMinutes);
  tOrder.value = '';
  tariffModal.value = true;
}
function closeTariffModal() {
  tariffModal.value = false;
  editingTariffId.value = null;
}
function submitTariff() {
  if (!tLabel.value || tPrice.value === '') return;
  const durationMinutes = tDuration.value === '' ? null : Number(tDuration.value);
  const input = {
    label: tLabel.value,
    price: Number(tPrice.value),
    durationMinutes,
    ...(tOrder.value !== '' ? { sortOrder: Number(tOrder.value) } : {}),
  };
  if (editingTariffId.value) {
    updateTariff.mutate({ id: editingTariffId.value, input }, { onSuccess: () => { resetTariffForm(); closeTariffModal(); } });
  } else {
    createTariff.mutate(input, { onSuccess: () => { resetTariffForm(); closeTariffModal(); } });
  }
}

// --- Conferme distruttive (ConfirmDialog) ---
type PendingDelete = { kind: 'item'; id: string; name: string } | { kind: 'tariff'; id: string; label: string };
const pendingDelete = ref<PendingDelete | null>(null);
const confirmOpen = ref(false);
function askDeleteItem(it: { id: string; name: string }) {
  pendingDelete.value = { kind: 'item', id: it.id, name: it.name };
  confirmOpen.value = true;
}
function askDeleteTariff(t: { id: string; label: string }) {
  pendingDelete.value = { kind: 'tariff', id: t.id, label: t.label };
  confirmOpen.value = true;
}
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'item')
    return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimosso in modo irreversibile dal catalogo.` };
  if (p?.kind === 'tariff')
    return { title: 'Eliminare definitivamente?', description: `«${p.label}» verrà rimossa in modo irreversibile.` };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'item') {
    deleteItem.mutate(p.id, { onSuccess: () => { if (selectedItemId.value === p.id) selectedItemId.value = null; } });
  } else {
    deleteTariff.mutate(p.id);
  }
  confirmOpen.value = false;
  pendingDelete.value = null;
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <!-- Barra azioni catalogo -->
    <div class="mb-[18px] flex flex-wrap items-center gap-3">
      <span class="text-[15px] font-bold text-[var(--color-text)]">Catalogo noleggio</span>
      <div class="flex-1"></div>
      <ActionBar gap="sm">
        <Button size="sm" data-test="new-item" @click="openCreateItem"><Icon name="plus" :size="16" />Nuovo articolo</Button>
      </ActionBar>
    </div>

    <!-- Card articoli attivi -->
    <EmptyState v-if="activeItems.length === 0" class="mb-4" message="Nessun articolo. Creane uno con «Nuovo articolo»." />
    <div v-else class="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        v-for="it in activeItems"
        :key="it.id"
        :data-test="`select-item-${it.id}`"
        :class="['cursor-pointer', selectedItemId === it.id ? 'outline outline-2 outline-[var(--color-accent)]' : '']"
        @click="selectItem(it.id)"
      >
        <div class="flex flex-col gap-1.5 p-3.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ it.name }}</span>
            <ActionBar gap="sm">
              <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
                :data-test="`edit-item-${it.id}`" @click.stop="openEditItem(it)" />
              <IconButton icon="archive" label="Archivia" variant="ghost" size="sm"
                :data-test="`archive-item-${it.id}`" @click.stop="archiveItem.mutate(it.id)" />
            </ActionBar>
          </div>
          <span class="text-[11.5px] text-[var(--color-text-muted)]">{{ stockLabel(it.stock) }}</span>
        </div>
      </Card>
    </div>

    <!-- Articoli archiviati (a scomparsa, chiusa di default) -->
    <div v-if="archivedItems.length > 0" class="mb-4">
      <button type="button" data-test="toggle-archived-items"
        class="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-2nd)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="archivedItemsOpen = !archivedItemsOpen">
        <Icon :name="archivedItemsOpen ? 'chevron-down' : 'chevron-right'" :size="15" />
        Archiviati ({{ archivedItems.length }})
      </button>
      <div v-if="archivedItemsOpen" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card v-for="it in archivedItems" :key="it.id" class="opacity-60">
          <div class="flex flex-col gap-1.5 p-3.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ it.name }}</span>
              <ActionBar gap="sm">
                <IconButton icon="renew" label="Ripristina" variant="ghost" size="sm"
                  :data-test="`restore-item-${it.id}`" @click="restoreItem.mutate(it.id)" />
                <IconButton icon="trash-2" label="Elimina definitivamente" variant="danger" size="sm"
                  :data-test="`del-item-${it.id}`" @click="askDeleteItem(it)" />
              </ActionBar>
            </div>
            <span class="text-[11.5px] text-[var(--color-text-muted)]">{{ stockLabel(it.stock) }}</span>
          </div>
        </Card>
      </div>
    </div>

    <!-- Editor tariffe stagionali dell'articolo selezionato -->
    <EmptyState v-if="!selectedItem" message="Seleziona un articolo dal catalogo per gestirne le tariffe." />
    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <span class="text-[13px] font-semibold text-[var(--color-text-2nd)]">Tariffe · {{ selectedItem.name }}</span>
        <Select v-model="activeSeasonId" data-test="season-select" class="min-w-[150px]">
          <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </Select>
        <div class="flex-1"></div>
        <Button variant="secondary" size="sm" data-test="new-tariff" :disabled="!activeSeasonId" @click="openCreateTariff">
          <Icon name="plus" :size="16" />Nuova tariffa
        </Button>
      </div>

      <DataTable :columns="tariffCols" :rows="(activeTariffs as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as RentalTariffDTO).id" :loading="tariffsLoading">
        <template #cell-label="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as RentalTariffDTO).label }}</span></template>
        <template #cell-duration="{ row }"><span class="text-[var(--color-text-2nd)]">{{ durationLabel((row as unknown as RentalTariffDTO).durationMinutes) }}</span></template>
        <template #cell-price="{ row }"><span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro((row as unknown as RentalTariffDTO).price) }}</span></template>
        <template #cell-actions="{ row }">
          <ActionBar gap="sm">
            <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
              :data-test="`edit-tariff-${(row as unknown as RentalTariffDTO).id}`" @click="openEditTariff(row as unknown as RentalTariffDTO)" />
            <IconButton icon="archive" label="Archivia" variant="ghost" size="sm"
              :data-test="`archive-tariff-${(row as unknown as RentalTariffDTO).id}`" @click="archiveTariff.mutate((row as unknown as RentalTariffDTO).id)" />
          </ActionBar>
        </template>
      </DataTable>
      <EmptyState v-if="activeSeasonId && activeTariffs.length === 0" class="mt-3" message="Nessuna tariffa per questa stagione. Aggiungine una con «Nuova tariffa»." />

      <!-- Tariffe archiviate (a scomparsa, chiusa di default) -->
      <div v-if="archivedTariffs.length > 0" class="mt-4">
        <button type="button" data-test="toggle-archived-tariffs"
          class="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-2nd)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          @click="archivedTariffsOpen = !archivedTariffsOpen">
          <Icon :name="archivedTariffsOpen ? 'chevron-down' : 'chevron-right'" :size="15" />
          Archiviati ({{ archivedTariffs.length }})
        </button>
        <DataTable
          v-if="archivedTariffsOpen"
          :columns="tariffCols"
          :rows="(archivedTariffs as unknown as Record<string, unknown>[])"
          :row-key="(r) => (r as unknown as RentalTariffDTO).id"
          :row-class="() => 'opacity-60'"
        >
          <template #cell-label="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as RentalTariffDTO).label }}</span></template>
          <template #cell-duration="{ row }"><span class="text-[var(--color-text-2nd)]">{{ durationLabel((row as unknown as RentalTariffDTO).durationMinutes) }}</span></template>
          <template #cell-price="{ row }"><span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro((row as unknown as RentalTariffDTO).price) }}</span></template>
          <template #cell-actions="{ row }">
            <ActionBar gap="sm">
              <IconButton icon="renew" label="Ripristina" variant="ghost" size="sm"
                :data-test="`restore-tariff-${(row as unknown as RentalTariffDTO).id}`" @click="restoreTariff.mutate((row as unknown as RentalTariffDTO).id)" />
              <IconButton icon="trash-2" label="Elimina definitivamente" variant="danger" size="sm"
                :data-test="`del-tariff-${(row as unknown as RentalTariffDTO).id}`" @click="askDeleteTariff(row as unknown as RentalTariffDTO)" />
            </ActionBar>
          </template>
        </DataTable>
      </div>
    </template>

    <!-- Modale articolo -->
    <Modal v-model:open="itemModal" :title="editingItemId ? 'Modifica articolo' : 'Nuovo articolo'">
      <form id="form-item" data-test="form-item" class="flex flex-col gap-4" @submit.prevent="submitItem">
        <Field label="Nome"><Input name="name" v-model="iName" placeholder="SUP" /></Field>
        <Field label="Scorta (opz.)"><Input name="stock" v-model="iStock" type="number" min="0" placeholder="Illimitata" /></Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeItemModal">Annulla</Button>
          <Button type="submit" form="form-item">{{ editingItemId ? 'Salva modifiche' : 'Salva articolo' }}</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale tariffa -->
    <Modal v-model:open="tariffModal" :title="editingTariffId ? 'Modifica tariffa' : 'Nuova tariffa'">
      <form id="form-tariff" data-test="form-tariff" class="flex flex-col gap-4" @submit.prevent="submitTariff">
        <Field label="Etichetta"><Input name="label" v-model="tLabel" placeholder="Mezza giornata" /></Field>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Prezzo (€)"><Input name="price" v-model="tPrice" type="number" step="0.01" placeholder="15.00" /></Field></div>
          <div class="flex-1"><Field label="Durata min. (opz.)"><Input name="durationMinutes" v-model="tDuration" type="number" min="0" placeholder="Illimitata" /></Field></div>
        </div>
        <Field label="Ordine (opz.)"><Input name="sortOrder" v-model="tOrder" type="number" min="0" /></Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeTariffModal">Annulla</Button>
          <Button type="submit" form="form-tariff">{{ editingTariffId ? 'Salva modifiche' : 'Crea tariffa' }}</Button>
        </div>
      </template>
    </Modal>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      confirm-label="Elimina"
      tone="danger"
      @confirm="onConfirmDelete"
    />
  </section>
</template>
