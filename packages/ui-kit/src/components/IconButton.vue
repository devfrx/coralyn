<script setup lang="ts">
import Icon from './Icon.vue';
withDefaults(
  defineProps<{ icon: string; label: string; variant?: 'ghost' | 'subtle'; size?: 'sm' | 'md'; disabled?: boolean }>(),
  { variant: 'ghost', size: 'md', disabled: false },
);
const base = 'inline-grid place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed';
const sizes = { sm: 'size-6', md: 'size-8' } as const;
const iconSize = { sm: 14, md: 16 } as const;
const variants = {
  ghost:  'border-0 bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-accent-tint)] hover:text-[var(--color-text)]',
  subtle: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)] hover:bg-[var(--color-warm-025)] hover:text-[var(--color-text)]',
} as const;
</script>
<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    :class="[base, sizes[$props.size ?? 'md'], variants[$props.variant ?? 'ghost']]"
  >
    <Icon :name="icon" :size="iconSize[$props.size ?? 'md']" />
  </button>
</template>
