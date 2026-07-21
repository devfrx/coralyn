<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'line' | 'block' | 'circle';
    width?: string;
    height?: string;
  }>(),
  { variant: 'line' },
);

const DEFAULTS = {
  line: { width: '100%', height: '0.75em' },
  block: { width: '100%', height: '64px' },
  circle: { width: '32px', height: '32px' },
} as const;
</script>
<template>
  <div
    data-test="skeleton"
    aria-hidden="true"
    class="skeleton-sheen bg-[var(--color-skeleton)]"
    :class="variant === 'circle' ? 'rounded-[var(--radius-full)]' : 'rounded-[var(--radius-sm)]'"
    :style="{ width: width ?? DEFAULTS[variant].width, height: height ?? DEFAULTS[variant].height }"
  />
</template>
