<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { TYPE_LABEL, PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();

// Raggruppa per stagione (già ordinati desc dal server); gruppi ordinati dal più recente.
const groups = computed(() => {
  const map = new Map<string, CustomerBookingDTO[]>();
  for (const b of props.bookings) {
    const key = b.seasonName ?? 'Senza stagione';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return [...map.entries()];
});
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Storico prenotazioni</div>
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <div v-for="[season, rows] in groups" :key="season" class="mb-4">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">{{ season }}</div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in rows" :key="b.id"
            :class="['flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[13px]', b.status === 'cancelled' ? 'opacity-50' : '']">
          <span class="tabular-nums text-[var(--color-text-2nd)]">{{ b.startDate }}<template v-if="b.endDate !== b.startDate"> → {{ b.endDate }}</template></span>
          <span class="flex items-center gap-2">
            <Badge tone="neutral">{{ TYPE_LABEL[b.type] }}</Badge>
            <span class="text-[var(--color-text-muted)]">{{ b.umbrellaLabel }}</span>
            <span class="tabular-nums font-semibold">{{ b.totalPrice.toFixed(2) }} €</span>
            <Badge v-if="b.status === 'cancelled'" tone="danger">Annullata</Badge>
            <Badge v-else :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge>
          </span>
        </li>
      </ul>
    </div>
  </Card>
</template>
