<script setup lang="ts">
import { Toast } from '@coralyn/ui-kit';
import { useToasts, dismissToast } from '@/lib/toasts';
const toasts = useToasts();
</script>
<template>
  <div class="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2">
    <Toast v-for="t in toasts.items" :key="t.id" class="pointer-events-auto" :message="t.message" @dismiss="dismissToast(t.id)" />
  </div>
</template>
