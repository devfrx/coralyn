<script setup lang="ts">
import Skeleton from './Skeleton.vue';
import { useDelayedLoading } from '../useDelayedLoading';

const props = withDefaults(
  defineProps<{
    value?: string;
    label: string;
    tone?: 'default' | 'accent';
    layout?: 'value-first' | 'label-first';
    loading?: boolean;
  }>(),
  { value: '', tone: 'default', layout: 'value-first', loading: false },
);

const skeletonBusy = useDelayedLoading(() => !!props.loading);
</script>
<template>
  <div class="rounded-[var(--radius-md)] bg-[var(--color-raised)] px-3.5 py-3" :aria-busy="skeletonBusy ? 'true' : undefined">
    <template v-if="layout === 'label-first'">
      <div class="text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">{{ label }}</div>
      <Skeleton v-if="skeletonBusy" width="56px" height="20px" class="mt-1.5" />
      <div v-else class="mt-1 text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
    </template>
    <template v-else>
      <Skeleton v-if="skeletonBusy" width="56px" height="20px" class="mb-1" />
      <div v-else class="text-2xl font-bold tabular-nums" :class="tone === 'accent' ? 'text-[var(--color-brand-ink)]' : 'text-[var(--color-text)]'">{{ value }}</div>
      <div class="mt-0.5 text-[11.5px] text-[var(--color-text-muted)]">{{ label }}</div>
    </template>
  </div>
</template>
