<script setup lang="ts">
const model = defineModel<string>();
</script>
<template>
  <input
    v-model="model"
    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-brand)] focus:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
  />
</template>
