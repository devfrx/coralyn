<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { Button, Badge, DataTable, Avatar, EmptyState, Select, Option, ConfirmDialog, initials } from '@coralyn/ui-kit';
import type { RenewalWindowItemDTO, RenewalWindowState, SubscriptionListItemDTO } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking, useRenewalCampaign, useOpenCampaign, useCloseCampaign } from './useRenewals';
import { useSeasons } from '@/features/pricing/useSeasons';
import { useEntityLabels } from '@/lib/useEntityLabels';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);

const { data: seasons } = useSeasons();
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
const originSeasonId = ref('');       // stagione di ORIGINE (per id)
const destinationSeasonId = ref(''); // stagione di DESTINAZIONE (per id)
const deadline = ref('');            // scadenza per l'apertura di una nuova campagna

// Default origine: la stagione che contiene activeDate se presente, altrimenti la prima.
watchEffect(() => {
  const list = seasons.value ?? [];
  if (!originSeasonId.value && list.length) {
    const containing = list.find((s) => s.startDate <= activeDate.value && activeDate.value <= s.endDate);
    originSeasonId.value = (containing ?? list[0]).id;
  }
});

const { data: subs, isLoading: subsLoading } = useSubscriptions(originSeasonId);
const { data: campaign, isLoading: campaignLoading } = useRenewalCampaign(destinationSeasonId);
const renew = useRenewBooking();
const openCampaign = useOpenCampaign();
const closeCampaign = useCloseCampaign();
const { customerName, umbrellaLabel, retiredUmbrellaIds } = useEntityLabels();

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
  if (!destinationSeasonId.value) return;
  renew.mutate({ id, destinationSeasonId: destinationSeasonId.value });
}

function doOpenCampaign(): void {
  if (!destinationSeasonId.value || !deadline.value) return;
  openCampaign.mutate({ originSeasonId: originSeasonId.value, destinationSeasonId: destinationSeasonId.value, deadline: deadline.value });
}

const closeConfirmOpen = ref(false);
function askCloseCampaign(): void { closeConfirmOpen.value = true; }
function onConfirmClose(): void {
  if (campaign.value) closeCampaign.mutate(campaign.value.id);
  closeConfirmOpen.value = false;
}

