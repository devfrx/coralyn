<script setup lang="ts">
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow } from 'reka-ui';

withDefaults(defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  defaultOpen?: boolean;
}>(), { side: 'bottom', align: 'end', defaultOpen: false });
</script>
<template>
  <PopoverRoot :default-open="defaultOpen">
    <PopoverTrigger as-child><slot name="trigger" /></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent :side="side" :align="align" :side-offset="8"
        class="z-[45] min-w-[220px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]">
        <slot name="content" />
        <PopoverArrow class="fill-[var(--color-surface)]" :width="10" :height="5" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
