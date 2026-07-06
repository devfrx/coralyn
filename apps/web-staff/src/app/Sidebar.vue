<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useActiveSeason } from '@/lib/useActiveSeason';
const session = useSessionStore();
const router = useRouter();
const { name: seasonName } = useActiveSeason();
const roleLabel = computed(() =>
  session.role === Role.Admin ? 'Amministratore' : session.role === Role.Superuser ? 'Superuser' : 'Staff',
);
const nav = [
  { to: '/map', label: 'Mappa', icon: 'map' },
  { to: '/bookings', label: 'Prenotazioni', icon: 'calendar' },
  { to: '/renewals', label: 'Rinnovi', icon: 'renew' },
  { to: '/customers', label: 'Clienti', icon: 'users' },
  { to: '/pricing', label: 'Listino', icon: 'tag' },
  { to: '/report', label: 'Report', icon: 'chart' },
];
const initials = computed(() => session.userEmail.slice(0, 2).toUpperCase());
function signOut() { session.logout(); router.push('/login'); }
</script>
<template>
  <aside class="flex w-[248px] flex-none flex-col bg-[var(--color-sidebar-bg)] px-3.5 pb-3.5 pt-[18px] text-[var(--color-on-sidebar)]">
    <div class="flex items-center gap-2.5 px-1.5 pb-[18px] pt-1">
      <img src="/coralyn-logo.png" alt="Coralyn" class="size-[38px] rounded-[11px] object-cover" style="box-shadow:0 2px 8px rgba(0,0,0,.22);" />
      <div class="leading-tight">
        <div class="text-[17px] font-bold tracking-[-.01em] text-[var(--color-on-sidebar-strong)]">Coralyn</div>
        <div class="text-[10.5px] font-medium uppercase tracking-[.08em] text-[var(--color-on-sidebar-muted)]">Gestionale lidi</div>
      </div>
    </div>
    <button @click="router.push('/establishment')" class="mb-[18px] flex w-full items-center gap-2.5 rounded-[11px] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-raised)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
      <span class="grid size-[30px] flex-none place-items-center rounded-lg text-white" style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);"><Icon name="waves" :size="17" /></span>
      <span class="flex-1 leading-tight">
        <span class="block text-[13px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.establishmentName }}</span>
        <span v-if="seasonName" class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ seasonName }}</span>
      </span>
      <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-on-sidebar-muted)]" />
    </button>
    <div class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-on-teal-eyebrow)]">Operativo</div>
    <nav class="flex flex-col gap-[3px]">
      <RouterLink v-for="it in nav" :key="it.to" :to="it.to" custom v-slot="{ isActive, navigate }">
        <button @click="navigate" :aria-current="isActive ? 'page' : undefined"
          class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          :class="isActive ? 'bg-[var(--color-sidebar-raised)] font-semibold text-[var(--color-on-sidebar-strong)]' : 'font-medium text-[var(--color-on-sidebar)] hover:bg-white/5'">
          <Icon :name="it.icon" :size="20" class="flex-none" />
          <span class="flex-1 text-left">{{ it.label }}</span>
          <span v-if="isActive" class="size-1.5 rounded-full bg-[var(--color-brand)]"></span>
        </button>
      </RouterLink>
    </nav>
    <div class="mt-auto flex flex-col gap-[3px]">
      <div class="mx-2 my-3 h-px bg-[var(--color-sidebar-divider)]"></div>
      <div class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5">
        <span class="grid size-8 flex-none place-items-center rounded-full bg-[var(--color-brand)] text-[12px] font-semibold text-white">{{ initials }}</span>
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block truncate text-[12px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.userEmail }}</span>
          <span class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ roleLabel }}</span>
        </span>
        <button @click="signOut" aria-label="Esci" title="Esci" class="grid size-[30px] flex-none place-items-center rounded-lg text-[var(--color-on-sidebar-muted)] hover:bg-white/5 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"><Icon name="logout" :size="18" /></button>
      </div>
    </div>
  </aside>
</template>
