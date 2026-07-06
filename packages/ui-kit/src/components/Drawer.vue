<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui';
import Icon from './Icon.vue';
defineProps<{ title: string }>();
const open = defineModel<boolean>('open', { required: true });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-[rgba(11,53,67,.3)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent class="fixed right-3 top-3 bottom-3 z-50 flex w-[380px] flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface)] p-4 [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:drawer-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:drawer-out_var(--motion-fast)_var(--ease-standard)]">
        <div class="flex items-center justify-between">
          <DialogTitle class="text-base font-semibold text-[var(--color-text)]">{{ title }}</DialogTitle>
          <DialogClose aria-label="Chiudi" class="grid size-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)]"><Icon name="x" :size="16" /></DialogClose>
        </div>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
