<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Field, Input, Button } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import AuthLayout from '@/app/AuthLayout.vue';
const router = useRouter();
const route = useRoute();
const session = useSessionStore();
const email = ref('');
const password = ref('');
const errore = ref<string | null>(null);
const loading = ref(false);
// Conferma di ritorno dalla pagina pubblica set-password (/imposta-password → /login?setPassword=1):
// l'utente ha appena impostato/reimpostato la password, invitiamolo ad accedere con quella.
const justSetPassword = computed(() => route.query.setPassword === '1');
async function accedi() {
  errore.value = null;
  loading.value = true;
  try {
    await session.login(email.value, password.value);
    router.push({ name: 'map' });
  } catch {
    errore.value = 'Email o password non corretti';
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <AuthLayout>
    <template #hero>
      <h2 class="mb-3.5 text-[30px] font-bold leading-[1.22] tracking-[-.02em] text-[var(--color-on-sidebar-strong)]">La spiaggia, gestita con leggerezza.</h2>
      <p class="text-[14.5px] leading-relaxed text-[var(--color-on-teal-2nd)]">Mappa ombrelloni, prenotazioni, abbonamenti e cassa del tuo stabilimento, in un unico posto.</p>
    </template>
    <template #footer>Stagione 2026 · sessione protetta</template>
    <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Bentornato</h1>
    <p class="mb-6 text-sm text-[var(--color-text-muted)]">Accedi al gestionale del tuo stabilimento.</p>
    <p v-if="justSetPassword && !errore" role="status" data-testid="login-set-password-ok" class="mb-4 rounded-[var(--radius-md)] border border-[var(--color-success)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--color-success)]">Password impostata. Ora accedi con le tue nuove credenziali.</p>
    <p v-if="errore" role="alert" class="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--color-danger)]">{{ errore }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="accedi">
      <Field label="Email"><Input v-model="email" type="email" placeholder="nome@stabilimento.it" /></Field>
      <Field label="Password"><Input v-model="password" type="password" placeholder="••••••••" /></Field>
      <Button type="submit" class="w-full" :disabled="loading">{{ loading ? 'Accesso…' : 'Accedi' }}</Button>
    </form>
    <div class="my-6 flex items-center gap-3"><span class="h-px flex-1 bg-[var(--color-border)]"></span><span class="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[var(--color-placeholder)]">oppure</span><span class="h-px flex-1 bg-[var(--color-border)]"></span></div>
    <p class="text-center text-[13.5px] text-[var(--color-text-2nd)]">Non hai un account? <RouterLink :to="{ name: 'register' }" class="font-semibold text-[var(--color-brand-ink)]">Registra il tuo stabilimento</RouterLink></p>
  </AuthLayout>
</template>
