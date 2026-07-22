<script setup lang="ts">
import { ref, watch } from 'vue';
import { Button, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureUmbrellaDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateUmbrella, useDeleteUmbrella } from '../useEstablishmentStructure';

const props = defineProps<{ umbrella: StructureUmbrellaDTO; rowLabel: string; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateUmbrella();
const removeUmbrella = useDeleteUmbrella();

const label = ref(props.umbrella.label);
const umbrellaTypeId = ref(props.umbrella.umbrellaTypeId ?? '');
watch(() => props.umbrella, (u) => { label.value = u.label; umbrellaTypeId.value = u.umbrellaTypeId ?? ''; });

function submit() {
  const l = label.value.trim();
  if (!l) return;
  update.mutate({ id: props.umbrella.id, label: l, umbrellaTypeId: umbrellaTypeId.value === '' ? null : umbrellaTypeId.value },
    { onSuccess: () => pushToast('Ombrellone aggiornato.') });
}

const confirmOpen = ref(false);
function onDelete() {
  removeUmbrella.mutate(props.umbrella.id, { onSuccess: () => { pushToast('Ombrellone eliminato.'); emit('close'); } });
  confirmOpen.value = false;
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ombrellone</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ umbrella.label }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sectorName }} · {{ rowLabel }}</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form v-if="isAdmin" data-testid="umbrella-form" class="flex flex-col gap-3" @submit.prevent="submit">
        <Field label="Etichetta">
          <Input name="umbrella-label" data-testid="umbrella-label" v-model="label" />
        </Field>
        <p class="-mt-2 text-[11.5px] text-[var(--color-text-muted)]">Numero fisico reale, unico in tutta la spiaggia</p>
        <Field label="Tipologia">
          <Select v-model="umbrellaTypeId" data-testid="umbrella-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <Button type="submit" data-testid="umbrella-save" :loading="update.isPending.value">Salva</Button>
      </form>
      <p class="text-[11.5px] text-[var(--color-text-muted)]">Maiusc+clic su altre celle per agire in blocco</p>
      <div v-if="isAdmin" class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Se ha prenotazioni non sarà eliminato.</p>
        <Button variant="danger" data-testid="umbrella-delete" class="w-full" :loading="removeUmbrella.isPending.value" @click="confirmOpen = true">Elimina ombrellone</Button>
      </div>
    </div>
    <ConfirmDialog v-model:open="confirmOpen" title="Eliminare l'ombrellone?"
      description="Se ha prenotazioni non sarà eliminato." confirm-label="Elimina" tone="danger" @confirm="onDelete" />
  </div>
</template>
