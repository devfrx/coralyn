<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Field, Input, Button, Icon } from '@driftly/ui-kit';
import { useSessionStore } from '@/stores/session';
import AuthLayout from '@/app/AuthLayout.vue';
const router = useRouter();
const session = useSessionStore();
const nome = ref(''); const email = ref(''); const password = ref(''); const conferma = ref('');
function crea() { session.login(); router.push('/mappa'); }
</script>
<template>
  <AuthLayout>
    <template #hero>
      <h2 class="mb-3.5 text-[30px] font-bold leading-[1.22] tracking-[-.02em] text-[var(--color-on-sidebar-strong)]">Porta il tuo lido su Coralyn.</h2>
      <p class="mb-5 text-[14.5px] leading-relaxed text-[var(--color-on-teal-2nd)]">Crea l'account dello stabilimento: sarai l'amministratore e potrai configurare mappa, listino e staff.</p>
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2.5 text-[13px] text-[var(--color-on-sidebar)]"><span class="grid size-[22px] flex-none place-items-center rounded-[7px]" style="background:rgba(133,180,178,.22);color:#9FD0CB;"><Icon name="check" :size="13" /></span>Configurazione guidata della spiaggia</div>
        <div class="flex items-center gap-2.5 text-[13px] text-[var(--color-on-sidebar)]"><span class="grid size-[22px] flex-none place-items-center rounded-[7px]" style="background:rgba(133,180,178,.22);color:#9FD0CB;"><Icon name="check" :size="13" /></span>Prenotazioni e abbonamenti dal primo giorno</div>
      </div>
    </template>
    <template #footer>Abbonamento per stabilimento</template>
    <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Crea il tuo stabilimento</h1>
    <p class="mb-6 text-sm text-[var(--color-text-muted)]">Pochi dati per iniziare. Sarai l'amministratore dell'account.</p>
    <form class="flex flex-col gap-4" @submit.prevent="crea">
      <Field label="Nome dello stabilimento"><Input v-model="nome" placeholder="Lido Maestrale" /></Field>
      <Field label="Email"><Input v-model="email" type="email" placeholder="nome@stabilimento.it" /></Field>
      <div class="flex gap-3.5">
        <div class="flex-1"><Field label="Password"><Input v-model="password" type="password" placeholder="••••••••" /></Field></div>
        <div class="flex-1"><Field label="Conferma"><Input v-model="conferma" type="password" placeholder="••••••••" /></Field></div>
      </div>
      <Button type="submit" class="w-full">Crea stabilimento</Button>
    </form>
    <p class="mt-5 text-center text-[13.5px] text-[var(--color-text-2nd)]">Hai già un account? <RouterLink to="/login" class="font-semibold text-[var(--color-brand-ink)]">Accedi</RouterLink></p>
  </AuthLayout>
</template>
