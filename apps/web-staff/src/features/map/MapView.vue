<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { UmbrellaCell, SegmentedControl, Badge, Button, IconButton, ActionBar, Modal, Icon, Select, ModalFooter, formatEuro } from '@coralyn/ui-kit';
import type { UmbrellaDTO, SlotState, BookingDTO, BookingType } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';
import { useDayMap } from './useDayMap';
import { useDayBookings, useCreateBooking, useCancelBooking } from '@/features/bookings/useBookings';
import { useBookingQuote, type QuoteParams } from '@/features/bookings/useBookingQuote';
import { usePackages } from '@/features/bookings/usePackages';
import SettlePaymentModal from '@/features/bookings/SettlePaymentModal.vue';
import { useCustomers } from '@/features/customers/useCustomers';
import { useSessionStore } from '@/stores/session';
import { storeToRefs } from 'pinia';

const { data: map, isLoading } = useDayMap();

const router = useRouter();

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
const { data: customers } = useCustomers();
const { data: packages } = usePackages();
const createBooking = useCreateBooking();
const cancelBooking = useCancelBooking();

const STATE_COLOR: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
  covered: 'var(--color-state-covered)',
};
const STATE_LABEL: Record<SlotState, string> = {
  free: 'Libero', season: 'Abbonato', daily: 'Giornaliero', booked: 'Prenotato',
  covered: 'Non disponibile',
};
const TYPE_LABEL: Record<BookingType, string> = {
  daily: 'Giornaliera', periodic: 'Periodica', subscription: 'Abbonamento',
};
const TYPE_HELP: Record<BookingType, string> = {
  daily: 'Un giorno.',
  periodic: 'Scegli le date; paghi a giornata (prezzo × giorni).',
  subscription: 'Tutta la stagione, prezzo forfait.',
};

const timeSlots = computed(() => [...(map.value?.timeSlots ?? [])].sort((a, b) => a.sortOrder - b.sortOrder));
const typesById = computed(() => new Map((map.value?.umbrellaTypes ?? []).map((t) => [t.id, t])));
const sectors = computed(() => map.value?.sectors ?? []);
// Convenzione: il settore "Speciali" è reso come blocco palme dedicato in coda, non come tab.
const normalSectors = computed(() => sectors.value.filter((s) => s.name.toLowerCase() !== 'speciali'));
const special = computed(() => sectors.value.find((s) => s.name.toLowerCase() === 'speciali') ?? null);

const activeSector = ref('');
watch(normalSectors, (list) => { if (!activeSector.value && list.length) activeSector.value = list[0].id; }, { immediate: true });
const currentSector = computed(() => normalSectors.value.find((s) => s.id === activeSector.value) ?? normalSectors.value[0] ?? null);
const sectorOptions = computed(() => normalSectors.value.map((s) => ({ value: s.id, label: s.name })));
const spotCount = computed(() => currentSector.value?.rows.reduce((n, r) => n + r.umbrellas.length, 0) ?? 0);

function slotStatesFor(u: UmbrellaDTO): SlotState[] {
  return timeSlots.value.map((s) => (u.stateBySlot[s.id] ?? 'free') as SlotState);
}
function typeIcon(u: UmbrellaDTO): string | null {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.icon ?? 'umbrella') : null;
}
function typeName(u: UmbrellaDTO): string {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.name ?? 'Tipologia') : 'Normale';
}
function ariaLabel(u: UmbrellaDTO, sector: string, row: string): string {
  const perSlot = timeSlots.value
    .map((s) => `${s.name} ${STATE_LABEL[(u.stateBySlot[s.id] ?? 'free') as SlotState]}`)
    .join(', ');
  return `Ombrellone ${u.label}, Settore ${sector} ${row}, tipologia ${typeName(u)}, ${perSlot}`;
}

const selectedSlotId = ref<string>('');
watch(timeSlots, (list) => { if (!selectedSlotId.value && list.length) selectedSlotId.value = list[0].id; }, { immediate: true });

const sel = ref<{ u: UmbrellaDTO; sector: string; row: string } | null>(null);
function open(u: UmbrellaDTO, sector: string, row: string) {
  sel.value = { u, sector, row };
  // Auto-seleziona la fascia che HA una prenotazione per questo ombrellone; altrimenti la prima fascia.
  const booked = (bookings.value ?? []).find((b) => b.umbrellaId === u.id);
  selectedSlotId.value = booked?.timeSlotId ?? timeSlots.value[0]?.id ?? '';
}
function close() { sel.value = null; }

