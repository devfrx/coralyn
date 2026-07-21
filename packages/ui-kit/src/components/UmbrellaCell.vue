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
  dimmed?: boolean;
  found?: boolean;
}>(), { selected: false, dimmed: false, found: false });

defineEmits<{ select: [] }>();

const fill: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
  covered: 'var(--color-state-covered)',
};
const ink: Record<SlotState, string> = {
  free: 'var(--color-state-free-ink)', season: 'var(--color-state-season-ink)',
  daily: 'var(--color-state-daily-ink)', booked: 'var(--color-state-booked-ink)',
  covered: 'var(--color-state-covered-ink)',
};

// N-agnostico: array vuoto → una fascia libera; nessun ramo speciale per N=2.
const states = computed<readonly SlotState[]>(() => (props.slotStates.length ? props.slotStates : ['free']));
const uniform = computed(() => states.value.every((s) => s === states.value[0]));
/** Colonne verticali nell'ordine delle fasce (prima fascia a sinistra); length 1 se uniforme. */
const fills = computed<string[]>(() =>
  uniform.value ? [fill[states.value[0]]] : states.value.map((s) => fill[s]),
);
const color = computed(() => (uniform.value ? ink[states.value[0]] : 'var(--color-text)'));

// jsdom non serializza var() negli style: esponiamo i computed grezzi per i test.
defineExpose({ uniform, fills });
</script>

<template>
  <span class="relative inline-flex transition-[opacity,filter] duration-200" :class="dimmed ? 'opacity-25 saturate-50' : ''">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selected"
      class="relative grid size-11 place-items-center overflow-hidden rounded-[12px] text-xs font-semibold [font-variant-numeric:tabular-nums] transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[.97] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] lg:size-10"
      :class="[
        selected
          ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)] [box-shadow:0_0_0_4px_var(--color-brand-tint)]'
          : '[box-shadow:var(--shadow-sun)]',
        found ? '[animation:cell-found_1.15s_var(--ease-standard)_2]' : '',
      ]"
      :style="{ color }"
      @click="$emit('select')"
    >
      <span aria-hidden="true" class="absolute inset-0 flex">
        <span v-for="(f, i) in fills" :key="i" class="h-full flex-1"
          :class="i > 0 ? 'border-l border-[rgba(255,255,255,.55)]' : ''" :style="{ background: f }"></span>
      </span>
      <span aria-hidden="true" class="absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-white/35 to-transparent"></span>
      <span class="relative z-[1]">{{ label }}</span>
    </button>
    <span v-if="typeIcon" data-test="type-badge" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] [box-shadow:var(--shadow-soft)]">
      <Icon :name="typeIcon" :size="10" />
    </span>
  </span>
</template>
