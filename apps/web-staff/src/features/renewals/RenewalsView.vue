<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { Button, Badge, DataTable, QueryBoundary, Avatar, EmptyState, Select, Option, ConfirmDialog, initials } from '@coralyn/ui-kit';
// RenewalWindowItemDTO e SubscriptionListItemDTO non si importano più: le due tabelle di questa
// vista li INFERISCONO da `rows`. `cols` è condiviso fra le due proprio perché nessuna colonna
// dichiara `sortValue` — l'unico punto in cui DataTableColumn<T> vincola la riga. Se un domani
// servisse ordinare, il typecheck lo dirà chiedendo due elenchi di colonne distinti.
import type { RenewalWindowState } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking, useRenewalCampaign, useOpenCampaign, useCloseCampaign } from './useRenewals';
import { seasonIdCoveringDate } from '@/lib/seasons';
import { useSeasons } from '@/features/pricing/useSeasons';
import { useEntityLabels } from '@/lib/useEntityLabels';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);

const canManagePricing = computed(() => session.hasPermission(Permission.PricingManage));
const canManageBookings = computed(() => session.hasPermission(Permission.BookingsManage));

const { data: seasons } = useSeasons();
const seasonOptions = computed(() => (seasons.value ?? []).map((s) => ({ value: s.id, label: s.name })));
const originSeasonId = ref('');       // stagione di ORIGINE (per id)
const destinationSeasonId = ref(''); // stagione di DESTINAZIONE (per id)
const deadline = ref('');            // scadenza per l'apertura di una nuova campagna

// Default origine: la stagione che contiene activeDate se presente, altrimenti la prima.
watchEffect(() => {
  const list = seasons.value ?? [];
  if (!originSeasonId.value && list.length) {
    originSeasonId.value = seasonIdCoveringDate(list, activeDate.value);
  }
});

const { data: subs, isLoading: subsLoading, error: subsError, refetch: refetchSubs } = useSubscriptions(originSeasonId);
const { data: campaign, isLoading: campaignLoading, error: campaignError, refetch: refetchCampaign } = useRenewalCampaign(destinationSeasonId);
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
      <!-- ⚠️ I Rinnovi compongono due endpoint di ALTRI permessi (ADR-0063): le stagioni stanno
           sotto `pricing.manage` e gli abbonati sotto `bookings.manage`, non sotto
           `renewals.manage`. Senza, i due selettori e la tabella restano vuoti senza dire perché. -->
      <p v-if="!canManagePricing" data-testid="seasons-denied" class="self-end text-[11.5px] text-[var(--color-text-muted)]">
        Non hai accesso al listino: senza stagioni i rinnovi non sono gestibili.
      </p>
      <p v-else-if="!canManageBookings" data-testid="subscriptions-denied" class="self-end text-[11.5px] text-[var(--color-text-muted)]">
        Non hai accesso alle prenotazioni: l'elenco degli abbonati non è disponibile.
      </p>
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

    <!-- Il v-if sta sul boundary, non sulla tabella: il suo `v-else` è un fratello, e separarli
         rompeva la compilazione del template. `campaignError` è nella condizione perché su guasto
         `campaign` è undefined e `campaignLoading` false — senza, un errore cadrebbe nel ramo
         v-else e tornerebbe a essere reso come «scegli una stagione». -->
    <QueryBoundary
      v-if="campaign || campaignLoading || campaignError"
      :error="campaignError"
      error-title="Campagna non disponibile"
      @retry="refetchCampaign"
    >
    <DataTable :columns="cols" :rows="windowRows" :row-key="(r) => r.sourceBookingId" :loading="campaignLoading" empty-message="Nessuna finestra di prelazione per questa campagna.">
      <template #cell-cliente="{ row }">
        <div class="flex items-center gap-2.5">
          <Avatar :initials="initials(customerName(row.customerId))" size="sm" />
          <span class="font-semibold text-[var(--color-text)]">{{ customerName(row.customerId) }}</span>
        </div>
      </template>
      <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(row.umbrellaId) ?? '–' }}</span> <Badge v-if="retiredUmbrellaIds.has(row.umbrellaId)" tone="neutral">Ritirato</Badge></template>
      <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ row.seniority }} {{ row.seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
      <template #cell-stato="{ row }">
        <Badge :tone="stateBadge(row.state).tone">{{ stateBadge(row.state).label }}</Badge>
      </template>
      <template #cell-azione="{ row }">
        <Button size="sm" :disabled="row.state === 'exercised' || !destinationSeasonId"
          :loading="renew.isPending.value && renew.variables.value?.id === row.sourceBookingId"
          @click="doRenew(row.sourceBookingId)">Rinnova</Button>
      </template>
    </DataTable>
    </QueryBoundary>

    <template v-else>
      <EmptyState v-if="!destinationSeasonId" message="Scegli una stagione di destinazione per gestire i rinnovi." />
      <template v-else>
        <QueryBoundary :error="subsError" error-title="Abbonati non disponibili" @retry="refetchSubs">
        <DataTable :columns="cols" :rows="rows" :row-key="(r) => r.id" :loading="subsLoading" empty-message="Nessun abbonato nella stagione di origine.">
          <template #cell-cliente="{ row }">
            <div class="flex items-center gap-2.5">
              <Avatar :initials="initials(customerName(row.customerId))" size="sm" />
              <span class="font-semibold text-[var(--color-text)]">{{ customerName(row.customerId) }}</span>
            </div>
          </template>
          <template #cell-ombrellone="{ row }"><span class="text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(row.umbrellaId) ?? '–' }}</span> <Badge v-if="retiredUmbrellaIds.has(row.umbrellaId)" tone="neutral">Ritirato</Badge></template>
          <template #cell-anzianita="{ row }"><span class="text-[var(--color-text-2nd)]">{{ row.seniority }} {{ row.seniority === 1 ? 'stagione' : 'stagioni' }}</span></template>
          <template #cell-stato="{ row }">
            <Badge :tone="row.renewed ? 'success' : 'neutral'">{{ row.renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
          </template>
          <template #cell-azione="{ row }">
            <Button size="sm" :disabled="row.renewed"
              :loading="renew.isPending.value && renew.variables.value?.id === row.id"
              @click="doRenew(row.id)">Rinnova</Button>
          </template>
        </DataTable>
        </QueryBoundary>
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
