<script setup lang="ts">
// Modale cliente per segnalare un'assenza (D-035 S4). Mirror di
// apps/web-staff/.../AbsenceReleaseModal.vue (S2, operatore), adattato: nessun campo
// operator-only, il cliente sceglie solo un giorno dentro il proprio abbonamento (≥ oggi).
import { ref, watch, computed } from 'vue';
import { Modal, Field, Input, Textarea, Button } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { todayIso } from '@/lib/dates';
import { useReleaseAbsence } from './useMySubscriptions';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null }>();

const release = useReleaseAbsence(() => props.booking?.id ?? '');

const date = ref('');
const reason = ref('');
const error = ref('');

// min = max(oggi, inizio abbonamento); max = fine abbonamento — stesso vincolo del server.
const minDate = computed(() => {
  const t = todayIso();
  const s = props.booking?.startDate ?? t;
  return s > t ? s : t;
});
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const releasedDates = computed(
  () => new Set((props.booking?.absenceReleases ?? []).filter((r) => !r.canceledAt).map((r) => r.date)),
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    date.value = clampDate(minDate.value, minDate.value, maxDate.value);
    reason.value = '';
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  // Guardia UX: l'input nativo type=date con min/max impedisce già la selezione fuori range,
  // ma non protegge da input non-standard (autofill, devtools, browser che ignorano min/max).
  // Il backend resta l'autorità (422 sotto); qui evitiamo solo una mutation inutile.
  if (date.value < minDate.value || date.value > maxDate.value) {
    error.value = 'Seleziona un giorno valido per questo abbonamento.';
    return;
  }
  if (releasedDates.value.has(date.value)) {
    error.value = 'Assenza già registrata per quel giorno.';
    return;
  }
  error.value = '';
  try {
    await release.mutateAsync({ date: date.value, reason: reason.value || undefined });
    open.value = false;
  } catch (e) {
    // Nessun dettaglio server oltre a ciò che il cliente può già dedurre dalla UI: il 409 è lo
    // stesso caso già intercettato lato client; il 422 (consenso non attivo / data fuori periodo)
    // resta generico — il server è l'autorità sulle guardie.
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409
        ? 'Assenza già registrata per quel giorno.'
        : status === 422
          ? 'Non è stato possibile registrare l’assenza per questo giorno.'
          : 'Errore durante la registrazione. Riprova.';
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Segnala assenza" eyebrow="Assenze comunicate">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <p data-testid="absence-prompt" class="text-[13px] text-[var(--color-text-2nd)]">
        <template v-if="booking.umbrellaLabel"
          >Comunica un giorno in cui sei sicuro di non essere presente su <b>{{ booking.umbrellaLabel }}</b>.</template
        ><template v-else>Comunica un giorno in cui sei sicuro di non essere presente.</template>
      </p>
      <Field label="Giorno di assenza">
        <Input v-model="date" data-testid="absence-date" type="date" :min="minDate" :max="maxDate" />
      </Field>
      <Field label="Motivo (facoltativo)">
        <Textarea v-model="reason" :rows="2" data-testid="absence-reason" placeholder="es. impegno di lavoro" />
      </Field>
      <p v-if="error" data-testid="absence-error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button
          type="button"
          data-testid="absence-confirm"
          variant="primary"
          :loading="release.isPending.value"
          @click="confirm"
        >Segnala assenza</Button>
      </div>
    </div>
  </Modal>
</template>
