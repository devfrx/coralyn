<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
const open = defineModel<boolean>('open', { required: true });
withDefaults(defineProps<{ title?: string }>(), { title: 'Menu di navigazione' });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-[var(--color-scrim)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent
        data-test="nav-drawer"
        class="fixed inset-y-0 left-0 z-50 flex w-[248px] max-w-[86vw] flex-col bg-[var(--color-sidebar-bg)] text-[var(--color-on-sidebar)] [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:nav-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:nav-out_var(--motion-fast)_var(--ease-standard)]">
        <DialogTitle class="sr-only">{{ title }}</DialogTitle>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
