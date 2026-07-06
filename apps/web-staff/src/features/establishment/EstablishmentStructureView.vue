<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Badge, Button, Icon, Modal, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import type { StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO, UmbrellaTypeDTO, SectorKind } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { pushToast } from '@/lib/toasts';
import {
  useEstablishmentStructure,
  useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType,
  useCreateSector, useUpdateSector, useDeleteSector,
  useCreateRow, useUpdateRow, useDeleteRow,
  useCreateUmbrella, useUpdateUmbrella, useDeleteUmbrella, useGenerateUmbrellas,
} from './useEstablishmentStructure';

const session = useSessionStore();
const router = useRouter();
const { data } = useEstablishmentStructure();
const isAdmin = computed(() => session.role === Role.Admin);

const sectors = computed(() => data.value?.sectors ?? []);
const types = computed(() => data.value?.umbrellaTypes ?? []);
const counts = computed(() => {
  const s = sectors.value;
  const rows = s.reduce((n, x) => n + x.rows.length, 0);
  const umbrellas = s.reduce((n, x) => n + x.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: s.length, rows, umbrellas, types: types.value.length };
});

const selectedSectorId = ref<string | null>(null);
const selectedSector = computed(() => sectors.value.find((s) => s.id === selectedSectorId.value) ?? sectors.value[0] ?? null);
function selectSector(id: string) { selectedSectorId.value = id; }

// --- Tipologie CRUD ---
const createType = useCreateUmbrellaType();
const updateType = useUpdateUmbrellaType();
const removeType = useDeleteUmbrellaType();
const typeModalOpen = ref(false);
const editingTypeId = ref<string | null>(null);
const typeName = ref('');
const typeIcon = ref<'umbrella' | 'leaf' | 'palmtree'>('umbrella');
function openNewType() { editingTypeId.value = null; typeName.value = ''; typeIcon.value = 'umbrella'; typeModalOpen.value = true; }
function openEditType(t: UmbrellaTypeDTO) {
  editingTypeId.value = t.id; typeName.value = t.name;
  typeIcon.value = (t.icon as 'umbrella' | 'leaf' | 'palmtree') ?? 'umbrella';
  typeModalOpen.value = true;
}
function submitType() {
  const name = typeName.value.trim();
  if (!name) return;
  const close = { onSuccess: () => { typeModalOpen.value = false; } };
  if (editingTypeId.value) updateType.mutate({ id: editingTypeId.value, name, icon: typeIcon.value }, close);
  else createType.mutate({ name, icon: typeIcon.value }, close);
}
const savingType = computed(() => createType.isPending.value || updateType.isPending.value);

// --- Settori CRUD ---
const createSector = useCreateSector();
const updateSector = useUpdateSector();
const removeSector = useDeleteSector();
const sectorModalOpen = ref(false);
const editingSectorId = ref<string | null>(null);
const sectorName = ref('');
const sectorKind = ref<SectorKind>('grid');
function openNewSector() { editingSectorId.value = null; sectorName.value = ''; sectorKind.value = 'grid'; sectorModalOpen.value = true; }
function openEditSector(s: StructureSectorDTO) { editingSectorId.value = s.id; sectorName.value = s.name; sectorKind.value = s.kind; sectorModalOpen.value = true; }
function submitSector() {
  const name = sectorName.value.trim();
  if (!name) return;
  if (editingSectorId.value) {
    updateSector.mutate({ id: editingSectorId.value, name, kind: sectorKind.value }, { onSuccess: () => { sectorModalOpen.value = false; } });
  } else {
    createSector.mutate({ name, kind: sectorKind.value }, {
      onSuccess: (res: StructureSectorDTO) => { sectorModalOpen.value = false; selectedSectorId.value = res.id; },
    });
  }
}
const savingSector = computed(() => createSector.isPending.value || updateSector.isPending.value);

// --- Generatore (condiviso da «Nuova fila» e «Genera») ---
const genPrefix = ref('');
const genStart = ref(1);
const genCount = ref(10);
const genTypeId = ref<string>(''); // '' = Normale
function resetGen() { genPrefix.value = ''; genStart.value = 1; genCount.value = 10; genTypeId.value = ''; }
const genPreview = computed(() => {
  const s = Number(genStart.value) || 0;
  const c = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  return Array.from({ length: c }, (_v, i) => `${genPrefix.value}${s + i}`);
});
function genTypeArg(): string | null { return genTypeId.value === '' ? null : genTypeId.value; }

