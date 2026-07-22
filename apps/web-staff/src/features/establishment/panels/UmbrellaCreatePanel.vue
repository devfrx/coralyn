<script setup lang="ts">
import { ref } from 'vue';
import { Button, Field, Input, Select } from '@coralyn/ui-kit';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useCreateUmbrella } from '../useEstablishmentStructure';

const props = defineProps<{ rowId: string; rowLabel: string; types: UmbrellaTypeDTO[] }>();
const emit = defineEmits<{ close: [] }>();
const create = useCreateUmbrella();

const label = ref('');
const umbrellaTypeId = ref('');

function submit() {
  const l = label.value.trim();
  if (!l) return;
  create.mutate({ rowId: props.rowId, label: l, umbrellaTypeId: umbrellaTypeId.value === '' ? null : umbrellaTypeId.value }, {
    onSuccess: () => { pushToast('Ombrellone creato.'); emit('close'); },
  });
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuovo ombrellone</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">Crea ombrellone</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">{{ rowLabel }}</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form data-testid="umbrella-form" class="flex flex-col gap-3" @submit.prevent="submit">
        <Field label="Etichetta">
          <Input name="umbrella-label" data-testid="umbrella-label" v-model="label" placeholder="es. A9" />
        </Field>
        <p class="-mt-2 text-[11.5px] text-[var(--color-text-muted)]">Numero fisico reale, unico in tutta la spiaggia</p>
        <Field label="Tipologia">
          <Select v-model="umbrellaTypeId" data-testid="umbrella-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <Button type="submit" data-testid="umbrella-save" :loading="create.isPending.value">Salva</Button>
      </form>
      <p class="text-[11.5px] text-[var(--color-text-muted)]">Maiusc+clic su altre celle per agire in blocco</p>
    </div>
  </div>
</template>
