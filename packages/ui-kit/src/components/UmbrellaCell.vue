<script setup lang="ts">
import { computed } from 'vue';
import type { SlotState } from '@coralyn/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  label: string;
  ariaLabel: string;
  morningState: SlotState;
  afternoonState: SlotState;
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
const isSplit = computed(() => props.morningState !== props.afternoonState);
const bg = computed(() =>
  isSplit.value
    ? `linear-gradient(90deg, ${fill[props.morningState]} 0 49%, var(--color-surface) 49% 51%, ${fill[props.afternoonState]} 51% 100%)`
    : fill[props.morningState],
);
const color = computed(() => (isSplit.value ? 'var(--color-text)' : ink[props.morningState]));
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
