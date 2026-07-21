<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { SegmentedControl, Button, Badge, Avatar, DataTable, Icon, PageToolbar, formatEuro, initials, dateRange } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentStatus } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useDayBookings } from './useBookings';
import { useEntityLabels } from '@/lib/useEntityLabels';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL } from '@/lib/statusMaps';
import SettlePaymentModal from './SettlePaymentModal.vue';

const router = useRouter();
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);

const filtro = ref<'all' | PaymentStatus>('all');
const filtri = [
  { value: 'all', label: 'Tutte' },
  { value: 'unpaid', label: 'Da incassare' },
  { value: 'partial', label: 'Parziali' },
  { value: 'paid', label: 'Saldate' },
];

const { customerName, umbrellaLabel, packageName } = useEntityLabels();
const periodLabel = (b: BookingDTO): string => (b.type === 'daily' ? b.startDate : dateRange(b.startDate, b.endDate));

const cols: DataTableColumn[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'tipo', label: 'Tipo', hideBelow: 'md' },
  { key: 'pacchetto', label: 'Pacchetto', hideBelow: 'lg', wrap: 'truncate', maxWidth: '180px' },
  { key: 'periodo', label: 'Periodo', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' },
];

const rows = computed<BookingDTO[]>(() => {
  const list = bookings.value ?? [];
  return filtro.value === 'all' ? list : list.filter((b) => b.paymentStatus === filtro.value);
});

const modalOpen = ref(false);
const selected = ref<BookingDTO | null>(null);
function openSettle(b: BookingDTO): void {
  selected.value = b;
  modalOpen.value = true;
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #left><SegmentedControl v-model="filtro" :options="filtri" /></template>
      <template #right><Button @click="router.push('/map')"><Icon name="plus" :size="16" />Nuova prenotazione</Button></template>
    </PageToolbar>

    <DataTable :columns="cols" :rows="(rows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as BookingDTO).id" empty-message="Nessuna prenotazione per questa data.">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as BookingDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as BookingDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get((row as unknown as BookingDTO).umbrellaId) ?? '—' }}</span></template>
      <template #cell-tipo="{ row }"><span class="text-[var(--color-text-2nd)]">{{ TYPE_LABEL[(row as unknown as BookingDTO).type] }}</span></template>
      <template #cell-pacchetto="{ row }"><span class="text-[var(--color-text-2nd)]" :title="(row as unknown as BookingDTO).packageId ? (packageName.get((row as unknown as BookingDTO).packageId!) ?? '') : ''">{{ (row as unknown as BookingDTO).packageId ? (packageName.get((row as unknown as BookingDTO).packageId!) ?? '—') : '—' }}</span></template>
      <template #cell-periodo="{ row }"><span class="text-[var(--color-text-2nd)]">{{ periodLabel(row as unknown as BookingDTO) }}</span></template>
      <template #cell-stato="{ row }"><Badge :tone="PAY_TONE[(row as unknown as BookingDTO).paymentStatus]">{{ PAY_LABEL[(row as unknown as BookingDTO).paymentStatus] }}</Badge></template>
      <template #cell-incasso="{ row }">
        <button
          type="button"
          class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          @click="openSettle(row as unknown as BookingDTO)"
        >{{ formatEuro((row as unknown as BookingDTO).amountCollected) }} / {{ formatEuro((row as unknown as BookingDTO).totalPrice) }}</button>
      </template>
    </DataTable>

    <SettlePaymentModal v-model="modalOpen" :booking="selected" />
  </section>
</template>
