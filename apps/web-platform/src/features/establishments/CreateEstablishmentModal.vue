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
const copied = ref(false);

const create = useCreateEstablishment();

function resetForm(): void {
  phase.value = 'form';
  name.value = '';
  adminEmail.value = '';
  errorMessage.value = '';
  result.value = null;
  copied.value = false;
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

async function copyPassword(): Promise<void> {
  const pwd = result.value?.temporaryPassword;
  if (!pwd) return;
  try {
    await navigator.clipboard?.writeText(pwd);
    copied.value = true;
  } catch {
    // clipboard non disponibile: nessuna azione, la password resta visibile per copia manuale.
  }
}

function done(): void {
  open.value = false;
}
</script>

<template>
  <Modal v-model:open="open" title="Nuovo lido" eyebrow="Provisioning">
    <form v-if="phase === 'form'" class="flex flex-col gap-4" @submit.prevent="submit">
      <Field label="Nome del lido">
        <Input name="create-name" data-testid="create-name" v-model="name" placeholder="es. Lido Gamma" />
      </Field>
      <Field label="Email amministratore">
        <Input name="create-admin-email" data-testid="create-admin-email" v-model="adminEmail" type="email" placeholder="admin@lido.it" />
      </Field>
      <p v-if="errorMessage" class="text-xs text-[var(--color-danger)]">{{ errorMessage }}</p>
      <div class="flex justify-end gap-2">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit" data-testid="create-submit" :disabled="create.isPending.value">Crea lido</Button>
      </div>
    </form>

    <div v-else class="flex flex-col gap-4">
      <p class="text-sm text-[var(--color-text)]">
        Lido <strong>{{ result?.establishment.name }}</strong> creato. Credenziali iniziali per
        <strong>{{ result?.adminEmail }}</strong>:
      </p>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-raised)] p-4">
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Password temporanea</div>
        <div class="flex items-center gap-3">
          <span data-testid="temp-password" class="flex-1 font-mono text-sm font-semibold tabular-nums text-[var(--color-text)]">{{ result?.temporaryPassword }}</span>
          <Button variant="secondary" type="button" @click="copyPassword">{{ copied ? 'Copiata' : 'Copia' }}</Button>
        </div>
      </div>
      <p class="text-xs text-[var(--color-danger)]">Questa password viene mostrata una sola volta: annotala ora, non potrà essere recuperata di nuovo.</p>
      <div class="flex justify-end">
        <Button data-testid="create-done" @click="done">Fatto</Button>
      </div>
    </div>
  </Modal>
</template>
