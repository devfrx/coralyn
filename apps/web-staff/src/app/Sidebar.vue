<script setup lang="ts">
import { Icon } from '@driftly/ui-kit';
import { Ruolo } from '@driftly/contracts';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
const items = [
  { to: '/mappa', label: 'Mappa', icon: 'map' },
  { to: '/prenotazioni', label: 'Prenotazioni', icon: 'calendar' },
  { to: '/clienti', label: 'Clienti', icon: 'users' },
  { to: '/listino', label: 'Listino', icon: 'tag' },
  { to: '/report', label: 'Report', icon: 'chart' },
];
</script>
<template>
  <nav class="flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] bg-[var(--color-navy-900)] p-2 [box-shadow:var(--shadow-sm)]">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" v-slot="{ isActive }">
      <span :aria-current="isActive ? 'page' : undefined" :class="['flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
        isActive ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-on-navy)] hover:bg-white/5']">
        <Icon :name="it.icon" /> {{ it.label }}
      </span>
    </RouterLink>
    <template v-if="session.ruolo === Ruolo.Superuser">
      <div class="my-2 h-px bg-[var(--color-navy-700)]" />
      <RouterLink to="/console" class="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-on-navy)]/80">
        <Icon name="shield" /> Console
      </RouterLink>
    </template>
  </nav>
</template>
