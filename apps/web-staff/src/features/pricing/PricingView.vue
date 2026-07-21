<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Button, Card, DataTable, EmptyState, Modal, ConfirmDialog, Field, Input, Select, Icon, IconButton, ActionBar, formatEuro } from '@coralyn/ui-kit';
import type { BookingType, PackageEquipmentDTO, RateDTO, TimeSlotDTO } from '@coralyn/contracts';
import { useSeasons, useCreateSeason, useDeleteSeason } from './useSeasons';
import { useRates, useCreateRate, useUpdateRate, useDeleteRate } from './useRates';
import { useTimeSlots, useCreateTimeSlot, useUpdateTimeSlot, useDeleteTimeSlot } from './useTimeSlots';
import { useAllPackages, useCreatePackage, useUpdatePackage, useDeletePackage, useArchivePackage, useRestorePackage } from '@/features/bookings/usePackages';
import {
  useEquipmentTypes,
  useAllEquipmentTypes,
  useCreateEquipmentType,
  useUpdateEquipmentType,
  useArchiveEquipmentType,
  useRestoreEquipmentType,
  useDeleteEquipmentType,
} from './useEquipmentTypes';
import { useDayMap } from '@/features/map/useDayMap';
import { rateSpecificity } from './rateSpecificity';

// --- Stagioni ---
const { data: seasons } = useSeasons();
const createSeason = useCreateSeason();
const deleteSeason = useDeleteSeason();
const activeSeasonId = ref('');
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
const activeSeason = computed(() => seasons.value?.find((s) => s.id === activeSeasonId.value));
// Seleziona la prima stagione appena arrivano i dati, se non ce n'è già una attiva.
watchEffect(() => {
  if (!activeSeasonId.value && (seasons.value?.length ?? 0) > 0) activeSeasonId.value = seasons.value![0].id;
});
const getSeasonId = () => activeSeasonId.value;

