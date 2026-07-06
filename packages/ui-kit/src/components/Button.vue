<script setup lang="ts">
import Icon from './Icon.vue';
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    loading?: boolean;
  }>(),
  { variant: 'primary', size: 'md', loading: false },
);
const base = 'relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-[background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[.98] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';
const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-sm' } as const;
const variants = {
  primary: 'border-0 bg-[var(--color-brand)] text-white [box-shadow:var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-accent)] hover:bg-[var(--color-warm-025)]',
  ghost: 'border-0 bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-accent-tint)]',
  danger: 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:brightness-95',
} as const;
</script>
<template>
  <button
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    :class="[base, sizes[props.size], variants[props.variant]]"
  >
    <Icon v-if="loading" name="loader-2" :size="16" class="animate-spin" />
    <slot />
  </button>
</template>
