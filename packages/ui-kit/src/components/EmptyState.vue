<script setup lang="ts">
defineProps<{ message: string }>();
</script>
<template>
  <p class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]">
    <slot>{{ message }}</slot>
  </p>
</template>
