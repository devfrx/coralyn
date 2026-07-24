<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, Select, Option, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { todayIso } from '@/lib/dates';
import { suggestedCessionRefund } from './cessionRefund';
import { useTransferSubscription, useCustomers } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const transfer = useTransferSubscription(props.customerId);
const { data: customers } = useCustomers();

const newCustomerId = ref('');
const effectiveDate = ref('');
const refundToPrevious = ref(0);
const collectedFromNew = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => props.booking?.startDate ?? todayIso());
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
// il subentrante non può essere il titolare attuale (Scheda = customerId)
const candidates = computed(() => (customers.value ?? []).filter((c) => c.id !== props.customerId && !c.anonymizedAt));
const suggested = computed(() =>
  props.booking && effectiveDate.value ? suggestedCessionRefund(props.booking, effectiveDate.value) : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    newCustomerId.value = '';
    effectiveDate.value = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    const s = suggestedCessionRefund(props.booking, effectiveDate.value);
    refundToPrevious.value = s;
    collectedFromNew.value = s;
    reason.value = '';
    error.value = '';
  }
});

watch(effectiveDate, () => {
  if (!props.booking) return;
  const s = suggestedCessionRefund(props.booking, effectiveDate.value);
  refundToPrevious.value = s;
  collectedFromNew.value = s;
});

async function confirm(): Promise<void> {
  if (!props.booking || !newCustomerId.value) { error.value = 'Seleziona il subentrante.'; return; }
  error.value = '';
  submitting.value = true;
  try {
    await transfer.mutateAsync({
      id: props.booking.id,
      input: {
        newCustomerId: newCustomerId.value,
        effectiveDate: effectiveDate.value,
        refundToPrevious: refundToPrevious.value,
        collectedFromNew: collectedFromNew.value,
        reason: reason.value || undefined,
      },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Sospensione aperta: riattiva prima di cedere.' : status === 422 ? 'Dati non validi.' : 'Errore durante la cessione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Cedi abbonamento" eyebrow="Subentro">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Cliente subentrante">
        <Select v-model="newCustomerId" data-testid="transfer-new-customer">
          <Option value="" disabled>Seleziona…</Option>
          <Option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</Option>
        </Select>
      </Field>

      <Field label="Data effettiva del subentro">
        <input v-model="effectiveDate" data-testid="transfer-date" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>

      <Field label="Rimborso al cedente (€)">
        <input v-model.number="refundToPrevious" data-testid="transfer-refund" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <Field label="Incasso dal subentrante (€)">
        <input v-model.number="collectedFromNew" data-testid="transfer-collect" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
        <span>Residuo suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
        <Button type="button" variant="ghost" @click="refundToPrevious = suggested; collectedFromNew = suggested">Usa suggerito</Button>
        <Button type="button" variant="ghost" @click="refundToPrevious = 0; collectedFromNew = 0">Regolamento privato</Button>
      </div>

      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="transfer-confirm" variant="primary" :disabled="submitting" @click="confirm">Cedi</Button>
      </div>
    </div>
  </Modal>
</template>
