<script setup lang="ts">
// Vista "I miei abbonamenti" (D-035 S4): lista read-only degli abbonamenti del cliente
// autenticato + canale assenze comunicate (segnalazione/annullo self-service).
import { computed, ref } from 'vue';
import { Badge, Button, EmptyState, SectionCard, dateRange } from '@coralyn/ui-kit';
import type { AbsenceReleaseDTO, CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useMySubscriptions, useCancelRelease } from './useMySubscriptions';
import AbsenceReleaseModal from './AbsenceReleaseModal.vue';

const session = useSessionStore();
const { data, isLoading } = useMySubscriptions();
const subscriptions = computed<CustomerBookingDTO[]>(() => data.value ?? []);

const modalOpen = ref(false);
const selectedBooking = ref<CustomerBookingDTO | null>(null);
function openAbsenceModal(sub: CustomerBookingDTO): void {
  selectedBooking.value = sub;
  modalOpen.value = true;
}

// Un solo mutation instance: `cancelingBookingId` è letto dal thunk al momento della `mutate`
// (stesso trucco di `useReleaseAbsence` nel modale), così una singola composable serve tutte
// le righe senza doverne istanziare una per abbonamento (le composable non si chiamano in loop).
const cancelingBookingId = ref('');
const cancelRelease = useCancelRelease(() => cancelingBookingId.value);
function onCancel(bookingId: string, releaseId: string): void {
  cancelingBookingId.value = bookingId;
  cancelRelease.mutate(releaseId);
}
function isCanceling(releaseId: string): boolean {
  return cancelRelease.isPending.value && cancelRelease.variables.value === releaseId;
}

function cancelableReleases(sub: CustomerBookingDTO): AbsenceReleaseDTO[] {
  return sub.absenceReleases ?? [];
}
</script>

<template>
  <section class="mx-auto max-w-[560px] px-4 py-6">
    <h1 class="mb-1 text-[22px] font-bold tracking-[-.02em] text-[var(--color-text)]">I miei abbonamenti</h1>
    <p v-if="session.me" class="mb-5 text-sm text-[var(--color-text-muted)]">{{ session.me.establishmentName }}</p>

    <p v-if="isLoading" class="py-10 text-center text-sm text-[var(--color-text-muted)]">Caricamento…</p>

    <EmptyState v-else-if="subscriptions.length === 0" icon="umbrella" message="Non hai abbonamenti attivi." />

    <div v-else class="flex flex-col gap-4">
      <SectionCard
        v-for="sub in subscriptions"
        :key="sub.id"
        :title="sub.umbrellaLabel"
        icon="umbrella"
        data-testid="subscription-row"
      >
        <template #action>
          <Badge :tone="sub.absenceConsentAt ? 'success' : 'neutral'">
            {{ sub.absenceConsentAt ? 'Assenze comunicate attive' : 'Assenze comunicate non attive' }}
          </Badge>
        </template>

        <p class="mb-1 text-[13px] text-[var(--color-text-2nd)]">{{ dateRange(sub.startDate, sub.endDate) }}</p>
        <p v-if="sub.seasonName" class="mb-3 text-[12.5px] text-[var(--color-text-muted)]">{{ sub.seasonName }}</p>

        <Button
          v-if="sub.absenceConsentAt"
          size="sm"
          variant="secondary"
          :data-testid="`report-absence-${sub.id}`"
          @click="openAbsenceModal(sub)"
        >Segnala assenza</Button>

        <div v-if="cancelableReleases(sub).length > 0" class="mt-4 flex flex-col gap-2">
          <p class="text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">
            Assenze comunicate
          </p>
          <div
            v-for="rel in cancelableReleases(sub)"
            :key="rel.id"
            data-testid="absence-release-row"
            class="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-raised)] px-3 py-2 text-[12.5px] text-[var(--color-text)]"
          >
            <span class="flex-1">
              {{ rel.date }}<span v-if="rel.reason"> · {{ rel.reason }}</span>
            </span>
            <Badge v-if="rel.resold" tone="success">Rivenduta</Badge>
            <Badge v-else-if="rel.canceledAt" tone="neutral">Annullata</Badge>
            <Button
              v-else
              size="sm"
              variant="ghost"
              :data-testid="`cancel-release-${rel.id}`"
              :disabled="isCanceling(rel.id)"
              @click="onCancel(sub.id, rel.id)"
            >Annulla</Button>
          </div>
        </div>
      </SectionCard>
    </div>

    <AbsenceReleaseModal v-model:open="modalOpen" :booking="selectedBooking" />
  </section>
</template>
