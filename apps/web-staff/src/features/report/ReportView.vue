<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { ReportPeriod, SlotState } from '@coralyn/contracts';
import { KpiCard, ChartBar, ChartDonut, SegmentedControl, Card, Avatar, Button, Icon, formatEuro } from '@coralyn/ui-kit';
import { useReportSummary } from './useReport';
import { stateColor, accentColor } from '@/lib/chartColors';

const STATE_LABEL: Record<SlotState, string> = { free: 'Libero', season: 'Abbonato', daily: 'Giornaliero', booked: 'Prenotato', covered: 'Non disponibile' };

const router = useRouter();
const period = ref<ReportPeriod>('week');
const { data } = useReportSummary(period);

const periodOptions = [
  { value: 'today', label: 'Oggi' }, { value: 'week', label: 'Settimana' }, { value: 'season', label: 'Stagione' },
];
const snapshotSuffix = computed(() => (period.value === 'today' ? '' : ' · ora'));

const revenueBars = computed(() =>
  (data.value?.revenueSeries ?? []).map((p) => ({ label: p.label, value: p.value, display: formatEuro(p.value) })));
const mixSegments = computed(() =>
  (data.value?.umbrellaStateMix ?? []).map((m) => ({ label: STATE_LABEL[m.state], value: m.pct, color: stateColor(m.state) })));
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-[18px] flex items-center justify-between">
      <SegmentedControl v-model="period" :options="periodOptions" />
    </div>

    <div class="mb-[18px] grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      <KpiCard icon="euro" iconBg="var(--color-accent-tint)" iconInk="var(--color-accent)" label="Incasso" :value="formatEuro(data?.kpis.revenue ?? 0)" />
      <KpiCard icon="clock" iconBg="var(--color-warning-bg)" iconInk="var(--color-warning-ink)" :label="`Da incassare${snapshotSuffix}`" :value="formatEuro(data?.kpis.outstanding ?? 0)" />
      <KpiCard icon="chart" iconBg="var(--color-brand-tint)" iconInk="var(--color-brand-ink)" :label="`Occupazione${snapshotSuffix}`" :value="`${data?.kpis.occupancyPct ?? 0}%`" />
      <KpiCard icon="star" iconBg="var(--color-success-bg)" iconInk="var(--color-success-ink)" :label="`Abbonamenti${snapshotSuffix}`" :value="String(data?.kpis.activeSubscriptions ?? 0)" />
    </div>

    <div class="mb-3.5 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5">
      <Card><div class="p-5">
        <span class="text-sm font-bold text-[var(--color-text)]">Incassi</span>
        <div class="mt-[18px]"><ChartBar :data="revenueBars" :color="accentColor()" ariaLabel="Incassi per periodo" /></div>
      </div></Card>
      <Card><div class="p-5">
        <span class="text-sm font-bold text-[var(--color-text)]">Stato ombrelloni · ora</span>
        <div class="mt-[18px]"><ChartDonut :data="mixSegments" ariaLabel="Stato ombrelloni attuale" /></div>
      </div></Card>
    </div>

    <Card><div class="p-5">
      <div class="mb-3.5 flex items-center justify-between">
        <span class="text-sm font-bold text-[var(--color-text)]">Abbonamenti in scadenza</span>
        <span class="text-xs text-[var(--color-text-muted)]">Campagna rinnovi</span>
      </div>
      <div v-if="(data?.expiringRenewals ?? []).length" class="flex flex-col">
        <div v-for="r in data!.expiringRenewals" :key="r.customerId" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-2.5 last:border-0">
          <Avatar :initials="r.customerName.split(' ').map((n) => n[0]).join('').slice(0, 2)" size="sm" />
          <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.customerName }}</div>
            <div class="text-[11.5px] tabular-nums text-[var(--color-text-muted)]">Ombrellone {{ r.umbrellaLabel }} · {{ r.seniority }} stagioni</div>
          </div>
          <span class="text-xs tabular-nums text-[var(--color-text-2nd)]">Scade {{ r.deadline }}</span>
          <Button variant="secondary" size="sm" @click="router.push(`/customers/${r.customerId}`)"><Icon name="renew" :size="14" />Rinnova</Button>
        </div>
      </div>
      <p v-else class="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Nessun abbonamento in scadenza.</p>
    </div></Card>
  </section>
</template>