// "2026-06-01" → "1 giu" (data breve in italiano per il pill stagione).
const MONTHS_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function shortDay(iso?: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS_IT[Number(m) - 1] ?? ''}`;
}
const seasonRange = computed(() => {
  const s = activeSeason.value;
  return s ? `${shortDay(s.startDate)} – ${shortDay(s.endDate)}` : '';
});

// --- Pacchetti ---
const { data: packages } = useAllPackages(); // include archiviati (editor)
const createPackage = useCreatePackage();
const updatePackage = useUpdatePackage();
const deletePackage = useDeletePackage();
const archivePackage = useArchivePackage();
const restorePackage = useRestorePackage();
const activePackages = computed(() => (packages.value ?? []).filter((p) => !p.archived));
const archivedPackages = computed(() => (packages.value ?? []).filter((p) => p.archived));
const archivedOpen = ref(false);

// Dotazione leggibile: [{name:'Lettino',quantity:3}] → "3 × Lettino".
function equipmentLabel(equipment: PackageEquipmentDTO[]): string {
  if (equipment.length === 0) return 'Nessuna dotazione';
  return equipment.map((e) => `${e.quantity} × ${e.name}`).join(' · ');
}

// --- Catalogo tipi di dotazione ---
const { data: equipmentTypesData } = useAllEquipmentTypes(); // include archiviati (editor catalogo)
const createEquipmentType = useCreateEquipmentType();
const updateEquipmentType = useUpdateEquipmentType();
const archiveEquipmentType = useArchiveEquipmentType();
const restoreEquipmentType = useRestoreEquipmentType();
const deleteEquipmentType = useDeleteEquipmentType();
const activeEquipmentTypes = computed(() => (equipmentTypesData.value ?? []).filter((t) => !t.archived));
const archivedEquipmentTypes = computed(() => (equipmentTypesData.value ?? []).filter((t) => t.archived));
const archivedEqtOpen = ref(false);
// Lista SOLO attivi, per il compositore pacchetto (i selettori di riga non devono proporre archiviati).
const { data: equipmentTypesActive } = useEquipmentTypes();

// --- Tariffe ---
const { data: rates } = useRates(getSeasonId);
const createRate = useCreateRate(getSeasonId);
const updateRate = useUpdateRate(getSeasonId);
const deleteRate = useDeleteRate(getSeasonId);
function rateCount(pkgId: string): number {
  return (rates.value ?? []).filter((r) => r.packageId === pkgId).length;
}
// Ordinamento per specificità (ADR-0032): non muta `rates`, solo la vista in tabella.
const sortedRates = computed(() =>
  [...(rates.value ?? [])].sort((a, b) => rateSpecificity(b) - rateSpecificity(a)),
);

// --- Fasce orarie ---
const { data: slots } = useTimeSlots();
const createSlot = useCreateTimeSlot();
const updateSlot = useUpdateTimeSlot();
const deleteSlot = useDeleteTimeSlot();

// --- Conferme distruttive (ConfirmDialog) ---
type PendingDelete =
  | { kind: 'season'; id: string; name: string }
  | { kind: 'package'; id: string; name: string }
  | { kind: 'rate'; id: string }
  | { kind: 'timeSlot'; id: string; name: string }
  | { kind: 'equipmentType'; id: string; name: string };
const pendingDelete = ref<PendingDelete | null>(null);
const confirmOpen = ref(false);

function askDeleteSeason() {
  const name = seasons.value?.find((s) => s.id === activeSeasonId.value)?.name ?? '';
  pendingDelete.value = { kind: 'season', id: activeSeasonId.value, name };
  confirmOpen.value = true;
}
function askDeletePackage(p: { id: string; name: string }) {
  pendingDelete.value = { kind: 'package', id: p.id, name: p.name };
  confirmOpen.value = true;
}
function askDeleteRate(id: string) {
  pendingDelete.value = { kind: 'rate', id };
  confirmOpen.value = true;
}
function askDeleteTimeSlot(s: { id: string; name: string }) {
  pendingDelete.value = { kind: 'timeSlot', id: s.id, name: s.name };
  confirmOpen.value = true;
}
function askDeleteEquipmentType(t: { id: string; name: string }) {
  pendingDelete.value = { kind: 'equipmentType', id: t.id, name: t.name };
  confirmOpen.value = true;
}
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'season')
    return { title: 'Eliminare la stagione?', description: `«${p.name}» e tutte le sue tariffe. L'operazione è irreversibile.` };
  if (p?.kind === 'package')
    return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimosso in modo irreversibile. Possibile solo perché è archiviato e senza tariffe/prenotazioni collegate.` };
  if (p?.kind === 'rate')
    return { title: 'Eliminare la tariffa?', description: 'La regola di prezzo verrà rimossa dal listino.' };
  if (p?.kind === 'timeSlot')
    return { title: 'Eliminare la fascia?', description: `«${p.name}». Se è usata da tariffe o prenotazioni non sarà eliminata.` };
  if (p?.kind === 'equipmentType')
    return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimosso in modo irreversibile dal catalogo.` };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'season') deleteSeason.mutate(p.id, { onSuccess: () => (activeSeasonId.value = '') });
  else if (p.kind === 'package') deletePackage.mutate(p.id);
  else if (p.kind === 'timeSlot') deleteSlot.mutate(p.id);
  else if (p.kind === 'equipmentType') deleteEquipmentType.mutate(p.id);
  else deleteRate.mutate(p.id);
  confirmOpen.value = false;
  pendingDelete.value = null;
}

// --- Dimensioni per il modale tariffa (da mappa + pacchetti) ---
const { data: dayMap } = useDayMap();
const sectorOptions = computed(() => (dayMap.value?.sectors ?? []).map((s) => ({ value: s.id, label: s.name })));
const timeSlotOptions = computed(() => (dayMap.value?.timeSlots ?? []).map((t) => ({ value: t.id, label: t.name })));
const packageOptions = computed(() => activePackages.value.map((p) => ({ value: p.id, label: p.name })));
const TYPE_OPTIONS: { value: BookingType; label: string }[] = [
  { value: 'daily', label: 'Giornaliera' }, { value: 'periodic', label: 'Periodica' }, { value: 'subscription', label: 'Abbonamento' },
];

