<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Button, Card, DataTable, EmptyState, Modal, ConfirmDialog, Field, Input, Select, Icon, formatEuro } from '@coralyn/ui-kit';
import type { BookingType, RateDTO, RateUnit } from '@coralyn/contracts';
import { useSeasons, useCreateSeason, useDeleteSeason } from './useSeasons';
import { useRates, useCreateRate, useUpdateRate, useDeleteRate } from './useRates';
import { usePackages, useCreatePackage, useUpdatePackage, useDeletePackage } from '@/features/bookings/usePackages';
import { useDayMap } from '@/features/map/useDayMap';

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
const { data: packages } = usePackages();
const createPackage = useCreatePackage();
const updatePackage = useUpdatePackage();
const deletePackage = useDeletePackage();

// Dotazione leggibile: {sunbeds:4} → "4 lettini". Chiavi note tradotte, le altre mostrate come sono.
const EQUIP_IT: Record<string, [string, string]> = {
  sunbeds: ['lettino', 'lettini'],
  deckchairs: ['sdraio', 'sdraio'],
  umbrellas: ['ombrellone', 'ombrelloni'],
};
function equipmentLabel(equipment: Record<string, number>): string {
  const parts = Object.entries(equipment).map(([k, v]) => {
    const it = EQUIP_IT[k];
    const noun = it ? (v === 1 ? it[0] : it[1]) : k;
    return `${v} ${noun}`;
  });
  return parts.join(' · ') || 'Nessuna dotazione';
}

// --- Tariffe ---
const { data: rates } = useRates(getSeasonId);
const createRate = useCreateRate(getSeasonId);
const updateRate = useUpdateRate(getSeasonId);
const deleteRate = useDeleteRate(getSeasonId);
function rateCount(pkgId: string): number {
  return (rates.value ?? []).filter((r) => r.packageId === pkgId).length;
}

// --- Conferme distruttive (ConfirmDialog) ---
type PendingDelete =
  | { kind: 'season'; id: string; name: string }
  | { kind: 'package'; id: string; name: string }
  | { kind: 'rate'; id: string };
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
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'season')
    return { title: 'Eliminare la stagione?', description: `«${p.name}» e tutte le sue tariffe. L'operazione è irreversibile.` };
  if (p?.kind === 'package')
    return { title: 'Eliminare il pacchetto?', description: `«${p.name}». Se è referenziato da tariffe o prenotazioni non sarà eliminato.` };
  if (p?.kind === 'rate')
    return { title: 'Eliminare la tariffa?', description: 'La regola di prezzo verrà rimossa dal listino.' };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'season') deleteSeason.mutate(p.id, { onSuccess: () => (activeSeasonId.value = '') });
  else if (p.kind === 'package') deletePackage.mutate(p.id);
  else deleteRate.mutate(p.id);
  confirmOpen.value = false;
  pendingDelete.value = null;
}

