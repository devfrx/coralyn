<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Button, Callout, Field, Input } from '@coralyn/ui-kit';
import { useCreateSeason, useSeasons } from '@/features/pricing/useSeasons';

const props = defineProps<{ status: SetupStatusDTO }>();
const emit = defineEmits<{ next: [] }>();

const { data: seasons } = useSeasons();

const createSeason = useCreateSeason();
const name = ref('');
const startDate = ref('');
const endDate = ref('');

// ADR-0031: il fuso operativo è Europe/Rome.
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const endInPast = computed(() => !!endDate.value && endDate.value < todayIso);

function save() {
  const trimmed = name.value.trim();
  if (!trimmed || !startDate.value || !endDate.value) return;
  createSeason.mutate(
    { name: trimmed, startDate: startDate.value, endDate: endDate.value },
    { onSuccess: () => { name.value = ''; startDate.value = ''; endDate.value = ''; } },
  );
}
</script>

<template>
  <div class="flex flex-col gap-5 px-[30px] py-[34px]">
    <div class="flex flex-col gap-2 text-center">
      <p class="m-0 text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">
        <strong class="text-[var(--color-text)]">La stagione è l'arco di date in cui il lido è aperto</strong>
        (es. 1 maggio – 30 settembre). Prezzi e abbonamenti vivono dentro una stagione: una prenotazione fuori
        stagione viene rifiutata.
      </p>
      <details class="mx-auto max-w-[52ch] text-left text-[12.5px] text-[var(--color-text-muted)]">
        <summary class="cursor-pointer font-semibold text-[var(--color-text)]">Perché serve?</summary>
        Puoi avere più stagioni (anche il prossimo anno, in anticipo). Conta che la stagione copra le date in cui
        vuoi vendere: una stagione già finita non permette di incassare.
      </details>
    </div>

    <ul v-if="(seasons ?? []).length > 0" class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="season in seasons"
        :key="season.id"
        class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-text)]"
      >
        {{ season.name }} · {{ season.startDate }}–{{ season.endDate }}
      </li>
    </ul>

    <form class="flex flex-col gap-3" @submit.prevent="save">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Nuova stagione</span>
      <div class="grid grid-cols-[1fr_auto_auto] gap-2">
        <Field label="Nome"><Input type="text" data-testid="ob-season-name" v-model="name" placeholder="es. Estate 2026" /></Field>
        <Field label="Inizio"><Input type="date" data-testid="ob-season-start" v-model="startDate" /></Field>
        <Field label="Fine"><Input type="date" data-testid="ob-season-end" v-model="endDate" /></Field>
      </div>
      <Callout v-if="endInPast" tone="warm" data-testid="ob-season-past-warning">
        Questa stagione finisce nel passato: non permetterà nuove prenotazioni.
      </Callout>
      <Button type="submit" data-testid="ob-season-save" :loading="createSeason.isPending.value">Crea stagione</Button>
    </form>

    <div class="flex flex-col items-center gap-2.5 border-t border-[var(--color-border)] pt-4">
      <Button data-testid="ob-seasons-next" :disabled="!props.status.seasons.complete" @click="emit('next')">Continua</Button>
    </div>
  </div>
</template>