// --- Modale stagione ---
const seasonModal = ref(false);
const sName = ref(''); const sStart = ref(''); const sEnd = ref('');
function submitSeason() {
  if (!sName.value || !sStart.value || !sEnd.value) return;
  createSeason.mutate(
    { name: sName.value, startDate: sStart.value, endDate: sEnd.value },
    { onSuccess: (s) => { activeSeasonId.value = s.id; sName.value = sStart.value = sEnd.value = ''; seasonModal.value = false; } },
  );
}

// --- Modale pacchetto: compositore multi-voce ---
const NEW_TYPE_OPTION = '__new__'; // sentinella per "+ Crea «testo»" nel select di riga
const pkgModal = ref(false);
const editingPkgId = ref<string | null>(null); // null = crea, valorizzato = modifica
const pName = ref('');
const pRows = ref<{ equipmentTypeId: string; quantity: string }[]>([]);
const equipmentTypeOptions = computed(() => (equipmentTypesActive.value ?? []).map((t) => ({ value: t.id, label: t.name })));
function openCreatePackage() {
  editingPkgId.value = null;
  pName.value = '';
  pRows.value = [];
  pkgModal.value = true;
}
function openEditPackage(p: { id: string; name: string; equipment: PackageEquipmentDTO[] }) {
  editingPkgId.value = p.id;
  pName.value = p.name;
  pRows.value = p.equipment.map((e) => ({ equipmentTypeId: e.equipmentTypeId, quantity: String(e.quantity) }));
  pkgModal.value = true;
}
function closePackageModal() {
  pkgModal.value = false;
  editingPkgId.value = null;
}
function addEquipmentRow() {
  pRows.value.push({ equipmentTypeId: '', quantity: '1' });
}
function removeEquipmentRow(i: number) {
  pRows.value.splice(i, 1);
}

// Creazione al volo di un tipo dalla riga del compositore (spec §5): l'utente digita un nome nuovo
// nel prompt, la select propone "+ Crea «testo»"; alla selezione si crea il tipo e si seleziona l'id.
const newTypeRowIndex = ref<number | null>(null);
const newTypeModal = ref(false);
const newTypeName = ref('');
function onRowTypeChange(i: number, value: string) {
  if (value === NEW_TYPE_OPTION) {
    newTypeRowIndex.value = i;
    newTypeName.value = '';
    newTypeModal.value = true;
    pRows.value[i].equipmentTypeId = ''; // non lasciare la sentinella selezionata
    return;
  }
  pRows.value[i].equipmentTypeId = value;
}
function closeNewTypeModal() {
  newTypeModal.value = false;
  newTypeRowIndex.value = null;
  newTypeName.value = '';
}
function submitNewEquipmentType() {
  if (!newTypeName.value.trim()) return;
  createEquipmentType.mutate(
    { name: newTypeName.value.trim() },
    {
      onSuccess: (created) => {
        if (newTypeRowIndex.value !== null) pRows.value[newTypeRowIndex.value].equipmentTypeId = created.id;
        closeNewTypeModal();
      },
    },
  );
}

function submitPackage() {
  if (!pName.value) return;
  const equipment = pRows.value
    .filter((r) => r.equipmentTypeId)
    .map((r) => ({ equipmentTypeId: r.equipmentTypeId, quantity: Math.max(1, Number(r.quantity) || 1) }));
  const input = { name: pName.value, equipment };
  if (editingPkgId.value) {
    updatePackage.mutate({ id: editingPkgId.value, input }, { onSuccess: () => closePackageModal() });
  } else {
    createPackage.mutate(input, { onSuccess: () => closePackageModal() });
  }
}

