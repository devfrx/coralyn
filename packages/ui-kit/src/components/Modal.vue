<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import IconButton from './IconButton.vue';
defineProps<{ title: string; eyebrow?: string; description?: string }>();
const open = defineModel<boolean>('open', { required: true });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[80] bg-[var(--color-scrim-strong)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-full max-w-[548px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface)] [box-shadow:var(--shadow-modal)] focus:outline-none data-[state=open]:[animation:dialog-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:dialog-out_var(--motion-fast)_var(--ease-standard)]">
        <div class="flex shrink-0 items-start justify-between border-b border-[var(--color-border-row)] p-5">
          <div>
            <div v-if="eyebrow" class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ eyebrow }}</div>
            <DialogTitle class="text-[19px] font-bold tracking-[-.01em] text-[var(--color-text)]">{{ title }}</DialogTitle>
            <DialogDescription :class="description ? 'mt-1 text-[12.5px] text-[var(--color-text-2nd)]' : 'sr-only'">
              {{ description ?? title }}
            </DialogDescription>
          </div>
          <DialogClose as-child><IconButton icon="x" label="Chiudi" variant="subtle" /></DialogClose>
        </div>
        <div data-test="modal-body" class="flex-1 overflow-auto p-5"><slot /></div>
        <div v-if="$slots.footer" data-test="modal-footer-region" class="shrink-0 border-t border-[var(--color-border-row)] p-5 pt-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
