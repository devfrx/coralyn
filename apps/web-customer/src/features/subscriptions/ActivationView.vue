<script setup lang="ts">
// Attivazione del canale cliente (D-035 S4): il cliente arriva qui dal link/QR di provisioning
// (?token=<enrollmentToken>) e inserisce il PIN comunicato dall'operatore. Nessun dettaglio
// d'auth è mai mostrato (token invalido, PIN errato, token scaduto → stesso messaggio generico):
// l'endpoint /customer/activate è l'unica autorità sulla validazione.
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Field, Input, Button, Callout } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const pin = ref('');
const error = ref('');
const loading = ref(false);

async function onSubmit(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await session.activate(token.value, pin.value);
    router.push('/abbonamenti');
  } catch {
    error.value = 'Attivazione non riuscita. Verifica il link e il PIN e riprova.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-5 py-10">
    <h1 class="mb-1.5 text-[24px] font-bold tracking-[-.02em] text-[var(--color-text)]">Attiva il tuo accesso</h1>
    <p class="mb-6 text-sm text-[var(--color-text-muted)]">
      Inserisci il PIN che ti ha consegnato lo stabilimento per accedere ai tuoi abbonamenti.
    </p>

    <Callout v-if="!token" tone="warm" data-testid="activation-missing-token">
      Link di attivazione non valido o scaduto. Richiedi un nuovo link allo stabilimento.
    </Callout>

    <template v-else>
      <Callout v-if="error" tone="warm" data-testid="activation-error">{{ error }}</Callout>
      <form class="mt-4 flex flex-col gap-4" @submit.prevent="onSubmit">
        <Field label="PIN">
          <Input
            v-model="pin"
            type="password"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="••••"
            data-testid="activation-pin"
          />
        </Field>
        <Button type="submit" class="w-full" :loading="loading" data-testid="activation-submit">Attiva</Button>
      </form>
    </template>
  </div>
</template>
