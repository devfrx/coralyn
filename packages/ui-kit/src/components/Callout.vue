<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'warm' | 'accent' | 'neutral' }>(), { tone: 'warm' });
const tones = {
  warm: 'bg-[var(--color-coral-050)] text-[var(--color-coral-700)]',
  accent: 'bg-[var(--color-accent-tint)] text-[var(--color-accent)]',
  neutral: 'bg-[var(--color-raised)] text-[var(--color-text-2nd)]',
} as const;
</script>
<template>
  <div
    :class="['flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-[12.5px] font-semibold', tones[$props.tone ?? 'warm']]"
  >
    <span class="mt-px shrink-0"><slot name="icon" /></span>
    <span><slot /></span>
  </div>
</template>
