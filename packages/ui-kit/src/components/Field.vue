<script setup lang="ts">
defineProps<{ label: string; error?: string }>();
</script>
<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-[var(--color-text)]">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1 block text-xs text-[var(--color-red-500)]">{{ error }}</span>
  </label>
</template>
