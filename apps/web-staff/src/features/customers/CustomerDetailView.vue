<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Avatar, Button, ActionBar, Icon, SectionCard, ConfirmDialog, Callout } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { pushToast } from '@/lib/toasts';
import { todayIso } from '@/lib/dates';
import { useCustomer, useCustomerBookings, useDeleteCustomer, useCededSubscriptions, useSetAbsenceConsent, useCancelAbsenceRelease } from './useCustomers';
import CustomerHistoryCard from './CustomerHistoryCard.vue';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';
import CustomerPaymentsCard from './CustomerPaymentsCard.vue';
import EditCustomerModal from './EditCustomerModal.vue';
import TerminateSubscriptionModal from './TerminateSubscriptionModal.vue';
import SuspendSubscriptionModal from './SuspendSubscriptionModal.vue';
import ReactivateSubscriptionModal from './ReactivateSubscriptionModal.vue';
import TransferSubscriptionModal from './TransferSubscriptionModal.vue';
import AbsenceReleaseModal from './AbsenceReleaseModal.vue';
import CustomerAccessCard from './CustomerAccessCard.vue';
import CustomerAccessModal from './CustomerAccessModal.vue';
import type { CustomerBookingDTO, SuspensionDTO, CustomerProvisionResponse } from '@coralyn/contracts';

const props = defineProps<{ id: string }>();
const router = useRouter();
const session = useSessionStore();
const { data: customer, isLoading, isError } = useCustomer(props.id);
const { data: bookings } = useCustomerBookings(props.id);
const { data: ceded } = useCededSubscriptions(props.id);
const deleteCustomer = useDeleteCustomer(props.id);

const editOpen = ref(false);
const terminateOpen = ref(false);
const terminateTarget = ref<CustomerBookingDTO | null>(null);
function onTerminate(b: CustomerBookingDTO) {
  terminateTarget.value = b;
  terminateOpen.value = true;
}
const suspendOpen = ref(false);
const suspendTarget = ref<CustomerBookingDTO | null>(null);
function onSuspend(b: CustomerBookingDTO) {
  suspendTarget.value = b;
  suspendOpen.value = true;
}
const reactivateOpen = ref(false);
const reactivateBooking = ref<CustomerBookingDTO | null>(null);
const reactivateSuspension = ref<SuspensionDTO | null>(null);
function onReactivate(p: { booking: CustomerBookingDTO; suspension: SuspensionDTO }) {
  reactivateBooking.value = p.booking;
  reactivateSuspension.value = p.suspension;
  reactivateOpen.value = true;
}
const transferOpen = ref(false);
const transferTarget = ref<CustomerBookingDTO | null>(null);
function onTransfer(b: CustomerBookingDTO) {
  transferTarget.value = b;
  transferOpen.value = true;
}
const absenceOpen = ref(false);
const absenceBooking = ref<CustomerBookingDTO | null>(null);
const setConsent = useSetAbsenceConsent(props.id);
const cancelAbsence = useCancelAbsenceRelease(props.id);
function onConsent(b: CustomerBookingDTO) {
  setConsent.mutate({ id: b.id, input: { consent: !b.absenceConsentAt } });
}
function onAbsence(b: CustomerBookingDTO) {
  absenceBooking.value = b;
  absenceOpen.value = true;
}
function onCancelAbsence(p: { booking: CustomerBookingDTO; releaseId: string }) {
  cancelAbsence.mutate({ id: p.booking.id, releaseId: p.releaseId });
}