// --- File CRUD (create compone create-fila + generate) ---
const createRow = useCreateRow();
const updateRow = useUpdateRow();
const removeRow = useDeleteRow();
const generateUmbrellas = useGenerateUmbrellas();
const rowModalOpen = ref(false);
const editingRowId = ref<string | null>(null);
const rowLabel = ref('');
function openNewRow() { editingRowId.value = null; rowLabel.value = ''; resetGen(); rowModalOpen.value = true; }
function openEditRow(r: StructureRowDTO) { editingRowId.value = r.id; rowLabel.value = r.label; rowModalOpen.value = true; }
function submitRow() {
  const label = rowLabel.value.trim();
  if (!label) return;
  if (editingRowId.value) {
    updateRow.mutate({ id: editingRowId.value, label }, { onSuccess: () => { rowModalOpen.value = false; } });
    return;
  }
  const sector = selectedSector.value;
  if (!sector) return;
  createRow.mutate({ sectorId: sector.id, label }, {
    onSuccess: (row: StructureRowDTO) => {
      rowModalOpen.value = false; // fila creata: chiudi subito → niente doppio-create su retry
      const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
      if (count <= 0) return;
      generateUmbrellas.mutate(
        { rowId: row.id, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeArg() },
        { onSuccess: (res) => { pushToast(`Fila creata · ${res.created} ombrelloni`); } },
      );
    },
  });
}
const savingRow = computed(() => createRow.isPending.value || updateRow.isPending.value || generateUmbrellas.isPending.value);

// --- Genera (su fila esistente) ---
const genModalOpen = ref(false);
const genRowId = ref<string | null>(null);
function openGenerate(rowId: string) { genRowId.value = rowId; resetGen(); genModalOpen.value = true; }
function submitGenerate() {
  const rowId = genRowId.value;
  const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  if (!rowId || count <= 0) return;
  generateUmbrellas.mutate(
    { rowId, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeArg() },
    { onSuccess: (res) => { genModalOpen.value = false; pushToast(`Creati ${res.created} · saltati ${res.skipped}`); } },
  );
}
const savingGenerate = computed(() => generateUmbrellas.isPending.value);

// --- Ombrelloni CRUD (singolo) ---
const createUmbrella = useCreateUmbrella();
const updateUmbrella = useUpdateUmbrella();
const removeUmbrella = useDeleteUmbrella();
const umbModalOpen = ref(false);
const editingUmbId = ref<string | null>(null);
const umbRowId = ref<string | null>(null);
const umbLabel = ref('');
const umbTypeId = ref<string>(''); // '' = Normale
function openNewUmbrella(rowId: string) { editingUmbId.value = null; umbRowId.value = rowId; umbLabel.value = ''; umbTypeId.value = ''; umbModalOpen.value = true; }
function openEditUmbrella(u: StructureUmbrellaDTO, rowId: string) {
  editingUmbId.value = u.id; umbRowId.value = rowId; umbLabel.value = u.label; umbTypeId.value = u.umbrellaTypeId ?? '';
  umbModalOpen.value = true;
}
function submitUmbrella() {
  const label = umbLabel.value.trim();
  if (!label) return;
  const typeArg: string | null = umbTypeId.value === '' ? null : umbTypeId.value;
  const close = { onSuccess: () => { umbModalOpen.value = false; } };
  if (editingUmbId.value) updateUmbrella.mutate({ id: editingUmbId.value, label, umbrellaTypeId: typeArg }, close);
  else if (umbRowId.value) createUmbrella.mutate({ rowId: umbRowId.value, label, umbrellaTypeId: typeArg }, close);
}
const savingUmb = computed(() => createUmbrella.isPending.value || updateUmbrella.isPending.value);
function deleteFromUmbModal() {
  if (!editingUmbId.value) return;
  askDeleteUmbrella({ id: editingUmbId.value, name: umbLabel.value });
  umbModalOpen.value = false;
}