function liveStateFor(slotId: string): SlotState {
  return sel.value ? ((liveU.value.stateBySlot[slotId] ?? 'free') as SlotState) : 'free';
}
const availabilityMessage = computed<string>(() => {
  if (!sel.value) return '';
  const slots = timeSlots.value;
  if (slots.length === 0) return '';
  const free = slots.filter((s) => (liveU.value.stateBySlot[s.id] ?? 'free') === 'free');
  if (free.length === slots.length) return 'Postazione libera tutto il giorno';
  if (free.length > 0) return `Libera nelle fasce: ${free.map((s) => s.name).join(', ')}`;
  return 'Nessuna fascia libera';
});
function tintBg(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 18%, var(--color-surface))`; }
function tintBorder(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 40%, var(--color-surface))`; }
function selectSlot(id: string) { if (id) selectedSlotId.value = id; }

const currentBooking = computed<BookingDTO | null>(() => {
  if (!sel.value) return null;
  return (bookings.value ?? []).find(
    (b) => b.umbrellaId === sel.value!.u.id && b.timeSlotId === selectedSlotId.value,
  ) ?? null;
});

const selUmbrella = computed<UmbrellaDTO | null>(() => {
  if (!sel.value) return null;
  for (const sector of map.value?.sectors ?? []) {
    for (const row of sector.rows) {
      const u = row.umbrellas.find((x) => x.id === sel.value!.u.id);
      if (u) return u;
    }
  }
  return null;
});
/** Stato live dell'ombrellone selezionato (fallback allo snapshot se non in mappa). */
const liveU = computed<UmbrellaDTO>(() => selUmbrella.value ?? sel.value!.u);

const currentCustomerName = computed<string>(() => {
  const b = currentBooking.value;
  if (!b) return '';
  const c = (customers.value ?? []).find((x) => x.id === b.customerId);
  return c ? `${c.firstName} ${c.lastName}` : b.customerId;
});

const customerId = ref<string>('');
const packageId = ref<string>('');
const bookingType = ref<BookingType>('daily');
const endDate = ref<string>('');

function slotIsBusy(slotId: string): boolean {
  return sel.value ? (liveU.value.stateBySlot[slotId] ?? 'free') !== 'free' : false;
}
function firstFreeSlot(): string {
  if (!sel.value) return timeSlots.value[0]?.id ?? '';
  const u = liveU.value;
  const free = timeSlots.value.find((s) => (u.stateBySlot[s.id] ?? 'free') === 'free');
  return free?.id ?? timeSlots.value[0]?.id ?? '';
}
function openModal(presetType: BookingType = 'daily'): void {
  selectedSlotId.value = firstFreeSlot();
  customerId.value = '';
  packageId.value = '';
  bookingType.value = presetType;
  endDate.value = '';
  modalBooking.value = true;
}
function confirmBooking(): void {
  if (!sel.value || !customerId.value) return;
  createBooking.mutate(
    {
      customerId: customerId.value,
      umbrellaId: sel.value.u.id,
      timeSlotId: selectedSlotId.value,
      type: bookingType.value,
      startDate: activeDate.value,
      endDate: bookingType.value === 'periodic' ? endDate.value : undefined,
      packageId: packageId.value || undefined,
    },
    { onSuccess: () => { modalBooking.value = false; } },
  );
  // Su errore: il modale resta aperto (l'operatore corregge) e il toast globale (Slice A) mostra il messaggio server.
}
function onCancel(): void {
  if (currentBooking.value) cancelBooking.mutate(currentBooking.value.id);
}

const modalBooking = ref(false);
const quoteParams = computed<QuoteParams | null>(() => {
  if (!(modalBooking.value && sel.value && selectedSlotId.value)) return null;
  if (bookingType.value === 'periodic' && !endDate.value) return null; // niente quote finché manca la fine
  return {
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    type: bookingType.value,
    startDate: activeDate.value,
    endDate: bookingType.value === 'periodic' ? endDate.value : undefined,
    packageId: packageId.value || undefined,
  };
});
const { data: quote, isError: quoteError, isFetching: quoteLoading } = useBookingQuote(quoteParams);

// Provenienza prezzo (ADR-0032): label composta dal FE dai nomi già in vista.
const packagesById = computed(() => new Map((packages.value ?? []).map((p) => [p.id, p.name])));
const slotsById = computed(() => new Map(timeSlots.value.map((s) => [s.id, s.name])));

