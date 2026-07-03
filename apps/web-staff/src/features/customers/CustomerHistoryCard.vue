<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { TYPE_LABEL } from '@/lib/statusMaps';

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
  <SectionCard title="Storico prenotazioni" icon="calendar" icon-bg="var(--color-accent-tint)" icon-ink="var(--color-accent)">
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <div v-for="[season, rows] in groups" :key="season" class="mb-4 last:mb-0">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">{{ season }}</span>
        <span class="text-[11px] text-[var(--color-text-muted)]">{{ rows.length }} prenotazioni</span>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in rows" :key="b.id"
            :class="['flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[13px]', b.status === 'cancelled' ? 'opacity-50' : '']">
          <span class="flex min-w-0 items-center gap-2">
            <Badge tone="brand">{{ TYPE_LABEL[b.type] }}</Badge>
            <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="tabular-nums font-semibold text-[var(--color-text)]">{{ `€ ${b.totalPrice.toFixed(2)}` }}</span>
            <Badge v-if="b.status === 'cancelled'" tone="danger">Annullata</Badge>
            <Badge v-else tone="success">Confermata</Badge>
          </span>
        </li>
      </ul>
    </div>
  </SectionCard>
</template>
