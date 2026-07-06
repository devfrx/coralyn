<script setup lang="ts">
withDefaults(defineProps<{ options?: { value: string; label: string }[] }>(), { options: () => [] });
const model = defineModel<string>();
</script>
<template>
  <select
    v-model="model"
    v-bind="$attrs"
    class="w-full rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)]"
  >
    <slot>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </slot>
  </select>
</template>
