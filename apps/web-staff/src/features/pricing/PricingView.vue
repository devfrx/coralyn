<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { Button, Card, DataTable, Modal, Field, Input, Select, Icon, PageToolbar, formatEuro } from '@coralyn/ui-kit';
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
// Seleziona la prima stagione appena arrivano i dati, se non ce n'è già una attiva.
watchEffect(() => {
  if (!activeSeasonId.value && (seasons.value?.length ?? 0) > 0) activeSeasonId.value = seasons.value![0].id;
});
const getSeasonId = () => activeSeasonId.value;

/** Elimina la stagione attiva SOLO dopo conferma: cascata applicativa che elimina anche tutte le sue tariffe (irreversibile). */
function confirmDeleteSeason() {
  const name = seasons.value?.find((s) => s.id === activeSeasonId.value)?.name ?? '';
  if (!window.confirm(`Eliminare la stagione «${name}» e tutte le sue tariffe? L'operazione è irreversibile.`)) return;
  deleteSeason.mutate(activeSeasonId.value, { onSuccess: () => (activeSeasonId.value = '') });
}

// --- Pacchetti ---
const { data: packages } = usePackages();
const createPackage = useCreatePackage();
const updatePackage = useUpdatePackage();
const deletePackage = useDeletePackage();

// --- Tariffe ---
const { data: rates } = useRates(getSeasonId);
const createRate = useCreateRate(getSeasonId);
const updateRate = useUpdateRate(getSeasonId);
const deleteRate = useDeleteRate(getSeasonId);

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
    <PageToolbar>
      <template #left>
        <Field label="Stagione">
          <Select v-model="activeSeasonId" data-test="season-select">
            <option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </Select>
        </Field>
        <Button variant="secondary" data-test="new-season" @click="seasonModal = true"><Icon name="plus" :size="16" />Stagione</Button>
        <Button
          v-if="activeSeasonId"
          variant="danger"
          data-test="delete-season"
          @click="confirmDeleteSeason"
        ><Icon name="trash-2" :size="16" />Elimina stagione</Button>
      </template>
      <template #right>
        <Button data-test="new-package" variant="secondary" @click="openCreatePackage"><Icon name="plus" :size="16" />Pacchetto</Button>
        <Button data-test="new-rate" :disabled="!activeSeasonId" @click="openCreateRate"><Icon name="plus" :size="16" />Nuova tariffa</Button>
      </template>
    </PageToolbar>

    <!-- Card pacchetti -->
    <div class="mb-3.5 grid grid-cols-3 gap-3.5">
      <Card v-for="p in packages" :key="p.id">
        <div class="p-[18px]">
          <div class="mb-2.5 flex items-center justify-between">
            <span class="text-[15px] font-bold text-[var(--color-text)]">{{ p.name }}</span>
            <div class="flex items-center gap-2.5">
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                :data-test="`edit-pkg-${p.id}`" @click="openEditPackage(p)"><Icon name="edit" :size="15" /></button>
              <button class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                :data-test="`del-pkg-${p.id}`" @click="deletePackage.mutate(p.id)"><Icon name="trash-2" :size="15" /></button>
            </div>
          </div>
          <div class="min-h-[40px] text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">
            {{ Object.entries(p.equipment).map(([k, v]) => `${v} ${k}`).join(' · ') || 'Nessuna dotazione' }}
          </div>
        </div>
      </Card>
    </div>

    <!-- Tabella tariffe -->
    <DataTable :columns="rateCols">
      <tr v-for="r in rates" :key="r.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 font-semibold text-[var(--color-text)]">{{ sectorName(r.sectorId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ pkgName(r.packageId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ slotName(r.timeSlotId) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ r.type ?? 'Tutti' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-right tabular-nums text-[var(--color-text)]">{{ formatEuro(r.price) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <div class="flex items-center justify-end gap-2.5">
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              :data-test="`edit-rate-${r.id}`" @click="openEditRate(r)"><Icon name="edit" :size="15" /></button>
            <button class="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              :data-test="`del-rate-${r.id}`" @click="deleteRate.mutate(r.id)"><Icon name="trash-2" :size="15" /></button>
          </div>
        </td>
      </tr>
    </DataTable>

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
  </section>
</template>