function stateBadge(s: RenewalWindowState): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  if (s === 'exercised') return { tone: 'success', label: 'Rinnovato' };
  if (s === 'expired') return { tone: 'warning', label: 'Scaduta' };
  return { tone: 'neutral', label: 'Aperta' };
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-5 rounded-[14px] border border-[var(--color-border-row)] bg-[var(--color-raised)] p-4 text-[12.5px] leading-relaxed text-[var(--color-text-2nd)]">
      <p class="mb-1 font-semibold text-[var(--color-text)]">Prelazione abbonamenti</p>
      <p>
        Una <strong>campagna di prelazione</strong> riserva ogni ombrellone all'abbonato che lo aveva nella
        stagione precedente (un <strong>diritto di precedenza</strong> per anzianità) fino a una
        <strong>scadenza unica</strong>, valida per tutti gli aventi-diritto allo stesso modo. Finché è aperta,
        nessun altro può prenotare quei posti per la stagione di destinazione.
      </p>
      <p class="mt-1.5">
        Alla scadenza (o chiudendo la campagna) i posti non rinnovati <strong>tornano liberi da soli</strong>:
        non devi fare nulla e <strong>non va reimpostata</strong>. Per cambiare la scadenza, chiudi la campagna e riaprila.
      </p>
    </div>

    <div class="mb-4 flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di origine</span>
        <Select v-model="originSeasonId" data-test="origin-season" class="min-w-[170px]">
          <Option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</Option>
        </Select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di destinazione</span>
        <Select v-model="destinationSeasonId" data-test="destination-season" class="min-w-[170px]">
          <Option value="">Scegli…</Option>
          <Option v-for="o in seasonOptions" :key="o.value" :value="o.value">{{ o.label }}</Option>
        </Select>
      </label>
    </div>

    <div v-if="destinationSeasonId && !campaign && !campaignLoading" class="mb-5 flex flex-wrap items-end gap-4 rounded-[14px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] p-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Scadenza prelazione</span>
        <input type="date" v-model="deadline" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
      <Button size="sm" :disabled="!deadline" @click="doOpenCampaign">Apri campagna di prelazione</Button>
      <span class="text-[12px] text-[var(--color-text-muted)]">Dopo la scadenza, i posti tornano liberi per tutti.</span>
    </div>

    <div v-if="campaign" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] p-4">
      <span class="text-[13.5px] text-[var(--color-text)]">Scadenza campagna: <strong>{{ campaign.deadline }}</strong></span>
      <Button size="sm" @click="askCloseCampaign">Chiudi campagna</Button>
    </div>

    <div v-if="campaign" class="mb-2 flex flex-wrap gap-3 text-[11.5px] text-[var(--color-text-muted)]">
      <span class="inline-flex items-center gap-1.5"><Badge tone="neutral">Aperta</Badge> in attesa di rinnovo</span>
      <span class="inline-flex items-center gap-1.5"><Badge tone="success">Rinnovato</Badge> diritto esercitato</span>
      <span class="inline-flex items-center gap-1.5"><Badge tone="warning">Scaduta</Badge> finestra chiusa</span>
    </div>

    <DataTable v-if="campaign || campaignLoading" :columns="cols" :rows="(windowRows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as RenewalWindowItemDTO).sourceBookingId" :loading="campaignLoading" empty-message="Nessuna finestra di prelazione per questa campagna.">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName((row as unknown as RenewalWindowItemDTO).customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as RenewalWindowItemDTO).customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get((row as unknown as RenewalWindowItemDTO).umbrellaId) ?? '–' }}</span> <Badge v-if="retiredUmbrellaIds.has((row as unknown as RenewalWindowItemDTO).umbrellaId)" tone="neutral">Ritirato</Badge></template>
      <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as RenewalWindowItemDTO).seniority }} {{ (row as unknown as RenewalWindowItemDTO).seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
      <template #cell-stato="{ row }">
        <Badge :tone="stateBadge((row as unknown as RenewalWindowItemDTO).state).tone">{{ stateBadge((row as unknown as RenewalWindowItemDTO).state).label }}</Badge>
      </template>
      <template #cell-azione="{ row }">
        <Button size="sm" :disabled="(row as unknown as RenewalWindowItemDTO).state === 'exercised' || !destinationSeasonId"
          :loading="renew.isPending.value && renew.variables.value?.id === (row as unknown as RenewalWindowItemDTO).sourceBookingId"
          @click="doRenew((row as unknown as RenewalWindowItemDTO).sourceBookingId)">Rinnova</Button>
      </template>
    </DataTable>

    <template v-else>
      <EmptyState v-if="!destinationSeasonId" message="Scegli una stagione di destinazione per gestire i rinnovi." />
      <template v-else>
        <DataTable :columns="cols" :rows="(rows as unknown as Record<string, unknown>[])" :row-key="(r) => (r as unknown as SubscriptionListItemDTO).id" :loading="subsLoading" empty-message="Nessun abbonato nella stagione di origine.">
          <template #cell-cliente="{ row }">
            <div class="flex items-center gap-2.5">
              <Avatar :initials="initials(customerName((row as unknown as SubscriptionListItemDTO).customerId))" size="sm" />
              <span class="font-semibold text-[var(--color-text)]">{{ customerName((row as unknown as SubscriptionListItemDTO).customerId) }}</span>
            </div>
          </template>
          <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get((row as unknown as SubscriptionListItemDTO).umbrellaId) ?? '–' }}</span> <Badge v-if="retiredUmbrellaIds.has((row as unknown as SubscriptionListItemDTO).umbrellaId)" tone="neutral">Ritirato</Badge></template>
          <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ (row as unknown as SubscriptionListItemDTO).seniority }} {{ (row as unknown as SubscriptionListItemDTO).seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
          <template #cell-stato="{ row }">
            <Badge :tone="(row as unknown as SubscriptionListItemDTO).renewed ? 'success' : 'neutral'">{{ (row as unknown as SubscriptionListItemDTO).renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
          </template>
          <template #cell-azione="{ row }">
            <Button size="sm" :disabled="(row as unknown as SubscriptionListItemDTO).renewed"
              :loading="renew.isPending.value && renew.variables.value?.id === (row as unknown as SubscriptionListItemDTO).id"
              @click="doRenew((row as unknown as SubscriptionListItemDTO).id)">Rinnova</Button>
          </template>
        </DataTable>
      </template>
    </template>

    <ConfirmDialog
      v-model:open="closeConfirmOpen"
      title="Chiudere la campagna?"
      description="Gli ombrelloni riservati per prelazione tornano liberi per tutti."
      confirm-label="Chiudi"
      tone="danger"
      @confirm="onConfirmClose"
    />
  </section>
</template>
