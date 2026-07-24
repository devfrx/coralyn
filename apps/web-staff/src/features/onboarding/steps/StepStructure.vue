<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SectorKind, SetupStatusDTO } from '@coralyn/contracts';
import { Button, Field, Input, Select, Option } from '@coralyn/ui-kit';
import { useCreateRow, useCreateSector, useEstablishmentStructure } from '@/features/establishment/useEstablishmentStructure';
import UmbrellaGeneratorForm from '@/features/establishment/UmbrellaGeneratorForm.vue';

const props = defineProps<{ status: SetupStatusDTO }>();
const emit = defineEmits<{ next: [] }>();

const { data: structure } = useEstablishmentStructure();
const sectors = computed(() => structure.value?.sectors ?? []);
const rows = computed(() => sectors.value.flatMap((s) => s.rows));
const rowCount = computed(() => rows.value.length);
const umbrellaCount = computed(() => rows.value.reduce((n, r) => n + r.umbrellas.length, 0));

// Form settore: sempre visibile in modalità "aggiungi", reset del nome dopo la creazione.
const createSector = useCreateSector();
const sectorName = ref('');
const sectorKind = ref<SectorKind>('grid');
function saveSector() {
  const name = sectorName.value.trim();
  if (!name) return;
  createSector.mutate({ name, kind: sectorKind.value }, { onSuccess: () => { sectorName.value = ''; } });
}

// Form fila: legata al settore selezionato (default: il primo, o l'ultimo rimasto valido).
const createRow = useCreateRow();
const rowSectorId = ref('');
watch(sectors, (list) => {
  if (!rowSectorId.value || !list.some((s) => s.id === rowSectorId.value)) rowSectorId.value = list[0]?.id ?? '';
}, { immediate: true });
const rowLabel = ref('');
function saveRow() {
  const label = rowLabel.value.trim();
  if (!label || !rowSectorId.value) return;
  createRow.mutate({ sectorId: rowSectorId.value, label }, { onSuccess: () => { rowLabel.value = ''; } });
}

// Generatore: fila selezionata, default l'ultima creata (finché l'utente non sceglie altro).
const selectedRowId = ref('');
watch(rows, (list) => {
  if (!selectedRowId.value || !list.some((r) => r.id === selectedRowId.value)) selectedRowId.value = list[list.length - 1]?.id ?? '';
}, { immediate: true, deep: true });
</script>

<template>
  <div class="flex flex-col gap-5 px-[30px] py-[34px]">
    <div class="flex flex-col gap-2 text-center">
      <p class="m-0 text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">
        <strong class="text-[var(--color-text)]">La struttura è la tua spiaggia dentro Coralyn.</strong>
        Un <em>settore</em> è una zona («Centro», «Zona nord»); ogni settore ha delle <em>file</em>, dalla più vicina al mare
        in giù; ogni fila contiene gli <em>ombrelloni</em>, che sono ciò che i clienti prenotano.
      </p>
      <details data-testid="ob-why-structure" class="mx-auto max-w-[52ch] text-left text-[12.5px] text-[var(--color-text-muted)]">
        <summary class="cursor-pointer font-semibold text-[var(--color-text)]">Perché serve?</summary>
        Una prenotazione è sempre su un ombrellone specifico: senza almeno un ombrellone il sistema risponde
        «Ombrellone non valido» e la mappa resta vuota. Potrai sempre aggiungere, rinominare e riorganizzare tutto dal Cantiere.
      </details>
    </div>

    <p class="m-0 text-center text-[12.5px] text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">
      {{ sectors.length }} settori · {{ rowCount }} file · {{ umbrellaCount }} ombrelloni
    </p>

    <form class="flex flex-col gap-3" @submit.prevent="saveSector">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuovo settore</span>
      <div class="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Nome del settore"><Input name="ob-sector-name" data-testid="ob-sector-name" v-model="sectorName" placeholder="es. Centro" /></Field>
        <Field label="Disposizione">
          <Select v-model="sectorKind" data-testid="ob-sector-kind">
            <Option value="grid">Griglia: file regolari</Option>
            <Option value="special">Speciali: posti fuori schema</Option>
          </Select>
        </Field>
      </div>
      <Button type="submit" data-testid="ob-sector-save" :loading="createSector.isPending.value">Crea settore</Button>
    </form>

    <form v-if="sectors.length > 0" class="flex flex-col gap-3" @submit.prevent="saveRow">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuova fila</span>
      <div class="grid grid-cols-[1fr_1fr] gap-2">
        <Field label="Settore">
          <Select v-model="rowSectorId" data-testid="ob-row-sector">
            <Option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.name }}</Option>
          </Select>
        </Field>
        <Field label="Etichetta"><Input name="ob-row-label" data-testid="ob-row-label" v-model="rowLabel" placeholder="es. Fila 1" /></Field>
      </div>
      <Button type="submit" data-testid="ob-row-save" :loading="createRow.isPending.value">Crea fila</Button>
    </form>

    <div v-if="rows.length > 0" class="flex flex-col gap-3">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Genera ombrelloni</span>
      <Field label="Fila">
        <Select v-model="selectedRowId" data-testid="ob-gen-row">
          <Option v-for="r in rows" :key="r.id" :value="r.id">{{ r.label }}</Option>
        </Select>
      </Field>
      <UmbrellaGeneratorForm v-if="selectedRowId" :row-id="selectedRowId" :types="structure?.umbrellaTypes ?? []" />
    </div>

    <div class="flex flex-col items-center gap-2.5 border-t border-[var(--color-border)] pt-4">
      <RouterLink to="/establishment/structure" class="text-[12.5px] font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline">
        Apri il Cantiere per l'editor completo
      </RouterLink>
      <Button data-testid="ob-structure-next" :disabled="!props.status.structure.complete" @click="emit('next')">Continua</Button>
    </div>
  </div>
</template>
