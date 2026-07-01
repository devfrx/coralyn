<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, ModalFooter, formatEuro } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentMethod } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSettlePayment } from './useBookings';

const open = defineModel<boolean>({ required: true });
const props = defineProps<{ booking: BookingDTO | null }>();

const settle = useSettlePayment();
const amount = ref(0);
const method = ref<PaymentMethod>('cash');
const date = ref('');
const error = ref('');
const submitting = ref(false);

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Contanti' },
  { value: 'card', label: 'Carta' },
  { value: 'transfer', label: 'Bonifico' },
  { value: 'other', label: 'Altro' },
];
const todayRome = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const total = computed(() => props.booking?.totalPrice ?? 0);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    amount.value = props.booking.totalPrice;
    method.value = props.booking.paymentMethod ?? 'cash';
    date.value = props.booking.collectionDate ?? todayRome();
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    await settle.mutateAsync({
      id: props.booking.id,
      input: {
        amountCollected: amount.value,
        paymentMethod: amount.value > 0 ? method.value : undefined,
        collectionDate: amount.value > 0 ? date.value : undefined,
      },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 422
        ? 'Importo o metodo non validi.'
        : status === 409
          ? 'Prenotazione annullata.'
          : 'Errore durante la registrazione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Registra incasso" eyebrow="Incasso">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <p class="text-[13px] text-[var(--color-text-2nd)]">
        Totale dovuto:
        <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(total) }}</span>
      </p>

      <Field label="Importo incassato (€)">
        <input v-model.number="amount" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>

      <div class="flex gap-2">
        <Button type="button" variant="secondary" @click="amount = total">Salda tutto</Button>
        <Button type="button" variant="ghost" @click="amount = 0">Segna non pagato</Button>
      </div>

      <Field v-if="amount > 0" label="Metodo">
        <select v-model="method" :class="inputClass">
          <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </Field>

      <Field v-if="amount > 0" label="Data incasso">
        <input v-model="date" type="date" :class="inputClass" />
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <ModalFooter class="pt-2" submit-label="Conferma incasso" :submit-disabled="submitting" @cancel="open = false" @submit="confirm" />
    </div>
  </Modal>
</template>
