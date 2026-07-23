<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Field, Input, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateRow, useDeleteRow, useBulkDeleteUmbrellas } from '../useEstablishmentStructure';
import UmbrellaGeneratorForm from '../UmbrellaGeneratorForm.vue';

const props = defineProps<{ row: StructureRowDTO; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateRow();
const removeRow = useDeleteRow();
const bulkDelete = useBulkDeleteUmbrellas();

const label = ref(props.row.label);
watch(() => props.row.id, () => { label.value = props.row.label; });
function rename() {
  const l = label.value.trim();
  if (!l) return;
  update.mutate({ id: props.row.id, label: l }, { onSuccess: () => pushToast('Fila aggiornata.') });
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
      <UmbrellaGeneratorForm :row-id="row.id" :types="types" />
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
