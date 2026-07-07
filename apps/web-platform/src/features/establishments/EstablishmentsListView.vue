<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, ActionBar, Badge, ConfirmDialog, EmptyState, PageToolbar, Icon, formatEuro, TD, TD_FIRST, TD_RIGHT, TD_NUM } from '@coralyn/ui-kit';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import { useEstablishmentsList, useSuspendEstablishment, useReactivateEstablishment } from './usePlatformEstablishments';
import CreateEstablishmentModal from './CreateEstablishmentModal.vue';

const { data, isLoading } = useEstablishmentsList();
const establishments = computed(() => data.value ?? []);

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function fmtDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : '—';
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

    <p v-if="isLoading" class="py-10 text-center text-sm text-[var(--color-text-muted)]">Caricamento…</p>

    <EmptyState v-else-if="establishments.length === 0" message="Nessun lido registrato." />

    <div v-else class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="bg-[var(--color-raised)]">
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-left text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Nome</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-left text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Creato</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-right text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Ombrelloni</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-right text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Staff attivi</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-right text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Incasso stagione</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-right text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Occ. oggi</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-left text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Ultima attività</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-left text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Stato</th>
            <th class="border-b border-[var(--color-border)] px-[18px] py-3 text-right text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]">Azioni</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in establishments" :key="e.id" data-testid="est-row" class="hover:bg-[var(--color-raised)]">
            <td :class="TD_FIRST">
              <span data-testid="est-name" class="font-semibold text-[var(--color-text)]">{{ e.name }}</span>
            </td>
            <td :class="[TD, TD_NUM]">{{ fmtDate(e.createdAt) }}</td>
            <td :class="[TD_RIGHT, TD_NUM]">{{ e.umbrellas }}</td>
            <td :class="[TD_RIGHT, TD_NUM]">{{ e.staffUsersActive }}</td>
            <td :class="[TD_RIGHT, TD_NUM]">{{ formatEuro(e.revenueSeasonTotal) }}</td>
            <td :class="[TD_RIGHT, TD_NUM]">{{ e.occupancyPctToday }}%</td>
            <td :class="[TD, TD_NUM]">{{ fmtDate(e.lastActivityAt) }}</td>
            <td :class="TD">
              <Badge :tone="e.suspendedAt ? 'neutral' : 'success'">{{ e.suspendedAt ? 'Sospeso' : 'Attivo' }}</Badge>
            </td>
            <td :class="TD_RIGHT">
              <ActionBar gap="sm" align="end">
                <RouterLink :to="`/establishments/${e.id}`" data-testid="detail-link">
                  <Button variant="secondary" size="sm">Dettaglio</Button>
                </RouterLink>
                <Button
                  v-if="!e.suspendedAt"
                  :data-testid="`suspend-${e.id}`"
                  variant="secondary"
                  size="sm"
                  :disabled="isSuspending(e.id)"
                  @click="askSuspend(e)"
                >Sospendi</Button>
                <Button
                  v-else
                  :data-testid="`reactivate-${e.id}`"
                  variant="secondary"
                  size="sm"
                  :disabled="isReactivating(e.id)"
                  @click="askReactivate(e)"
                >Riattiva</Button>
              </ActionBar>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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
