<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
const route = useRoute();
const session = useSessionStore();
const title = computed(() => (route.meta.title as string | undefined) ?? '');
const subtitle = computed(() => (route.meta.subtitle as string | undefined) ?? '');
const dataLabel = computed(() => {
  const d = new Date(session.dataAttiva + 'T00:00:00');
  const s = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
});
</script>
<template>
  <header class="flex flex-none items-center gap-[18px] border-b border-[var(--color-border)] bg-[var(--color-raised)] px-[26px] py-4">
    <div class="min-w-0">
      <h1 class="whitespace-nowrap text-xl font-bold tracking-[-.015em] text-[var(--color-text)]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">{{ subtitle }}</p>
    </div>
    <div class="flex-1"></div>
    <div class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 [box-shadow:var(--shadow-soft)]">
      <button aria-label="Giorno precedente" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"><Icon name="chevron-left" :size="17" /></button>
      <span class="min-w-[128px] px-1 text-center text-[13px] font-semibold tabular-nums text-[var(--color-text)]">{{ dataLabel }}</span>
      <button aria-label="Giorno successivo" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"><Icon name="chevron-right" :size="17" /></button>
    </div>
    <div aria-hidden="true" class="flex w-[236px] items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[var(--color-placeholder)] [box-shadow:var(--shadow-soft)]">
      <Icon name="search" :size="16" /><span class="text-[13px]">Cerca cliente, ombrellone…</span>
    </div>
    <button aria-label="Notifiche" class="relative grid size-10 flex-none place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-2nd)] [box-shadow:var(--shadow-soft)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
      <Icon name="bell" :size="19" />
      <span class="absolute right-2.5 top-2 size-[7px] rounded-full bg-[var(--color-brand)] ring-2 ring-[var(--color-surface)]"></span>
    </button>
  </header>
</template>