// --- Catalogo tipi di dotazione: modale crea/rinomina ---
const eqtModal = ref(false);
const editingEqtId = ref<string | null>(null); // null = crea, valorizzato = modifica
const eqtName = ref('');
function openCreateEquipmentType() {
  editingEqtId.value = null;
  eqtName.value = '';
  eqtModal.value = true;
}
function openEditEquipmentType(t: { id: string; name: string }) {
  editingEqtId.value = t.id;
  eqtName.value = t.name;
  eqtModal.value = true;
}
function closeEquipmentTypeModal() {
  eqtModal.value = false;
  editingEqtId.value = null;
}
function submitEquipmentType() {
  if (!eqtName.value) return;
  const input = { name: eqtName.value };
  if (editingEqtId.value) {
    updateEquipmentType.mutate({ id: editingEqtId.value, input }, { onSuccess: () => closeEquipmentTypeModal() });
  } else {
    createEquipmentType.mutate(input, { onSuccess: () => closeEquipmentTypeModal() });
  }
}

// --- Modale fascia ---
const slotModal = ref(false);
const editingSlotId = ref<string | null>(null); // null = crea, valorizzato = modifica
const slotNameField = ref(''); const slotStart = ref(''); const slotEnd = ref('');
function openCreateSlot() {
  editingSlotId.value = null;
  slotNameField.value = ''; slotStart.value = '08:00'; slotEnd.value = '19:00';
  slotModal.value = true;
}
function openEditSlot(s: TimeSlotDTO) {
  editingSlotId.value = s.id;
  slotNameField.value = s.name;
  slotStart.value = s.startTime ?? '';
  slotEnd.value = s.endTime ?? '';
  slotModal.value = true;
}
function closeSlotModal() {
  slotModal.value = false;
  editingSlotId.value = null;
}
function submitSlot() {
  if (!slotNameField.value || !slotStart.value || !slotEnd.value) return;
  const input = { name: slotNameField.value, startTime: slotStart.value, endTime: slotEnd.value };
  if (editingSlotId.value) {
    updateSlot.mutate({ id: editingSlotId.value, input }, { onSuccess: () => closeSlotModal() });
  } else {
    createSlot.mutate(input, { onSuccess: () => closeSlotModal() });
  }
}

// --- Modale tariffa ---
const rateModal = ref(false);
const editingRateId = ref<string | null>(null); // null = crea, valorizzato = modifica
const rType = ref(''); const rSector = ref(''); const rPackage = ref(''); const rSlot = ref('');
const rPrice = ref('');
function resetRateForm() {
  rType.value = rSector.value = rPackage.value = rSlot.value = '';
  rPrice.value = '';
}
function openCreateRate() {
  editingRateId.value = null;
  resetRateForm();
  rateModal.value = true;
}
function openEditRate(r: RateDTO) {
  editingRateId.value = r.id;
  rType.value = r.type ?? '';
  rSector.value = r.sectorId ?? '';
  rPackage.value = r.packageId ?? '';
  rSlot.value = r.timeSlotId ?? '';
  rPrice.value = String(r.price);
  rateModal.value = true;
}
function closeRateModal() {
  rateModal.value = false;
  editingRateId.value = null;
}
function submitRate() {
  if (rPrice.value === '') return;
  if (editingRateId.value) {
    // Edit: `null` (non `undefined`) per le dimensioni svuotate, altrimenti JSON.stringify le droppa
    // e il backend le interpreta come "campo non toccato" → il vecchio valore resterebbe silenziosamente.
    const editDims = {
      type: (rType.value || null) as BookingType | null,
      sectorId: rSector.value || null,
      packageId: rPackage.value || null,
      timeSlotId: rSlot.value || null,
      price: Number(rPrice.value),
    };
    updateRate.mutate({ id: editingRateId.value, input: editDims }, { onSuccess: () => { resetRateForm(); closeRateModal(); } });
  } else {
    if (!activeSeasonId.value) return;
    const createDims = {
      type: (rType.value || undefined) as BookingType | undefined,
      sectorId: rSector.value || undefined,
      packageId: rPackage.value || undefined,
      timeSlotId: rSlot.value || undefined,
      price: Number(rPrice.value),
    };
    createRate.mutate(
      { seasonId: activeSeasonId.value, ...createDims },
      { onSuccess: () => { resetRateForm(); closeRateModal(); } },
    );
  }
}

