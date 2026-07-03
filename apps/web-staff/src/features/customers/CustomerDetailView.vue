<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Card, Avatar, Button, Field, Input, Textarea, Icon } from '@coralyn/ui-kit';
import { useCustomer, useUpdateCustomer, useCustomerBookings } from './useCustomers';
import CustomerHistoryCard from './CustomerHistoryCard.vue';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';
import CustomerPaymentsCard from './CustomerPaymentsCard.vue';

const props = defineProps<{ id: string }>();
const { data: customer, isLoading, isError } = useCustomer(props.id);
const update = useUpdateCustomer(props.id);
const { data: bookings } = useCustomerBookings(props.id);

const phone = ref(''); const email = ref(''); const notes = ref('');
watch(customer, (c) => { if (c) { phone.value = c.phone ?? ''; email.value = c.email ?? ''; notes.value = c.notes ?? ''; } }, { immediate: true });
function save() { update.mutate({ phone: phone.value, email: email.value, notes: notes.value }); }

const ini = computed(() => (customer.value ? ((customer.value.firstName[0] ?? '') + (customer.value.lastName[0] ?? '')).toUpperCase() : ''));
</script>
<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[18px]">
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <p v-else-if="isError" class="text-[var(--color-danger)]">Errore nel caricamento del cliente.</p>
    <template v-else-if="customer">
      <RouterLink :to="{ name: 'customers' }" class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-accent)]"><Icon name="chevron-left" :size="17" />Clienti</RouterLink>

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
          <Button variant="secondary"><Icon name="edit" :size="15" />Modifica</Button>
        </div>
      </Card>

      <Card class="mb-4">
        <form class="p-5" @submit.prevent="save">
          <div class="mb-4 flex items-center justify-between">
            <span class="text-sm font-bold text-[var(--color-text)]">Anagrafica e contatti</span>
            <Button type="submit" variant="ghost"><Icon name="check" :size="14" />Salva</Button>
          </div>
          <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.firstName }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.lastName }}</div></div>
            <Field label="Telefono"><Input name="phone" v-model="phone" numeric /></Field>
            <Field label="Email"><Input name="email" v-model="email" type="email" /></Field>
            <div class="col-span-2"><Field label="Note"><Textarea name="notes" v-model="notes" /></Field></div>
          </div>
        </form>
      </Card>

      <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <CustomerSubscriptionsCard :bookings="bookings ?? []" />
        <CustomerHistoryCard :bookings="bookings ?? []" />
        <CustomerPaymentsCard :bookings="bookings ?? []" />
      </div>
    </template>
  </section>
</template>
