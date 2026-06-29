<script setup lang="ts">
defineProps<{ value: string; label: string }>();
</script>
<template>
  <div class="rounded-[var(--radius-md)] bg-[var(--color-raised)] px-3.5 py-3">
    <div class="text-2xl font-bold tabular-nums text-[var(--color-text)]">{{ value }}</div>
    <div class="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{{ label }}</div>
  </div>
</template>
