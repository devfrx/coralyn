<script setup lang="ts">
withDefaults(defineProps<{ numeric?: boolean }>(), { numeric: false });
const model = defineModel<string>();
</script>
<template>
  <input
    v-model="model"
    v-bind="$attrs"
    :class="[
      'w-full rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-placeholder)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)]',
      numeric && '[font-variant-numeric:tabular-nums]',
    ]"
  />
</template>
