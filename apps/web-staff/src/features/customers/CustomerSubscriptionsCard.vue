<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Callout, Badge, Button, Icon, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { todayIso } from '@/lib/dates';

const props = defineProps<{ bookings: CustomerBookingDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ terminate: [CustomerBookingDTO] }>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));

const canTerminate = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt && b.endDate >= todayIso();
const terminatedDay = (iso: string): string => iso.slice(0, 10);
</script>
<template>
  <SectionCard title="Abbonamento e anzianità" icon="star">
    <p v-if="subs.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessun abbonamento.</p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="b in subs" :key="b.id" class="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3.5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}</span>
              <Badge v-if="b.packageName" tone="brand">{{ b.packageName }}</Badge>
              <Badge v-if="b.renewed" tone="success">Rinnovato</Badge>
            </div>
            <div class="mt-1.5 text-[13px] font-semibold text-[var(--color-text)]">{{ b.seasonName ?? '—' }} · posto riservato</div>
            <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Abbonato da {{ b.seniority ?? 1 }} {{ (b.seniority ?? 1) === 1 ? 'stagione' : 'stagioni consecutive' }}</div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-2">
            <div class="text-right">
              <div class="text-[26px] font-bold leading-none tabular-nums text-[var(--color-text)]">{{ b.seniority ?? 1 }}</div>
              <div class="mt-1 text-[10px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ (b.seniority ?? 1) === 1 ? 'STAGIONE' : 'STAGIONI' }}</div>
            </div>
            <Button v-if="isAdmin && canTerminate(b)" variant="danger" :data-testid="`terminate-${b.id}`" @click="emit('terminate', b)"><Icon name="trash-2" :size="15" />Disdici</Button>
          </div>
        </div>
        <Callout v-if="b.prelazione" tone="warm" class="mt-3">
          <template #icon><Icon name="clock" :size="15" /></template>
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </Callout>
        <div v-if="b.terminatedAt" class="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          Disdetto il {{ terminatedDay(b.terminatedAt) }} · rimborso {{ formatEuro(b.refundedAmount ?? 0) }}<span v-if="b.terminationReason"> · {{ b.terminationReason }}</span>
        </div>
      </li>
    </ul>
  </SectionCard>
</template>
