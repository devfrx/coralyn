<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(), { variant: 'primary' });
const base = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed';
const variants = {
  primary: 'border-0 bg-[var(--color-brand)] text-white [box-shadow:var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-accent)] hover:bg-[var(--color-warm-025)]',
  ghost: 'border-0 bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-accent-tint)]',
  danger: 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:brightness-95',
} as const;
</script>
<template><button :class="[base, variants[$props.variant ?? 'primary']]"><slot /></button></template>
