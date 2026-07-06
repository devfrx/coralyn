<script setup lang="ts">
import { Toast } from '@coralyn/ui-kit';
import { useToasts, dismissToast } from '@/lib/toasts';
const toasts = useToasts();
</script>
<template>
  <TransitionGroup
    tag="div"
    class="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2"
    enter-active-class="[animation:toast-in_var(--motion-base)_var(--ease-emphasized)]"
    leave-active-class="[animation:toast-out_var(--motion-fast)_var(--ease-standard)]"
  >
    <Toast v-for="t in toasts.items" :key="t.id" class="pointer-events-auto" :message="t.message" @dismiss="dismissToast(t.id)" />
  </TransitionGroup>
</template>
