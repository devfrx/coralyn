<script setup lang="ts">
import { ref } from 'vue';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Button, Field, Input } from '@coralyn/ui-kit';
import { useCreateTimeSlot, useTimeSlots } from '@/features/pricing/useTimeSlots';

const props = defineProps<{ status: SetupStatusDTO }>();
const emit = defineEmits<{ next: [] }>();

const { data: timeSlots } = useTimeSlots();

const createSlot = useCreateTimeSlot();
const name = ref('');
const startTime = ref('');
const endTime = ref('');
function save() {
  const trimmed = name.value.trim();
  if (!trimmed || !startTime.value || !endTime.value) return;
  createSlot.mutate(
    { name: trimmed, startTime: startTime.value, endTime: endTime.value },
    { onSuccess: () => { name.value = ''; startTime.value = ''; endTime.value = ''; } },
  );
}
</script>

<template>
  <div class="flex flex-col gap-5 px-[30px] py-[34px]">
    <div class="flex flex-col gap-2 text-center">
      <p class="m-0 text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">
        <strong class="text-[var(--color-text)]">Le fasce orarie sono i "tagli" prenotabili della giornata</strong>:
        ad esempio una fascia unica «Giornata», oppure «Mattina» e «Pomeriggio». Ogni prenotazione appartiene a una fascia.
      </p>
      <details class="mx-auto max-w-[52ch] text-left text-[12.5px] text-[var(--color-text-muted)]">
        <summary class="cursor-pointer font-semibold text-[var(--color-text)]">Perché serve?</summary>
        Senza fasce non si può scegliere <em>quando</em> prenotare. Se usi solo la giornata intera, creane una sola
        (es. 08:00–19:00): potrai aggiungerne altre in ogni momento dal Listino.
      </details>
    </div>

    <ul v-if="(timeSlots ?? []).length > 0" class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="slot in timeSlots"
        :key="slot.id"
        class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-text)]"
      >
        {{ slot.name }} · {{ slot.startTime }}–{{ slot.endTime }}
      </li>
    </ul>

    <form class="flex flex-col gap-3" @submit.prevent="save">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuova fascia</span>
      <div class="grid grid-cols-[1fr_auto_auto] gap-2">
        <Field label="Nome"><Input type="text" data-testid="ob-slot-name" v-model="name" placeholder="es. Giornata" /></Field>
        <Field label="Inizio"><Input type="time" data-testid="ob-slot-start" v-model="startTime" /></Field>
        <Field label="Fine"><Input type="time" data-testid="ob-slot-end" v-model="endTime" /></Field>
      </div>
      <Button type="submit" data-testid="ob-slot-save" :loading="createSlot.isPending.value">Crea fascia</Button>
    </form>

    <div class="flex flex-col items-center gap-2.5 border-t border-[var(--color-border)] pt-4">
      <Button data-testid="ob-timeslots-next" :disabled="!props.status.timeSlots.complete" @click="emit('next')">Continua</Button>
    </div>
  </div>
</template>
