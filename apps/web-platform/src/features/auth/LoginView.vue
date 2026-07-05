<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Field, Input, Button } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import AuthLayout from '@/app/AuthLayout.vue';

const router = useRouter();
const session = useSessionStore();
const email = ref('');
const password = ref('');
const errore = ref<string | null>(null);
const loading = ref(false);

async function accedi(): Promise<void> {
  errore.value = null;
  loading.value = true;
  try {
    await session.login(email.value, password.value);
    router.push({ name: 'establishments' });
  } catch (e) {
    errore.value = e instanceof Error && e.message.includes('riservato') ? e.message : 'Email o password non corretti';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Console distributore</h1>
    <p class="mb-6 text-sm text-[var(--color-text-muted)]">Accedi con le tue credenziali di operatore Coralyn Platform.</p>
    <p v-if="errore" role="alert" data-testid="login-error" class="mb-4 rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--color-danger)]">{{ errore }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="accedi">
      <Field label="Email"><Input v-model="email" type="email" data-testid="login-email" placeholder="operatore@coralyn.dev" /></Field>
      <Field label="Password"><Input v-model="password" type="password" data-testid="login-password" placeholder="••••••••" /></Field>
      <Button type="submit" class="w-full" :disabled="loading" data-testid="login-submit">{{ loading ? 'Accesso…' : 'Accedi' }}</Button>
    </form>
  </AuthLayout>
</template>