// --- Etichette per la tabella tariffe ---
function pkgName(id?: string) { if (!id) return 'Tutti'; return packages.value?.find((p) => p.id === id)?.name ?? '—'; }
function slotName(id?: string) { if (!id) return 'Tutte'; return dayMap.value?.timeSlots.find((t) => t.id === id)?.name ?? '—'; }
function sectorName(id?: string) { return dayMap.value?.sectors.find((s) => s.id === id)?.name ?? 'Tutti'; }
/** Posizione leggibile: "Settore · Fila" se c'è la fila, altrimenti il settore, altrimenti "Tutti". */
function rowName(id?: string): string | undefined {
  if (!id || !dayMap.value) return undefined;
  for (const s of dayMap.value.sectors) {
    const row = s.rows.find((r) => r.id === id);
    if (row) return `${s.name} · ${row.label}`;
  }
  return undefined;
}
function positionLabel(r: RateDTO): string {
  return rowName(r.rowId) ?? (r.sectorId ? sectorName(r.sectorId) : 'Tutti');
}
function typeLabel(t?: BookingType): string {
  return t ? (TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t) : 'Tutti';
}
function priceHint(r: RateDTO): string {
  return r.type === 'subscription' ? 'forfait/stagione' : '/giorno';
}
const rateCols = [
  { key: 'position', label: 'Posizione' },
  { key: 'package', label: 'Pacchetto' },
  { key: 'slot', label: 'Fascia' },
  { key: 'type', label: 'Tipo' },
  { key: 'price', label: 'Prezzo', align: 'right' as const },
  { key: 'actions', label: '' },
];
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <!-- Barra stagione + azioni -->
    <div class="mb-[18px] flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2.5">
        <Select v-model="activeSeasonId" data-test="season-select" class="min-w-[150px] font-semibold">
          <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </Select>
        <span v-if="seasonRange" class="whitespace-nowrap text-[12px] tabular-nums text-[var(--color-text-muted)]">{{ seasonRange }}</span>
      </div>
      <ActionBar gap="sm" align="start">
        <Button variant="secondary" size="sm" data-test="new-season" @click="seasonModal = true"><Icon name="plus" :size="16" />Stagione</Button>
        <IconButton
          v-if="activeSeasonId"
          icon="trash-2"
          label="Elimina stagione"
          variant="danger"
          size="sm"
          data-test="delete-season"
          @click="askDeleteSeason"
        />
      </ActionBar>
      <div class="flex-1"></div>
      <ActionBar gap="sm">
        <Button variant="secondary" size="sm" data-test="new-equipment-type" @click="openCreateEquipmentType"><Icon name="plus" :size="16" />Tipo di dotazione</Button>
        <Button variant="secondary" size="sm" data-test="new-package" @click="openCreatePackage"><Icon name="plus" :size="16" />Pacchetto</Button>
        <Button size="sm" data-test="new-rate" :disabled="!activeSeasonId" @click="openCreateRate"><Icon name="plus" :size="16" />Nuova tariffa</Button>
      </ActionBar>
    </div>

    <!-- Catalogo tipi di dotazione -->
    <EmptyState v-if="activeEquipmentTypes.length === 0" class="mb-4" message="Nessun tipo di dotazione. Creane uno con «Tipo di dotazione»." />
    <div v-else class="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card v-for="t in activeEquipmentTypes" :key="t.id">
        <div class="flex items-center justify-between gap-2 p-3.5">
          <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ t.name }}</span>
          <ActionBar gap="sm">
            <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
              :data-test="`edit-eqt-${t.id}`" @click="openEditEquipmentType(t)" />
            <IconButton icon="archive" label="Archivia" variant="ghost" size="sm"
              :data-test="`archive-eqt-${t.id}`" @click="archiveEquipmentType.mutate(t.id)" />
          </ActionBar>
        </div>
      </Card>
    </div>

    <!-- Tipi di dotazione archiviati (a scomparsa, chiusa di default) -->
    <div v-if="archivedEquipmentTypes.length > 0" class="mb-4">
      <button type="button" data-test="toggle-archived-eqt"
        class="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-2nd)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="archivedEqtOpen = !archivedEqtOpen">
        <Icon :name="archivedEqtOpen ? 'chevron-down' : 'chevron-right'" :size="15" />
        Archiviati ({{ archivedEquipmentTypes.length }})
      </button>
      <div v-if="archivedEqtOpen" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card v-for="t in archivedEquipmentTypes" :key="t.id" class="opacity-60">
          <div class="flex items-center justify-between gap-2 p-3.5">
            <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ t.name }}</span>
            <ActionBar gap="sm">
              <IconButton icon="renew" label="Ripristina" variant="ghost" size="sm"
                :data-test="`restore-eqt-${t.id}`" @click="restoreEquipmentType.mutate(t.id)" />
              <IconButton icon="trash-2" label="Elimina definitivamente" variant="danger" size="sm"
                :data-test="`del-eqt-${t.id}`" @click="askDeleteEquipmentType(t)" />
            </ActionBar>
          </div>
        </Card>
      </div>
    </div>

    <!-- Card pacchetti -->
    <EmptyState v-if="activePackages.length === 0" class="mb-4" message="Nessun pacchetto. Creane uno con «Pacchetto»." />
    <div v-else class="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
      <Card v-for="p in activePackages" :key="p.id">
        <div class="flex h-full flex-col p-[18px]">
          <div class="mb-2 flex items-start justify-between gap-2">
            <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
            <ActionBar gap="sm">
              <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
                :data-test="`edit-pkg-${p.id}`" @click="openEditPackage(p)" />
              <IconButton icon="archive" label="Archivia" variant="ghost" size="sm"
                :data-test="`archive-pkg-${p.id}`" @click="archivePackage.mutate(p.id)" />
            </ActionBar>
          </div>
          <div class="min-h-[38px] flex-1 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">{{ equipmentLabel(p.equipment) }}</div>
          <div class="mt-3 flex items-baseline gap-1.5 border-t border-[var(--color-border-row)] pt-3">
            <span class="text-[18px] font-bold tabular-nums text-[var(--color-text)]">{{ rateCount(p.id) }}</span>
            <span class="text-[11.5px] text-[var(--color-text-muted)]">{{ rateCount(p.id) === 1 ? 'tariffa collegata' : 'tariffe collegate' }}</span>
          </div>
        </div>
      </Card>
    </div>

    <!-- Pacchetti archiviati (a scomparsa, chiusa di default) -->
    <div v-if="archivedPackages.length > 0" class="mb-4">
      <button type="button" data-test="toggle-archived"
        class="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-2nd)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="archivedOpen = !archivedOpen">
        <Icon :name="archivedOpen ? 'chevron-down' : 'chevron-right'" :size="15" />
        Archiviati ({{ archivedPackages.length }})
      </button>
      <div v-if="archivedOpen" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <Card v-for="p in archivedPackages" :key="p.id" class="opacity-60">
          <div class="flex h-full flex-col p-[18px]">
            <div class="mb-2 flex items-start justify-between gap-2">
              <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
              <ActionBar gap="sm">
                <IconButton icon="renew" label="Ripristina" variant="ghost" size="sm"
                  :data-test="`restore-pkg-${p.id}`" @click="restorePackage.mutate(p.id)" />
                <IconButton icon="trash-2" label="Elimina definitivamente" variant="danger" size="sm"
                  :data-test="`del-pkg-${p.id}`" @click="askDeletePackage(p)" />
              </ActionBar>
            </div>
            <div class="min-h-[38px] flex-1 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">{{ equipmentLabel(p.equipment) }}</div>
          </div>
        </Card>
      </div>
    </div>

    <!-- Fasce orarie della giornata (editor) -->
    <div class="mb-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[13px] font-semibold text-[var(--color-text-2nd)]">Fasce orarie</span>
        <Button variant="secondary" size="sm" data-test="new-time-slot" @click="openCreateSlot"><Icon name="plus" :size="16" />Nuova fascia</Button>
      </div>
      <EmptyState v-if="(slots?.length ?? 0) === 0" message="Nessuna fascia. Creane una con «Nuova fascia»." />
      <div v-else class="flex flex-wrap gap-2.5">
        <div v-for="f in slots" :key="f.id" :data-test="`slot-${f.id}`"
          class="flex items-center gap-2 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-raised)] px-3.5 py-2">
          <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />
          <span class="text-[12.5px] font-semibold text-[var(--color-text)]">{{ f.name }}</span>
          <span v-if="f.startTime" class="text-[11.5px] text-[var(--color-text-muted)]">{{ f.startTime }}–{{ f.endTime }}</span>
          <ActionBar gap="sm">
            <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
              :data-test="`edit-slot-${f.id}`" @click="openEditSlot(f)" />
            <IconButton icon="trash-2" label="Elimina" variant="danger" size="sm"
              :data-test="`del-slot-${f.id}`" @click="askDeleteTimeSlot(f)" />
          </ActionBar>
        </div>
      </div>
    </div>

    <!-- Tabella tariffe -->
    <p class="mb-2 text-[12px] text-[var(--color-text-muted)]">
      Quando più tariffe si applicano, vince la più specifica: periodo › fila › settore › pacchetto › fascia › tipo.
    </p>
    <DataTable :columns="rateCols">
      <tr v-for="r in sortedRates" :key="r.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 font-semibold text-[var(--color-text)]">{{ positionLabel(r) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ pkgName(r.packageId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ slotName(r.timeSlotId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ typeLabel(r.type) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right">
          <span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro(r.price) }}</span>
          <span class="ml-1 text-[11px] text-[var(--color-text-muted)]">{{ priceHint(r) }}</span>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <ActionBar gap="sm">
            <IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
              :data-test="`edit-rate-${r.id}`" @click="openEditRate(r)" />
            <IconButton icon="trash-2" label="Elimina" variant="danger" size="sm"
              :data-test="`del-rate-${r.id}`" @click="askDeleteRate(r.id)" />
          </ActionBar>
        </td>
      </tr>
    </DataTable>
    <EmptyState v-if="activeSeasonId && (rates?.length ?? 0) === 0" class="mt-3" message="Nessuna tariffa per questa stagione. Aggiungine una con «Nuova tariffa»." />

    <!-- Modale stagione -->
    <Modal v-model:open="seasonModal" title="Nuova stagione">
      <form id="form-season" data-test="form-season" class="flex flex-col gap-4" @submit.prevent="submitSeason">
        <Field label="Nome"><Input name="name" v-model="sName" placeholder="Estate 2027" /></Field>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Inizio"><Input name="startDate" v-model="sStart" type="date" /></Field></div>
          <div class="flex-1"><Field label="Fine"><Input name="endDate" v-model="sEnd" type="date" /></Field></div>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="seasonModal = false">Annulla</Button>
          <Button type="submit" form="form-season">Crea stagione</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale pacchetto -->
    <Modal v-model:open="pkgModal" :title="editingPkgId ? 'Modifica pacchetto' : 'Nuovo pacchetto'">
      <form id="form-package" data-test="form-package" class="flex flex-col gap-4" @submit.prevent="submitPackage">
        <Field label="Nome"><Input name="name" v-model="pName" placeholder="Comfort" /></Field>
        <div class="flex flex-col gap-2.5">
          <span class="text-[12px] font-semibold text-[var(--color-text-2nd)]">Dotazione</span>
          <div v-for="(row, i) in pRows" :key="i" :data-test="`equip-row-${i}`" class="flex items-center gap-2.5">
            <div class="flex-1">
              <Select
                :model-value="row.equipmentTypeId"
                @update:model-value="(v) => onRowTypeChange(i, v as string)"
              >
                <option value="" disabled>Seleziona un tipo</option>
                <option v-for="o in equipmentTypeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                <option :value="NEW_TYPE_OPTION">+ Crea nuovo tipo…</option>
              </Select>
            </div>
            <div class="w-20"><Input name="quantity" v-model="row.quantity" type="number" min="1" /></div>
            <IconButton icon="trash-2" label="Rimuovi voce" variant="danger" size="sm"
              @click="removeEquipmentRow(i)" />
          </div>
          <Button variant="secondary" size="sm" type="button" data-test="add-equipment-row" @click="addEquipmentRow"><Icon name="plus" :size="16" />Aggiungi voce</Button>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closePackageModal">Annulla</Button>
          <Button type="submit" form="form-package">{{ editingPkgId ? 'Salva modifiche' : 'Salva pacchetto' }}</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale tipo di dotazione -->
    <Modal v-model:open="eqtModal" :title="editingEqtId ? 'Modifica tipo di dotazione' : 'Nuovo tipo di dotazione'">
      <form id="form-equipment-type" data-test="form-equipment-type" class="flex flex-col gap-4" @submit.prevent="submitEquipmentType">
        <Field label="Nome"><Input name="name" v-model="eqtName" placeholder="Lettino" /></Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeEquipmentTypeModal">Annulla</Button>
          <Button type="submit" form="form-equipment-type">{{ editingEqtId ? 'Salva modifiche' : 'Salva tipo' }}</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale creazione al volo di un tipo (dal compositore pacchetto) -->
    <Modal v-model:open="newTypeModal" title="Nuovo tipo di dotazione">
      <form id="form-new-equipment-type" data-test="form-new-equipment-type" class="flex flex-col gap-4" @submit.prevent="submitNewEquipmentType">
        <Field label="Nome"><Input name="name" v-model="newTypeName" placeholder="Cassaforte" /></Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeNewTypeModal">Annulla</Button>
          <Button type="submit" form="form-new-equipment-type">Crea e seleziona</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale fascia -->
    <Modal v-model:open="slotModal" :title="editingSlotId ? 'Modifica fascia' : 'Nuova fascia'">
      <form id="form-time-slot" data-test="form-time-slot" class="flex flex-col gap-4" @submit.prevent="submitSlot">
        <Field label="Nome"><Input name="name" v-model="slotNameField" data-test="slot-name" placeholder="Es. Mattina" /></Field>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Inizio"><Input name="startTime" v-model="slotStart" type="time" data-test="slot-start" /></Field></div>
          <div class="flex-1"><Field label="Fine"><Input name="endTime" v-model="slotEnd" type="time" data-test="slot-end" /></Field></div>
        </div>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeSlotModal">Annulla</Button>
          <Button type="submit" form="form-time-slot">{{ editingSlotId ? 'Salva modifiche' : 'Salva fascia' }}</Button>
        </div>
      </template>
    </Modal>

    <!-- Modale tariffa -->
    <Modal v-model:open="rateModal" :title="editingRateId ? 'Modifica tariffa' : 'Nuova tariffa'">
      <form id="form-rate" data-test="form-rate" class="flex flex-col gap-4" @submit.prevent="submitRate">
        <div class="flex gap-3.5">
          <div class="flex-1">
            <Field label="Tipo (opz.)">
              <Select v-model="rType">
                <option value="">Tutti</option>
                <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Select>
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Settore (opz.)">
              <Select v-model="rSector">
                <option value="">Tutti</option>
                <option v-for="o in sectorOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Select>
            </Field>
          </div>
        </div>
        <div class="flex gap-3.5">
          <div class="flex-1">
            <Field label="Pacchetto (opz.)">
              <Select v-model="rPackage">
                <option value="">Nessuno</option>
                <option v-for="o in packageOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Select>
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Fascia (opz.)">
              <Select v-model="rSlot">
                <option value="">Tutte</option>
                <option v-for="o in timeSlotOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Select>
            </Field>
          </div>
        </div>
        <Field label="Prezzo (€)"><Input name="price" v-model="rPrice" type="number" step="0.01" placeholder="28.00" /></Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="closeRateModal">Annulla</Button>
          <Button type="submit" form="form-rate">{{ editingRateId ? 'Salva modifiche' : 'Crea tariffa' }}</Button>
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
