<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, StatTile, DataTable, Badge, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE, PAYMENT_METHOD_LABEL, TYPE_LABEL } from '@/lib/statusMaps';
import { positionLabel } from './positionLabel';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const active = computed(() => props.bookings.filter((b) => b.status !== 'cancelled'));
// Saldo aperto = credito ancora esigibile: esclude i disdetti (terminatedAt) — contratto sciolto, residuo non dovuto (§4.3).
const balance = computed(() =>
  active.value.filter((b) => !b.terminatedAt).reduce((s, b) => s + (b.totalPrice - b.amountCollected), 0),
);
// Incassato = netto dei rimborsi erogati (disdetta/sospensione: refundedAmount è il ledger cumulativo, §4.3).
const collected = computed(() =>
  active.value.reduce((s, b) => s + (b.amountCollected - (b.refundedAmount ?? 0)), 0),
);

/** Periodo mostrato: le periodiche esibiscono la durata effettiva; le altre la stagione (o la data d'inizio). */
function periodLabel(b: CustomerBookingDTO): string {
  if (b.type === 'periodic') return `${b.startDate} – ${b.endDate}`;
  return b.seasonName ?? b.startDate;
}

const cols = [
  { key: 'period', label: 'Periodo' },
  { key: 'type', label: 'Tipo' },
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
      <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <StatTile layout="label-first" tone="accent" label="Saldo aperto" :value="formatEuro(balance)" />
        <StatTile layout="label-first" label="Incassato stagione" :value="formatEuro(collected)" />
      </div>
      <DataTable :columns="cols" :rows="active" :row-key="(r) => r.id" density="compact">
        <template #cell-period="{ row }">{{ periodLabel(row) }}</template>
        <template #cell-type="{ row }">{{ TYPE_LABEL[row.type] }}</template>
        <template #cell-umbrella="{ row }">{{ positionLabel(row) }} <Badge v-if="row.umbrellaRetiredAt" tone="neutral">Ritirato</Badge></template>
        <template #cell-amount="{ row }">{{ formatEuro(row.totalPrice) }}</template>
        <template #cell-method="{ row }">{{ row.paymentMethod ? PAYMENT_METHOD_LABEL[row.paymentMethod!] : '–' }}</template>
        <template #cell-status="{ row }"><Badge :tone="PAY_TONE[row.paymentStatus]">{{ PAY_LABEL[row.paymentStatus] }}</Badge></template>
      </DataTable>
    </template>
  </SectionCard>
</template>
