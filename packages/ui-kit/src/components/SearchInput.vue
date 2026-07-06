<script setup lang="ts">
import Icon from './Icon.vue';
withDefaults(defineProps<{ placeholder?: string; ariaLabel?: string }>(), {
  placeholder: 'Cerca…',
  ariaLabel: 'Cerca',
});
const model = defineModel<string>({ default: '' });
</script>
<template>
  <div class="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 focus-within:border-[var(--color-brand)] focus-within:[box-shadow:var(--ring-focus)]">
    <Icon name="search" :size="16" class="shrink-0 text-[var(--color-placeholder)]" />
    <input
      v-model="model"
      type="text"
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      class="w-full min-w-0 bg-transparent text-[13px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-placeholder)]"
    />
    <button
      v-if="model"
      type="button"
      aria-label="Cancella ricerca"
      class="grid size-5 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-raised)]"
      @click="model = ''"
    ><Icon name="x" :size="14" /></button>
  </div>
</template>
