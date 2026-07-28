<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { Permission, Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useActiveSeason } from '@/lib/useActiveSeason';
import { OPERATIVE_NAV, ADMIN_NAV, type NavItem } from './navigation';
const session = useSessionStore();
const router = useRouter();
const { name: seasonName } = useActiveSeason();
// Il ruolo resta qui, ed è l'unico posto in cui serve ancora: dice *chi sei*, non *cosa puoi*.
const roleLabel = computed(() =>
  session.role === Role.Admin ? 'Amministratore' : session.role === Role.Superuser ? 'Superuser' : 'Staff',
);
// ⚠️ Prima di ADR-0063 `operativeNav` era mostrato a OGNI ruolo e l'unico gate era su `adminNav`.
// Ora ogni voce compare solo a chi ne detiene il permesso: è il punto che rende visibile la
// revoca configurata dall'admin. Una sezione che resta senza voci sparisce con la sua intestazione.
const canOpenEstablishment = computed(() => session.hasPermission(Permission.EstablishmentRead));
// ⚠️ Provato per mutazione (ADR-0063): disattivare questo filtro fa cadere 3 test.
const visible = (items: readonly NavItem[]): NavItem[] =>
  items.filter((it) => session.hasPermission(it.permission));
const sections = computed(() =>
  [
    { eyebrow: 'Operativo', items: visible(OPERATIVE_NAV) },
    { eyebrow: 'Amministrazione', items: visible(ADMIN_NAV) },
  ].filter((s) => s.items.length > 0),
);
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
    <!-- Il nome visibile del lido resta nel nome accessibile (WCAG 2.5.3 Label in Name).
         ⚠️ Questo blocco era un bottone INCONDIZIONATO verso /establishment — ed è il motivo per
         cui l'affermazione «/establishment non è nel menu dello staff» del brief era falsa. Da
         ADR-0063 porta lì solo chi ha `establishment.read`; a chi non ce l'ha resta la stessa
         card come identità del lido, che viene dalla sessione e non dall'endpoint negato.
         Mostrare una porta che si apre su un 403 sarebbe peggio che non mostrarla. -->
    <component :is="canOpenEstablishment ? 'button' : 'div'"
      v-bind="canOpenEstablishment ? { title: 'Vai allo Stabilimento', 'aria-label': `Vai allo Stabilimento: ${session.establishmentName}` } : {}"
      @click="canOpenEstablishment && router.push('/establishment')"
      class="mb-[18px] flex w-full items-center gap-2.5 rounded-[11px] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-raised)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
      <span class="grid size-[30px] flex-none place-items-center rounded-lg text-white" style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);"><Icon name="waves" :size="17" /></span>
      <span class="flex-1 leading-tight">
        <span class="block text-[13px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.establishmentName }}</span>
        <span v-if="seasonName" class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ seasonName }}</span>
      </span>
    </component>
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
