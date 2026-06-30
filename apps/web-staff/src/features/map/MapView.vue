<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { UmbrellaCell, SegmentedControl, Badge, Button, Modal, Icon } from '@coralyn/ui-kit';
import type { UmbrellaDTO, SlotState, BookingDTO } from '@coralyn/contracts';
import { useDayMap } from './useDayMap';
import { useDayBookings, useCreateBooking, useCancelBooking } from '@/features/bookings/useBookings';
import { useCustomers } from '@/features/customers/useCustomers';
import { useSessionStore } from '@/stores/session';
import { storeToRefs } from 'pinia';

const { data: map, isLoading } = useDayMap();

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
const { data: customers } = useCustomers();
const createBooking = useCreateBooking();
const cancelBooking = useCancelBooking();

const STATE_COLOR: Record<SlotState, string> = {
  free: 'var(--color-state-free)', season: 'var(--color-state-season)',
  daily: 'var(--color-state-daily)', booked: 'var(--color-state-booked)',
};
const STATE_LABEL: Record<SlotState, string> = {
  free: 'Libero', season: 'Abbonato', daily: 'Giornaliero', booked: 'Prenotato',
};

const timeSlots = computed(() => map.value?.timeSlots ?? []);
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

function slotState(u: UmbrellaDTO, idx: number): SlotState {
  const s = timeSlots.value[idx] ?? timeSlots.value[0];
  return (u.stateBySlot[s?.id] ?? 'free') as SlotState;
}
function typeIcon(u: UmbrellaDTO): string | null {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.icon ?? 'umbrella') : null;
}
function typeName(u: UmbrellaDTO): string {
  return u.umbrellaTypeId ? (typesById.value.get(u.umbrellaTypeId)?.name ?? 'Tipologia') : 'Normale';
}
function ariaLabel(u: UmbrellaDTO, sector: string, row: string): string {
  return `Ombrellone ${u.label}, Settore ${sector} ${row}, tipologia ${typeName(u)}, mattina ${STATE_LABEL[slotState(u, 0)]}, pomeriggio ${STATE_LABEL[slotState(u, 1)]}`;
}

const sel = ref<{ u: UmbrellaDTO; sector: string; row: string } | null>(null);
function open(u: UmbrellaDTO, sector: string, row: string) { sel.value = { u, sector, row }; }
function close() { sel.value = null; }

