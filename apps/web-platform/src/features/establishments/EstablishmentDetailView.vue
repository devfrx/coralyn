<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ActionBar, Badge, Button, ConfirmDialog, EmptyState, Skeleton, StatTile, formatEuro, useDelayedLoading } from '@coralyn/ui-kit';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import { useEstablishmentDetail, useSuspendEstablishment, useReactivateEstablishment, useResetAdminPassword } from './usePlatformEstablishments';
import { pushToast } from '@/lib/toasts';

const route = useRoute();
const id = () => String(route.params.id);

const { data, isLoading, isError, refetch } = useEstablishmentDetail(id);
const skeletonVisible = useDelayedLoading(() => isLoading.value);

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function fmtDate(iso: string | null | undefined): string {
  return iso ? DATE_FMT.format(new Date(iso)) : '–';
}

// Sorgente unica delle metriche: lo skeleton e i tile reali derivano da qui, così label/testid/ordine non driftano.
const METRICS: readonly { testid: string; label: string; value: (d: PlatformEstablishmentDTO) => string }[] = [
  { testid: 'metric-umbrellas', label: 'Ombrelloni', value: (d) => String(d.umbrellas) },
  { testid: 'metric-sectors', label: 'Settori', value: (d) => String(d.sectors) },
  { testid: 'metric-rows', label: 'File', value: (d) => String(d.rows) },
  { testid: 'metric-staff', label: 'Staff attivi', value: (d) => String(d.staffUsersActive) },
  { testid: 'metric-revenue', label: 'Incasso stagione', value: (d) => formatEuro(d.revenueSeasonTotal) },
  { testid: 'metric-subscriptions', label: 'Abbonamenti attivi', value: (d) => String(d.activeSubscriptions) },
  { testid: 'metric-bookings', label: 'Prenotazioni stagione', value: (d) => String(d.bookingsThisSeason) },
  { testid: 'metric-occupancy', label: 'Occ. oggi', value: (d) => `${d.occupancyPctToday}%` },
  { testid: 'metric-last-activity', label: 'Ultima attività', value: (d) => fmtDate(d.lastActivityAt) },
  { testid: 'metric-created', label: 'Creato', value: (d) => fmtDate(d.createdAt) },
];

const suspend = useSuspendEstablishment();
const reactivate = useReactivateEstablishment();
const resetPw = useResetAdminPassword();

const confirmOpen = ref(false);
const resetOpen = ref(false);

const confirmCopy = computed(() => {
  const e = data.value;
  if (!e) return { title: '', description: '', confirmLabel: '' };
  if (!e.suspendedAt) {
    return { title: 'Sospendere il lido?', description: `«${e.name}» non sarà più accessibile allo staff fino alla riattivazione.`, confirmLabel: 'Sospendi' };
  }
  return { title: 'Riattivare il lido?', description: `«${e.name}» tornerà accessibile allo staff.`, confirmLabel: 'Riattiva' };
});

function askAction(): void {
  confirmOpen.value = true;
}

async function onConfirmAction(): Promise<void> {
  confirmOpen.value = false;
  const e = data.value;
  if (!e) return;
  if (!e.suspendedAt) await suspend.mutateAsync(e.id);
  else await reactivate.mutateAsync(e.id);
  await refetch();
}

function askReset(): void {
  resetOpen.value = true;
}

async function onConfirmReset(): Promise<void> {
  resetOpen.value = false;
  const e = data.value;
  if (!e) return;
  const res = await resetPw.mutateAsync(e.id);
  pushToast(`Invito di reset inviato a ${res.adminEmail}.`);
}
</script>

<template>
  <section class="max-w-[1200px] px-[26px] pb-[30px] pt-[22px]">
    <RouterLink to="/establishments" data-testid="back-link" class="mb-4 inline-block text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
      ← Lidi
    </RouterLink>

    <div v-if="skeletonVisible" aria-busy="true">
      <div class="mb-5 flex items-center gap-3"><Skeleton width="220px" height="28px" /></div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile v-for="m in METRICS" :key="m.testid" :label="m.label" loading />
      </div>
    </div>

    <EmptyState v-else-if="!isLoading && (isError || !data)" message="Lido non trovato." />

    <template v-else-if="data">
      <div class="mb-5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 data-testid="detail-name" class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ data.name }}</h2>
          <Badge data-testid="detail-status" :tone="data.suspendedAt ? 'neutral' : 'success'">{{ data.suspendedAt ? 'Sospeso' : 'Attivo' }}</Badge>
        </div>
        <ActionBar gap="sm" align="end">
          <Button
            data-testid="toggle-suspend"
            variant="secondary"
            size="sm"
            :loading="suspend.isPending.value || reactivate.isPending.value"
            @click="askAction"
          >{{ data.suspendedAt ? 'Riattiva' : 'Sospendi' }}</Button>
          <Button
            data-testid="reset-admin"
            variant="secondary"
            size="sm"
            :loading="resetPw.isPending.value"
            @click="askReset"
          >Reset password admin</Button>
        </ActionBar>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile v-for="m in METRICS" :key="m.testid" :data-testid="m.testid" :label="m.label" :value="m.value(data)" />
      </div>
    </template>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.confirmLabel"
      @confirm="onConfirmAction"
    />

    <ConfirmDialog
      v-model:open="resetOpen"
      title="Reset password admin?"
      :description="`Invieremo a «${data?.name}» un'email con un link per reimpostare la password dell'amministratore.`"
      confirm-label="Invia invito di reset"
      @confirm="onConfirmReset"
    />
  </section>
</template>
