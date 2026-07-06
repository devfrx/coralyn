<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Avatar, Button, Field, Input, Textarea, Icon, SectionCard, ConfirmDialog, Callout } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { pushToast } from '@/lib/toasts';
import { todayIso } from '@/lib/dates';
import { useCustomer, useUpdateCustomer, useCustomerBookings, useDeleteCustomer } from './useCustomers';
import CustomerHistoryCard from './CustomerHistoryCard.vue';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';
import CustomerPaymentsCard from './CustomerPaymentsCard.vue';

const props = defineProps<{ id: string }>();
const router = useRouter();
const session = useSessionStore();
const { data: customer, isLoading, isError } = useCustomer(props.id);
const update = useUpdateCustomer(props.id);
const { data: bookings } = useCustomerBookings(props.id);
const deleteCustomer = useDeleteCustomer(props.id);

const phone = ref(''); const email = ref(''); const notes = ref('');
watch(customer, (c) => { if (c) { phone.value = c.phone ?? ''; email.value = c.email ?? ''; notes.value = c.notes ?? ''; } }, { immediate: true });
function save() { update.mutate({ phone: phone.value, email: email.value, notes: notes.value }); }

const ini = computed(() => (customer.value ? ((customer.value.firstName[0] ?? '') + (customer.value.lastName[0] ?? '')).toUpperCase() : ''));

// Diritto all'oblio (GDPR D-024): l'azione è admin-only e si adatta allo storico già caricato
// (useCustomerBookings) — nessuna prenotazione → delete reale; con storico → anonimizzazione;
// con una prenotazione attiva/futura → azione bloccata (409 lato server, disabilitata qui in FE).
const isAdmin = computed(() => session.role === Role.Admin);
const hasBookings = computed(() => (bookings.value ?? []).length > 0);
const hasActiveOrFuture = computed(() =>
  (bookings.value ?? []).some((b) => b.status === 'confirmed' && b.endDate >= todayIso()),
);
const deleteLabel = computed(() => (hasBookings.value ? 'Anonimizza dati personali (GDPR)' : 'Elimina cliente'));
const deleteDescription = computed(() =>
  hasBookings.value
    ? 'I dati personali verranno rimossi in modo irreversibile; lo storico prenotazioni resta in forma anonima.'
    : 'Il cliente verrà eliminato definitivamente.',
);

const deleteConfirmOpen = ref(false);
function askDelete() { deleteConfirmOpen.value = true; }
function onConfirmDelete() {
  deleteCustomer.mutate(undefined, {
    onSuccess: (res) => {
      deleteConfirmOpen.value = false;
      pushToast(res.outcome === 'anonymized' ? 'Dati personali anonimizzati' : 'Cliente eliminato');
      router.push('/customers');
    },
    onError: () => {
      deleteConfirmOpen.value = false;
    },
  });
}
</script>
<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[18px]">
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <p v-else-if="isError" class="text-[var(--color-danger)]">Errore nel caricamento del cliente.</p>
    <template v-else-if="customer">
      <RouterLink :to="{ name: 'customers' }" class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-accent)]"><Icon name="chevron-left" :size="17" />Clienti</RouterLink>

      <Callout v-if="customer.anonymizedAt" tone="warm" class="mb-4">
        <template #icon><Icon name="shield" :size="15" /></template>
        Dati personali rimossi
      </Callout>

      <Card class="mb-4">
        <div class="flex items-center gap-[18px] p-[22px]">
          <Avatar :initials="ini" size="lg" />
          <div class="min-w-0 flex-1">
            <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ customer.firstName }} {{ customer.lastName }}</h2>
            <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5 tabular-nums"><Icon name="phone" :size="15" class="text-[var(--color-placeholder)]" />{{ customer.phone ?? '—' }}</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="mail" :size="15" class="text-[var(--color-placeholder)]" />{{ customer.email ?? '—' }}</span>
            </div>
          </div>
          <div v-if="!customer.anonymizedAt" class="flex items-center gap-2">
            <Button variant="secondary"><Icon name="edit" :size="15" />Modifica</Button>
            <Button
              v-if="isAdmin"
              variant="danger"
              data-testid="delete-customer"
              :disabled="hasActiveOrFuture"
              @click="askDelete"
            ><Icon name="trash-2" :size="15" />{{ deleteLabel }}</Button>
          </div>
        </div>
        <p v-if="!customer.anonymizedAt && isAdmin && hasActiveOrFuture" data-testid="delete-customer-hint" class="px-[22px] pb-4 text-xs text-[var(--color-text-muted)]">
          Non puoi eliminare o anonimizzare un cliente con prenotazioni attive o future: annullale o attendi la scadenza.
        </p>
      </Card>

      <SectionCard v-if="!customer.anonymizedAt" title="Anagrafica e contatti" icon="users" class="mb-4">
        <template #action>
          <Button type="submit" form="anagrafica-form" variant="ghost"><Icon name="check" :size="14" />Salva</Button>
        </template>
        <form id="anagrafica-form" @submit.prevent="save">
          <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.firstName }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.lastName }}</div></div>
            <Field label="Telefono"><Input name="phone" v-model="phone" numeric /></Field>
            <Field label="Email"><Input name="email" v-model="email" type="email" /></Field>
            <div class="col-span-2"><Field label="Note"><Textarea name="notes" v-model="notes" /></Field></div>
          </div>
        </form>
      </SectionCard>

      <div class="flex flex-col gap-3.5">
        <CustomerSubscriptionsCard :bookings="bookings ?? []" />
        <CustomerHistoryCard :bookings="bookings ?? []" />
        <CustomerPaymentsCard :bookings="bookings ?? []" />
      </div>

      <ConfirmDialog
        v-model:open="deleteConfirmOpen"
        :title="deleteLabel + '?'"
        :description="deleteDescription"
        confirm-label="Elimina"
        tone="danger"
        @confirm="onConfirmDelete"
      />
    </template>
  </section>
</template>