// D-051: l'accesso cliente è per-cliente ma gli endpoint prendono un bookingId; usiamo il primo
// abbonamento come id rappresentativo (qualunque booking del cliente risolve lo stesso customer,
// la rotazione è unica). Senza abbonamento l'app cliente sarebbe vuota → card assente.
const accessBookingId = computed<string | null>(() => {
  const sub = (bookings.value ?? []).find((b) => b.type === 'subscription');
  return sub?.id ?? null;
});
const accessModalOpen = ref(false);
const accessResult = ref<CustomerProvisionResponse | null>(null);
function onProvisioned(res: CustomerProvisionResponse): void {
  accessResult.value = res;
  accessModalOpen.value = true;
}

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
  <section class="px-[26px] pb-[30px] pt-[18px]">
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
          <ActionBar v-if="!customer.anonymizedAt" gap="sm">
            <Button variant="secondary" size="sm" data-testid="edit-customer" @click="editOpen = true"><Icon name="edit" :size="15" />Modifica</Button>
            <Button
              v-if="isAdmin"
              variant="danger"
              size="sm"
              data-testid="delete-customer"
              :disabled="hasActiveOrFuture"
              @click="askDelete"
            ><Icon name="trash-2" :size="15" />{{ deleteLabel }}</Button>
          </ActionBar>
        </div>
        <p v-if="!customer.anonymizedAt && isAdmin && hasActiveOrFuture" data-testid="delete-customer-hint" class="px-[22px] pb-4 text-xs text-[var(--color-text-muted)]">
          Non puoi eliminare o anonimizzare un cliente con prenotazioni attive o future: annullale o attendi la scadenza.
        </p>
      </Card>

      <div class="grid grid-cols-[1.6fr_1fr] items-start gap-3.5">
        <div class="flex min-w-0 flex-col gap-3.5">
          <CustomerSubscriptionsCard :bookings="bookings ?? []" :ceded="ceded ?? []" :is-admin="isAdmin" @terminate="onTerminate" @suspend="onSuspend" @reactivate="onReactivate" @transfer="onTransfer" @consent="onConsent" @absence="onAbsence" @cancelAbsence="onCancelAbsence" />
          <CustomerHistoryCard :bookings="bookings ?? []" />
          <CustomerPaymentsCard :bookings="bookings ?? []" />
        </div>
        <div class="flex min-w-0 flex-col gap-3.5">
          <SectionCard v-if="!customer.anonymizedAt" title="Anagrafica e contatti" icon="users">
            <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
              <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.firstName }}</div></div>
              <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.lastName }}</div></div>
              <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Telefono</div><div class="text-sm font-medium tabular-nums text-[var(--color-text)]">{{ customer.phone ?? '—' }}</div></div>
              <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Email</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.email ?? '—' }}</div></div>
              <div class="col-span-2"><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Note</div><div class="whitespace-pre-wrap text-sm font-medium text-[var(--color-text)]">{{ customer.notes || '—' }}</div></div>
            </div>
          </SectionCard>
          <CustomerAccessCard v-if="accessBookingId" :booking-id="accessBookingId" :is-admin="isAdmin" @provisioned="onProvisioned" />
        </div>
      </div>

      <ConfirmDialog
        v-model:open="deleteConfirmOpen"
        :title="deleteLabel + '?'"
        :description="deleteDescription"
        confirm-label="Elimina"
        tone="danger"
        @confirm="onConfirmDelete"
      />
      <EditCustomerModal :customer="customer" v-model:open="editOpen" />
      <TerminateSubscriptionModal :booking="terminateTarget" :customer-id="id" v-model:open="terminateOpen" />
      <SuspendSubscriptionModal :booking="suspendTarget" :customer-id="id" v-model:open="suspendOpen" />
      <ReactivateSubscriptionModal :booking="reactivateBooking" :suspension="reactivateSuspension" :customer-id="id" v-model:open="reactivateOpen" />
      <TransferSubscriptionModal :booking="transferTarget" :customer-id="id" v-model:open="transferOpen" />
      <AbsenceReleaseModal :booking="absenceBooking" :customer-id="id" v-model:open="absenceOpen" />
      <CustomerAccessModal v-model:open="accessModalOpen" :result="accessResult" />
    </template>
  </section>
</template>
