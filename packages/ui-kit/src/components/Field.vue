<script setup lang="ts">
defineProps<{ label: string; error?: string }>();
</script>
<template>
  <label class="block">
    <span class="mb-1.5 block text-[13px] font-semibold text-[var(--color-text-2nd)]">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1 block text-xs text-[var(--color-danger)]">{{ error }}</span>
  </label>
</template>
