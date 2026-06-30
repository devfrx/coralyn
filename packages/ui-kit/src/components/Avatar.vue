<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ initials: string; size?: 'sm'|'md'|'lg'; tone?: 'brand'|'accent' }>(), { size: 'md', tone: 'accent' });
const px = { sm: '30px', md: '40px', lg: '60px' } as const;
const fs = { sm: '11px', md: '12.5px', lg: '20px' } as const;
const tones = { brand: 'background:var(--color-brand-tint);color:var(--color-brand-ink)', accent: 'background:var(--color-accent-tint);color:var(--color-accent)' } as const;
const style = computed(() => `width:${px[props.size]};height:${px[props.size]};font-size:${fs[props.size]};${tones[props.tone]}`);
</script>
<template>
  <span class="inline-flex flex-none items-center justify-center rounded-full font-semibold" :style="style">{{ initials }}</span>
</template>
