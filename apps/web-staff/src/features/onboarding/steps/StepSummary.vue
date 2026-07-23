<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Button, Callout } from '@coralyn/ui-kit';

const props = defineProps<{ status: SetupStatusDTO }>();
const router = useRouter();

const rows = computed(() => [
  { key: 'structure', label: `Struttura · ${props.status.structure.sectors} settori, ${props.status.structure.activeUmbrellas} ombrelloni`, done: props.status.structure.complete },
  { key: 'timeSlots', label: `Fasce orarie · ${props.status.timeSlots.count}`, done: props.status.timeSlots.complete },
  { key: 'seasons', label: `Stagioni valide · ${props.status.seasons.usable}`, done: props.status.seasons.complete },
  { key: 'rates', label: `Tariffe · ${props.status.rates.count}`, done: props.status.rates.complete },
]);

const showCatchAllWarning = computed(() => !props.status.rates.hasCatchAll && props.status.rates.complete);

function goToMap() {
  router.push('/map');
}
</script>

<template>
  <div class="flex flex-col gap-5 px-[30px] py-[40px]">
    <h2 class="m-0 text-center text-[17px] font-extrabold text-[var(--color-text)]">
      {{ status.complete ? 'Configurazione completa' : 'Quasi fatto' }}
    </h2>

    <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
      <li
        v-for="r in rows"
        :key="r.key"
        class="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5"
      >
        <span
          class="grid size-6 flex-none place-items-center rounded-full text-[11.5px] font-extrabold"
          :class="r.done ? 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]' : 'bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]'"
          aria-hidden="true"
        >{{ r.done ? '✓' : '•' }}</span>
        <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.label }}</span>
      </li>
    </ul>

    <Callout v-if="showCatchAllWarning" tone="warm">
      Non c'è una tariffa base valida ovunque: alcune combinazioni potrebbero restare senza prezzo.
    </Callout>

    <div class="flex flex-col items-center gap-2.5 pt-1">
      <Button data-testid="ob-go-map" @click="goToMap">Vai alla mappa</Button>
      <RouterLink
        to="/rentals/catalogo"
        class="text-[12.5px] font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline"
      >Vuoi noleggiare pedalò e attrezzatura? Configura il catalogo noleggio (facoltativo).</RouterLink>
    </div>
  </div>
</template>
