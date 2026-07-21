<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import { addDays } from '@/lib/dates';
const route = useRoute();
const emit = defineEmits<{ 'open-nav': [] }>();
const session = useSessionStore();
const title = computed(() => (route.meta.title as string | undefined) ?? '');
const subtitle = computed(() => (route.meta.subtitle as string | undefined) ?? '');
const showDateNav = computed(() => route.meta.usesDate === true);
const dateLabel = computed(() => {
  // Parse e format entrambi in UTC: la convenzione "niente aritmetica in ora locale" resta uniforme
  // con addDays/todayIso (il giorno di calendario ISO è preservato su qualunque fuso host).
  const d = new Date(session.activeDate + 'T00:00:00Z');
  const s = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
});
function shiftDay(n: number): void {
  session.activeDate = addDays(session.activeDate, n);
}
function onPickDate(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  if (v) session.activeDate = v;
}
</script>
<template>
  <header class="flex flex-none items-center gap-3 sm:gap-[18px] border-b border-[var(--color-border)] bg-[var(--color-raised)] px-[26px] py-4">
    <button aria-label="Apri menu" class="grid size-9 flex-none place-items-center rounded-[10px] text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] lg:hidden" @click="emit('open-nav')">
      <Icon name="menu" :size="20" />
    </button>
    <div class="min-w-0">
      <h1 class="truncate text-xl font-bold tracking-[-.015em] text-[var(--color-text)]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">{{ subtitle }}</p>
    </div>
    <div class="flex-1"></div>
    <div v-if="showDateNav" data-testid="date-nav" class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 [box-shadow:var(--shadow-soft)]">
      <button aria-label="Giorno precedente" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(-1)"><Icon name="chevron-left" :size="17" /></button>
      <label class="relative grid min-w-[128px] cursor-pointer place-items-center px-1">
        <span class="text-center text-[13px] font-semibold tabular-nums text-[var(--color-text)]">{{ dateLabel }}</span>
        <input type="date" aria-label="Scegli data" :value="session.activeDate" class="absolute inset-0 cursor-pointer opacity-0" @change="onPickDate" />
      </label>
      <button aria-label="Giorno successivo" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(1)"><Icon name="chevron-right" :size="17" /></button>
    </div>
  </header>
</template>
