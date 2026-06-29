<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Card, StatTile, Badge, Button, Avatar, Icon } from '@driftly/ui-kit';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
const router = useRouter();
function esci() { session.logout(); router.push('/login'); }
// Mock seam: dati demo statici — da sostituire con useQuery quando il backend espone l'endpoint.
const struttura = [
  { value: '2', label: 'Settori' }, { value: '47', label: 'Ombrelloni' }, { value: '3', label: 'Tipologie' }, { value: '3', label: 'Pacchetti' },
];
type Tone = 'brand' | 'neutral';
const utenti: { ini: string; email: string; ruolo: string; tone: Tone; tu: boolean }[] = [
  { ini: 'GI', email: session.utenteEmail, ruolo: 'Amministratore', tone: 'brand', tu: true },
  { ini: 'LS', email: 'staff@lidomaestrale.it', ruolo: 'Staff', tone: 'neutral', tu: false },
];
</script>
<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[22px]">
    <Card class="mb-4">
      <div class="flex items-center gap-[18px] p-[22px]">
        <img src="/coralyn-logo.png" alt="Lido Maestrale" class="size-14 rounded-[14px] object-cover" style="box-shadow:0 2px 8px rgba(15,60,73,.18);" />
        <div class="min-w-0 flex-1">
          <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ session.nomeStabilimento }}</h2>
          <div class="mt-1 text-[13px] text-[var(--color-text-muted)]">Amministratore · {{ session.utenteEmail }} · <span class="tabular-nums">Stagione 2026</span></div>
        </div>
        <Button variant="secondary"><Icon name="edit" :size="15" />Modifica</Button>
      </div>
    </Card>

    <div class="mb-4 grid grid-cols-2 gap-4">
      <Card>
        <div class="p-5">
          <span class="text-sm font-bold text-[var(--color-text)]">Informazioni stabilimento</span>
          <div class="mt-4 flex flex-col gap-3.5">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ session.nomeStabilimento }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Stagione attiva</div><div class="text-sm font-medium tabular-nums text-[var(--color-text)]">Estate 2026 · 1 giu – 15 set</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Fasce operative</div><div class="text-sm font-medium text-[var(--color-text)]">Giornata · Mattina · Pomeriggio</div></div>
          </div>
        </div>
      </Card>
      <Card>
        <div class="p-5">
          <div class="mb-4 flex items-center justify-between"><span class="text-sm font-bold text-[var(--color-text)]">Struttura della spiaggia</span><Badge tone="soon">Configura · in arrivo</Badge></div>
          <div class="grid grid-cols-2 gap-3.5">
            <StatTile v-for="s in struttura" :key="s.label" :value="s.value" :label="s.label" />
          </div>
        </div>
      </Card>
    </div>

    <Card class="mb-4">
      <div class="p-5">
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-sm font-bold text-[var(--color-text)]">Utenti e ruoli</span>
          <Badge tone="soon"><Icon name="plus" :size="13" />Inviti e gestione · in arrivo</Badge>
        </div>
        <p class="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">Il team dello stabilimento ha ruoli <strong class="text-[var(--color-text-2nd)]">Amministratore</strong> e <strong class="text-[var(--color-text-2nd)]">Staff</strong>. Il ruolo <strong class="text-[var(--color-text-2nd)]">Superuser</strong> è di piattaforma (console cross-stabilimento) e non appartiene al team del lido.</p>
        <div class="flex flex-col">
          <div v-for="u in utenti" :key="u.email" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-3 last:border-0">
            <Avatar :iniziali="u.ini" size="md" :tone="u.tone === 'brand' ? 'brand' : 'accent'" />
            <div class="flex flex-1 items-center gap-2">
              <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ u.email }}</span>
              <Badge v-if="u.tu" tone="accent">Tu</Badge>
            </div>
            <Badge :tone="u.tone">{{ u.ruolo }}</Badge>
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div class="flex items-center gap-3.5 p-5">
        <span class="grid size-10 flex-none place-items-center rounded-[11px] bg-[var(--color-accent-tint)] text-[var(--color-accent)]"><Icon name="shield" :size="20" /></span>
        <div class="min-w-0 flex-1">
          <div class="text-[13.5px] font-bold text-[var(--color-text)]">Sessione</div>
          <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Accesso protetto · la sessione scade dopo 8 ore.</div>
        </div>
        <Button variant="danger" @click="esci"><Icon name="logout" :size="16" />Esci</Button>
      </div>
    </Card>
  </section>
</template>
