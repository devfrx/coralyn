<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral'|'brand'|'accent'|'success'|'warning'|'danger'|'soon' }>(), { tone: 'neutral' });
const tones = {
  neutral: 'bg-[var(--color-raised)] text-[var(--color-text-2nd)]',
  brand:   'bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]',
  accent:  'bg-[var(--color-accent-tint)] text-[var(--color-accent)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)]',
  danger:  'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]',
  soon:    'bg-[var(--color-soon-bg)] text-[var(--color-soon-ink)]',
} as const;
</script>
<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-semibold', tones[$props.tone ?? 'neutral']]"><slot /></span>
</template>
