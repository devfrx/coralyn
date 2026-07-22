<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Field, Input, Select } from '@coralyn/ui-kit';
import type { UmbrellaTypeDTO, StructureRowDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { GENERATE_MAX } from '../structureSelection';
import { useCreateRow, useGenerateUmbrellas } from '../useEstablishmentStructure';

const props = defineProps<{ sectorId: string; sectorName: string; types: UmbrellaTypeDTO[] }>();
const emit = defineEmits<{ close: [] }>();
const create = useCreateRow();
const generate = useGenerateUmbrellas();

const label = ref('');

const genPrefix = ref('');
const genStart = ref(1);
const genCount = ref(10);
const genTypeId = ref('');
const genCountOverMax = computed(() => (Number(genCount.value) || 0) > GENERATE_MAX);
const genPreview = computed(() => {
  const s = Number(genStart.value) || 0;
  const c = Math.max(0, Number(genCount.value) || 0);
  if (c === 0 || c > GENERATE_MAX) return [];
  return Array.from({ length: c }, (_v, i) => `${genPrefix.value}${s + i}`);
});

function submit() {
  const l = label.value.trim();
  if (!l || genCountOverMax.value) return;
  create.mutate({ sectorId: props.sectorId, label: l }, {
    onSuccess: (row: StructureRowDTO) => {
      // Fila creata: chiudi subito il pannello — niente doppio-create se il generate fallisce/viene ritentato.
      emit('close');
      const count = Number(genCount.value) || 0;
      if (count <= 0) return;
      // mutateAsync (non mutate): il pannello sta per smontarsi — mutate() instrada onSuccess tramite
      // l'observer sottoscritto dal componente, che vue-query disiscrive all'unmount (onScopeDispose)
      // perdendo così la callback anche se la richiesta va comunque a buon fine lato server.
      // mutateAsync restituisce la promise dell'esecuzione stessa, indipendente dal ciclo di vita.
      generate.mutateAsync({ rowId: row.id, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeId.value === '' ? null : genTypeId.value })
        .then((res) => pushToast(`Fila creata · ${res.created} ombrelloni`))
        .catch(() => {}); // errore già segnalato dal toast globale di mutationResource (onError)
    },
  });
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuova fila</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">Crea fila</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sectorName }}</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form data-testid="row-form" class="flex flex-col gap-3" @submit.prevent="submit">
        <Field label="Etichetta"><Input name="row-label" data-testid="row-label" v-model="label" placeholder="es. Fila 3" /></Field>
        <hr class="border-0 border-t border-[var(--color-border-row)]">
        <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Genera ombrelloni</span>
        <div class="grid grid-cols-3 gap-2">
          <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
          <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" step="1" min="0" /></Field>
          <Field label="Quantità" :error="genCountOverMax ? `Massimo ${GENERATE_MAX} per volta` : undefined">
            <Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" step="1" min="1" :max="GENERATE_MAX" />
          </Field>
        </div>
        <Field label="Tipologia">
          <Select v-model="genTypeId" data-testid="gen-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <p v-if="!genCountOverMax" class="text-[11.5px] text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }}). Le etichette già esistenti vengono saltate.</p>
        <Button type="submit" data-testid="row-save" :disabled="genCountOverMax" :loading="create.isPending.value || generate.isPending.value">Crea fila</Button>
      </form>
    </div>
  </div>
</template>