// --- Dimensioni per il modale tariffa (da mappa + pacchetti) ---
const { data: dayMap } = useDayMap();
const sectorOptions = computed(() => (dayMap.value?.sectors ?? []).map((s) => ({ value: s.id, label: s.name })));
const timeSlotOptions = computed(() => (dayMap.value?.timeSlots ?? []).map((t) => ({ value: t.id, label: t.name })));
const packageOptions = computed(() => (packages.value ?? []).map((p) => ({ value: p.id, label: p.name })));
const TYPE_OPTIONS: { value: BookingType; label: string }[] = [
  { value: 'daily', label: 'Giornaliera' }, { value: 'periodic', label: 'Periodica' }, { value: 'subscription', label: 'Abbonamento' },
];
const UNIT_OPTIONS: { value: RateUnit; label: string }[] = [
  { value: 'day', label: 'Al giorno' }, { value: 'period', label: 'Forfait periodo' },
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

// --- Modale pacchetto ---
const pkgModal = ref(false);
const editingPkgId = ref<string | null>(null); // null = crea, valorizzato = modifica
const pName = ref(''); const pSunbeds = ref('2');
function openCreatePackage() {
  editingPkgId.value = null;
  pName.value = ''; pSunbeds.value = '2';
  pkgModal.value = true;
}
function openEditPackage(p: { id: string; name: string; equipment: Record<string, number> }) {
  editingPkgId.value = p.id;
  pName.value = p.name;
  pSunbeds.value = String(p.equipment.sunbeds ?? 0);
  pkgModal.value = true;
}
function closePackageModal() {
  pkgModal.value = false;
  editingPkgId.value = null;
}
function submitPackage() {
  if (!pName.value) return;
  const input = { name: pName.value, equipment: { sunbeds: Number(pSunbeds.value) || 0 } };
  if (editingPkgId.value) {
    updatePackage.mutate({ id: editingPkgId.value, input }, { onSuccess: () => closePackageModal() });
  } else {
    createPackage.mutate(input, { onSuccess: () => closePackageModal() });
  }
}

// --- Modale tariffa ---
const rateModal = ref(false);
const editingRateId = ref<string | null>(null); // null = crea, valorizzato = modifica
const rType = ref(''); const rSector = ref(''); const rPackage = ref(''); const rSlot = ref('');
const rPrice = ref(''); const rUnit = ref<RateUnit>('day');
function resetRateForm() {
  rType.value = rSector.value = rPackage.value = rSlot.value = '';
  rPrice.value = ''; rUnit.value = 'day';
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
  rUnit.value = r.unit;
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
      unit: rUnit.value,
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
      unit: rUnit.value,
    };
    createRate.mutate(
      { seasonId: activeSeasonId.value, ...createDims },
      { onSuccess: () => { resetRateForm(); closeRateModal(); } },
    );
  }
}

