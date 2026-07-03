<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));

function seniorityLabel(n?: number): string {
  if (!n) return '';
  return n === 1 ? '1ª stagione' : `${n}ª stagione consecutiva`;
}
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Abbonamento e anzianità</div>
    <p v-if="subs.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessun abbonamento.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="b in subs" :key="b.id" class="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ b.seasonName ?? '—' }} · {{ b.umbrellaLabel }}</span>
          <Badge v-if="b.renewed" tone="success">Rinnovato</Badge>
        </div>
        <div class="mt-1 text-xs text-[var(--color-text-muted)]">{{ seniorityLabel(b.seniority) }}</div>
        <div v-if="b.prelazione" class="mt-1.5 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </div>
      </li>
    </ul>
  </Card>
</template>
