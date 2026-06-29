<script setup lang="ts">
import { computed } from 'vue';
import type { StatoSlot } from '@driftly/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  etichetta: string;
  ariaLabel: string;
  statoMattina: StatoSlot;
  statoPomeriggio: StatoSlot;
  iconaTipologia?: string | null;
  selezionato?: boolean;
}>(), { selezionato: false });

defineEmits<{ select: [] }>();

const fill: Record<StatoSlot, string> = {
  libero: 'var(--color-state-libero)', abbonato: 'var(--color-state-abbonato)',
  giornaliero: 'var(--color-state-giornaliero)', prenotato: 'var(--color-state-prenotato)',
};
const ink: Record<StatoSlot, string> = {
  libero: 'var(--color-state-libero-ink)', abbonato: 'var(--color-state-abbonato-ink)',
  giornaliero: 'var(--color-state-giornaliero-ink)', prenotato: 'var(--color-state-prenotato-ink)',
};
const isSplit = computed(() => props.statoMattina !== props.statoPomeriggio);
const bg = computed(() =>
  isSplit.value
    ? `linear-gradient(90deg, ${fill[props.statoMattina]} 0 49%, var(--color-surface) 49% 51%, ${fill[props.statoPomeriggio]} 51% 100%)`
    : fill[props.statoMattina],
);
const color = computed(() => (isSplit.value ? 'var(--color-text)' : ink[props.statoMattina]));
const boxShadow = computed(() =>
  props.selezionato
    ? '0 0 0 4px var(--color-brand-tint)'
    : 'var(--shadow-soft)',
);
</script>

<template>
  <span class="relative inline-flex">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selezionato"
      class="grid size-[34px] place-items-center rounded-full text-xs font-semibold [font-variant-numeric:tabular-nums] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
      :class="selezionato ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)]' : ''"
      :style="{ background: bg, color, boxShadow }"
      @click="$emit('select')"
    >{{ etichetta }}</button>
    <span v-if="iconaTipologia" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] [box-shadow:var(--shadow-soft)]">
      <Icon :name="iconaTipologia" :size="10" />
    </span>
  </span>
</template>
