<script setup lang="ts">
withDefaults(defineProps<{ rows?: number }>(), { rows: 3 });
const model = defineModel<string>();
</script>
<template>
  <textarea
    v-model="model"
    v-bind="$attrs"
    :rows="rows ?? 3"
    class="w-full rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-placeholder)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)] resize-none"
  />
</template>
