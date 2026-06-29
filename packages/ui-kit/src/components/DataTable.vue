<script setup lang="ts">
defineProps<{ columns: { key: string; label: string; align?: 'left'|'right' }[] }>();
</script>
<template>
  <div class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
    <table class="w-full border-collapse text-[13px]">
      <thead>
        <tr class="bg-[var(--color-raised)]">
          <th v-for="c in columns" :key="c.key" :class="['border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]', c.align === 'right' ? 'text-right' : 'text-left']">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody><slot /></tbody>
    </table>
  </div>
</template>