// --- Elimina (ConfirmDialog generalizzato) ---
const pendingDelete = ref<{ kind: 'type' | 'sector' | 'row' | 'umbrella'; id: string; name: string } | null>(null);
const confirmDeleteOpen = ref(false);
function askDeleteType(t: UmbrellaTypeDTO) { pendingDelete.value = { kind: 'type', id: t.id, name: t.name }; confirmDeleteOpen.value = true; }
function askDeleteSector(s: StructureSectorDTO) { pendingDelete.value = { kind: 'sector', id: s.id, name: s.name }; confirmDeleteOpen.value = true; }
function askDeleteRow(r: StructureRowDTO) { pendingDelete.value = { kind: 'row', id: r.id, name: r.label }; confirmDeleteOpen.value = true; }
function askDeleteUmbrella(u: { id: string; name: string }) { pendingDelete.value = { kind: 'umbrella', id: u.id, name: u.name }; confirmDeleteOpen.value = true; }
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'sector') return { title: 'Eliminare il settore?', description: `«${p.name}». Se contiene file o è usato da tariffe non sarà eliminato.` };
  if (p?.kind === 'row') return { title: 'Eliminare la fila?', description: `«${p.name}». Se contiene ombrelloni o è usata da tariffe non sarà eliminata.` };
  if (p?.kind === 'umbrella') return { title: 'Eliminare l’ombrellone?', description: `«${p.name}». Se ha prenotazioni non sarà eliminato.` };
  if (p?.kind === 'type') return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimossa in modo irreversibile dal catalogo. Se è in uso da ombrelloni non sarà eliminata.` };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'type') removeType.mutate(p.id);
  else if (p.kind === 'sector') removeSector.mutate(p.id);
  else if (p.kind === 'row') removeRow.mutate(p.id);
  else removeUmbrella.mutate(p.id);
  confirmDeleteOpen.value = false;
  pendingDelete.value = null;
}
</script>

<template>
  <section class="max-w-[1040px] px-[26px] pb-[30px] pt-[22px]">
    <button class="mb-3 flex items-center gap-1 text-[13px] font-semibold text-[var(--color-text-muted)]" @click="router.push('/establishment')">
      <Icon name="chevron-left" :size="15" />Stabilimento
    </button>
    <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">Struttura della spiaggia</h2>
    <p class="mb-4 text-[13px] text-[var(--color-text-muted)]">Settori, file, ombrelloni e tipologie · setup guidato</p>

    <div class="mb-4 grid grid-cols-4 gap-4">
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.sectors }}</div><div class="text-xs text-[var(--color-text-muted)]">Settori</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.rows }}</div><div class="text-xs text-[var(--color-text-muted)]">File</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.umbrellas }}</div><div class="text-xs text-[var(--color-text-muted)]">Ombrelloni</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.types }}</div><div class="text-xs text-[var(--color-text-muted)]">Tipologie</div></div></Card>
    </div>

    <div class="grid grid-cols-[300px_1fr] gap-4">
      <div class="flex flex-col gap-4">
        <Card>
          <div class="p-4">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-bold text-[var(--color-text)]">Settori</span>
              <Button v-if="isAdmin" data-testid="add-sector" variant="secondary" @click="openNewSector"><Icon name="plus" :size="13" />Nuovo</Button>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="s in sectors" :key="s.id" data-testid="sector-row"
                class="flex items-center gap-1 rounded-[10px] border px-2 py-1"
                :class="(selectedSector && selectedSector.id === s.id) ? 'border-[var(--color-brand)] bg-[var(--color-accent-tint)]' : 'border-[var(--color-border)]'">
                <button class="flex flex-1 items-center justify-between gap-2 py-1 text-left" @click="selectSector(s.id)">
                  <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ s.name }}</span>
                  <Badge tone="neutral">{{ s.kind === 'special' ? 'Speciali' : 'Griglia' }}</Badge>
                </button>
                <template v-if="isAdmin">
                  <Button data-testid="edit-sector" variant="secondary" @click="openEditSector(s)"><Icon name="edit" :size="12" /></Button>
                  <Button data-testid="delete-sector" variant="secondary" @click="askDeleteSector(s)"><Icon name="trash-2" :size="12" /></Button>
                </template>
              </div>
              <p v-if="sectors.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessun settore.</p>
            </div>
          </div>
        </Card>

        <Card>
          <div class="p-4">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-sm font-bold text-[var(--color-text)]">Tipologie</span>
              <Button v-if="isAdmin" data-testid="add-type" variant="secondary" @click="openNewType"><Icon name="plus" :size="13" />Nuova</Button>
            </div>
            <p class="mb-2 text-xs text-[var(--color-text-muted)]">Classificazione ortogonale alla posizione. Normale = predefinita.</p>
            <div class="flex flex-col">
              <div v-for="t in types" :key="t.id" data-testid="type-row" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-2.5 last:border-0">
                <span class="grid size-8 place-items-center rounded-[9px] bg-[var(--color-raised)] text-[var(--color-text-2nd)]"><Icon :name="t.icon ?? 'umbrella'" :size="16" /></span>
                <span class="flex-1 text-[13px] font-semibold text-[var(--color-text)]">{{ t.name }}</span>
                <template v-if="isAdmin">
                  <Button data-testid="edit-type" variant="secondary" @click="openEditType(t)"><Icon name="edit" :size="13" /></Button>
                  <Button data-testid="delete-type" variant="secondary" @click="askDeleteType(t)"><Icon name="trash-2" :size="13" /></Button>
                </template>
              </div>
              <p v-if="types.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessuna tipologia.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div class="p-4">
          <div class="mb-3 flex items-center gap-2">
            <span class="text-sm font-bold text-[var(--color-text)]">Settore {{ selectedSector?.name ?? '—' }}</span>
            <Badge v-if="selectedSector" tone="neutral">{{ selectedSector.kind === 'special' ? 'Speciali' : 'Griglia' }}</Badge>
            <Button v-if="isAdmin && selectedSector" data-testid="add-row" variant="secondary" class="ml-auto" @click="openNewRow"><Icon name="plus" :size="13" />Nuova fila</Button>
          </div>
          <div v-if="selectedSector" class="flex flex-col gap-3">
            <div v-for="r in selectedSector.rows" :key="r.id" data-testid="row-block" class="rounded-[12px] border border-[var(--color-border)] p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.label }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-[var(--color-text-muted)]">{{ r.umbrellas.length }} {{ r.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</span>
                  <template v-if="isAdmin">
                    <Button data-testid="generate-umbrellas" variant="secondary" @click="openGenerate(r.id)">Genera</Button>
                    <Button data-testid="add-umbrella" variant="secondary" @click="openNewUmbrella(r.id)"><Icon name="plus" :size="12" />Aggiungi</Button>
                    <Button data-testid="edit-row" variant="secondary" @click="openEditRow(r)"><Icon name="edit" :size="12" /></Button>
                    <Button data-testid="delete-row" variant="secondary" @click="askDeleteRow(r)"><Icon name="trash-2" :size="12" /></Button>
                  </template>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <template v-if="isAdmin">
                  <button v-for="u in r.umbrellas" :key="u.id" data-testid="umbrella-chip" type="button"
                    class="grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[12.5px] font-semibold tabular-nums text-[var(--color-text-2nd)] hover:border-[var(--color-brand)]"
                    @click="openEditUmbrella(u, r.id)">{{ u.label }}</button>
                </template>
                <template v-else>
                  <span v-for="u in r.umbrellas" :key="u.id" class="grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[12.5px] font-semibold tabular-nums text-[var(--color-text-2nd)]">{{ u.label }}</span>
                </template>
                <p v-if="r.umbrellas.length === 0" class="py-1 text-xs text-[var(--color-text-muted)]">Nessun ombrellone. Usa «Aggiungi» o «Genera».</p>
              </div>
            </div>
            <p v-if="selectedSector.rows.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessuna fila in questo settore.</p>
          </div>
          <p v-else class="py-2 text-sm text-[var(--color-text-muted)]">Crea un settore per iniziare.</p>
        </div>
      </Card>
    </div>

    <Modal v-model:open="sectorModalOpen" :title="editingSectorId ? 'Modifica settore' : 'Nuovo settore'" eyebrow="Settori">
      <form id="form-sector" class="flex flex-col gap-4" @submit.prevent="submitSector">
        <Field label="Nome"><Input name="sector-name" data-testid="sector-name" v-model="sectorName" placeholder="es. Prima fila mare" /></Field>
        <Field label="Disposizione">
          <Select v-model="sectorKind" data-testid="sector-kind">
            <option value="grid">Griglia</option>
            <option value="special">Speciali</option>
          </Select>
        </Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="sectorModalOpen = false">Annulla</Button>
          <Button type="submit" form="form-sector" data-testid="sector-save" :disabled="savingSector">Salva settore</Button>
        </div>
      </template>
    </Modal>

    <Modal v-model:open="rowModalOpen" :title="editingRowId ? 'Modifica fila' : 'Nuova fila'" eyebrow="File">
      <form id="form-row" class="flex flex-col gap-4" @submit.prevent="submitRow">
        <Field label="Etichetta"><Input name="row-label" data-testid="row-label" v-model="rowLabel" placeholder="es. Fila 1" /></Field>
        <template v-if="!editingRowId">
          <div class="grid grid-cols-3 gap-3">
            <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
            <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" step="1" min="0" /></Field>
            <Field label="Quantità"><Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" step="1" min="1" /></Field>
          </div>
          <Field label="Tipologia">
            <Select v-model="genTypeId" data-testid="gen-type">
              <option value="">Normale</option>
              <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
            </Select>
          </Field>
          <p class="text-xs text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }} ombrelloni). Quantità 0 = crea solo la fila.</p>
        </template>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="rowModalOpen = false">Annulla</Button>
          <Button type="submit" form="form-row" data-testid="row-save" :disabled="savingRow">Salva fila</Button>
        </div>
      </template>
    </Modal>

    <Modal v-model:open="genModalOpen" title="Genera ombrelloni" eyebrow="File">
      <form id="form-generate" class="flex flex-col gap-4" @submit.prevent="submitGenerate">
        <div class="grid grid-cols-3 gap-3">
          <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
          <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" step="1" min="0" /></Field>
          <Field label="Quantità"><Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" step="1" min="1" /></Field>
        </div>
        <Field label="Tipologia">
          <Select v-model="genTypeId" data-testid="gen-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <p class="text-xs text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }} ombrelloni). Le etichette già esistenti vengono saltate.</p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="genModalOpen = false">Annulla</Button>
          <Button type="submit" form="form-generate" data-testid="gen-save" :disabled="savingGenerate">Genera</Button>
        </div>
      </template>
    </Modal>

    <Modal v-model:open="umbModalOpen" :title="editingUmbId ? 'Modifica ombrellone' : 'Nuovo ombrellone'" eyebrow="Ombrelloni">
      <form id="form-umbrella" class="flex flex-col gap-4" @submit.prevent="submitUmbrella">
        <Field label="Etichetta"><Input name="umbrella-label" data-testid="umbrella-label" v-model="umbLabel" placeholder="es. 12 o P1" /></Field>
        <Field label="Tipologia">
          <Select v-model="umbTypeId" data-testid="umbrella-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
      </form>
      <template #footer>
        <div class="flex items-center justify-between gap-2">
          <Button v-if="editingUmbId" data-testid="umbrella-delete" variant="secondary" type="button" @click="deleteFromUmbModal"><Icon name="trash-2" :size="13" />Elimina</Button>
          <div class="ml-auto flex gap-2">
            <Button variant="secondary" type="button" @click="umbModalOpen = false">Annulla</Button>
            <Button type="submit" form="form-umbrella" data-testid="umbrella-save" :disabled="savingUmb">Salva ombrellone</Button>
          </div>
        </div>
      </template>
    </Modal>

    <Modal v-model:open="typeModalOpen" :title="editingTypeId ? 'Modifica tipologia' : 'Nuova tipologia'" eyebrow="Tipologie">
      <form id="form-type" class="flex flex-col gap-4" @submit.prevent="submitType">
        <Field label="Nome"><Input name="type-name" data-testid="type-name" v-model="typeName" placeholder="es. Gazebo" /></Field>
        <Field label="Icona sulla mappa">
          <Select v-model="typeIcon" data-testid="type-icon">
            <option value="umbrella">Ombrellone</option>
            <option value="leaf">Paglia</option>
            <option value="palmtree">Palma</option>
          </Select>
        </Field>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="typeModalOpen = false">Annulla</Button>
          <Button type="submit" form="form-type" data-testid="type-save" :disabled="savingType">Salva tipologia</Button>
        </div>
      </template>
    </Modal>

    <ConfirmDialog
      v-model:open="confirmDeleteOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      confirm-label="Elimina"
      tone="danger"
      @confirm="onConfirmDelete"
    />
  </section>
</template>
