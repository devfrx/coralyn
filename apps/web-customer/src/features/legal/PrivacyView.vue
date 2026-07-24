<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { PublicTitolareDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { INFORMATIVA_SECTIONS, INFORMATIVA_VERSION, INFORMATIVA_UPDATED } from './informativa.content';
import { useMyInformativa, usePublicInformativa } from './useInformativa';

const route = useRoute();
const session = useSessionStore();
const eid = computed(() => (typeof route.query.e === 'string' ? route.query.e : ''));

// Priorità: ?e=<id> (deep-link) → pubblico; altrimenti autenticato; altrimenti solo testo fisso.
// Gating (queryResource.enabled): parte SOLO la fonte pertinente. Senza gating, un /privacy da
// sloggati farebbe partire /customer/me/informativa → 401 → l'interceptor tenta un refresh → logout
// + redirect a /attiva (bug), e /public/informativa/ con id vuoto → 400. Il gating lo evita.
const publicRes = usePublicInformativa(eid.value, () => eid.value.length > 0);
const myRes = useMyInformativa(() => eid.value.length === 0 && session.authenticated);
const titolare = computed<PublicTitolareDTO | null>(() => {
  if (eid.value) return publicRes.data.value ?? null;
  if (session.authenticated) return myRes.data.value ?? null;
  return null;
});

const TODO = '[COMPILARE]';
function v(field: keyof PublicTitolareDTO): string {
  const t = titolare.value;
  if (!t) return TODO;
  const raw = t[field];
  return raw === null || raw === '' ? TODO : String(raw);
}
const titolareName = computed(() => (titolare.value ? titolare.value.establishmentName : 'lo stabilimento presso cui ti sei registrato'));
</script>

<template>
  <section class="mx-auto max-w-[640px] px-5 py-8">
    <h1 class="mb-1 text-[22px] font-bold tracking-[-.02em] text-[var(--color-text)]">Informativa privacy</h1>
    <p data-testid="informativa-version" class="mb-6 text-xs text-[var(--color-text-muted)]">
      Versione {{ INFORMATIVA_VERSION }} · aggiornata il {{ INFORMATIVA_UPDATED }}
    </p>

    <div class="mb-6 rounded-lg border border-[var(--color-border)] p-4">
      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">Titolare del trattamento</h2>
      <p class="text-sm text-[var(--color-text-muted)]">{{ titolareName }}</p>
      <dl class="mt-2 grid grid-cols-1 gap-1 text-sm text-[var(--color-text-muted)]">
        <div><span class="font-medium">Denominazione:</span> {{ v('legalName') }}</div>
        <div><span class="font-medium">Sede legale:</span> {{ v('registeredAddress') }}</div>
        <div><span class="font-medium">P.IVA / C.F.:</span> {{ v('vatOrTaxId') }}</div>
        <div><span class="font-medium">Email:</span> {{ v('contactEmail') }}</div>
        <div><span class="font-medium">PEC:</span> {{ v('pec') }}</div>
        <div><span class="font-medium">Legale rappresentante:</span> {{ v('legalRepresentative') }}</div>
        <div><span class="font-medium">Contatto per i diritti:</span> {{ v('dataRightsContact') }}</div>
        <div v-if="titolare?.dpoNominated"><span class="font-medium">DPO:</span> {{ v('dpoContact') }}</div>
      </dl>
    </div>

    <div v-for="s in INFORMATIVA_SECTIONS" :key="s.id" class="mb-5">
      <h2 class="mb-1 text-sm font-semibold text-[var(--color-text)]">{{ s.heading }}</h2>
      <p v-for="(p, i) in s.paragraphs" :key="i" class="mb-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{{ p }}</p>
    </div>

    <p class="mt-8 border-t border-[var(--color-border)] pt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
      Questo testo è una bozza tecnica e non costituisce un parere legale. Prima della pubblicazione deve
      essere validato da un professionista legale o dal responsabile della protezione dei dati.
    </p>
  </section>
</template>