interface CoverInfo { slotName: string; customer: string; amount: number | null; }
/** Per una fascia coperta, elenca le fasce copritrici col dettaglio della loro prenotazione (D-048). */
function coveringInfo(slotId: string): CoverInfo[] {
  if (!sel.value) return [];
  const coveringIds = liveU.value.coveredBySlot?.[slotId] ?? [];
  return coveringIds.map((cid) => {
    const b = (bookings.value ?? []).find((x) => x.umbrellaId === sel.value!.u.id && x.timeSlotId === cid);
    const cust = b ? (customers.value ?? []).find((c) => c.id === b.customerId) : undefined;
    return {
      slotName: slotsById.value.get(cid) ?? 'Fascia',
      customer: cust ? `${cust.firstName} ${cust.lastName}` : (b?.customerId ?? ''),
      amount: b ? b.totalPrice : null,
    };
  });
}
const sectorsById = computed(() => new Map(sectors.value.map((s) => [s.id, s.name])));
const rowsById = computed(
  () => new Map(sectors.value.flatMap((s) => s.rows.map((r) => [r.id, r.label]))),
);

const matchedRateLabel = computed<string>(() => {
  const r = quote.value?.matchedRate;
  if (!r) return '';
  const parts: string[] = [];
  if (r.timeSlotId) parts.push(slotsById.value.get(r.timeSlotId) ?? 'Fascia');
  if (r.packageId) parts.push(packagesById.value.get(r.packageId) ?? 'Pacchetto');
  if (r.sectorId) parts.push(sectorsById.value.get(r.sectorId) ?? 'Settore');
  if (r.rowId) parts.push(rowsById.value.get(r.rowId) ?? 'Fila');
  if (r.type) parts.push(TYPE_LABEL[r.type] ?? r.type);
  if (r.periodStart) parts.push(`Periodo ${r.periodStart}${r.periodEnd ? '–' + r.periodEnd : ''}`);
  const dims = parts.length ? parts.join(' · ') : 'Tariffa base del listino';
  // Il suffisso deriva dal TIPO CORRENTE della prenotazione (non da `r.type`): il calcolo del prezzo è
  // funzione del tipo scelto, non della tariffa matchata (un abbonamento può vincere una catch-all → forfait).
  const suffix = bookingType.value === 'subscription' ? ' forfait stagione' : '/g';
  return `${dims} — ${formatEuro(r.price)}${suffix}`;
});

const settleOpen = ref(false);
// Fascia options for modal: only free slots (SegmentedControl has no disabled-option API)
const freeSlotOptions = computed(() =>
  timeSlots.value
    .filter((s) => !slotIsBusy(s.id))
    .map((s) => ({ value: s.id, label: s.name })),
);
</script>

