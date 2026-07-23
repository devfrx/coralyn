<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Button, Callout, Field, Input, Select, formatEuro } from '@coralyn/ui-kit';
import { useSeasons } from '@/features/pricing/useSeasons';
import { useCreateRate, useRates } from '@/features/pricing/useRates';

const props = defineProps<{ status: SetupStatusDTO }>();
const emit = defineEmits<{ next: [] }>();

const { data: seasons } = useSeasons();

// ADR-0031: il fuso operativo è Europe/Rome.
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const usableSeasons = computed(() => (seasons.value ?? []).filter((s) => s.endDate >= todayIso));

// Stagione selezionata per il form e per l'elenco tariffe: default la prima usable.
const selectedSeasonId = ref('');
watch(usableSeasons, (list) => {
  if (!selectedSeasonId.value || !list.some((s) => s.id === selectedSeasonId.value)) {
    selectedSeasonId.value = list[0]?.id ?? '';
  }
}, { immediate: true });

const { data: rates } = useRates(() => selectedSeasonId.value);
const createRate = useCreateRate(() => selectedSeasonId.value);
const price = ref('');

function save() {
  if (!selectedSeasonId.value || price.value === '') return;
  createRate.mutate(
    { seasonId: selectedSeasonId.value, price: Number(price.value) },
    { onSuccess: () => { price.value = ''; } },
  );
}
</script>

<template>
  <div class="flex flex-col gap-5 px-[30px] py-[34px]">
    <div class="flex flex-col gap-2 text-center">
      <p class="m-0 text-[13px] leading-[1.55] text-[var(--color-text-2nd)]">
        <strong class="text-[var(--color-text)]">Il listino dice al sistema quanto costa un ombrellone.</strong>
        Il modo più solido per partire è una <em>tariffa base</em>: un prezzo al giorno valido per tutta la spiaggia,
        ogni fascia e ogni tipo di prenotazione. Le tariffe specifiche (per settore, fila, fascia o pacchetto) si
        aggiungono dopo, dal Listino, e vincono su quella base.
      </p>
      <details class="mx-auto max-w-[52ch] text-left text-[12.5px] text-[var(--color-text-muted)]">
        <summary class="cursor-pointer font-semibold text-[var(--color-text)]">Perché serve?</summary>
        Senza una tariffa applicabile la prenotazione fallisce con «configurare il listino». La tariffa base è la
        rete di sicurezza: garantisce che nessuna combinazione resti senza prezzo.
      </details>
    </div>

    <form class="flex flex-col gap-3" @submit.prevent="save">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Tariffa base</span>
      <div class="grid gap-2" :class="usableSeasons.length > 1 ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'">
        <Field v-if="usableSeasons.length > 1" label="Stagione">
          <Select v-model="selectedSeasonId" data-testid="ob-rate-season">
            <option v-for="s in usableSeasons" :key="s.id" :value="s.id">{{ s.name }}</option>
          </Select>
        </Field>
        <Field label="Prezzo al giorno (€)">
          <Input type="number" step="0.5" min="0" data-testid="ob-rate-price" v-model="price" placeholder="25" />
        </Field>
      </div>
      <Button type="submit" data-testid="ob-rate-save" :loading="createRate.isPending.value">Crea tariffa base</Button>
    </form>

    <div v-if="(rates ?? []).length > 0" class="flex flex-col gap-2">
      <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">
        {{ (rates ?? []).length }} {{ (rates ?? []).length === 1 ? 'tariffa in questa stagione' : 'tariffe in questa stagione' }}
      </span>
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="rate in rates"
          :key="rate.id"
          class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-text)]"
        >
          {{ formatEuro(rate.price) }}
        </li>
      </ul>
    </div>

    <Callout v-if="props.status.rates.count > 0 && !props.status.rates.hasCatchAll" tone="warm" data-testid="ob-no-catchall">
      Non c'è una tariffa base valida ovunque: alcune combinazioni potrebbero restare senza prezzo.
    </Callout>

    <div class="flex flex-col items-center gap-2.5 border-t border-[var(--color-border)] pt-4">
      <Button data-testid="ob-rates-next" :disabled="!props.status.rates.complete" @click="emit('next')">Continua</Button>
    </div>
  </div>
</template>
