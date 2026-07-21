<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, Field, Input, Button } from '@coralyn/ui-kit';
import type { CreateEstablishmentResponse } from '@coralyn/contracts';
import { useCreateEstablishment } from './usePlatformEstablishments';

const open = defineModel<boolean>('open', { required: true });

const phase = ref<'form' | 'result'>('form');
const name = ref('');
const adminEmail = ref('');
const errorMessage = ref('');
const result = ref<CreateEstablishmentResponse | null>(null);

const create = useCreateEstablishment();

const EXPIRES_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
function fmtExpires(iso: string | undefined): string {
  return iso ? EXPIRES_FMT.format(new Date(iso)) : '—';
}

function resetForm(): void {
  phase.value = 'form';
  name.value = '';
  adminEmail.value = '';
  errorMessage.value = '';
  result.value = null;
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm();
});

async function submit(): Promise<void> {
  const trimmedName = name.value.trim();
  const trimmedEmail = adminEmail.value.trim();
  if (!trimmedName || !trimmedEmail) return;
  errorMessage.value = '';
  try {
    const res = await create.mutateAsync({ name: trimmedName, adminEmail: trimmedEmail });
    result.value = res;
    phase.value = 'result';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Impossibile creare il lido.';
  }
}

function done(): void {
  open.value = false;
}
</script>

<template>
  <Modal v-model:open="open" title="Nuovo lido" eyebrow="Provisioning">
    <form v-if="phase === 'form'" id="form-create-establishment" class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Nome del lido">
        <Input name="create-name" data-testid="create-name" v-model="name" placeholder="es. Lido Gamma" />
      </Field>
      <Field label="Email amministratore">
        <Input name="create-admin-email" data-testid="create-admin-email" v-model="adminEmail" type="email" placeholder="admin@lido.it" />
      </Field>
      <p v-if="errorMessage" class="text-xs text-[var(--color-danger)]">{{ errorMessage }}</p>
    </form>

    <div v-else class="flex flex-col gap-4">
      <p class="text-sm text-[var(--color-text)]">
        Lido <strong>{{ result?.establishment.name }}</strong> creato. Abbiamo inviato un invito per impostare la password
        dell'amministratore a:
      </p>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-raised)] p-4">
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Email amministratore</div>
        <div data-testid="invite-email" class="text-sm font-semibold text-[var(--color-text)]">{{ result?.adminEmail }}</div>
        <div class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Il link scade il</div>
        <div data-testid="invite-expires" class="text-sm font-semibold tabular-nums text-[var(--color-text)]">{{ fmtExpires(result?.expiresAt) }}</div>
      </div>
      <p class="text-xs text-[var(--color-text-muted)]">L'amministratore dovrà impostare la password seguendo il link ricevuto via email prima della scadenza.</p>
    </div>

    <template #footer>
      <div v-if="phase === 'form'" class="flex justify-end gap-2">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit" form="form-create-establishment" data-testid="create-submit" :loading="create.isPending.value">Crea lido</Button>
      </div>
      <div v-else class="flex justify-end">
        <Button data-testid="create-done" @click="done">Fatto</Button>
      </div>
    </template>
  </Modal>
</template>
