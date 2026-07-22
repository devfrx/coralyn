<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Button, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureSectorDTO, SectorKind } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateSector, useDeleteSector } from '../useEstablishmentStructure';

const props = defineProps<{ sector: StructureSectorDTO; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateSector();
const remove = useDeleteSector();

const name = ref(props.sector.name);
const kind = ref<SectorKind>(props.sector.kind);
// Sync per id, non per identità oggetto: i refetch (ogni mutation invalida la query struttura)
// producono oggetti nuovi con lo stesso id e non devono azzerare le bozze in corso; il cambio di
// entità (istanza non key-ata) sì. Contropartita accettata: un rename arrivato da un'altra scheda
// non aggiorna il form finché la selezione non cambia.
watch(() => props.sector.id, () => { name.value = props.sector.name; kind.value = props.sector.kind; });

function submit() {
  const n = name.value.trim();
  if (!n) return;
  update.mutate({ id: props.sector.id, name: n, kind: kind.value }, { onSuccess: () => pushToast('Settore aggiornato.') });
}
const confirmOpen = ref(false);
function onDelete() {
  remove.mutate(props.sector.id, { onSuccess: () => { pushToast('Settore eliminato.'); emit('close'); } });
  confirmOpen.value = false;
}
const seats = computed(() => props.sector.rows.reduce((n, r) => n + r.umbrellas.length, 0));
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Settore</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ sector.name }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">{{ sector.rows.length }} file · {{ seats }} ombrelloni</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form v-if="isAdmin" data-testid="sector-form" class="flex flex-col gap-3.5" @submit.prevent="submit">
        <Field label="Nome"><Input name="sector-name" data-testid="sector-name" v-model="name" /></Field>
        <Field label="Disposizione">
          <Select v-model="kind" data-testid="sector-kind">
            <option value="grid">Griglia — file regolari verso il mare</option>
            <option value="special">Speciali — posti fuori griglia</option>
          </Select>
        </Field>
        <Button type="submit" data-testid="sector-save" :loading="update.isPending.value">Salva settore</Button>
      </form>
      <div v-if="isAdmin" class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Se contiene file o è usato da tariffe non sarà eliminato.</p>
        <Button variant="danger" data-testid="sector-delete" class="w-full" :loading="remove.isPending.value" @click="confirmOpen = true">Elimina settore</Button>
      </div>
    </div>
    <ConfirmDialog v-model:open="confirmOpen" title="Eliminare il settore?"
      :description="`«${sector.name}». Se contiene file o è usato da tariffe non sarà eliminato.`"
      confirm-label="Elimina" tone="danger" @confirm="onDelete" />
  </div>
</template>
