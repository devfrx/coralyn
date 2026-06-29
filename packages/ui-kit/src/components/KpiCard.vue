<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ icon: string; iconBg: string; iconInk: string; label: string; value: string; trend?: string; trendDir?: 'up'|'down' }>();
</script>
<template>
  <div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[18px] [box-shadow:var(--shadow-card)]">
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="grid size-[34px] place-items-center rounded-[10px]" :style="{ background: iconBg, color: iconInk }"><Icon :name="icon" :size="18" /></span>
      <span class="text-xs font-semibold text-[var(--color-text-muted)]">{{ label }}</span>
    </div>
    <div class="whitespace-nowrap text-[28px] font-bold tracking-[-.02em] tabular-nums text-[var(--color-text)]">{{ value }}</div>
    <div v-if="trend" class="mt-1.5 flex items-center gap-1 text-[11.5px] font-semibold" :class="trendDir === 'down' ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'">
      <Icon :name="trendDir === 'down' ? 'arrow-down' : 'arrow-up'" :size="14" />{{ trend }}
    </div>
  </div>
</template>
