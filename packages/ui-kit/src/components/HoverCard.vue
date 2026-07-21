<script setup lang="ts">
import { HoverCardRoot, HoverCardTrigger, HoverCardPortal, HoverCardContent, HoverCardArrow } from 'reka-ui';

withDefaults(defineProps<{
  /** true = rende solo il trigger (es. dispositivi touch: la card non esiste). */
  disabled?: boolean;
  openDelay?: number;
  closeDelay?: number;
  defaultOpen?: boolean;
}>(), { disabled: false, openDelay: 350, closeDelay: 150, defaultOpen: false });
</script>
<template>
  <slot v-if="disabled" name="trigger" />
  <HoverCardRoot v-else :open-delay="openDelay" :close-delay="closeDelay" :default-open="defaultOpen">
    <HoverCardTrigger as-child><slot name="trigger" /></HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent side="top" :side-offset="8"
        class="z-[45] min-w-[200px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 [box-shadow:var(--shadow-drawer)] data-[state=open]:[animation:overlay-in_var(--motion-fast)_var(--ease-standard)]">
        <slot name="content" />
        <HoverCardArrow class="fill-[var(--color-surface)]" :width="10" :height="5" />
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
