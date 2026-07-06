<script setup lang="ts">
import { computed } from 'vue';
import type { SlotState } from '@coralyn/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  label: string;
  ariaLabel: string;
  slotStates: readonly SlotState[];
  typeIcon?: string | null;
  selected?: boolean;
}>(), { selected: false });

defineEmits<{ select: [] }>();

const fill: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
};
const ink: Record<SlotState, string> = {
  free: 'var(--color-state-free-ink)', season: 'var(--color-state-season-ink)',
  daily: 'var(--color-state-daily-ink)', booked: 'var(--color-state-booked-ink)',
};

// N-agnostico: array vuoto → una fascia libera; nessun ramo speciale per N=2.
const states = computed<readonly SlotState[]>(() => (props.slotStates.length ? props.slotStates : ['free']));
const uniform = computed(() => states.value.every((s) => s === states.value[0]));
const bg = computed(() => {
  if (uniform.value) return fill[states.value[0]];
  const n = states.value.length;
  // Spicchi uguali in senso orario da ore 12 (conic-gradient); stop netti tra i colori.
  const stops = states.value
    .map((s, i) => `${fill[s]} ${((i / n) * 100).toFixed(3)}% ${(((i + 1) / n) * 100).toFixed(3)}%`)
    .join(', ');
  return `conic-gradient(from 0deg, ${stops})`;
});
const color = computed(() => (uniform.value ? ink[states.value[0]] : 'var(--color-text)'));

// jsdom non serializza conic-gradient/var() nello style attribute → esponiamo i computed grezzi per i test.
defineExpose({ bg, uniform });
</script>

<template>
  <span class="relative inline-flex">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selected"
      class="grid size-[34px] place-items-center rounded-full text-xs font-semibold [font-variant-numeric:tabular-nums] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :class="selected ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)] [box-shadow:0_0_0_4px_var(--color-brand-tint)]' : '[box-shadow:var(--shadow-soft)]'"
      :style="{ background: bg, color }"
      @click="$emit('select')"
    >{{ label }}</button>
    <span v-if="typeIcon" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] [box-shadow:var(--shadow-soft)]">
      <Icon :name="typeIcon" :size="10" />
    </span>
  </span>
</template>
