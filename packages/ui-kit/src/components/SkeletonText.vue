<script setup lang="ts">
import Skeleton from './Skeleton.vue';

const props = withDefaults(defineProps<{ lines?: number }>(), { lines: 3 });

// Larghezze variate per indice, deterministiche: niente random, niente shift tra render.
const WIDTHS = ['100%', '92%', '96%', '88%'] as const;
function widthFor(i: number): string {
  return i === props.lines - 1 ? '60%' : WIDTHS[i % WIDTHS.length];
}
</script>
<template>
  <div class="flex flex-col gap-2" aria-hidden="true">
    <Skeleton v-for="i in lines" :key="i" variant="line" :width="widthFor(i - 1)" />
  </div>
</template>
