<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, Field, Input, Textarea, Button } from '@coralyn/ui-kit';
import type { CustomerDTO } from '@coralyn/contracts';
import { useUpdateCustomer } from './useCustomers';

const props = defineProps<{ customer: CustomerDTO }>();
const open = defineModel<boolean>('open', { required: true });
const update = useUpdateCustomer(props.customer.id);

const firstName = ref('');
const lastName = ref('');
const phone = ref('');
const email = ref('');
const notes = ref('');

// Precompila (e risincronizza all'apertura) dai valori correnti del cliente.
watch(
  [open, () => props.customer],
  ([isOpen]) => {
    if (!isOpen) return;
    firstName.value = props.customer.firstName;
    lastName.value = props.customer.lastName;
    phone.value = props.customer.phone ?? '';
    email.value = props.customer.email ?? '';
    notes.value = props.customer.notes ?? '';
  },
  { immediate: true },
);

function submit() {
  if (!firstName.value || !lastName.value) return;
  update.mutate(
    {
      firstName: firstName.value,
      lastName: lastName.value,
      phone: phone.value || undefined,
      email: email.value || undefined,
      notes: notes.value || undefined,
    },
    { onSuccess: () => { open.value = false; } },
  );
}
</script>
<template>
  <Modal v-model:open="open" title="Modifica cliente">
    <form data-test="form-edit-customer" class="flex flex-col gap-4" @submit.prevent="submit">
      <div class="flex gap-3.5">
        <div class="flex-1"><Field label="Nome"><Input name="firstName" v-model="firstName" placeholder="Mario" /></Field></div>
        <div class="flex-1"><Field label="Cognome"><Input name="lastName" v-model="lastName" placeholder="Rossi" /></Field></div>
      </div>
      <Field label="Telefono"><Input name="phone" v-model="phone" placeholder="+39 ___ ___ ____" /></Field>
      <Field label="Email"><Input name="email" v-model="email" type="email" placeholder="nome@email.it" /></Field>
      <Field label="Note"><Textarea name="notes" v-model="notes" placeholder="Preferenze, recapiti aggiuntivi…" /></Field>
      <div class="flex justify-end gap-2.5 pt-1">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit">Salva</Button>
      </div>
    </form>
  </Modal>
</template>