<template>
  <section class="flex min-h-[560px] flex-col">
    <div class="flex flex-wrap items-center gap-3 px-[26px] pt-4">
      <SegmentedControl v-if="sectorOptions.length" v-model="activeSector" :options="sectorOptions" />
      <div class="flex-1"></div>
      <div class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />Stato per fascia
      </div>
    </div>

    <p v-if="isLoading" class="px-[26px] py-10 text-[var(--color-text-muted)]">Caricamento…</p>

    <div v-else class="flex flex-1 flex-col items-stretch gap-[18px] px-[26px] pb-[26px] pt-4 lg:flex-row">
      <div class="relative min-w-0 flex-1 overflow-auto rounded-[var(--radius-xl)] border border-[var(--color-warm-border-stage)] p-5 [box-shadow:var(--shadow-card)]"
        style="background:linear-gradient(168deg,var(--color-warm-075) 0%,var(--color-warm-150) 100%);">
        <div class="mb-3 flex items-baseline justify-between">
          <span class="text-[13.5px] font-semibold text-[var(--color-stage-1)]">Spiaggia · Settore {{ currentSector?.name }}</span>
          <span class="text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-2)]">{{ spotCount }} postazioni</span>
        </div>
        <div class="relative mb-[18px] flex h-9 items-center justify-center gap-2.5 overflow-hidden rounded-[13px]"
          style="background:linear-gradient(180deg,var(--color-sea-1) 0%,var(--color-sea-2) 55%,var(--color-sea-3) 100%);box-shadow:inset 0 -8px 16px -5px rgba(47,110,132,.24);">
          <Icon name="waves" :size="16" class="text-[var(--color-sea-ink)] opacity-80" />
          <span class="text-[10px] font-semibold uppercase tracking-[.26em] text-[var(--color-sea-ink)]">Mare</span>
        </div>
        <div v-for="r in currentSector?.rows ?? []" :key="r.id" class="my-3 flex items-center gap-2.5">
          <span class="w-[46px] flex-none text-right text-[10px] font-semibold text-[var(--color-stage-2)]">{{ r.label }}</span>
          <div class="flex flex-wrap gap-2.5">
            <UmbrellaCell v-for="u in r.umbrellas" :key="u.id" :label="u.label"
              :ariaLabel="ariaLabel(u, currentSector!.name, r.label)" :slot-states="slotStatesFor(u)"
              :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
              @select="open(u, currentSector!.name, r.label)" />
          </div>
        </div>
        <div v-if="special" class="mt-[18px] border-t border-dashed border-[var(--color-warm-border-stage)] pt-3.5">
          <div class="mb-2.5 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-1)]">Settore Speciali · Palme</div>
          <div v-for="r in special.rows" :key="r.id" class="flex flex-wrap gap-3.5">
            <UmbrellaCell v-for="u in r.umbrellas" :key="u.id" :label="u.label"
              :ariaLabel="ariaLabel(u, 'Speciali', r.label)" :slot-states="slotStatesFor(u)"
              :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
              @select="open(u, 'Speciali', r.label)" />
          </div>
        </div>
        <div class="mt-[22px] flex flex-wrap gap-7 border-t border-[var(--color-warm-border-stage)] pt-4">
          <div>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-3)]">Stato</div>
            <div class="flex flex-wrap gap-3.5 text-[11.5px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-free)"></i>Libero</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-season)"></i>Abbonato</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-daily)"></i>Giornaliero</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-booked)"></i>Prenotato</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-covered)"></i>Non disponibile</span>
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:conic-gradient(from 0deg,var(--color-state-booked) 0 33.333%,var(--color-state-daily) 33.333% 66.666%,var(--color-state-free) 66.666% 100%)"></i>Stato misto</span>
            </div>
          </div>
          <div>
            <div class="mb-2 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-3)]">Tipologia</div>
            <div class="flex flex-wrap gap-3.5 text-[11.5px] text-[var(--color-text-2nd)]">
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:var(--color-state-normal-mark)"></i>Normale</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="leaf" :size="14" class="text-[var(--color-accent)]" />Mini-palma</span>
              <span class="inline-flex items-center gap-1.5"><Icon name="palmtree" :size="14" class="text-[var(--color-accent)]" />Palma</span>
            </div>
          </div>
        </div>
      </div>

      <aside v-if="sel" class="flex w-full flex-none flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 [box-shadow:var(--shadow-drawer)] lg:w-[380px]">
        <div class="flex items-start justify-between">
          <div>
            <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">Ombrellone</div>
            <h3 class="text-2xl font-bold tracking-[-.02em] tabular-nums text-[var(--color-text)]">{{ sel.u.label }}</h3>
          </div>
          <IconButton icon="x" label="Chiudi" variant="subtle" @click="close" />
        </div>
        <div class="my-2.5 flex items-center gap-2">
          <Badge tone="accent"><Icon :name="typeIcon(sel.u) ?? 'umbrella'" :size="12" />{{ typeName(sel.u) }}</Badge>
          <span class="text-xs text-[var(--color-text-muted)]">Settore {{ sel.sector }} · {{ sel.row }}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2.5">
          <button v-for="s in timeSlots" :key="s.id" type="button" @click="selectSlot(s.id)"
            :aria-pressed="selectedSlotId === s.id"
            class="min-w-[92px] flex-1 rounded-[11px] p-3 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            :style="{ background: tintBg(liveStateFor(s.id)), border: `1px solid ${tintBorder(liveStateFor(s.id))}`, boxShadow: selectedSlotId === s.id ? 'inset 0 0 0 2px var(--color-accent)' : undefined }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">{{ s.name }}</span>
            <span v-if="s.startTime && s.endTime" class="mb-1 block text-[9px] tabular-nums text-[var(--color-text-muted)]">{{ s.startTime }}–{{ s.endTime }}</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATE_COLOR[liveStateFor(s.id)] }">{{ STATE_LABEL[liveStateFor(s.id)] }}</span>
          </button>
        </div>
        <template v-if="currentBooking">
          <div class="mt-3 text-[12.5px]">
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Cliente</span><span class="font-semibold text-[var(--color-text)]">{{ currentCustomerName }}</span></div>
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Importo</span><span class="font-semibold tabular-nums text-[var(--color-text)]">€ {{ currentBooking.totalPrice }}</span></div>
            <div class="flex items-center justify-between py-2"><span class="text-[var(--color-text-muted)]">Pagamento</span>
              <Badge :tone="PAY_TONE[currentBooking.paymentStatus]">{{ PAY_LABEL[currentBooking.paymentStatus] }}</Badge>
            </div>
          </div>
          <ActionBar class="mt-2.5" align="start" gap="sm">
            <Button variant="ghost" size="sm" @click="settleOpen = true">Registra incasso</Button>
            <!-- L'abbonamento non si annulla col void crudo (perderebbe storico e rimborso): si disdice
                 dalla Scheda cliente (D-013, admin-only). Solo daily/periodic sono annullabili qui. -->
            <Button v-if="currentBooking.type !== 'subscription'" variant="danger" size="sm" :loading="cancelBooking.isPending.value" @click="onCancel">Annulla prenotazione</Button>
            <Button v-else variant="ghost" size="sm" @click="router.push(`/customers/${currentBooking.customerId}`)">Gestisci abbonamento</Button>
          </ActionBar>
        </template>
        <div v-else class="mt-3.5 rounded-xl border border-dashed border-[var(--color-warm-border-seg)] bg-[var(--color-warm-075)] p-4 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          <template v-if="liveStateFor(selectedSlotId) === 'covered'">
            <div class="mb-1.5 text-center text-[13px] font-semibold text-[var(--color-text)]">Non disponibile</div>
            <ul class="space-y-1">
              <li v-for="(c, i) in coveringInfo(selectedSlotId)" :key="i">
                coperta da <span class="font-semibold text-[var(--color-text-2nd)]">{{ c.slotName }}</span><template v-if="c.customer"> — {{ c.customer }}<template v-if="c.amount !== null"> · € {{ c.amount }}</template></template>
              </li>
            </ul>
          </template>
          <div v-else class="text-center">{{ availabilityMessage }}</div>
        </div>
        <div class="mt-auto flex flex-col gap-2 pt-4">
          <Button @click="openModal()"><Icon name="plus" :size="17" />Nuova prenotazione</Button>
          <Button variant="secondary" @click="openModal('subscription')"><Icon name="star" :size="15" />Abbonamento</Button>
        </div>
      </aside>
    </div>

    <Modal v-model:open="modalBooking" title="Nuova prenotazione" :eyebrow="`Settore ${sel?.sector ?? ''} · Ombrellone ${sel?.u.label ?? ''}`">
      <div class="flex flex-col gap-[18px]">
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Tipo</label>
          <Select v-model="bookingType">
            <option value="daily">Giornaliera</option>
            <option value="periodic">Periodica</option>
            <option value="subscription">Abbonamento</option>
          </Select>
          <p class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">{{ TYPE_HELP[bookingType] }}</p>
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Cliente</label>
          <Select v-model="customerId">
            <option value="" disabled>Seleziona un cliente…</option>
            <option v-for="c in (customers ?? [])" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </Select>
          <p v-if="(customers ?? []).length === 0" class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            Nessun cliente. <router-link to="/customers" class="font-semibold text-[var(--color-accent)]">Crea un cliente</router-link>.
          </p>
        </div>
        <div v-if="freeSlotOptions.length">
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Fascia</label>
          <SegmentedControl v-model="selectedSlotId" :options="freeSlotOptions" />
        </div>
        <div v-if="bookingType === 'periodic'">
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Fine periodo</label>
          <input type="date" v-model="endDate" :min="activeDate" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Pacchetto</label>
          <Select v-model="packageId">
            <option value="">Nessun pacchetto</option>
            <option v-for="p in (packages ?? [])" :key="p.id" :value="p.id">{{ p.name }}</option>
          </Select>
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Prezzo</label>
          <p v-if="quoteLoading" class="text-[13.5px] text-[var(--color-text-muted)]">Calcolo…</p>
          <p v-else-if="quoteError" class="text-[13.5px] text-[var(--color-danger)]">Prezzo non disponibile: listino non configurato.</p>
          <p v-else class="text-lg font-bold tabular-nums text-[var(--color-text)]">{{ formatEuro(quote?.totalPrice ?? 0) }}</p>
          <p v-if="!quoteLoading && !quoteError && quote" class="mt-1 text-[12px] text-[var(--color-text-muted)]">
            Tariffa applicata: {{ matchedRateLabel }}
          </p>
        </div>
      </div>

      <template #footer>
        <ModalFooter submit-label="Conferma prenotazione" :submit-disabled="quoteError || quoteLoading" @cancel="modalBooking = false" @submit="confirmBooking" />
      </template>
    </Modal>

    <SettlePaymentModal v-model="settleOpen" :booking="currentBooking" />
  </section>
</template>