const morning = computed<SlotState>(() => (sel.value ? slotState(sel.value.u, 0) : 'free'));
const afternoon = computed<SlotState>(() => (sel.value ? slotState(sel.value.u, 1) : 'free'));
function tintBg(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 18%, var(--color-surface))`; }
function tintBorder(s: SlotState) { return `color-mix(in srgb, ${STATE_COLOR[s]} 40%, var(--color-surface))`; }

const selectedSlotId = ref<string>('');
watch(timeSlots, (list) => { if (!selectedSlotId.value && list.length) selectedSlotId.value = list[0].id; }, { immediate: true });

const currentBooking = computed<BookingDTO | null>(() => {
  if (!sel.value) return null;
  return (bookings.value ?? []).find(
    (b) => b.umbrellaId === sel.value!.u.id && b.timeSlotId === selectedSlotId.value,
  ) ?? null;
});

const currentCustomerName = computed<string>(() => {
  const b = currentBooking.value;
  if (!b) return '';
  const c = (customers.value ?? []).find((x) => x.id === b.customerId);
  return c ? `${c.firstName} ${c.lastName}` : b.customerId;
});

const customerId = ref<string>('');
const price = ref<number>(0);

function slotIsBusy(slotId: string): boolean {
  return sel.value ? (sel.value.u.stateBySlot[slotId] ?? 'free') !== 'free' : false;
}
function firstFreeSlot(): string {
  if (!sel.value) return timeSlots.value[0]?.id ?? '';
  const u = sel.value.u;
  const free = timeSlots.value.find((s) => (u.stateBySlot[s.id] ?? 'free') === 'free');
  return free?.id ?? timeSlots.value[0]?.id ?? '';
}
function openModal(): void {
  selectedSlotId.value = firstFreeSlot();
  customerId.value = '';
  price.value = 0;
  modalBooking.value = true;
}
async function confirmBooking(): Promise<void> {
  if (!sel.value || !customerId.value) return;
  await createBooking.mutateAsync({
    customerId: customerId.value,
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    date: activeDate.value,
    totalPrice: price.value,
  });
  modalBooking.value = false;
}
async function onCancel(): Promise<void> {
  if (currentBooking.value) await cancelBooking.mutateAsync(currentBooking.value.id);
}

const modalBooking = ref(false);
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
        <Icon name="clock" :size="15" class="text-[var(--color-accent)]" />Stato per fascia · mattina / pomeriggio
      </div>
    </div>

    <p v-if="isLoading" class="px-[26px] py-10 text-[var(--color-text-muted)]">Caricamento…</p>

    <div v-else class="flex flex-1 items-stretch gap-[18px] px-[26px] pb-[26px] pt-4">
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
              :ariaLabel="ariaLabel(u, currentSector!.name, r.label)" :morning-state="slotState(u, 0)"
              :afternoon-state="slotState(u, 1)" :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
              @select="open(u, currentSector!.name, r.label)" />
          </div>
        </div>
        <div v-if="special" class="mt-[18px] border-t border-dashed border-[var(--color-warm-border-stage)] pt-3.5">
          <div class="mb-2.5 text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--color-stage-1)]">Settore Speciali · Palme</div>
          <div v-for="r in special.rows" :key="r.id" class="flex flex-wrap gap-3.5">
            <UmbrellaCell v-for="u in r.umbrellas" :key="u.id" :label="u.label"
              :ariaLabel="ariaLabel(u, 'Speciali', r.label)" :morning-state="slotState(u, 0)"
              :afternoon-state="slotState(u, 1)" :type-icon="typeIcon(u)" :selected="sel?.u.id === u.id"
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
              <span class="inline-flex items-center gap-1.5"><i class="size-[13px] rounded-full" style="background:linear-gradient(90deg,var(--color-state-booked) 0 50%,var(--color-state-free) 50% 100%)"></i>Mezza giornata</span>
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

      <aside v-if="sel" class="flex w-[340px] flex-none flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 [box-shadow:var(--shadow-drawer)]">
        <div class="flex items-start justify-between">
          <div>
            <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">Ombrellone</div>
            <h3 class="text-2xl font-bold tracking-[-.02em] tabular-nums text-[var(--color-text)]">{{ sel.u.label }}</h3>
          </div>
          <button @click="close" aria-label="Chiudi" class="grid size-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)]"><Icon name="x" :size="16" /></button>
        </div>
        <div class="my-2.5 flex items-center gap-2">
          <Badge tone="accent"><Icon :name="typeIcon(sel.u) ?? 'umbrella'" :size="12" />{{ typeName(sel.u) }}</Badge>
          <span class="text-xs text-[var(--color-text-muted)]">Settore {{ sel.sector }} · {{ sel.row }}</span>
        </div>
        <div class="mt-3 flex gap-2.5">
          <div class="flex-1 rounded-[11px] p-3" :style="{ background: tintBg(morning), border: `1px solid ${tintBorder(morning)}` }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">Mattina</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATE_COLOR[morning] }">{{ STATE_LABEL[morning] }}</span>
          </div>
          <div class="flex-1 rounded-[11px] p-3" :style="{ background: tintBg(afternoon), border: `1px solid ${tintBorder(afternoon)}` }">
            <span class="mb-1 block text-[9.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-ink-600)]">Pomeriggio</span>
            <span class="text-[13px] font-semibold" :style="{ color: STATE_COLOR[afternoon] }">{{ STATE_LABEL[afternoon] }}</span>
          </div>
        </div>
        <template v-if="currentBooking">
          <div class="mt-3 text-[12.5px]">
            <div class="flex justify-between border-b border-dashed border-[var(--color-border-row)] py-2"><span class="text-[var(--color-text-muted)]">Cliente</span><span class="font-semibold text-[var(--color-text)]">{{ currentCustomerName }}</span></div>
            <div class="flex justify-between py-2"><span class="text-[var(--color-text-muted)]">Importo</span><span class="font-semibold tabular-nums text-[var(--color-text)]">€ {{ currentBooking.totalPrice }}</span></div>
          </div>
          <button type="button" @click="onCancel" class="mt-2.5 self-start p-0.5 text-xs font-semibold text-[var(--color-danger)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">Annulla prenotazione</button>
        </template>
        <div v-else class="mt-3.5 rounded-xl border border-dashed border-[var(--color-warm-border-seg)] bg-[var(--color-warm-075)] p-4 text-center text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          Postazione disponibile<br />per l'intera giornata.
        </div>
        <div class="mt-auto flex flex-col gap-2 pt-4">
          <Button @click="openModal"><Icon name="plus" :size="17" />Nuova prenotazione</Button>
          <div class="flex gap-2">
            <Button variant="secondary" class="flex-1"><Icon name="star" :size="15" />Abbonamento</Button>
            <Button variant="secondary" class="flex-1"><Icon name="check" :size="15" />Presenza</Button>
          </div>
        </div>
      </aside>
    </div>

    <Modal v-model:open="modalBooking" title="Nuova prenotazione" :eyebrow="`Settore ${sel?.sector ?? ''} · Ombrellone ${sel?.u.label ?? ''}`">
      <div class="flex flex-col gap-[18px]">
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Cliente</label>
          <select v-model="customerId" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="" disabled>Seleziona un cliente…</option>
            <option v-for="c in (customers ?? [])" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </select>
          <p v-if="(customers ?? []).length === 0" class="mt-1.5 text-[11.5px] text-[var(--color-text-muted)]">
            Nessun cliente. <router-link to="/customers" class="font-semibold text-[var(--color-accent)]">Crea un cliente</router-link>.
          </p>
        </div>
        <div v-if="freeSlotOptions.length">
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Fascia</label>
          <SegmentedControl v-model="selectedSlotId" :options="freeSlotOptions" />
        </div>
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Prezzo (€)</label>
          <input type="number" min="0" step="0.01" v-model.number="price" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
        </div>
        <div class="flex justify-end gap-2.5 pt-2">
          <Button variant="secondary" @click="modalBooking = false">Annulla</Button>
          <Button @click="confirmBooking">Conferma prenotazione</Button>
        </div>
      </div>
    </Modal>
  </section>
</template>
