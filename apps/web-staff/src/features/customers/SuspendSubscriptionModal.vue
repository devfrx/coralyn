<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, SegmentedControl, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedSuspensionRefund } from './suspensionRefund';
import { useSuspendSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const suspend = useSuspendSubscription(props.customerId);

const mode = ref<'closed' | 'open'>('closed');
const startDate = ref('');
const returnDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minStart = computed(() => {
  const t = todayIso();
  const s = props.booking?.startDate ?? t;
  return s > t ? s : t; // max(oggi, inizio abbonamento)
});
const maxDate = computed(() => props.booking?.endDate ?? '');
const minReturn = computed(() => (startDate.value ? addDays(startDate.value, 1) : minStart.value));
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() =>
  props.booking && returnDate.value ? suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value) : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    mode.value = 'closed';
    startDate.value = clampDate(session.activeDate || todayIso(), minStart.value, maxDate.value);
    returnDate.value = clampDate(addDays(startDate.value, 7), minReturn.value, maxDate.value);
    refundAmount.value = suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value);
    reason.value = '';
    error.value = '';
  }
});

// mantiene ritorno e rimborso coerenti quando cambiano inizio/ritorno
watch([startDate, returnDate], () => {
  if (!props.booking) return;
  if (returnDate.value && returnDate.value < minReturn.value) returnDate.value = minReturn.value;
  refundAmount.value = suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value);
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    const input =
      mode.value === 'closed'
        ? { startDate: startDate.value, endDate: returnDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined }
        : { startDate: startDate.value, reason: reason.value || undefined };
    await suspend.mutateAsync({ id: props.booking.id, input });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Esiste già una sospensione aperta.' : status === 422 ? 'Dati non validi.' : 'Errore durante la sospensione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Sospendi abbonamento" eyebrow="Sospensione">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <SegmentedControl
        v-model="mode"
        :options="[{ value: 'closed', label: 'Ritorno noto' }, { value: 'open', label: 'Ritorno ignoto' }]"
      />

      <Field label="Data inizio sospensione">
        <input v-model="startDate" data-testid="suspend-start" type="date" :min="minStart" :max="maxDate" :class="inputClass" />
      </Field>

      <template v-if="mode === 'closed'">
        <Field label="Data ritorno">
          <input v-model="returnDate" data-testid="suspend-return" type="date" :min="minReturn" :max="maxDate" :class="inputClass" />
        </Field>
        <Field label="Rimborso (€)">
          <input v-model.number="refundAmount" data-testid="suspend-refund" type="number" min="0" step="0.01" :class="inputClass" />
        </Field>
        <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
          <span>Suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
          <Button type="button" variant="ghost" @click="refundAmount = suggested">Usa suggerito</Button>
        </div>
      </template>
      <p v-else class="text-[12.5px] text-[var(--color-text-2nd)]">
        Il posto resta libero da data inizio a tempo indeterminato. Il rimborso si calcola alla riattivazione.
      </p>

      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="suspend-confirm" variant="primary" :disabled="submitting" @click="confirm">Sospendi</Button>
      </div>
    </div>
  </Modal>
</template>
