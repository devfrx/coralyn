<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Button, Badge, DataTable, Modal, ConfirmDialog, Field, Select, Icon, ActionBar,
  PageToolbar, ModalFooter, formatEuro,
} from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { RentalDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE } from '@/lib/statusMaps';
import { useRentals, useCheckoutRental, useReturnRental, useCancelRental } from './useRentals';
import { useRentalItems } from './useRentalItems';
import { useRentalTariffs } from './useRentalTariffs';
import { useSeasons } from '@/features/pricing/useSeasons';
import { useCustomers } from '@/features/customers/useCustomers';
import SettleRentalPaymentModal from './SettleRentalPaymentModal.vue';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: day, isLoading: dayLoading } = useRentals(activeDate);
const rentals = computed<RentalDTO[]>(() => day.value?.rentals ?? []);
const availability = computed(() => day.value?.availability ?? []);

const { data: items } = useRentalItems(); // solo attivi (banco: nessuna gestione archivio qui)
const itemsById = computed(() => new Map((items.value ?? []).map((i) => [i.id, i])));
const { data: customers } = useCustomers();

// Stagione attiva: quella che copre la data operativa corrente, altrimenti la prima disponibile
// (stesso fallback di RentalCatalogView quando non c'è ancora una stagione "in corso" configurata).
const { data: seasons } = useSeasons();
const activeSeasonId = computed(() => {
  const list = seasons.value ?? [];
  const covering = list.find((s) => s.startDate <= activeDate.value && activeDate.value <= s.endDate);
  return covering?.id ?? list[0]?.id ?? '';
});

const cols: DataTableColumn[] = [
  { key: 'articolo', label: 'Articolo' },
  { key: 'tariffa', label: 'Tariffa' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'unita', label: 'Unità', numeric: true, align: 'right' },
  { key: 'stato', label: 'Stato' },
  { key: 'incasso', label: 'Incasso', align: 'right' },
  { key: 'azioni', label: '', align: 'right' },
];

// --- Azioni riga ---
const returnRental = useReturnRental();
const cancelRental = useCancelRental();

const settleOpen = ref(false);
const settleTarget = ref<RentalDTO | null>(null);
function openSettle(r: RentalDTO): void {
  settleTarget.value = r;
  settleOpen.value = true;
}

const confirmCancelOpen = ref(false);
const cancelTarget = ref<RentalDTO | null>(null);
function askCancel(r: RentalDTO): void {
  cancelTarget.value = r;
  confirmCancelOpen.value = true;
}
function onConfirmCancel(): void {
  if (cancelTarget.value) cancelRental.mutate(cancelTarget.value.id);
  confirmCancelOpen.value = false;
  cancelTarget.value = null;
}

// --- Disponibilità: "Disponibili: X" per gli articoli con noleggi attivi in giornata, "—" se illimitata ---
function availabilityLabel(rentalItemId: string): string {
  const a = availability.value.find((x) => x.rentalItemId === rentalItemId);
  if (!a || a.available === null) return '—';
  return `Disponibili: ${a.available}`;
}
const activeItemIds = computed(() => new Set(rentals.value.filter((r) => r.status === 'active').map((r) => r.rentalItemId)));
const availabilityRows = computed(() => availability.value.filter((a) => activeItemIds.value.has(a.rentalItemId)));

// --- Modale "Nuovo noleggio" ---
const modalOpen = ref(false);
const checkout = useCheckoutRental();
const itemId = ref('');
const tariffId = ref('');
const customerId = ref('');
const units = ref(1);

const getItemId = () => itemId.value;
const getSeasonId = () => activeSeasonId.value;
const { data: tariffsData } = useRentalTariffs(getItemId, getSeasonId);
const tariffs = computed(() => (tariffsData.value ?? []).filter((t) => !t.archived));
const selectedTariff = computed(() => tariffs.value.find((t) => t.id === tariffId.value));
// Anteprima prezzo READ-ONLY, calcolata client-side: il server la ricalcola e la snapshotta in modo
// autoritativo su checkout — qui NON esiste (né va chiamato) un endpoint di preventivo (D-052).
const preview = computed(() => (selectedTariff.value ? selectedTariff.value.price * (units.value || 0) : 0));

// Selezionando un nuovo articolo, la tariffa precedente (di un altro articolo) non è più valida.
watch(itemId, () => { tariffId.value = ''; });

