<script setup lang="ts">
import { computed } from 'vue';
import { icons, FALLBACK_ICON } from '../icons/registry';

const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), { size: 16 });
const comp = computed(() => icons[props.name] ?? icons[FALLBACK_ICON]);
</script>

<template>
  <component
    :is="comp" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
  />
</template>
