<script setup lang="ts">
import { Icon } from '@driftly/ui-kit';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
</script>
<template>
  <header class="mb-3 flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-brand)] px-3.5 py-2.5 text-white [box-shadow:var(--shadow-sm)]">
    <span class="flex items-center gap-2 font-semibold"><Icon name="umbrella" /> {{ session.nomeStabilimento }}</span>
    <span class="flex items-center gap-2 rounded-[var(--radius-md)] bg-white/15 px-2.5 py-1.5 text-xs [font-variant-numeric:tabular-nums]">
      <Icon name="chevron-left" :size="14" /> {{ session.dataAttiva }} <Icon name="chevron-right" :size="14" />
    </span>
    <span class="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] bg-white px-3 py-1.5 text-xs text-[var(--color-cool-400)]">
      <Icon name="search" /> Cerca cliente…
    </span>
    <span class="grid size-6 place-items-center rounded-full bg-[var(--color-sand-400)] text-[11px] font-semibold text-[#3a2a08]">LS</span>
  </header>
</template>