function openNewRental(): void {
  itemId.value = '';
  tariffId.value = '';
  customerId.value = '';
  units.value = 1;
  modalOpen.value = true;
}
function confirmCheckout(): void {
  if (!itemId.value || !tariffId.value || units.value < 1) return;
  checkout.mutate(
    { rentalItemId: itemId.value, rentalTariffId: tariffId.value, customerId: customerId.value || undefined, units: units.value },
    { onSuccess: () => { modalOpen.value = false; } },
  );
  // Su 422 (es. nessuna stagione attiva / tariffa non valida per articolo o stagione): il modale resta aperto,
  // il toast globale mostra il messaggio server. La disponibilità è informativa e NON blocca il checkout.
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #right>
        <Button data-test="new-rental" @click="openNewRental"><Icon name="plus" :size="16" />Nuovo noleggio</Button>
      </template>
    </PageToolbar>

    <!-- Barra disponibilità per gli articoli con noleggi attivi oggi -->
    <div v-if="availabilityRows.length" class="mb-4 flex flex-wrap gap-2.5">
      <Badge v-for="a in availabilityRows" :key="a.rentalItemId" tone="accent" :data-test="`availability-${a.rentalItemId}`">
        {{ itemsById.get(a.rentalItemId)?.name ?? a.rentalItemId }} · {{ availabilityLabel(a.rentalItemId) }}
      </Badge>
    </div>

    <DataTable
      :columns="cols"
      :rows="(rentals as unknown as Record<string, unknown>[])"
      :row-key="(r) => (r as unknown as RentalDTO).id"
      empty-message="Nessun noleggio per questa data."
      :loading="dayLoading"
    >
      <template #cell-articolo="{ row }"><span class="font-semibold text-[var(--color-text)]">{{ (row as unknown as RentalDTO).rentalItemName }}</span></template>
      <template #cell-tariffa="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).tariffLabel }}</span></template>
      <template #cell-cliente="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).customerName ?? '—' }}</span></template>
      <template #cell-unita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RentalDTO).units }}</span></template>
      <template #cell-stato="{ row }">
        <Badge :tone="RENTAL_STATUS_TONE[(row as unknown as RentalDTO).status]">{{ RENTAL_STATUS_LABEL[(row as unknown as RentalDTO).status] }}</Badge>
      </template>
      <template #cell-incasso="{ row }">
        <button
          type="button"
          class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          :data-test="`settle-${(row as unknown as RentalDTO).id}`"
          :disabled="(row as unknown as RentalDTO).status === 'cancelled'"
          @click="openSettle(row as unknown as RentalDTO)"
        >{{ formatEuro((row as unknown as RentalDTO).amountCollected) }} / {{ formatEuro((row as unknown as RentalDTO).totalPrice) }}</button>
      </template>
      <template #cell-azioni="{ row }">
        <ActionBar gap="sm" align="end">
          <Button v-if="(row as unknown as RentalDTO).status === 'active'" variant="secondary" size="sm" :data-test="`return-${(row as unknown as RentalDTO).id}`"
            :loading="returnRental.isPending.value && returnRental.variables.value === (row as unknown as RentalDTO).id"
            @click="returnRental.mutate((row as unknown as RentalDTO).id)">Rientro</Button>
          <Button v-if="(row as unknown as RentalDTO).status === 'active'" variant="danger" size="sm" :data-test="`cancel-${(row as unknown as RentalDTO).id}`" @click="askCancel(row as unknown as RentalDTO)">Annulla</Button>
        </ActionBar>
      </template>
    </DataTable>

    <!-- Modale Nuovo noleggio -->
    <Modal v-model:open="modalOpen" title="Nuovo noleggio" eyebrow="Banco noleggi">
      <div class="flex flex-col gap-[18px]">
        <Field label="Articolo">
          <Select v-model="itemId" data-test="new-rental-item">
            <option value="" disabled>Seleziona un articolo…</option>
            <option v-for="i in (items ?? [])" :key="i.id" :value="i.id">{{ i.name }}</option>
          </Select>
        </Field>
        <Field label="Tariffa">
          <Select v-model="tariffId" data-test="new-rental-tariff" :disabled="!itemId">
            <option value="" disabled>Seleziona una tariffa…</option>
            <option v-for="t in tariffs" :key="t.id" :value="t.id">{{ t.label }} — {{ formatEuro(t.price) }}</option>
          </Select>
          <p v-if="itemId && tariffs.length === 0" class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            Nessuna tariffa per questo articolo nella stagione attiva.
          </p>
        </Field>
        <Field label="Cliente (opzionale)">
          <Select v-model="customerId" data-test="new-rental-customer">
            <option value="">Nessun cliente</option>
            <option v-for="c in (customers ?? [])" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </Select>
        </Field>
        <Field label="Unità">
          <input v-model.number="units" data-test="new-rental-units" type="number" min="1" step="1"
            class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
        </Field>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Prezzo</label>
          <p class="text-lg font-bold tabular-nums text-[var(--color-text)]" data-test="new-rental-preview">{{ formatEuro(preview) }}</p>
        </div>
      </div>
      <template #footer>
        <ModalFooter submit-label="Conferma noleggio" :submit-disabled="!itemId || !tariffId" :submit-loading="checkout.isPending.value" @cancel="modalOpen = false" @submit="confirmCheckout" />
      </template>
    </Modal>

    <SettleRentalPaymentModal v-model="settleOpen" :rental="settleTarget" />

    <ConfirmDialog
      v-model:open="confirmCancelOpen"
      title="Annullare il noleggio?"
      :description="`«${cancelTarget?.rentalItemName ?? ''}» verrà annullato.`"
      confirm-label="Annulla noleggio"
      tone="danger"
      @confirm="onConfirmCancel"
    />
  </section>
</template>
