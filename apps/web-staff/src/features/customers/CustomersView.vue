<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Button, Avatar, DataTable, QueryBoundary, Modal, Field, Input, Textarea, Icon, PageToolbar, SearchInput } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { CustomerDTO } from '@coralyn/contracts';
import { useCustomers, useCreateCustomer } from './useCustomers';
import { privacyPreviewUrl } from '@/lib/privacyPreview';
import { useSessionStore } from '@/stores/session';
// Vuota se `VITE_WEB_CUSTOMER_URL` non e' configurata: in quel caso il promemoria resta come testo
// SENZA link. L'anteprima vive su web-customer, non qui: un link relativo porterebbe all'informativa
// operatori (documento diverso, ADR-0056).

const router = useRouter();
const session = useSessionStore();
const { data: customers, isLoading, error: customersError, refetch: refetchCustomers } = useCustomers();
const create = useCreateCustomer();
const privacyUrl = computed(() => privacyPreviewUrl(session.establishmentId));

const search = ref('');
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = customers.value ?? [];
  if (!q) return list;
  // Telefono: confronta le sole cifre da entrambi i lati, così "3332222" o "+39 333 2222"
  // trovano lo stesso numero indipendentemente da spazi/prefissi digitati.
  const qDigits = q.replace(/\D/g, '');
  return list.filter(
    (c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (qDigits.length > 0 && (c.phone ?? '').replace(/\D/g, '').includes(qDigits)),
  );
});

const open = ref(false);
const firstName = ref(''); const lastName = ref(''); const phone = ref(''); const email = ref(''); const notes = ref('');
function submit() {
  if (!firstName.value || !lastName.value) return;
  create.mutate(
    { firstName: firstName.value, lastName: lastName.value, phone: phone.value || undefined, email: email.value || undefined, notes: notes.value || undefined },
    { onSuccess: () => { firstName.value = ''; lastName.value = ''; phone.value = ''; email.value = ''; notes.value = ''; open.value = false; } },
  );
}
const cols: DataTableColumn<CustomerDTO>[] = [
  {
    key: 'customer', label: 'Cliente', sortable: true,
    sortValue: (r) => `${r.lastName} ${r.firstName}`.toLowerCase(),
  },
  { key: 'phone', label: 'Telefono', numeric: true },
  { key: 'email', label: 'Email', wrap: 'truncate', maxWidth: '220px', hideBelow: 'md' },
  { key: 'notes', label: 'Note', wrap: 'truncate', maxWidth: '280px', hideBelow: 'lg' },
];
function ini(c: { firstName: string; lastName: string }) { return ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase(); }
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #left>
        <SearchInput v-model="search" class="w-[300px]" placeholder="Cerca per nome o telefono…" aria-label="Cerca clienti" />
      </template>
      <template #right>
        <span class="text-[12.5px] tabular-nums text-[var(--color-text-muted)]">{{ filtered.length }} clienti</span>
        <Button data-test="new-customer" @click="open = true"><Icon name="plus" :size="16" />Nuovo cliente</Button>
      </template>
    </PageToolbar>

    <QueryBoundary :error="customersError" error-title="Anagrafica non disponibile" @retry="refetchCustomers">
    <DataTable
      :columns="cols"
      :rows="filtered"
      :row-key="(r) => r.id"
      :page-size="25"
      :loading="isLoading"
      empty-message="Nessun cliente trovato"
      @row-click="(r) => router.push({ name: 'customer-detail', params: { id: r.id } })"
    >
      <template #cell-customer="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="ini(row)" size="sm" />
          <RouterLink
            :to="{ name: 'customer-detail', params: { id: row.id } }"
            class="font-semibold text-[var(--color-text)] hover:text-[var(--color-brand-ink)]"
            @click.stop
          >{{ row.firstName }} {{ row.lastName }}</RouterLink>
        </div>
      </template>
      <template #cell-phone="{ row }"><span class="tabular-nums text-[var(--color-text-2nd)]">{{ row.phone ?? '–' }}</span></template>
      <template #cell-email="{ row }"><span class="text-[var(--color-text-2nd)]">{{ row.email ?? '–' }}</span></template>
      <template #cell-notes="{ row }"><span class="text-[var(--color-text-muted)]" :title="row.notes ?? ''">{{ row.notes ?? '' }}</span></template>
    </DataTable>
    </QueryBoundary>

    <Modal v-model:open="open" title="Nuovo cliente">
      <form id="form-new-customer" data-test="form-new-customer" class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex gap-3.5">
          <div class="flex-1"><Field label="Nome"><Input name="firstName" v-model="firstName" placeholder="Mario" /></Field></div>
          <div class="flex-1"><Field label="Cognome"><Input name="lastName" v-model="lastName" placeholder="Rossi" /></Field></div>
        </div>
        <Field label="Telefono"><Input name="phone" v-model="phone" placeholder="+39 ___ ___ ____" /></Field>
        <Field label="Email"><Input name="email" v-model="email" type="email" placeholder="nome@email.it" /></Field>
        <Field label="Note"><Textarea name="notes" v-model="notes" placeholder="Preferenze, recapiti aggiuntivi…" /></Field>
        <p class="text-xs leading-relaxed text-[var(--color-text-muted)]">
          Informa il cliente e forniscigli l'informativa privacy<template v-if="privacyUrl">:
          <a
            :href="privacyUrl"
            target="_blank"
            rel="noopener"
            data-test="privacy-reminder-link"
            class="underline"
          >apri anteprima</a></template>.
        </p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2.5">
          <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
          <Button type="submit" form="form-new-customer">Salva cliente</Button>
        </div>
      </template>
    </Modal>
  </section>
</template>
