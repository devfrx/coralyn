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
const operativeNav = [
  { to: '/map', label: 'Mappa', icon: 'map' },
  { to: '/bookings', label: 'Prenotazioni', icon: 'calendar' },
  { to: '/rentals', label: 'Noleggi', icon: 'waves' },
  { to: '/renewals', label: 'Rinnovi', icon: 'renew' },
  { to: '/customers', label: 'Clienti', icon: 'users' },
  { to: '/pricing', label: 'Listino', icon: 'tag' },
  { to: '/rentals/catalogo', label: 'Listino noleggi', icon: 'layers' },
  { to: '/report', label: 'Report', icon: 'chart' },
];
// /onboarding resta fuori di proposito: ha già i suoi ingressi (card in Stabilimento,
// empty-state della Mappa) e a setup completo sarebbe una voce-rumore permanente.
const adminNav = [{ to: '/establishment/structure', label: 'Struttura', icon: 'umbrella' }];
const sections = computed(() => [
  { eyebrow: 'Operativo', items: operativeNav },
  ...(session.role === Role.Admin ? [{ eyebrow: 'Amministrazione', items: adminNav }] : []),
]);
const initials = computed(() => session.userEmail.slice(0, 2).toUpperCase());
function signOut() { session.logout(); router.push('/login'); }
</script>
<template>
  <!-- overflow-y-auto: su viewport bassi (laptop 768p, drawer mobile fixed) il contenuto admin
       supera l'altezza disponibile e senza scroll interno «Esci» diventerebbe irraggiungibile. -->
  <div class="flex h-full flex-col overflow-y-auto px-3.5 pb-3.5 pt-[18px] text-[var(--color-on-sidebar)]">
    <div class="flex items-center gap-2.5 px-1.5 pb-[18px] pt-1">
      <img src="/coralyn-logo.png" alt="Coralyn" class="size-[38px] rounded-[11px] object-cover" style="box-shadow:0 2px 8px rgba(0,0,0,.22);" />
      <div class="leading-tight">
        <div class="text-[17px] font-bold tracking-[-.01em] text-[var(--color-on-sidebar-strong)]">Coralyn</div>
        <div class="text-[10.5px] font-medium uppercase tracking-[.08em] text-[var(--color-on-sidebar-muted)]">Gestionale lidi</div>
      </div>
    </div>
    <button @click="router.push('/establishment')" title="Vai allo Stabilimento" aria-label="Vai allo Stabilimento" class="mb-[18px] flex w-full items-center gap-2.5 rounded-[11px] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-raised)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
      <span class="grid size-[30px] flex-none place-items-center rounded-lg text-white" style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);"><Icon name="waves" :size="17" /></span>
      <span class="flex-1 leading-tight">
        <span class="block text-[13px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.establishmentName }}</span>
        <span v-if="seasonName" class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ seasonName }}</span>
      </span>
    </button>
    <template v-for="(sec, i) in sections" :key="sec.eyebrow">
      <div class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-on-teal-eyebrow)]" :class="i > 0 ? 'pt-4' : ''">{{ sec.eyebrow }}</div>
      <nav class="flex flex-col gap-[3px]" :aria-label="sec.eyebrow">
        <RouterLink v-for="it in sec.items" :key="it.to" :to="it.to" custom v-slot="{ isActive, navigate }">
          <button @click="navigate" :aria-current="isActive ? 'page' : undefined"
            class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            :class="isActive ? 'bg-[var(--color-sidebar-raised)] font-semibold text-[var(--color-on-sidebar-strong)]' : 'font-medium text-[var(--color-on-sidebar)] hover:bg-white/5'">
            <Icon :name="it.icon" :size="20" class="flex-none" />
            <span class="flex-1 text-left">{{ it.label }}</span>
            <span v-if="isActive" class="size-1.5 rounded-full bg-[var(--color-brand)]"></span>
          </button>
        </RouterLink>
      </nav>
    </template>
    <div class="mt-auto flex flex-col gap-[3px]">
      <div class="mx-2 my-3 h-px bg-[var(--color-sidebar-divider)]"></div>
      <div class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5">
        <span class="grid size-8 flex-none place-items-center rounded-full bg-[var(--color-brand)] text-[12px] font-semibold text-white">{{ initials }}</span>
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block truncate text-[12px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.userEmail }}</span>
          <span class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ roleLabel }}</span>
        </span>
      </div>
      <!-- Stesso pattern di web-platform (bottone con icona e testo «Esci»), reso però coi token
           della sidebar: Button secondary di ui-kit nasce per superfici chiare e sul teal scuro
           diventerebbe un chip fuori palette. -->
      <button @click="signOut" class="flex w-full items-center justify-center gap-2 rounded-[11px] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-raised)] px-2.5 py-2 text-[13px] font-semibold text-[var(--color-on-sidebar-strong)] hover:bg-white/5 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
        <Icon name="logout" :size="15" />Esci
      </button>
    </div>
  </div>
</template>
