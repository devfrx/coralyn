<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Field, Input, Button } from '@coralyn/ui-kit';
import type { CredentialSetupContext } from '@coralyn/contracts';
import AuthLayout from '@/app/AuthLayout.vue';
import { apiFetch } from '@/lib/http';

const route = useRoute();
const router = useRouter();
const token = String(route.query.token ?? '');

type Phase = 'loading' | 'form' | 'invalid';
const phase = ref<Phase>('loading');
const email = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const submitting = ref(false);

onMounted(async () => {
  if (!token) {
    phase.value = 'invalid';
    return;
  }
  try {
    const ctx = await apiFetch<CredentialSetupContext>(`/auth/credential-setup/${encodeURIComponent(token)}`);
    email.value = ctx.email;
    phase.value = 'form';
  } catch {
    phase.value = 'invalid';
  }
});

async function submit(): Promise<void> {
  error.value = '';
  if (password.value.length < 10) {
    error.value = 'La password deve avere almeno 10 caratteri.';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = 'Le due password non coincidono.';
    return;
  }
  submitting.value = true;
  try {
    await apiFetch<null>('/auth/credential-setup', { method: 'POST', body: JSON.stringify({ token, password: password.value }) });
    await router.push({ name: 'login', query: { setPassword: '1' } });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Impossibile impostare la password.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <template #footer>Attivazione su invito · servizio per stabilimenti</template>

    <p v-if="phase === 'loading'" class="py-6 text-center text-sm text-[var(--color-text-muted)]">Verifica del link…</p>

    <template v-else-if="phase === 'invalid'">
      <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Link non valido</h1>
      <p class="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
        Questo link per impostare la password non è valido o è scaduto. Richiedi un nuovo invito o accedi se hai già impostato la password.
      </p>
      <RouterLink to="/login" class="font-semibold text-[var(--color-brand-ink)]">Vai al login</RouterLink>
    </template>

    <form v-else-if="phase === 'form'" class="flex flex-col gap-4" @submit.prevent="submit">
      <div>
        <h1 class="mb-1.5 text-[27px] font-bold tracking-[-.02em] text-[var(--color-text)]">Imposta la password</h1>
        <p class="text-sm text-[var(--color-text-muted)]">Per l'account <strong data-testid="sp-email">{{ email }}</strong>.</p>
      </div>
      <Field label="Nuova password">
        <Input name="sp-password" data-testid="sp-password" v-model="password" type="password" placeholder="Almeno 10 caratteri" />
      </Field>
      <Field label="Conferma password">
        <Input name="sp-confirm" data-testid="sp-confirm" v-model="confirm" type="password" />
      </Field>
      <p v-if="error" data-testid="sp-error" class="text-xs text-[var(--color-danger)]">{{ error }}</p>
      <Button type="submit" data-testid="sp-submit" :disabled="submitting">Imposta password</Button>
    </form>
  </AuthLayout>
</template>
