<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { SegmentedControl, Button, Badge, Avatar, DataTable, QueryBoundary, Icon, PageToolbar, formatEuro, initials, dateRange } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentStatus } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useDayBookings } from './useBookings';
import { useEntityLabels } from '@/lib/useEntityLabels';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL } from '@/lib/statusMaps';
import SettlePaymentModal from './SettlePaymentModal.vue';

const router = useRouter();
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
// `error`/`refetch` non erano destrutturati: senza, un guasto di rete arrivava a DataTable come
// «0 righe» e l'operatore leggeva «Nessuna prenotazione per questa data» (AUD-012).
const { data: bookings, isLoading: bookingsLoading, error: bookingsError, refetch: refetchBookings } = useDayBookings(activeDate);
// Le etichette della tabella vengono da endpoint di ALTRI permessi (ADR-0064, Decision 4).
const canReadCustomers = computed(() => session.hasPermission(Permission.CustomersManage));
const canReadMap = computed(() => session.hasPermission(Permission.MapRead));

const filtro = ref<'all' | PaymentStatus>('all');
const filtri = [
  { value: 'all', label: 'Tutte' },
  { value: 'unpaid', label: 'Da incassare' },
  { value: 'partial', label: 'Parziali' },
  { value: 'paid', label: 'Saldate' },
];

const { customerName, umbrellaLabel, retiredUmbrellaIds, packageName } = useEntityLabels();
const periodLabel = (b: BookingDTO): string => (b.type === 'daily' ? b.startDate : dateRange(b.startDate, b.endDate));

const cols: DataTableColumn<BookingDTO>[] = [
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

    <!-- Solo l'ERRORE passa da QueryBoundary: attesa e vuoto restano di DataTable, che li possiede
         già bene (scheletro in-card, EmptyState dentro la cornice). L'unico stato che mancava era
         il guasto, ed è l'unico che si aggiunge. -->
    <!-- ⚠️ La tabella COMPONE dati di altri permessi (ADR-0064): nome del cliente da
         `customers.manage`, label ombrellone da `map.read`/`structure.read`, nome pacchetto da
         `pricing.manage`. Senza, le celle degradano a un segnaposto: va detto perché. -->
    <p v-if="!canReadCustomers || !canReadMap" data-testid="labels-denied-bookings" class="mb-2 text-[11.5px] text-[var(--color-text-muted)]">
      Alcune colonne non sono risolte: non hai accesso
      <template v-if="!canReadCustomers">all'anagrafica clienti</template>
      <template v-if="!canReadCustomers && !canReadMap"> né </template>
      <template v-if="!canReadMap">alla mappa</template>.
    </p>
    <QueryBoundary :error="bookingsError" error-title="Prenotazioni non disponibili" @retry="refetchBookings">
    <DataTable :columns="cols" :rows="rows" :row-key="(r) => r.id" :loading="bookingsLoading" empty-message="Nessuna prenotazione per questa data.">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName(row.customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName(row.customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(row.umbrellaId) ?? '–' }}</span> <Badge v-if="retiredUmbrellaIds.has(row.umbrellaId)" tone="neutral">Ritirato</Badge></template>
      <template #cell-tipo="{ row }"><span class="text-[var(--color-text-2nd)]">{{ TYPE_LABEL[row.type] }}</span></template>
      <template #cell-pacchetto="{ row }"><span class="text-[var(--color-text-2nd)]" :title="row.packageId ? (packageName.get(row.packageId!) ?? '') : ''">{{ row.packageId ? (packageName.get(row.packageId!) ?? '–') : '–' }}</span></template>
      <template #cell-periodo="{ row }"><span class="text-[var(--color-text-2nd)]">{{ periodLabel(row) }}</span></template>
      <template #cell-stato="{ row }"><Badge :tone="PAY_TONE[row.paymentStatus]">{{ PAY_LABEL[row.paymentStatus] }}</Badge></template>
      <template #cell-incasso="{ row }">
        <button
          type="button"
          class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          @click="openSettle(row)"
        >{{ formatEuro(row.amountCollected) }} / {{ formatEuro(row.totalPrice) }}</button>
      </template>
    </DataTable>
    </QueryBoundary>

    <SettlePaymentModal v-model="modalOpen" :booking="selected" />
  </section>
</template>
