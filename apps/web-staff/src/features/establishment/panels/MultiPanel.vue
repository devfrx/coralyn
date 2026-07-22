<script setup lang="ts">
import { ref } from 'vue';
import { Button, Field, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useBulkAssignUmbrellaType, useBulkDeleteUmbrellas } from '../useEstablishmentStructure';

const props = defineProps<{ ids: string[]; labels: string[]; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const bulkAssign = useBulkAssignUmbrellaType();
const bulkDelete = useBulkDeleteUmbrellas();

const umbrellaTypeId = ref('');
function assign() {
  if (umbrellaTypeId.value === '') return;
  const value = umbrellaTypeId.value === '__none__' ? null : umbrellaTypeId.value;
  bulkAssign.mutate({ ids: props.ids, umbrellaTypeId: value },
    { onSuccess: () => pushToast(`Tipologia assegnata a ${props.ids.length} ombrelloni.`) });
}

const confirmOpen = ref(false);
function onDelete() {
  bulkDelete.mutate({ ids: props.ids }, {
    onSuccess: (res) => { pushToast(`Eliminati ${res.deleted} · saltati ${res.skipped}`); emit('close'); },
  });
  confirmOpen.value = false;
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Selezione multipla</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]" aria-live="polite">{{ ids.length }} ombrelloni</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-brand-tint)] p-2.5 text-[11.5px] font-semibold text-[var(--color-brand-ink)]">
        {{ labels.join(' · ') }}
      </div>
      <template v-if="isAdmin">
        <Field label="Tipologia">
          <Select v-model="umbrellaTypeId" data-testid="multi-type">
            <option value="">Scegli…</option>
            <option value="__none__">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <Button data-testid="multi-assign" :disabled="umbrellaTypeId === '' || bulkAssign.isPending.value" :loading="bulkAssign.isPending.value" @click="assign">
          Applica a {{ ids.length }}
        </Button>
        <div class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
          <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
          <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Quelli con prenotazioni non verranno eliminati.</p>
          <Button variant="danger" data-testid="multi-delete" class="w-full" :loading="bulkDelete.isPending.value" @click="confirmOpen = true">
            Elimina {{ ids.length }}
          </Button>
        </div>
      </template>
    </div>
    <ConfirmDialog v-model:open="confirmOpen" :title="`Eliminare ${ids.length} ombrelloni?`"
      description="Quelli con prenotazioni non verranno eliminati." confirm-label="Elimina" tone="danger" @confirm="onDelete" />
  </div>
</template>
