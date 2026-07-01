<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Badge, DataTable, Avatar } from '@coralyn/ui-kit';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking } from './useRenewals';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const sourceDate = ref(activeDate.value); // una data nella stagione di ORIGINE
const targetDate = ref('');               // una data nella stagione di DESTINAZIONE

const { data: subs } = useSubscriptions(sourceDate);
const { data: customers } = useCustomers();
const { data: map } = useDayMap(); // le label ombrellone non dipendono dalla data
const renew = useRenewBooking();

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone' },
  { key: 'anzianita', label: 'Anzianità' },
  { key: 'stato', label: 'Stato' },
  { key: 'azione', label: '', align: 'right' as const },
];

const rows = computed(() => subs.value ?? []);
const customerName = (id: string): string => {
  const c = (customers.value ?? []).find((x) => x.id === id);
  return c ? `${c.firstName} ${c.lastName}` : id;
};
const umbrellaLabel = computed(() => {
  const m = new Map<string, string>();
  for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
  return m;
});
const initials = (name: string): string => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

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

    <DataTable v-if="rows.length" :columns="cols">
      <tr v-for="b in rows" :key="b.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5">
            <Avatar :initials="initials(customerName(b.customerId))" size="sm" />
            <span class="font-semibold text-[var(--color-text)]">{{ customerName(b.customerId) }}</span>
          </div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(b.umbrellaId) ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ b.seniority }} {{ b.seniority === 1 ? 'stagione' : 'stagioni' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5">
          <Badge :tone="b.renewed ? 'success' : 'neutral'">{{ b.renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <Button :disabled="b.renewed || !targetDate" @click="doRenew(b.id)">Rinnova</Button>
        </td>
      </tr>
    </DataTable>
    <p v-else class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]">
      Nessun abbonato per questa stagione.
    </p>
  </section>
</template>
