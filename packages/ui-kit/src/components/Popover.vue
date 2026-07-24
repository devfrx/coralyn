<script setup lang="ts">
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent, PopoverArrow } from 'reka-ui';

withDefaults(defineProps<{
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  defaultOpen?: boolean;
}>(), { side: 'bottom', align: 'end', defaultOpen: false });

// Open controllato opzionale: se il consumatore non usa v-model:open, il model resta undefined
// e PopoverRoot ricade su defaultOpen (uncontrolled) — retro-compatibile.
// NB: `default: undefined` esplicito è necessario — senza, Vue applica la sua regola
// "prop Boolean assente → false" (nessuna `default` key nelle props compilate da
// defineModel), e un `open` non bindato diventerebbe `false` anziché `undefined`,
// forzando PopoverRoot in modalità controllata chiusa (rompe defaultOpen).
const open = defineModel<boolean>('open', { default: undefined });
</script>
<template>
  <PopoverRoot v-model:open="open" :default-open="defaultOpen">
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
