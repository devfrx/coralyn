<script setup lang="ts">
defineProps<{ segments: { pct: number; color: string; label: string }[] }>();
</script>
<template>
  <div>
    <div class="flex h-3.5 overflow-hidden rounded-full">
      <div v-for="s in segments" :key="s.label" :style="{ width: s.pct + '%', background: s.color }"></div>
    </div>
    <div class="mt-4 flex flex-col gap-2.5">
      <div v-for="s in segments" :key="s.label" class="flex items-center gap-2.5 text-[12.5px]">
        <span class="size-2.5 flex-none rounded-full" :style="{ background: s.color }"></span>
        <span class="flex-1 text-[var(--color-text-2nd)]">{{ s.label }}</span>
        <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ s.pct }}%</span>
      </div>
    </div>
  </div>
</template>
