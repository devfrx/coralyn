<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Callout, Badge, Button, Icon, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO, SuspensionDTO, CededSubscriptionDTO } from '@coralyn/contracts';
import { todayIso } from '@/lib/dates';

const props = defineProps<{ bookings: CustomerBookingDTO[]; ceded?: CededSubscriptionDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{
  terminate: [CustomerBookingDTO];
  suspend: [CustomerBookingDTO];
  reactivate: [{ booking: CustomerBookingDTO; suspension: SuspensionDTO }];
  transfer: [CustomerBookingDTO];
  consent: [CustomerBookingDTO];
  absence: [CustomerBookingDTO];
  cancelAbsence: [{ booking: CustomerBookingDTO; releaseId: string }];
}>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));

const openSuspension = (b: CustomerBookingDTO): SuspensionDTO | undefined =>
  (b.suspensions ?? []).find((s) => !s.endDate);
const canTerminate = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt && b.endDate >= todayIso() && !openSuspension(b);
const pastSuspensions = (b: CustomerBookingDTO): SuspensionDTO[] =>
  (b.suspensions ?? []).filter((s) => s.endDate);
const canSuspend = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt && b.endDate >= todayIso() && !openSuspension(b);
const canToggleConsent = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt;
const dayOf = (iso: string): string => iso.slice(0, 10);
const consentActive = (b: CustomerBookingDTO): boolean => !!b.absenceConsentAt;
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
            <Button v-if="isAdmin && canSuspend(b)" variant="secondary" :data-testid="`suspend-${b.id}`" @click="emit('suspend', b)"><Icon name="clock" :size="15" />Sospendi</Button>
            <Button v-if="isAdmin && canSuspend(b)" variant="secondary" :data-testid="`transfer-${b.id}`" @click="emit('transfer', b)"><Icon name="renew" :size="15" />Cedi</Button>
            <Button v-if="isAdmin && canToggleConsent(b)" variant="secondary" :data-testid="`absence-consent-${b.id}`" @click="emit('consent', b)"><Icon name="check" :size="15" />{{ consentActive(b) ? 'Revoca assenze' : 'Attiva assenze' }}</Button>
            <Button v-if="isAdmin && canSuspend(b) && consentActive(b)" variant="secondary" :data-testid="`absence-${b.id}`" @click="emit('absence', b)"><Icon name="calendar" :size="15" />Segnala assenza</Button>
          </div>
        </div>
        <Callout v-if="b.prelazione" tone="warm" class="mt-3">
          <template #icon><Icon name="clock" :size="15" /></template>
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </Callout>
        <div v-if="b.terminatedAt" class="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          Disdetto il {{ dayOf(b.terminatedAt) }} · rimborso {{ formatEuro(b.refundedAmount ?? 0) }}<span v-if="b.terminationReason"> · {{ b.terminationReason }}</span>
        </div>
        <div v-if="openSuspension(b)" class="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warm-100,#FBEFE7)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          <span class="flex-1">Sospeso dal {{ dayOf(openSuspension(b)!.startDate) }} (in corso)</span>
          <Button v-if="isAdmin && b.status === 'confirmed' && !b.terminatedAt" variant="primary" :data-testid="`reactivate-${b.id}`" @click="emit('reactivate', { booking: b, suspension: openSuspension(b)! })">Riattiva</Button>
        </div>
        <div v-for="s in pastSuspensions(b)" :key="s.id" class="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          Sospeso dal {{ dayOf(s.startDate) }} al {{ dayOf(s.endDate!) }} · rimborso {{ formatEuro(s.refundedAmount) }}<span v-if="s.reason"> · {{ s.reason }}</span>
        </div>
        <div v-for="r in (b.absenceReleases ?? [])" :key="r.id" class="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)] flex items-center justify-between">
          <span>Assente il {{ r.date }}<template v-if="r.canceledAt"> · annullata</template><template v-else-if="r.resold"> · rivenduta</template></span>
          <Button v-if="isAdmin && !r.canceledAt && !r.resold && b.status === 'confirmed' && !b.terminatedAt && !openSuspension(b)" variant="ghost" :data-testid="`absence-cancel-${r.id}`" @click="emit('cancelAbsence', { booking: b, releaseId: r.id })">Annulla</Button>
        </div>
      </li>
    </ul>
    <div v-if="(ceded ?? []).length" class="mt-4 border-t border-[var(--color-border)] pt-3">
      <div class="mb-2 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cessioni effettuate</div>
      <div v-for="c in ceded" :key="c.transferId" class="mb-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
        Ombrellone {{ c.umbrellaLabel }} ceduto a {{ c.newCustomerName }} il {{ c.effectiveDate.slice(0, 10) }}<span v-if="c.refundToPrevious"> · rimborso {{ formatEuro(c.refundToPrevious) }}</span><span v-if="c.reason"> · {{ c.reason }}</span>
      </div>
    </div>
  </SectionCard>
</template>