// --- Etichette per la tabella tariffe ---
function pkgName(id?: string) { return packages.value?.find((p) => p.id === id)?.name ?? '—'; }
function slotName(id?: string) { return dayMap.value?.timeSlots.find((t) => t.id === id)?.name ?? '—'; }
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
function unitLabel(unit: RateUnit): string {
  return unit === 'day' ? '/ giorno' : '/ periodo';
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
      <Button variant="secondary" data-test="new-season" @click="seasonModal = true"><Icon name="plus" :size="16" />Stagione</Button>
      <button
        v-if="activeSeasonId"
        data-test="delete-season"
        type="button"
        title="Elimina stagione"
        class="grid h-9 w-9 place-items-center rounded-[10px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="askDeleteSeason"
      ><Icon name="trash-2" :size="16" /></button>
      <div class="flex-1"></div>
      <Button variant="secondary" data-test="new-package" @click="openCreatePackage"><Icon name="plus" :size="16" />Pacchetto</Button>
      <Button data-test="new-rate" :disabled="!activeSeasonId" @click="openCreateRate"><Icon name="plus" :size="16" />Nuova tariffa</Button>
    </div>

    <!-- Card pacchetti -->
    <EmptyState v-if="(packages?.length ?? 0) === 0" class="mb-4" message="Nessun pacchetto. Creane uno con «Pacchetto»." />
    <div v-else class="mb-4 grid grid-cols-3 gap-3.5">
      <Card v-for="p in packages" :key="p.id">
        <div class="flex h-full flex-col p-[18px]">
          <div class="mb-2 flex items-start justify-between gap-2">
            <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
            <div class="flex shrink-0 items-center gap-2.5">
              <button type="button" title="Modifica" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                :data-test="`edit-pkg-${p.id}`" @click="openEditPackage(p)"><Icon name="edit" :size="15" /></button>
              <button type="button" title="Elimina" class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                :data-test="`del-pkg-${p.id}`" @click="askDeletePackage(p)"><Icon name="trash-2" :size="15" /></button>
            </div>
          </div>
          <div class="min-h-[38px] flex-1 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">{{ equipmentLabel(p.equipment) }}</div>
          <div class="mt-3 flex items-baseline gap-1.5 border-t border-[var(--color-border-row)] pt-3">
            <span class="text-[18px] font-bold tabular-nums text-[var(--color-text)]">{{ rateCount(p.id) }}</span>
            <span class="text-[11.5px] text-[var(--color-text-muted)]">{{ rateCount(p.id) === 1 ? 'tariffa collegata' : 'tariffe collegate' }}</span>
          </div>
        </div>
      </Card>
    </div>

    <!-- Fasce orarie della giornata (contesto per le tariffe) -->
    <div v-if="(dayMap?.timeSlots?.length ?? 0) > 0" class="mb-4 flex flex-wrap gap-2.5">
      <div v-for="f in dayMap!.timeSlots" :key="f.id"
        class="flex items-center gap-2 rounded-[11px] border border-[var(--color-border)] bg-[var(--color-raised)] px-3.5 py-2">
        <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />
        <span class="text-[12.5px] font-semibold text-[var(--color-text)]">{{ f.name }}</span>
      </div>
    </div>

    <!-- Tabella tariffe -->
    <DataTable :columns="rateCols">
      <tr v-for="r in rates" :key="r.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 font-semibold text-[var(--color-text)]">{{ positionLabel(r) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ pkgName(r.packageId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ slotName(r.timeSlotId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ typeLabel(r.type) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right">
          <span class="font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro(r.price) }}</span>
          <span class="ml-1 text-[11px] text-[var(--color-text-muted)]">{{ unitLabel(r.unit) }}</span>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <div class="flex items-center justify-end gap-2.5">
            <button type="button" title="Modifica" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              :data-test="`edit-rate-${r.id}`" @click="openEditRate(r)"><Icon name="edit" :size="15" /></button>
            <button type="button" title="Elimina" class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              :data-test="`del-rate-${r.id}`" @click="askDeleteRate(r.id)"><Icon name="trash-2" :size="15" /></button>
          </div>
        </td>
      </tr>
    </DataTable>
    <EmptyState v-if="activeSeasonId && (rates?.length ?? 0) === 0" class="mt-3" message="Nessuna tariffa per questa stagione. Aggiungine una con «Nuova tariffa»." />

    <!-- Modale stagione -->
    <Modal v-model:open="seasonModal" title="Nuova stagione">
      <form data-test="form-season" class="flex flex-col gap-4" @submit.prevent="submitSeason">
        <Field label="Nome"><Input name="name" v-model="sName" placeholder="Estate 2027" /></Field>
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Inizio"><Input name="startDate" v-model="sStart" type="date" /></Field></div>
          <div class="flex-1"><Field label="Fine"><Input name="endDate" v-model="sEnd" type="date" /></Field></div>
        </div>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="seasonModal = false">Annulla</Button>
          <Button type="submit">Crea stagione</Button>
        </div>
      </form>
    </Modal>

    <!-- Modale pacchetto -->
    <Modal v-model:open="pkgModal" :title="editingPkgId ? 'Modifica pacchetto' : 'Nuovo pacchetto'">
      <form data-test="form-package" class="flex flex-col gap-4" @submit.prevent="submitPackage">
        <Field label="Nome"><Input name="name" v-model="pName" placeholder="Comfort" /></Field>
        <Field label="Lettini"><Input name="sunbeds" v-model="pSunbeds" type="number" /></Field>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="closePackageModal">Annulla</Button>
          <Button type="submit">{{ editingPkgId ? 'Salva modifiche' : 'Salva pacchetto' }}</Button>
        </div>
      </form>
    </Modal>

    <!-- Modale tariffa -->
    <Modal v-model:open="rateModal" :title="editingRateId ? 'Modifica tariffa' : 'Nuova tariffa'">
      <form data-test="form-rate" class="flex flex-col gap-4" @submit.prevent="submitRate">
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
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Prezzo (€)"><Input name="price" v-model="rPrice" type="number" step="0.01" placeholder="28.00" /></Field></div>
          <div class="flex-1">
            <Field label="Unità">
              <Select v-model="rUnit">
                <option v-for="o in UNIT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Select>
            </Field>
          </div>
        </div>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="closeRateModal">Annulla</Button>
          <Button type="submit">{{ editingRateId ? 'Salva modifiche' : 'Crea tariffa' }}</Button>
        </div>
      </form>
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
