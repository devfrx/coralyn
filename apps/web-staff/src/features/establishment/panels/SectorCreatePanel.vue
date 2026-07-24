<script setup lang="ts">
import { ref } from 'vue';
import { Button, Field, Input, Select, Option } from '@coralyn/ui-kit';
import type { SectorKind, StructureSectorDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useCreateSector } from '../useEstablishmentStructure';

const emit = defineEmits<{ close: []; created: [id: string] }>();
const create = useCreateSector();

const name = ref('');
const kind = ref<SectorKind>('grid');

function submit() {
  const n = name.value.trim();
  if (!n) return;
  create.mutate({ name: n, kind: kind.value }, {
    onSuccess: (res: StructureSectorDTO) => {
      pushToast('Settore creato.');
      emit('created', res.id);
      emit('close');
    },
  });
}
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuovo settore</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">Crea settore</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form data-testid="sector-form" class="flex flex-col gap-3.5" @submit.prevent="submit">
        <Field label="Nome"><Input name="sector-name" data-testid="sector-name" v-model="name" placeholder="es. Nord" /></Field>
        <Field label="Disposizione">
          <Select v-model="kind" data-testid="sector-kind">
            <Option value="grid">Griglia: file regolari verso il mare</Option>
            <Option value="special">Speciali: posti fuori griglia</Option>
          </Select>
        </Field>
        <Button type="submit" data-testid="sector-save" :loading="create.isPending.value">Crea settore</Button>
      </form>
    </div>
  </div>
</template>
