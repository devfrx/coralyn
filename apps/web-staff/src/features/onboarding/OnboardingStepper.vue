<script setup lang="ts">
defineProps<{ items: { key: string; label: string; state: 'done' | 'active' | 'todo' }[] }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <nav class="flex flex-wrap items-center gap-2" aria-label="Passi della configurazione guidata">
    <button
      v-for="(item, i) in items"
      :key="item.key"
      type="button"
      :data-testid="`stepper-${item.key}`"
      :aria-current="item.state === 'active' ? 'step' : undefined"
      class="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :class="item.state === 'active' ? 'border-[var(--color-brand)] bg-[var(--color-brand-tint)]' : 'hover:bg-[var(--color-warm-025)]'"
      @click="emit('select', item.key)"
    >
      <span
        class="grid size-6 flex-none place-items-center rounded-full text-[11.5px] font-extrabold"
        :class="item.state === 'done' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]' : 'bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]'"
        aria-hidden="true"
      >{{ item.state === 'done' ? '✓' : i + 1 }}</span>
      <span class="text-[12.5px] font-semibold text-[var(--color-text)]">{{ item.label }}</span>
    </button>
  </nav>
</template>
