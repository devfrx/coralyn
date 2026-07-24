<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Field, Input, Select, Option } from '@coralyn/ui-kit';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { GENERATE_MAX } from './structureSelection';
import { useGenerateUmbrellas } from './useEstablishmentStructure';

const props = defineProps<{ rowId: string; types: UmbrellaTypeDTO[] }>();
const generate = useGenerateUmbrellas();

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
function doGenerate() {
  const count = Number(genCount.value) || 0;
  if (count <= 0 || count > GENERATE_MAX) return;
  generate.mutate(
    { rowId: props.rowId, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeId.value === '' ? null : genTypeId.value },
    { onSuccess: (res) => pushToast(`Creati ${res.created} · saltati ${res.skipped}`) },
  );
}
</script>

<template>
  <form data-testid="gen-form" class="flex flex-col gap-3" @submit.prevent="doGenerate">
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
        <Option value="">Normale</Option>
        <Option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</Option>
      </Select>
    </Field>
    <p v-if="!genCountOverMax" class="text-[11.5px] text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }}). Le etichette già esistenti vengono saltate.</p>
    <Button type="submit" data-testid="gen-save" :disabled="genCountOverMax || genPreview.length === 0" :loading="generate.isPending.value">Genera {{ genPreview.length }} ombrelloni</Button>
  </form>
</template>
