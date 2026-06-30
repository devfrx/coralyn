<script setup lang="ts">
import { Icon } from '@coralyn/ui-kit';
import AuthLayout from '@/app/AuthLayout.vue';
// Coralyn è un servizio B2B a contratto: l'attivazione avviene SU INVITO, non con
// self-registration aperta (vedi ADR-0028 e D-002). Questa pagina è informativa:
// non crea account. L'indirizzo è un placeholder finché il brand/dominio (D-017)
// non è deciso.
const CONTATTO = 'attivazione@coralyn.app';
</script>
<template>
  <AuthLayout>
    <template #hero>
      <h2 class="mb-3.5 text-[30px] font-bold leading-[1.22] tracking-[-.02em] text-[var(--color-on-sidebar-strong)]">Porta il tuo lido su Coralyn.</h2>
      <p class="mb-5 text-[14.5px] leading-relaxed text-[var(--color-on-teal-2nd)]">Coralyn è il gestionale dei lidi: mappa ombrelloni, prenotazioni, abbonamenti e cassa, configurati per la tua struttura.</p>
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2.5 text-[13px] text-[var(--color-on-sidebar)]"><span class="grid size-[22px] flex-none place-items-center rounded-[7px]" style="background:rgba(133,180,178,.22);color:var(--color-on-teal-check);"><Icon name="check" :size="13" /></span>Configurazione guidata della spiaggia</div>
        <div class="flex items-center gap-2.5 text-[13px] text-[var(--color-on-sidebar)]"><span class="grid size-[22px] flex-none place-items-center rounded-[7px]" style="background:rgba(133,180,178,.22);color:var(--color-on-teal-check);"><Icon name="check" :size="13" /></span>Onboarding e dati seguiti dal nostro team</div>
      </div>
    </template>
    <template #footer>Attivazione su invito · servizio per stabilimenti</template>
    <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Attivazione su invito</h1>
    <p class="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">Coralyn è un servizio per stabilimenti balneari e si attiva <strong>su invito</strong>: configuriamo noi lo stabilimento e l'account amministratore, così i dati e i ruoli partono corretti fin dal primo giorno.</p>
    <a :href="`mailto:${CONTATTO}`" class="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-brand)] px-4 py-3 text-sm font-semibold text-white [box-shadow:var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]">
      <Icon name="mail" :size="16" /> Richiedi l'attivazione
    </a>
    <p class="mt-3 text-center text-[12.5px] text-[var(--color-text-muted)]">Scrivici a {{ CONTATTO }} con il nome del tuo lido.</p>
    <p class="mt-6 text-center text-[13.5px] text-[var(--color-text-2nd)]">Hai già un account? <RouterLink to="/login" class="font-semibold text-[var(--color-brand-ink)]">Accedi</RouterLink></p>
  </AuthLayout>
</template>
