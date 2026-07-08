<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO, SuspensionDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedSuspensionRefund } from './suspensionRefund';
import { useReactivateSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; suspension: SuspensionDTO | null; customerId: string }>();

const session = useSessionStore();
const reactivate = useReactivateSubscription(props.customerId);

const returnDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minReturn = computed(() => (props.suspension ? addDays(props.suspension.startDate, 1) : ''));
const maxReturn = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() =>
  props.booking && props.suspension && returnDate.value
    ? suggestedSuspensionRefund(props.booking, props.suspension.startDate, returnDate.value)
    : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking && props.suspension) {
    returnDate.value = clampDate(session.activeDate || todayIso(), minReturn.value, maxReturn.value);
    refundAmount.value = suggested.value;
    reason.value = '';
    error.value = '';
  }
});

watch(returnDate, () => {
  refundAmount.value = suggested.value;
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    await reactivate.mutateAsync({
      id: props.booking.id,
      input: { returnDate: returnDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Il posto è occupato nel periodo di ritorno.' : status === 422 ? 'Data non valida.' : 'Errore durante la riattivazione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Riattiva abbonamento" eyebrow="Riattivazione">
    <div v-if="booking && suspension" class="flex flex-col gap-[18px]">
      <Field label="Data ritorno">
        <input v-model="returnDate" data-testid="reactivate-return" type="date" :min="minReturn" :max="maxReturn" :class="inputClass" />
      </Field>
      <Field label="Rimborso (€)">
        <input v-model.number="refundAmount" data-testid="reactivate-refund" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
        <span>Suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
        <Button type="button" variant="ghost" @click="refundAmount = suggested">Usa suggerito</Button>
      </div>
      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>
      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="reactivate-confirm" variant="primary" :disabled="submitting" @click="confirm">Riattiva</Button>
      </div>
    </div>
  </Modal>
</template>
