<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, StatTile, DataTable, Badge, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE, PAYMENT_METHOD_LABEL } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const active = computed(() => props.bookings.filter((b) => b.status !== 'cancelled'));
const balance = computed(() => active.value.reduce((s, b) => s + (b.totalPrice - b.amountCollected), 0));
const collected = computed(() => active.value.reduce((s, b) => s + b.amountCollected, 0));

const cols = [
  { key: 'period', label: 'Periodo' },
  { key: 'umbrella', label: 'Ombrellone' },
  { key: 'amount', label: 'Importo', align: 'right' as const, numeric: true },
  { key: 'method', label: 'Metodo' },
  { key: 'status', label: 'Stato' },
];
</script>
<template>
  <SectionCard title="Pagamenti e saldo" icon="euro">
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <template v-else>
      <div class="mb-4 grid grid-cols-2 gap-2.5">
        <StatTile layout="label-first" tone="accent" label="Saldo aperto" :value="formatEuro(balance)" />
        <StatTile layout="label-first" label="Incassato stagione" :value="formatEuro(collected)" />
      </div>
      <DataTable :columns="cols" :rows="(active as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as CustomerBookingDTO).id">
        <template #cell-period="{ row }">{{ (row as unknown as CustomerBookingDTO).seasonName ?? (row as unknown as CustomerBookingDTO).startDate }}</template>
        <template #cell-umbrella="{ row }">{{ (row as unknown as CustomerBookingDTO).sectorName ?? '—' }} · {{ (row as unknown as CustomerBookingDTO).umbrellaLabel }}</template>
        <template #cell-amount="{ row }">{{ formatEuro((row as unknown as CustomerBookingDTO).totalPrice) }}</template>
        <template #cell-method="{ row }">{{ (row as unknown as CustomerBookingDTO).paymentMethod ? PAYMENT_METHOD_LABEL[(row as unknown as CustomerBookingDTO).paymentMethod!] : '—' }}</template>
        <template #cell-status="{ row }"><Badge :tone="PAY_TONE[(row as unknown as CustomerBookingDTO).paymentStatus]">{{ PAY_LABEL[(row as unknown as CustomerBookingDTO).paymentStatus] }}</Badge></template>
      </DataTable>
    </template>
  </SectionCard>
</template>
