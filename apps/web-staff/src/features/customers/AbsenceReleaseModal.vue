<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { todayIso } from '@/lib/dates';
import { useReleaseAbsence } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const release = useReleaseAbsence(props.customerId);

const date = ref('');
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => {
  const t = todayIso();
  const s = props.booking?.startDate ?? t;
  return s > t ? s : t; // max(oggi, inizio abbonamento)
});
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const releasedDates = computed(
  () => new Set((props.booking?.absenceReleases ?? []).filter((r) => !r.canceledAt).map((r) => r.date)),
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    date.value = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    reason.value = '';
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  if (releasedDates.value.has(date.value)) {
    error.value = 'Assenza già registrata per quel giorno.';
    return;
  }
  error.value = '';
  submitting.value = true;
  try {
    await release.mutateAsync({ id: props.booking.id, input: { date: date.value, reason: reason.value || undefined } });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409
        ? 'Assenza già registrata per quel giorno.'
        : status === 422
          ? 'Dati non validi (consenso non attivo o data fuori periodo).'
          : 'Errore durante la registrazione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Segnala assenza" eyebrow="Assenze comunicate">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Giorno di assenza">
        <input v-model="date" data-testid="absence-date" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>
      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>
      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="absence-confirm" variant="primary" :disabled="submitting" @click="confirm">Segnala assenza</Button>
      </div>
    </div>
  </Modal>
</template>
