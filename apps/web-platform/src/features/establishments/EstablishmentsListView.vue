<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, ActionBar, Badge, ConfirmDialog, DataTable, PageToolbar, Icon, formatEuro } from '@coralyn/ui-kit';
import type { DataTableColumn } from '@coralyn/ui-kit';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import { useEstablishmentsList, useSuspendEstablishment, useReactivateEstablishment } from './usePlatformEstablishments';
import CreateEstablishmentModal from './CreateEstablishmentModal.vue';

const { data, isLoading } = useEstablishmentsList();
const establishments = computed(() => data.value ?? []);

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function fmtDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : '–';
}

const createOpen = ref(false);

const suspend = useSuspendEstablishment();
const reactivate = useReactivateEstablishment();

const pendingAction = ref<{ id: string; name: string; kind: 'suspend' | 'reactivate' } | null>(null);
const confirmOpen = ref(false);

function askSuspend(e: PlatformEstablishmentDTO): void {
  pendingAction.value = { id: e.id, name: e.name, kind: 'suspend' };
  confirmOpen.value = true;
}
function askReactivate(e: PlatformEstablishmentDTO): void {
  pendingAction.value = { id: e.id, name: e.name, kind: 'reactivate' };
  confirmOpen.value = true;
}

const confirmCopy = computed(() => {
  const p = pendingAction.value;
  if (!p) return { title: '', description: '', confirmLabel: '' };
  if (p.kind === 'suspend') {
    return { title: 'Sospendere il lido?', description: `«${p.name}» non sarà più accessibile allo staff fino alla riattivazione.`, confirmLabel: 'Sospendi' };
  }
  return { title: 'Riattivare il lido?', description: `«${p.name}» tornerà accessibile allo staff.`, confirmLabel: 'Riattiva' };
});

function onConfirmAction(): void {
  const p = pendingAction.value;
  confirmOpen.value = false;
  if (!p) return;
  if (p.kind === 'suspend') suspend.mutate(p.id);
  else reactivate.mutate(p.id);
  pendingAction.value = null;
}

function isSuspending(id: string): boolean {
  return suspend.isPending.value && suspend.variables.value === id;
}
function isReactivating(id: string): boolean {
  return reactivate.isPending.value && reactivate.variables.value === id;
}

const cols: DataTableColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'createdAt', label: 'Creato', numeric: true },
  { key: 'umbrellas', label: 'Ombrelloni', align: 'right', numeric: true },
  { key: 'staffUsersActive', label: 'Staff attivi', align: 'right', numeric: true },
  { key: 'revenueSeasonTotal', label: 'Incasso stagione', align: 'right', numeric: true },
  { key: 'occupancyPctToday', label: 'Occ. oggi', align: 'right', numeric: true },
  { key: 'lastActivityAt', label: 'Ultima attività', numeric: true },
  { key: 'suspendedAt', label: 'Stato' },
  { key: 'actions', label: 'Azioni', align: 'right' },
];
</script>

<template>
  <section class="max-w-[1200px] px-[26px] pb-[30px] pt-[22px]">
    <PageToolbar>
      <template #left>
        <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">Lidi</h2>
      </template>
      <template #right>
        <Button data-testid="new-establishment" @click="createOpen = true"><Icon name="plus" :size="14" />Nuovo lido</Button>
      </template>
    </PageToolbar>

    <DataTable
      :columns="cols"
      :rows="(establishments as unknown as Record<string, unknown>[])"
      :row-key="(r) => (r as unknown as PlatformEstablishmentDTO).id"
      :loading="isLoading"
      empty-message="Nessun lido registrato."
    >
      <template #cell-name="{ row }">
        <span data-testid="est-name" class="font-semibold text-[var(--color-text)]">{{ (row as unknown as PlatformEstablishmentDTO).name }}</span>
      </template>
      <template #cell-createdAt="{ row }">{{ fmtDate((row as unknown as PlatformEstablishmentDTO).createdAt) }}</template>
      <template #cell-revenueSeasonTotal="{ row }">{{ formatEuro((row as unknown as PlatformEstablishmentDTO).revenueSeasonTotal) }}</template>
      <template #cell-occupancyPctToday="{ row }">{{ (row as unknown as PlatformEstablishmentDTO).occupancyPctToday }}%</template>
      <template #cell-lastActivityAt="{ row }">{{ fmtDate((row as unknown as PlatformEstablishmentDTO).lastActivityAt) }}</template>
      <template #cell-suspendedAt="{ row }">
        <span class="inline-flex items-center gap-1.5">
          <Badge :tone="(row as unknown as PlatformEstablishmentDTO).suspendedAt ? 'neutral' : 'success'">{{ (row as unknown as PlatformEstablishmentDTO).suspendedAt ? 'Sospeso' : 'Attivo' }}</Badge>
          <Badge v-if="!(row as unknown as PlatformEstablishmentDTO).suspendedAt && !(row as unknown as PlatformEstablishmentDTO).setupComplete" tone="neutral" data-testid="setup-incomplete">Da configurare</Badge>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <ActionBar gap="sm" align="end">
          <RouterLink :to="`/establishments/${(row as unknown as PlatformEstablishmentDTO).id}`" data-testid="detail-link">
            <Button variant="secondary" size="sm">Dettaglio</Button>
          </RouterLink>
          <Button
            v-if="!(row as unknown as PlatformEstablishmentDTO).suspendedAt"
            :data-testid="`suspend-${(row as unknown as PlatformEstablishmentDTO).id}`"
            variant="secondary"
            size="sm"
            :loading="isSuspending((row as unknown as PlatformEstablishmentDTO).id)"
            @click="askSuspend(row as unknown as PlatformEstablishmentDTO)"
          >Sospendi</Button>
          <Button
            v-else
            :data-testid="`reactivate-${(row as unknown as PlatformEstablishmentDTO).id}`"
            variant="secondary"
            size="sm"
            :loading="isReactivating((row as unknown as PlatformEstablishmentDTO).id)"
            @click="askReactivate(row as unknown as PlatformEstablishmentDTO)"
          >Riattiva</Button>
        </ActionBar>
      </template>
    </DataTable>

    <CreateEstablishmentModal v-model:open="createOpen" />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.confirmLabel"
      @confirm="onConfirmAction"
    />
  </section>
</template>
