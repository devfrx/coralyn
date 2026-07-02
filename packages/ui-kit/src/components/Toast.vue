<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ message: string }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>
<template>
  <div role="alert" class="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-surface)] p-3.5 [box-shadow:var(--shadow-modal)]">
    <Icon name="alert-triangle" :size="16" class="mt-0.5 shrink-0 text-[var(--color-danger)]" />
    <span class="flex-1 text-[13px] leading-snug text-[var(--color-text)]">{{ message }}</span>
    <button type="button" aria-label="Chiudi" class="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)]" @click="emit('dismiss')">
      <Icon name="x" :size="14" />
    </button>
  </div>
</template>
