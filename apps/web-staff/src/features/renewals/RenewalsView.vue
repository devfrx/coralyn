<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Badge, DataTable, Avatar, EmptyState, initials } from '@coralyn/ui-kit';
import type { RenewalWindowItemDTO, RenewalWindowState, SubscriptionListItemDTO } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking, useRenewalCampaign, useOpenCampaign, useCloseCampaign } from './useRenewals';
import { useEntityLabels } from '@/lib/useEntityLabels';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const sourceDate = ref(activeDate.value); // una data nella stagione di ORIGINE
const targetDate = ref('');               // una data nella stagione di DESTINAZIONE
const deadline = ref('');                 // scadenza per l'apertura di una nuova campagna

const { data: subs } = useSubscriptions(sourceDate);
const { data: campaign } = useRenewalCampaign(targetDate);
const renew = useRenewBooking();
const openCampaign = useOpenCampaign();
const closeCampaign = useCloseCampaign();
const { customerName, umbrellaLabel } = useEntityLabels();

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone', numeric: true },
  { key: 'anzianita', label: 'Anzianità', numeric: true },
  { key: 'stato', label: 'Stato' },
  { key: 'azione', label: '', align: 'right' as const },
];

const rows = computed(() => subs.value ?? []);
const windowRows = computed(() => campaign.value?.windows ?? []);

function doRenew(id: string): void {
  if (!targetDate.value) return;
  renew.mutate({ id, startDate: targetDate.value });
}

function doOpenCampaign(): void {
  if (!targetDate.value || !deadline.value) return;
  openCampaign.mutate({ originDate: sourceDate.value, destinationDate: targetDate.value, deadline: deadline.value });
}

function doCloseCampaign(): void {
  if (!campaign.value) return;
  closeCampaign.mutate(campaign.value.id);
}

function stateBadge(s: RenewalWindowState): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  if (s === 'exercised') return { tone: 'success', label: 'Rinnovato' };
  if (s === 'expired') return { tone: 'warning', label: 'Scaduta' };
  return { tone: 'neutral', label: 'Aperta' };
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

    <div v-if="targetDate && !campaign" class="mb-5 flex flex-wrap items-end gap-4 rounded-[14px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] p-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Scadenza prelazione</span>
        <input type="date" v-model="deadline" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
      <Button :disabled="!deadline" @click="doOpenCampaign">Apri campagna di prelazione</Button>
    </div>

    <div v-if="campaign" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] p-4">
      <span class="text-[13.5px] text-[var(--color-text)]">Scadenza campagna: <strong>{{ campaign.deadline }}</strong></span>
      <Button @click="doCloseCampaign">Chiudi campagna</Button>
    </div>

    <DataTable v-if="campaign && windowRows.length" :columns="cols" :rows="(windowRows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as RenewalWindowItemDTO).sourceBookingId">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as RenewalWindowItemDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as RenewalWindowItemDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get((row as unknown as RenewalWindowItemDTO).umbrellaId) ?? '—' }}</span></template>
      <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RenewalWindowItemDTO).seniority }} {{ (row as unknown as RenewalWindowItemDTO).seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
      <template #cell-stato="{ row }">
        <Badge :tone="stateBadge((row as unknown as RenewalWindowItemDTO).state).tone">{{ stateBadge((row as unknown as RenewalWindowItemDTO).state).label }}</Badge>
      </template>
      <template #cell-azione="{ row }">
        <Button :disabled="(row as unknown as RenewalWindowItemDTO).state === 'exercised' || !targetDate" @click="doRenew((row as unknown as RenewalWindowItemDTO).sourceBookingId)">Rinnova</Button>
      </template>
    </DataTable>
    <EmptyState v-else-if="campaign" message="Nessuna finestra di prelazione per questa campagna." />

    <template v-else>
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
    </template>
  </section>
</template>
