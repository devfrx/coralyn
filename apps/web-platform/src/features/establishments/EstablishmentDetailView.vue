<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Badge, Button, ConfirmDialog, EmptyState, StatTile, formatEuro } from '@coralyn/ui-kit';
import { useEstablishmentDetail, useSuspendEstablishment, useReactivateEstablishment } from './usePlatformEstablishments';

const route = useRoute();
const id = () => String(route.params.id);

const { data, isLoading, isError, refetch } = useEstablishmentDetail(id);

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function fmtDate(iso: string | null | undefined): string {
  return iso ? DATE_FMT.format(new Date(iso)) : '—';
}

const suspend = useSuspendEstablishment();
const reactivate = useReactivateEstablishment();

const confirmOpen = ref(false);

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
</script>

<template>
  <section class="max-w-[1200px] px-[26px] pb-[30px] pt-[22px]">
    <RouterLink to="/establishments" data-testid="back-link" class="mb-4 inline-block text-sm font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
      ← Lidi
    </RouterLink>

    <p v-if="isLoading" class="py-10 text-center text-sm text-[var(--color-text-muted)]">Caricamento…</p>

    <EmptyState v-else-if="isError || !data" message="Lido non trovato." />

    <template v-else>
      <div class="mb-5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 data-testid="detail-name" class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ data.name }}</h2>
          <Badge data-testid="detail-status" :tone="data.suspendedAt ? 'neutral' : 'success'">{{ data.suspendedAt ? 'Sospeso' : 'Attivo' }}</Badge>
        </div>
        <Button
          data-testid="toggle-suspend"
          variant="secondary"
          :disabled="suspend.isPending.value || reactivate.isPending.value"
          @click="askAction"
        >{{ data.suspendedAt ? 'Riattiva' : 'Sospendi' }}</Button>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile data-testid="metric-umbrellas" label="Ombrelloni" :value="String(data.umbrellas)" />
        <StatTile data-testid="metric-sectors" label="Settori" :value="String(data.sectors)" />
        <StatTile data-testid="metric-rows" label="File" :value="String(data.rows)" />
        <StatTile data-testid="metric-staff" label="Staff attivi" :value="String(data.staffUsersActive)" />
        <StatTile data-testid="metric-revenue" label="Incasso stagione" :value="formatEuro(data.revenueSeasonTotal)" />
        <StatTile data-testid="metric-subscriptions" label="Abbonamenti attivi" :value="String(data.activeSubscriptions)" />
        <StatTile data-testid="metric-bookings" label="Prenotazioni stagione" :value="String(data.bookingsThisSeason)" />
        <StatTile data-testid="metric-occupancy" label="Occ. oggi" :value="`${data.occupancyPctToday}%`" />
        <StatTile data-testid="metric-last-activity" label="Ultima attività" :value="fmtDate(data.lastActivityAt)" />
        <StatTile data-testid="metric-created" label="Creato" :value="fmtDate(data.createdAt)" />
      </div>
    </template>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.confirmLabel"
      @confirm="onConfirmAction"
    />
  </section>
</template>
