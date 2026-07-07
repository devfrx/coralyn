<script setup lang="ts">
const props = withDefaults(
  defineProps<{ align?: 'start' | 'end' | 'between'; gap?: 'sm' | 'md'; wrap?: boolean }>(),
  { align: 'end', gap: 'sm', wrap: false },
);
const aligns = { start: 'justify-start', end: 'justify-end', between: 'justify-between' } as const;
const gaps = { sm: 'gap-1.5', md: 'gap-2.5' } as const;
</script>
<template>
  <div :class="['flex items-center', aligns[props.align], gaps[props.gap], props.wrap ? 'flex-wrap' : 'flex-nowrap']">
    <slot />
  </div>
</template>
