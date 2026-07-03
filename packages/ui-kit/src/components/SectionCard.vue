<script setup lang="ts">
import Card from './Card.vue';
import Icon from './Icon.vue';
withDefaults(
  defineProps<{ title: string; icon?: string; iconBg?: string; iconInk?: string }>(),
  { iconBg: 'var(--color-brand-tint)', iconInk: 'var(--color-brand-ink)' },
);
</script>
<template>
  <Card>
    <div class="p-[22px]">
      <div class="mb-4 flex items-center gap-2.5">
        <span
          v-if="icon"
          class="grid size-[34px] shrink-0 place-items-center rounded-[10px]"
          :style="{ background: iconBg, color: iconInk }"
        ><Icon :name="icon" :size="18" /></span>
        <span class="flex-1 text-sm font-bold text-[var(--color-text)]">{{ title }}</span>
        <slot name="action" />
      </div>
      <slot />
    </div>
  </Card>
</template>
