<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ message?: string; icon?: string; title?: string }>();
</script>
<template>
  <div
    data-test="empty-state"
    class="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center"
  >
    <span v-if="icon" class="mb-1 grid size-11 place-items-center rounded-full bg-[var(--color-raised)] text-[var(--color-text-muted)]">
      <Icon :name="icon" :size="20" />
    </span>
    <p v-if="title" class="text-sm font-semibold text-[var(--color-text)]">{{ title }}</p>
    <p class="text-sm text-[var(--color-text-2nd)]"><slot>{{ message }}</slot></p>
    <div v-if="$slots.action" class="mt-2"><slot name="action" /></div>
  </div>
</template>
