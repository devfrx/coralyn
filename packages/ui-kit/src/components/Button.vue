<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'ghost' | 'danger' }>(), { variant: 'primary' });
const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)] disabled:opacity-50';
const variants = {
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]',
  ghost: 'bg-[var(--color-sunken)] text-[var(--color-brand)] hover:bg-[var(--color-cool-200)]',
  danger: 'bg-[var(--color-red-500)] text-white',
} as const;
</script>

<template>
  <button :class="[base, variants[$props.variant ?? 'primary']]"><slot /></button>
</template>
