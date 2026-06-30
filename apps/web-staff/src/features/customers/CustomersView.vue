<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Avatar, DataTable, Modal, Field, Input, Textarea, Icon } from '@coralyn/ui-kit';
import { useCustomers, useCreateCustomer } from './useCustomers';

const router = useRouter();
const { data: customers, isLoading } = useCustomers();
const create = useCreateCustomer();

const open = ref(false);
const firstName = ref(''); const lastName = ref(''); const phone = ref(''); const email = ref(''); const notes = ref('');
function submit() {
  if (!firstName.value || !lastName.value) return;
  create.mutate(
    { firstName: firstName.value, lastName: lastName.value, phone: phone.value || undefined, email: email.value || undefined, notes: notes.value || undefined },
    { onSuccess: () => { firstName.value = ''; lastName.value = ''; phone.value = ''; email.value = ''; notes.value = ''; open.value = false; } },
  );
}
const cols = [
  { key: 'customer', label: 'Cliente' }, { key: 'phone', label: 'Telefono' }, { key: 'email', label: 'Email' }, { key: 'notes', label: 'Note' },
];
function ini(c: { firstName: string; lastName: string }) { return ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase(); }
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="flex w-[300px] items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[var(--color-placeholder)]">
        <Icon name="search" :size="16" /><span class="text-[13px]">Cerca per nome o telefono…</span>
      </div>
      <div class="flex-1"></div>
      <span class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ customers?.length ?? 0 }} clienti</span>
      <Button data-test="new-customer" @click="open = true"><Icon name="plus" :size="16" />Nuovo cliente</Button>
    </div>

    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <DataTable v-else :columns="cols">
      <tr v-for="c in customers" :key="c.id" class="cursor-pointer hover:bg-[var(--color-raised)]" @click="router.push({ name: 'customer-detail', params: { id: c.id } })">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5">
            <Avatar :initials="ini(c)" size="sm" />
            <RouterLink :to="{ name: 'customer-detail', params: { id: c.id } }" class="font-semibold text-[var(--color-text)] hover:text-[var(--color-brand-ink)]" @click.stop>{{ c.firstName }} {{ c.lastName }}</RouterLink>
          </div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ c.phone ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ c.email ?? '—' }}</td>
        <td class="max-w-[280px] truncate border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-[var(--color-text-muted)]">{{ c.notes ?? '' }}</td>
      </tr>
    </DataTable>

    <Modal v-model:open="open" title="Nuovo cliente">
      <form data-test="form-new-customer" class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Nome"><Input name="firstName" v-model="firstName" placeholder="Mario" /></Field></div>
          <div class="flex-1"><Field label="Cognome"><Input name="lastName" v-model="lastName" placeholder="Rossi" /></Field></div>
        </div>
        <Field label="Telefono"><Input name="phone" v-model="phone" placeholder="+39 ___ ___ ____" /></Field>
        <Field label="Email"><Input name="email" v-model="email" type="email" placeholder="nome@email.it" /></Field>
        <Field label="Note"><Textarea name="notes" v-model="notes" placeholder="Preferenze, recapiti aggiuntivi…" /></Field>
        <div class="flex justify-end gap-2.5 pt-1">
          <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
          <Button type="submit">Salva cliente</Button>
        </div>
      </form>
    </Modal>
  </section>
</template>
