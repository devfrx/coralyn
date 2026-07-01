<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Badge, DataTable, Avatar, EmptyState, initials } from '@coralyn/ui-kit';
import type { SubscriptionListItemDTO } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking } from './useRenewals';
import { useEntityLabels } from '@/lib/useEntityLabels';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const sourceDate = ref(activeDate.value); // una data nella stagione di ORIGINE
const targetDate = ref('');               // una data nella stagione di DESTINAZIONE

const { data: subs } = useSubscriptions(sourceDate);
const renew = useRenewBooking();
const { customerName, umbrellaLabel } = useEntityLabels();

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'anzianita', label: 'Anzianità', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'azione', label: '', align: 'right' as const },
];

const rows = computed(() => subs.value ?? []);

function doRenew(id: string): void {
  if (!targetDate.value) return;
  renew.mutate({ id, startDate: targetDate.value });
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-4 flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di origine</span>
        <input type="date" v-model="sourceDate" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di destinazione</span>
        <input type="date" v-model="targetDate" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
    </div>

    <DataTable v-if="rows.length" :columns="cols" :rows="(rows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as SubscriptionListItemDTO).id">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as SubscriptionListItemDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as SubscriptionListItemDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get((row as unknown as SubscriptionListItemDTO).umbrellaId) ?? '—' }}</span></template>
      <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as SubscriptionListItemDTO).seniority }} {{ (row as unknown as SubscriptionListItemDTO).seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
      <template #cell-stato="{ row }">
        <Badge :tone="(row as unknown as SubscriptionListItemDTO).renewed ? 'success' : 'neutral'">{{ (row as unknown as SubscriptionListItemDTO).renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
      </template>
      <template #cell-azione="{ row }">
        <Button :disabled="(row as unknown as SubscriptionListItemDTO).renewed || !targetDate" @click="doRenew((row as unknown as SubscriptionListItemDTO).id)">Rinnova</Button>
      </template>
    </DataTable>
    <EmptyState v-else message="Nessun abbonato per questa stagione." />
  </section>
</template>
