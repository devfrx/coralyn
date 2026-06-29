<script setup lang="ts">
defineProps<{ bars: { label: string; value: number; display: string }[]; max: number; fill?: string }>();
</script>
<template>
  <div class="flex h-[170px] items-end gap-3.5 pb-1">
    <div v-for="b in bars" :key="b.label" class="flex h-full flex-1 flex-col items-center justify-end gap-2">
      <span class="text-[10.5px] font-semibold tabular-nums text-[var(--color-text-2nd)]">{{ b.display }}</span>
      <div class="w-full max-w-[42px] rounded-t-[8px] rounded-b-[4px] transition-[height]" :style="{ height: (max ? (b.value / max) * 100 : 0) + '%', background: fill || 'var(--color-accent)' }"></div>
      <span class="text-[10.5px] text-[var(--color-text-muted)]">{{ b.label }}</span>
    </div>
  </div>
</template>
