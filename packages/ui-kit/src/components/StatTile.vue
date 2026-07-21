<script setup lang="ts">
withDefaults(
  defineProps<{
    value: string;
    label: string;
    tone?: 'default' | 'accent';
    layout?: 'value-first' | 'label-first';
  }>(),
  { tone: 'default', layout: 'value-first' },
);
</script>
<template>
  <div class="rounded-[var(--radius-md)] bg-[var(--color-raised)] px-3.5 py-3">
    <template v-if="layout === 'label-first'">
      <div class="text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">{{ label }}</div>
      <div class="mt-1 text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
    </template>
    <template v-else>
      <div class="text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
      <div class="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{{ label }}</div>
    </template>
  </div>
</template>
