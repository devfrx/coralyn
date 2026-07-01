<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { SegmentedControl, Button, Badge, Avatar, DataTable, Icon } from '@coralyn/ui-kit';
import type { BookingDTO, BookingType, PaymentStatus } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useDayBookings } from './useBookings';
import { usePackages } from './usePackages';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import SettlePaymentModal from './SettlePaymentModal.vue';

const router = useRouter();
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
const { data: customers } = useCustomers();
const { data: map } = useDayMap();
const { data: packages } = usePackages();

const filtro = ref<'all' | PaymentStatus>('all');
const filtri = [
  { value: 'all', label: 'Tutte' },
  { value: 'unpaid', label: 'Da incassare' },
  { value: 'partial', label: 'Parziali' },
  { value: 'paid', label: 'Saldate' },
];

const PAY_LABEL: Record<PaymentStatus, string> = { unpaid: 'Da incassare', partial: 'Parziale', paid: 'Saldato' };
const PAY_TONE: Record<PaymentStatus, 'success' | 'warning' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
};
const TYPE_LABEL: Record<BookingType, string> = { daily: 'Giornaliera', periodic: 'Periodica', subscription: 'Abbonamento' };
const periodLabel = (b: BookingDTO): string => (b.type === 'daily' ? b.startDate : `${b.startDate} → ${b.endDate}`);

const customerName = (id: string): string => {
  const c = (customers.value ?? []).find((x) => x.id === id);
  return c ? `${c.firstName} ${c.lastName}` : id;
};
const umbrellaLabel = computed(() => {
  const m = new Map<string, string>();
  for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
  return m;
});
const initials = (name: string): string =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

const packageName = computed(() => {
  const m = new Map<string, string>();
  for (const p of packages.value ?? []) m.set(p.id, p.name);
  return m;
});

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'pacchetto', label: 'Pacchetto' },
  { key: 'periodo', label: 'Periodo' },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' as const },
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
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <SegmentedControl v-model="filtro" :options="filtri" />
      <div class="flex-1"></div>
      <Button @click="router.push('/map')"><Icon name="plus" :size="16" />Nuova prenotazione</Button>
    </div>

    <DataTable v-if="rows.length" :columns="cols">
      <tr v-for="b in rows" :key="b.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5">
            <Avatar :initials="initials(customerName(b.customerId))" size="sm" />
            <span class="font-semibold text-[var(--color-text)]">{{ customerName(b.customerId) }}</span>
          </div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(b.umbrellaId) ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ TYPE_LABEL[b.type] }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ b.packageId ? (packageName.get(b.packageId) ?? '—') : '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ periodLabel(b) }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5"><Badge :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge></td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <button
            type="button"
            class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            @click="openSettle(b)"
          >€ {{ b.amountCollected.toFixed(2) }} / € {{ b.totalPrice.toFixed(2) }}</button>
        </td>
      </tr>
    </DataTable>
    <p
      v-else
      class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]"
    >
      Nessuna prenotazione per questa data.
    </p>

    <SettlePaymentModal v-model="modalOpen" :booking="selected" />
  </section>
</template>
