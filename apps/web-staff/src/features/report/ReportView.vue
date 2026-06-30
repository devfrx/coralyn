<script setup lang="ts">
import { KpiCard, BarChart, StackedBar, Card, Avatar, Button, Icon } from '@coralyn/ui-kit';

// Mock seam: dati demo statici — da sostituire con useQuery quando il backend espone l'endpoint.
const kpi = [
  { icon: 'euro', iconBg: 'var(--color-accent-tint)', iconInk: 'var(--color-accent)', label: 'Incasso oggi', value: '€ 2.340', trend: '+12% vs ieri', trendDir: 'up' as const },
  { icon: 'users', iconBg: 'var(--color-success-bg)', iconInk: 'var(--color-success-ink)', label: 'Presenze', value: '128', trend: '+8% vs ieri', trendDir: 'up' as const },
  { icon: 'chart', iconBg: 'var(--color-brand-tint)', iconInk: 'var(--color-brand-ink)', label: 'Occupazione', value: '78%', trend: '+5% vs ieri', trendDir: 'up' as const },
  { icon: 'star', iconBg: 'var(--color-warning-bg)', iconInk: 'var(--color-warning-ink)', label: 'Abbonamenti', value: '64', trend: '-2 vs 2025', trendDir: 'down' as const },
];
const incassi = [
  { label: 'Lun', value: 1280, display: '€ 1.280' },
  { label: 'Mar', value: 1540, display: '€ 1.540' },
  { label: 'Mer', value: 1180, display: '€ 1.180' },
  { label: 'Gio', value: 1720, display: '€ 1.720' },
  { label: 'Ven', value: 1960, display: '€ 1.960' },
  { label: 'Sab', value: 2340, display: '€ 2.340' },
  { label: 'Dom', value: 1760, display: '€ 1.760' },
];
const maxIncasso = 2340;
const statoMix = [
  { pct: 48, color: 'var(--color-state-abbonato)', label: 'Abbonato' },
  { pct: 18, color: 'var(--color-state-giornaliero)', label: 'Giornaliero' },
  { pct: 12, color: 'var(--color-state-prenotato)', label: 'Prenotato' },
  { pct: 22, color: 'var(--color-state-libero)', label: 'Libero' },
];
const scadenze = [
  { ini: 'MR', nome: 'Mario Rossi', ombrellone: '8', anzianita: 6, scadenza: '4 lug' },
  { ini: 'AC', nome: 'Anna Conti', ombrellone: 'P1', anzianita: 9, scadenza: '6 lug' },
  { ini: 'FM', nome: 'Franco Marini', ombrellone: '21', anzianita: 3, scadenza: '9 lug' },
  { ini: 'EL', nome: 'Elena Lombardi', ombrellone: 'P2', anzianita: 5, scadenza: '11 lug' },
];
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-[18px] grid grid-cols-4 gap-3.5">
      <KpiCard v-for="k in kpi" :key="k.label" v-bind="k" />
    </div>
    <div class="mb-3.5 grid grid-cols-[1.6fr_1fr] gap-3.5">
      <Card>
        <div class="p-5">
          <div class="mb-[18px] flex items-baseline justify-between">
            <span class="text-sm font-bold text-[var(--color-text)]">Incassi ultimi 7 giorni</span>
            <span class="text-xs tabular-nums text-[var(--color-text-muted)]">Totale € 11.780</span>
          </div>
          <BarChart :bars="incassi" :max="maxIncasso" />
        </div>
      </Card>
      <Card>
        <div class="p-5">
          <span class="text-sm font-bold text-[var(--color-text)]">Stato ombrelloni</span>
          <div class="mt-[18px]"><StackedBar :segments="statoMix" /></div>
        </div>
      </Card>
    </div>
    <Card>
      <div class="p-5">
        <div class="mb-3.5 flex items-center justify-between">
          <span class="text-sm font-bold text-[var(--color-text)]">Abbonamenti in scadenza</span>
          <span class="text-xs text-[var(--color-text-muted)]">Campagna rinnovi</span>
        </div>
        <div class="flex flex-col">
          <div v-for="r in scadenze" :key="r.nome" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-2.5 last:border-0">
            <Avatar :initials="r.ini" size="sm" />
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.nome }}</div>
              <div class="text-[11.5px] tabular-nums text-[var(--color-text-muted)]">Ombrellone {{ r.ombrellone }} · {{ r.anzianita }} stagioni</div>
            </div>
            <span class="text-xs tabular-nums text-[var(--color-text-2nd)]">Scade {{ r.scadenza }}</span>
            <Button variant="secondary"><Icon name="renew" :size="14" />Rinnova</Button>
          </div>
        </div>
      </div>
    </Card>
  </section>
</template>
