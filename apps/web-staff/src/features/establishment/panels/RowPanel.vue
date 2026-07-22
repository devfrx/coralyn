<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateRow, useDeleteRow, useGenerateUmbrellas, useBulkDeleteUmbrellas } from '../useEstablishmentStructure';

const props = defineProps<{ row: StructureRowDTO; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateRow();
const removeRow = useDeleteRow();
const generate = useGenerateUmbrellas();
const bulkDelete = useBulkDeleteUmbrellas();

const label = ref(props.row.label);
watch(() => props.row, (r) => { label.value = r.label; });
function rename() {
  const l = label.value.trim();
  if (!l) return;
  update.mutate({ id: props.row.id, label: l }, { onSuccess: () => pushToast('Fila aggiornata.') });
}

const genPrefix = ref('');
const genStart = ref(1);
const genCount = ref(10);
const genTypeId = ref('');
const genPreview = computed(() => {
  const s = Number(genStart.value) || 0;
  const c = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  return Array.from({ length: c }, (_v, i) => `${genPrefix.value}${s + i}`);
});
function doGenerate() {
  const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  if (count <= 0) return;
  generate.mutate(
    { rowId: props.row.id, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeId.value === '' ? null : genTypeId.value },
    { onSuccess: (res) => pushToast(`Creati ${res.created} · saltati ${res.skipped}`) },
  );
}

const confirm = ref<'clear' | 'delete' | null>(null);
function onConfirm() {
  if (confirm.value === 'clear') {
    bulkDelete.mutate({ ids: props.row.umbrellas.map((u) => u.id) },
      { onSuccess: (res) => pushToast(`Eliminati ${res.deleted} · saltati ${res.skipped} (con prenotazioni)`) });
  } else if (confirm.value === 'delete') {
    removeRow.mutate(props.row.id, { onSuccess: () => { pushToast('Fila eliminata.'); emit('close'); } });
  }
  confirm.value = null;
}
const confirmCopy = computed(() => confirm.value === 'clear'
  ? { title: 'Svuotare la fila?', description: `Elimina in blocco gli ombrelloni di «${props.row.label}» senza prenotazioni; i protetti restano.`, label: 'Svuota' }
  : { title: 'Eliminare la fila?', description: `«${props.row.label}». Se contiene ombrelloni o è usata da tariffe non sarà eliminata.`, label: 'Elimina' });
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Fila</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ row.label }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sectorName }} · {{ row.umbrellas.length }} ombrelloni</div>
    </div>
    <div v-if="isAdmin" class="flex flex-col gap-3.5 p-[18px]">
      <form class="flex flex-col gap-3" @submit.prevent="rename">
        <Field label="Etichetta"><Input name="row-label" data-testid="row-label" v-model="label" /></Field>
        <Button type="submit" size="sm" data-testid="row-save" :loading="update.isPending.value">Salva</Button>
      </form>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <form data-testid="gen-form" class="flex flex-col gap-3" @submit.prevent="doGenerate">
        <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Genera ombrelloni</span>
        <div class="grid grid-cols-3 gap-2">
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
        <p class="text-[11.5px] text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }}). Le etichette già esistenti vengono saltate.</p>
        <Button type="submit" data-testid="gen-save" :loading="generate.isPending.value">Genera {{ genPreview.length }} ombrelloni</Button>
      </form>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">«Svuota» elimina in blocco gli ombrelloni senza prenotazioni; quelli con prenotazioni restano.</p>
        <div class="flex gap-2">
          <Button variant="danger" class="flex-1" data-testid="row-clear" :disabled="row.umbrellas.length === 0 || bulkDelete.isPending.value" :loading="bulkDelete.isPending.value" @click="confirm = 'clear'">Svuota fila ({{ row.umbrellas.length }})</Button>
          <Button variant="danger" class="flex-1" data-testid="row-delete" :loading="removeRow.isPending.value" @click="confirm = 'delete'">Elimina fila</Button>
        </div>
      </div>
    </div>
    <ConfirmDialog :open="confirm !== null" @update:open="(v: boolean) => { if (!v) confirm = null; }"
      :title="confirmCopy.title" :description="confirmCopy.description" :confirm-label="confirmCopy.label" tone="danger" @confirm="onConfirm" />
  </div>
</template>
