<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedRefund } from './terminationRefund';
import { useTerminateSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const terminate = useTerminateSubscription(props.customerId);

const effectiveDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => (props.booking ? addDays(props.booking.startDate, 1) : ''));
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() => (props.booking ? suggestedRefund(props.booking, effectiveDate.value) : 0));

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    const def = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    effectiveDate.value = def;
    refundAmount.value = suggestedRefund(props.booking, def);
    reason.value = '';
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    await terminate.mutateAsync({
      id: props.booking.id,
      input: { effectiveDate: effectiveDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Abbonamento già disdetto.' : status === 422 ? 'Dati non validi.' : 'Errore durante la disdetta.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Disdici abbonamento" eyebrow="Disdetta">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Data effettiva (primo giorno di posto libero)">
        <input v-model="effectiveDate" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>

      <Field label="Rimborso (€)">
        <input v-model.number="refundAmount" data-testid="refund-amount" type="number" min="0" step="0.01" :class="inputClass" />
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
        <Button data-testid="terminate-confirm" variant="danger" :disabled="submitting" @click="confirm">Conferma disdetta</Button>
      </div>
    </div>
  </Modal>
</template>
