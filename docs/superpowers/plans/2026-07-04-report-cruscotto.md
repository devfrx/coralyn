# Report Cruscotto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare `ReportView` dal mock statico a un cruscotto operativo su dati reali (KPI, grafici ECharts interattivi, scadenze abbonamenti), con un nuovo endpoint aggregante tenant-scoped.

**Architecture:** 3 layer indipendenti, un commit per layer/task. **L1** fondazione grafici nel `ui-kit` (ECharts SVG + wrapper testabili). **L2** endpoint `GET /api/reports/summary` (nuovo `ReportsModule`, riusa `MapService` per occupazione/mix e `computeRenewalWindowState` per le scadenze). **L3** `ReportView` sui dati reali con selettore periodo. Read-only, **nessuna migrazione**.

**Tech Stack:** Vue 3.5 + TanStack Query + `@coralyn/ui-kit`; ECharts 5 + `vue-echarts` (renderer SVG); NestJS + Prisma (RLS `forTenant`); Vitest (FE/ui-kit), Jest (api).

**Spec:** `docs/superpowers/specs/2026-07-04-report-cruscotto-design.md`

**Baseline test da non regredire:** web-staff **170** · ui-kit **65** · api unit **113** · api e2e (~159, riverificare con Docker) · typecheck pulito.

---

## File Structure

**Create:**
- `packages/ui-kit/src/components/echarts-option.ts` — builder PURI di option ECharts (bar, donut). Nessun DOM.
- `packages/ui-kit/src/components/ChartBar.vue` — wrapper serie temporale (VChart + tabella a11y).
- `packages/ui-kit/src/components/ChartDonut.vue` — wrapper donut (VChart + tabella a11y).
- `packages/ui-kit/src/components/echarts-option.spec.ts`, `ChartBar.spec.ts`, `ChartDonut.spec.ts`
- `packages/ui-kit/src/echarts.ts` — registrazione moduli ECharts (tree-shaking) + renderer SVG.
- `docs/architecture/decisions/0038-libreria-grafici-echarts.md` — ADR adozione ECharts.
- `apps/api/src/reports/report.projection.ts` — funzioni pure (revenue buckets/kpi, occupancy%, state mix).
- `apps/api/src/reports/reports.service.ts`, `reports.controller.ts`, `reports.module.ts`
- `apps/api/src/reports/dto/report-summary-query.dto.ts`
- `apps/api/src/reports/report.projection.spec.ts`
- `apps/api/test/reports.e2e-spec.ts`
- `apps/web-staff/src/features/report/useReport.ts` — composable `useReportSummary(period)`.
- `apps/web-staff/src/lib/chartColors.ts` — risoluzione token→colore concreto per i grafici.
- `apps/web-staff/src/features/report/ReportView.spec.ts`

**Modify:**
- `packages/ui-kit/package.json` — dipendenze `echarts`, `vue-echarts`.
- `packages/ui-kit/src/index.ts` — export `ChartBar`, `ChartDonut`.
- `packages/contracts/src/index.ts` — `ReportPeriod`, `ReportSummaryDTO`.
- `apps/api/src/app.module.ts` — importa `ReportsModule`.
- `apps/api/src/bookings/renewal-campaigns.service.ts` — estrai `buildWindows` + aggiungi `getActiveCampaign()` (fonte unica dello stato finestra).
- `apps/web-staff/src/lib/queryKeys.ts` — `reportSummary`.
- `apps/web-staff/src/mocks/server.ts` — handler `GET /api/reports/summary`.
- `apps/web-staff/src/features/report/ReportView.vue` — dal mock ai dati reali.

---

# LAYER 1 — Fondazione grafici nel ui-kit

### Task 1.1: Dipendenze ECharts + registrazione moduli

**Files:**
- Modify: `packages/ui-kit/package.json`
- Create: `packages/ui-kit/src/echarts.ts`

- [ ] **Step 1: Aggiungi le dipendenze** in `packages/ui-kit/package.json` (sezione `dependencies`, dopo `reka-ui`):

```json
    "reka-ui": "^2.0.0",
    "echarts": "^5.5.1",
    "vue-echarts": "^7.0.3"
```

- [ ] **Step 2: Installa** (dalla root):

Run: `corepack pnpm install`
Expected: installazione OK, `echarts` e `vue-echarts` in `packages/ui-kit/node_modules`.

- [ ] **Step 3: Registra i moduli ECharts** (tree-shaking + renderer SVG) in `packages/ui-kit/src/echarts.ts`:

```ts
// Registrazione selettiva ECharts (no bundle intero) + renderer SVG (theming-token + a11y).
import { use } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/package.json packages/ui-kit/src/echarts.ts pnpm-lock.yaml
git commit -m "build(ui-kit): ECharts + vue-echarts (moduli selettivi, renderer SVG)"
```

---

### Task 1.2: Builder di option PURI (`echarts-option.ts`) — TDD

**Files:**
- Create: `packages/ui-kit/src/components/echarts-option.ts`
- Test: `packages/ui-kit/src/components/echarts-option.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce** in `echarts-option.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBarOption, buildDonutOption } from './echarts-option';

describe('buildBarOption', () => {
  it('mappa i dati in una serie bar con i valori e usa il colore passato', () => {
    const opt = buildBarOption(
      [{ label: 'Lun', value: 1280 }, { label: 'Mar', value: 1540 }],
      { color: '#E0795A' },
    );
    expect(opt.xAxis.data).toEqual(['Lun', 'Mar']);
    expect(opt.series[0].type).toBe('bar');
    expect(opt.series[0].data).toEqual([1280, 1540]);
    expect(opt.series[0].itemStyle.color).toBe('#E0795A');
  });
});

describe('buildDonutOption', () => {
  it('mappa i segmenti in una serie pie ad anello, con nome/valore/colore per segmento', () => {
    const opt = buildDonutOption([
      { label: 'Abbonato', value: 48, color: '#5E9AA6' },
      { label: 'Libero', value: 22, color: '#8FBF9E' },
    ]);
    expect(opt.series[0].type).toBe('pie');
    expect(opt.series[0].radius).toEqual(['58%', '80%']);
    expect(opt.series[0].data).toEqual([
      { name: 'Abbonato', value: 48, itemStyle: { color: '#5E9AA6' } },
      { name: 'Libero', value: 22, itemStyle: { color: '#8FBF9E' } },
    ]);
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- echarts-option`
Expected: FAIL con "Cannot find module './echarts-option'".

- [ ] **Step 3: Implementa i builder** in `echarts-option.ts`:

```ts
// Builder PURI di option ECharts: nessun accesso al DOM → unit-testabili.
// I colori sono INIETTATI dal chiamante (già risolti dai token), così restano deterministici.
export interface ChartDatum { label: string; value: number; display?: string }
export interface DonutDatum { label: string; value: number; color: string }

export function buildBarOption(data: ChartDatum[], opts: { color: string }) {
  return {
    grid: { left: 8, right: 8, top: 12, bottom: 20, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map((d) => d.label), axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { show: true } },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        itemStyle: { color: opts.color, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  };
}

export function buildDonutOption(data: DonutDatum[]) {
  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['58%', '80%'],
        avoidLabelOverlap: false,
        label: { show: false },
        data: data.map((d) => ({ name: d.label, value: d.value, itemStyle: { color: d.color } })),
      },
    ],
  };
}
```

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- echarts-option`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/echarts-option.ts packages/ui-kit/src/components/echarts-option.spec.ts
git commit -m "feat(ui-kit): builder puri di option ECharts (bar/donut) — TDD"
```

---

### Task 1.3: `<ChartBar>` (VChart + tabella a11y) — TDD

**Files:**
- Create: `packages/ui-kit/src/components/ChartBar.vue`
- Test: `packages/ui-kit/src/components/ChartBar.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce** in `ChartBar.spec.ts` (stub di `vue-echarts` per non far girare ECharts in jsdom):

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChartBar from './ChartBar.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div class="vchart-stub" />' } };

describe('ChartBar', () => {
  it('rende una tabella dati accessibile con label e valori (fallback a11y)', () => {
    const w = mount(ChartBar, {
      props: {
        data: [{ label: 'Lun', value: 1280, display: '€ 1.280' }, { label: 'Mar', value: 1540, display: '€ 1.540' }],
        color: '#E0795A',
        ariaLabel: 'Incassi ultimi 7 giorni',
      },
      global: { stubs },
    });
    const table = w.find('table');
    expect(table.exists()).toBe(true);
    expect(table.attributes('aria-label')).toBe('Incassi ultimi 7 giorni');
    expect(table.text()).toContain('Lun');
    expect(table.text()).toContain('€ 1.280');
    expect(table.text()).toContain('Mar');
  });

  it('passa a VChart una option con i valori della serie', () => {
    const w = mount(ChartBar, {
      props: { data: [{ label: 'Lun', value: 1280 }], color: '#E0795A', ariaLabel: 'x' },
      global: { stubs },
    });
    const vchart = w.findComponent({ name: 'VChart' });
    expect(vchart.props('option').series[0].data).toEqual([1280]);
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ChartBar`
Expected: FAIL ("Cannot find module './ChartBar.vue'").

- [ ] **Step 3: Implementa** `ChartBar.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import '@/echarts'; // registrazione moduli (side-effect)
import { buildBarOption, type ChartDatum } from './echarts-option';

const props = defineProps<{ data: ChartDatum[]; color: string; ariaLabel: string }>();
const option = computed(() => buildBarOption(props.data, { color: props.color }));
</script>

<template>
  <div class="relative h-[200px] w-full">
    <VChart :option="option" autoresize aria-hidden="true" />
    <!-- Fallback a11y: equivalente testuale del grafico per screen reader. -->
    <table :aria-label="ariaLabel" class="sr-only">
      <thead><tr><th>Periodo</th><th>Valore</th></tr></thead>
      <tbody>
        <tr v-for="d in data" :key="d.label"><td>{{ d.label }}</td><td>{{ d.display ?? d.value }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
```

> Nota: `@/echarts` è l'alias del ui-kit verso `src/echarts.ts`. Se il ui-kit non ha alias `@`, usa il path relativo `../echarts`. Verifica in `packages/ui-kit/vite.config.ts`/`tsconfig` durante l'esecuzione e adegua l'import.

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ChartBar`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/ChartBar.vue packages/ui-kit/src/components/ChartBar.spec.ts
git commit -m "feat(ui-kit): ChartBar (ECharts SVG + tabella a11y) — TDD"
```

---

### Task 1.4: `<ChartDonut>` (VChart + tabella a11y) — TDD

**Files:**
- Create: `packages/ui-kit/src/components/ChartDonut.vue`
- Test: `packages/ui-kit/src/components/ChartDonut.spec.ts`

- [ ] **Step 1: Test che fallisce** in `ChartDonut.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChartDonut from './ChartDonut.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div class="vchart-stub" />' } };

describe('ChartDonut', () => {
  it('rende la tabella a11y con etichette e valori dei segmenti', () => {
    const w = mount(ChartDonut, {
      props: {
        data: [{ label: 'Abbonato', value: 48, color: '#5E9AA6' }, { label: 'Libero', value: 22, color: '#8FBF9E' }],
        ariaLabel: 'Stato ombrelloni',
      },
      global: { stubs },
    });
    const table = w.find('table');
    expect(table.exists()).toBe(true);
    expect(table.attributes('aria-label')).toBe('Stato ombrelloni');
    expect(table.text()).toContain('Abbonato');
    expect(table.text()).toContain('48');
  });

  it('passa a VChart una option pie con i segmenti', () => {
    const w = mount(ChartDonut, {
      props: { data: [{ label: 'Libero', value: 22, color: '#8FBF9E' }], ariaLabel: 'x' },
      global: { stubs },
    });
    expect(w.findComponent({ name: 'VChart' }).props('option').series[0].type).toBe('pie');
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ChartDonut`
Expected: FAIL ("Cannot find module './ChartDonut.vue'").

- [ ] **Step 3: Implementa** `ChartDonut.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import '@/echarts';
import { buildDonutOption, type DonutDatum } from './echarts-option';

const props = defineProps<{ data: DonutDatum[]; ariaLabel: string }>();
const option = computed(() => buildDonutOption(props.data));
</script>

<template>
  <div class="relative h-[180px] w-full">
    <VChart :option="option" autoresize aria-hidden="true" />
    <table :aria-label="ariaLabel" class="sr-only">
      <thead><tr><th>Stato</th><th>Percentuale</th></tr></thead>
      <tbody>
        <tr v-for="d in data" :key="d.label"><td>{{ d.label }}</td><td>{{ d.value }}%</td></tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/ui-kit test -- ChartDonut`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/ChartDonut.vue packages/ui-kit/src/components/ChartDonut.spec.ts
git commit -m "feat(ui-kit): ChartDonut (ECharts SVG + tabella a11y) — TDD"
```

---

### Task 1.5: Export ui-kit + ADR-0038

**Files:**
- Modify: `packages/ui-kit/src/index.ts`
- Create: `docs/architecture/decisions/0038-libreria-grafici-echarts.md`

- [ ] **Step 1: Esporta i componenti** in `packages/ui-kit/src/index.ts` (accanto a `KpiCard`):

```ts
export { default as ChartBar } from './components/ChartBar.vue';
export { default as ChartDonut } from './components/ChartDonut.vue';
```

- [ ] **Step 2: Scrivi l'ADR** `0038-libreria-grafici-echarts.md`:

```markdown
# ADR-0038 — Libreria grafici: Apache ECharts (SVG)

## Stato
Accettata (2026-07-04).

## Contesto
Il Report richiede grafici interattivi (tooltip/hover, più tipi, animazioni). I primitivi `BarChart`/`StackedBar`
del ui-kit sono adatti solo a viz statiche minime.

## Decisione
Adottare **Apache ECharts** via `vue-echarts`, con **renderer SVG** e **import modulari** (tree-shaking). I colori
sono risolti dai design-token e iniettati (no `var()` dentro l'SVG). L'uso è incapsulato in componenti ui-kit
(`ChartBar`, `ChartDonut`) così l'app resta agnostica dalla libreria; i builder di option sono funzioni pure testabili.
Ogni grafico ha un fallback a tabella per l'accessibilità.

## Alternative scartate
- **Chart.js**: canvas → perde theming-token e accessibilità.
- **Unovis**: ecosistema/community più piccoli.

## Conseguenze
Nuova dipendenza (tree-shakeable). Riferimento: spec `2026-07-04-report-cruscotto-design.md`. I vecchi
`BarChart`/`StackedBar` restano solo per micro-usi finché non migrati.
```

- [ ] **Step 3: Typecheck + test ui-kit completi (non regredire 65)**

Run: `corepack pnpm --filter @coralyn/ui-kit typecheck && corepack pnpm --filter @coralyn/ui-kit test`
Expected: typecheck EXIT 0; test ≥ 71 (65 + 6 nuovi).

- [ ] **Step 4: Commit**

```bash
git add packages/ui-kit/src/index.ts docs/architecture/decisions/0038-libreria-grafici-echarts.md
git commit -m "feat(ui-kit): export ChartBar/ChartDonut + ADR-0038 (adozione ECharts)"
```

---

# LAYER 2 — Endpoint aggregante

### Task 2.1: Contract `ReportSummaryDTO`

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i tipi** in `packages/contracts/src/index.ts` (in coda alla sezione DTO, dopo `CustomerBookingDTO`):

```ts
export type ReportPeriod = 'today' | 'week' | 'season';

export interface ReportSummaryDTO {
  period: ReportPeriod;
  kpis: {
    revenue: number;             // incasso nel periodo
    outstanding: number;         // da incassare ora
    occupancyPct: number;        // occupazione attuale (oggi)
    activeSubscriptions: number; // abbonamenti attivi ora
  };
  revenueSeries: { label: string; value: number }[];
  umbrellaStateMix: { state: SlotState; count: number; pct: number }[];
  expiringRenewals: {
    customerId: string; customerName: string; umbrellaLabel: string; seniority: number; deadline: string;
  }[];
}
```

- [ ] **Step 2: Rebuild contracts** (l'api consuma il buildato, gotcha noto):

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: `tsc` EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): ReportSummaryDTO + ReportPeriod (Report cruscotto)"
```

---

### Task 2.2: Proiettori PURI `report.projection.ts` — TDD

**Files:**
- Create: `apps/api/src/reports/report.projection.ts`
- Test: `apps/api/src/reports/report.projection.spec.ts`

- [ ] **Step 1: Test che fallisce** in `report.projection.spec.ts`:

```ts
import { revenueBuckets, revenueKpi, occupancyPct, stateMix } from './report.projection';

describe('revenueKpi', () => {
  const rows = [
    { date: '2026-07-04', amount: 100 }, { date: '2026-07-04', amount: 40 },
    { date: '2026-07-01', amount: 60 },
  ];
  it('today = somma del solo giorno odierno', () => {
    expect(revenueKpi(rows, 'today', '2026-07-04')).toBe(140);
  });
  it('week/season = somma di tutte le righe nel range', () => {
    expect(revenueKpi(rows, 'week', '2026-07-04')).toBe(200);
  });
});

describe('revenueBuckets', () => {
  it('week → 7 barre giornaliere etichettate per giorno (ultimi 7 gg incluso oggi)', () => {
    const b = revenueBuckets([{ date: '2026-07-04', amount: 200 }], 'week', '2026-07-04');
    expect(b).toHaveLength(7);
    expect(b[6].value).toBe(200); // l'ultimo bucket è oggi
  });
});

describe('occupancyPct', () => {
  it('arrotonda occupati/totali a intero percentuale', () => {
    expect(occupancyPct(39, 50)).toBe(78);
    expect(occupancyPct(0, 0)).toBe(0);
  });
});

describe('stateMix', () => {
  it('conta gli stati e calcola le percentuali sul totale', () => {
    const mix = stateMix(['daily', 'daily', 'free', 'season']);
    expect(mix.find((m) => m.state === 'daily')).toEqual({ state: 'daily', count: 2, pct: 50 });
    expect(mix.find((m) => m.state === 'free')).toEqual({ state: 'free', count: 1, pct: 25 });
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- report.projection`
Expected: FAIL ("Cannot find module './report.projection'").

- [ ] **Step 3: Implementa** `report.projection.ts`:

```ts
import type { ReportPeriod, SlotState } from '@coralyn/contracts';

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
type RevRow = { date: string; amount: number };

function lastNDays(todayIso: string, n: number): string[] {
  const out: string[] = [];
  const t = new Date(`${todayIso}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function revenueKpi(rows: RevRow[], period: ReportPeriod, todayIso: string): number {
  const inScope = period === 'today' ? rows.filter((r) => r.date === todayIso) : rows;
  return inScope.reduce((s, r) => s + r.amount, 0);
}

export function revenueBuckets(rows: RevRow[], period: ReportPeriod, todayIso: string): { label: string; value: number }[] {
  // v1: today+week → ultimi 7 giorni giornalieri; season → stessa vista giornaliera (bucket settimanali = deferito).
  const days = lastNDays(todayIso, 7);
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.amount);
  return days.map((iso) => ({ label: WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()], value: byDate.get(iso) ?? 0 }));
}

export function occupancyPct(occupied: number, total: number): number {
  return total === 0 ? 0 : Math.round((occupied / total) * 100);
}

export function stateMix(states: SlotState[]): { state: SlotState; count: number; pct: number }[] {
  const total = states.length;
  const counts = new Map<SlotState, number>();
  for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].map(([state, count]) => ({ state, count, pct: total === 0 ? 0 : Math.round((count / total) * 100) }));
}
```

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- report.projection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/report.projection.ts apps/api/src/reports/report.projection.spec.ts
git commit -m "feat(api): proiettori puri Report (revenue/occupancy/mix) — TDD"
```

---

### Task 2.3: Estrai `getActiveCampaign` da RenewalCampaignsService (fonte unica)

**Files:**
- Modify: `apps/api/src/bookings/renewal-campaigns.service.ts`

- [ ] **Step 1: Aggiungi un metodo** `getActiveCampaign()` che trova l'(unica) campagna aperta e ne ritorna le finestre in stato `open`, riusando la logica interna già esistente. Estrai il corpo di costruzione finestre di `getByDestinationSeasonId` in un helper privato `buildWindows(tx, campaign)` e chiamalo da entrambi. Aggiungi:

```ts
/** Campagna rinnovi attualmente aperta (se esiste) + finestre. Fonte unica per il Report (read-only). */
async getActiveCampaign(): Promise<{ deadline: string; windows: RenewalWindowItemDTO[] } | null> {
  const tenantId = this.tenant.require();
  return this.prisma.forTenant(tenantId, async (tx) => {
    const campaign = await tx.renewalCampaign.findFirst({ orderBy: { deadline: 'asc' } });
    if (!campaign) return null;
    const windows = await this.buildWindows(tx, campaign); // helper estratto da getByDestinationSeasonId
    return { deadline: campaign.deadline.toISOString().slice(0, 10), windows };
  });
}
```

> **Refactor guidato:** sposta il blocco che in `getByDestinationSeasonId` costruisce `windows` (query subs origin-season + `computeSeniority` + `computeRenewalWindowState` + `toRenewalWindowItemDTO` + sort) in `private async buildWindows(tx, campaign): Promise<RenewalWindowItemDTO[]>`, e fai sì che `getByDestinationSeasonId` lo richiami. NON duplicare `computeRenewalWindowState` (resta la fonte unica dello stato). `RenewalWindowItemDTO` è già il tipo di ritorno esistente.

- [ ] **Step 2: Esegui gli e2e prelazione — non regredire**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- renewal-campaigns`
Expected: PASS (invariati, il refactor è comportamentalmente neutro).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bookings/renewal-campaigns.service.ts
git commit -m "refactor(api): estrai buildWindows + getActiveCampaign (fonte unica finestre prelazione)"
```

---

### Task 2.4: `ReportsService` + `ReportsController` + DTO + Module

**Files:**
- Create: `apps/api/src/reports/dto/report-summary-query.dto.ts`, `reports.service.ts`, `reports.controller.ts`, `reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Query DTO** `report-summary-query.dto.ts`:

```ts
import { IsIn, IsOptional } from 'class-validator';
import type { ReportPeriod } from '@coralyn/contracts';

const PERIODS: ReportPeriod[] = ['today', 'week', 'season'];

export class ReportSummaryQueryDto {
  @IsOptional()
  @IsIn(PERIODS, { message: 'period must be one of today|week|season' })
  period?: ReportPeriod;
}
```

- [ ] **Step 2: Service** `reports.service.ts` (riusa `MapService` per occupazione/mix e `RenewalCampaignsService` per le scadenze):

```ts
import { Injectable } from '@nestjs/common';
import type { ReportSummaryDTO, ReportPeriod, SlotState } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { MapService } from '../map/map.service';
import { RenewalCampaignsService } from '../bookings/renewal-campaigns.service';
import { revenueKpi, revenueBuckets, occupancyPct, stateMix } from './report.projection';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly map: MapService,
    private readonly renewals: RenewalCampaignsService,
  ) {}

  async getSummary(period: ReportPeriod): Promise<ReportSummaryDTO> {
    const tenantId = this.tenant.require();
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const weekAgo = new Date(today); weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

    const { revenueRows, outstanding, activeSubscriptions } = await this.prisma.forTenant(tenantId, async (tx) => {
      const paid = await tx.booking.findMany({
        where: { collectionDate: { gte: weekAgo, lte: today } },
        select: { collectionDate: true, amountCollected: true },
      });
      const unpaid = await tx.booking.findMany({
        where: { status: 'confirmed', paymentStatus: { not: 'paid' } },
        select: { totalPrice: true, amountCollected: true },
      });
      const activeSubscriptions = await tx.booking.count({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
      });
      return {
        revenueRows: paid.map((p) => ({ date: p.collectionDate!.toISOString().slice(0, 10), amount: Number(p.amountCollected) })),
        outstanding: unpaid.reduce((s, b) => s + (Number(b.totalPrice) - Number(b.amountCollected)), 0),
        activeSubscriptions,
      };
    });

    // Occupazione + mix: riuso della proiezione mappa di OGGI (stato per slot).
    const map = await this.map.getDayMap(todayIso);
    const states: SlotState[] = [];
    for (const sector of map.sectors)
      for (const row of sector.rows)
        for (const u of row.umbrellas)
          for (const slot of map.timeSlots) states.push((u.stateBySlot[slot.id] ?? 'free') as SlotState);
    const occupied = states.filter((s) => s !== 'free').length;

    // Scadenze: finestre in stato "open" della campagna attiva (fonte unica prelazione), arricchite per il display.
    const campaign = await this.renewals.getActiveCampaign();
    const expiringRenewals = await this.enrichRenewals(tenantId, campaign);

    return {
      period,
      kpis: {
        revenue: revenueKpi(revenueRows, period, todayIso),
        outstanding,
        occupancyPct: occupancyPct(occupied, states.length),
        activeSubscriptions,
      },
      revenueSeries: revenueBuckets(revenueRows, period, todayIso),
      umbrellaStateMix: stateMix(states),
      expiringRenewals,
    };
  }

  /** Arricchisce le finestre "open" con nome cliente ed etichetta ombrellone (read-only, Report-specific). */
  private async enrichRenewals(
    tenantId: string,
    campaign: { deadline: string; windows: { customerId: string; umbrellaId: string; seniority: number; state: string }[] } | null,
  ): Promise<ReportSummaryDTO['expiringRenewals']> {
    if (!campaign) return [];
    const open = campaign.windows.filter((w) => w.state === 'open');
    if (open.length === 0) return [];
    return this.prisma.forTenant(tenantId, async (tx) => {
      const customers = await tx.customer.findMany({ where: { id: { in: open.map((w) => w.customerId) } }, select: { id: true, firstName: true, lastName: true } });
      const umbrellas = await tx.umbrella.findMany({ where: { id: { in: open.map((w) => w.umbrellaId) } }, select: { id: true, label: true } });
      const cById = new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
      const uById = new Map(umbrellas.map((u) => [u.id, u.label]));
      return open.map((w) => ({
        customerId: w.customerId,
        customerName: cById.get(w.customerId) ?? w.customerId,
        umbrellaLabel: uById.get(w.umbrellaId) ?? '—',
        seniority: w.seniority,
        deadline: campaign.deadline,
      }));
    });
  }
}
```

> Nota d'esecuzione: verifica i nomi esatti dei campi `RenewalWindowItemDTO` (`customerId`/`umbrellaId`/`seniority`/`state`) contro il tipo reale in `@coralyn/contracts`/proiezione; se differiscono, adegua il `.filter`/`.map`. `TenantContext` è il provider iniettato altrove come `this.tenant`.

- [ ] **Step 3: Controller** `reports.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import type { ReportSummaryDTO } from '@coralyn/contracts';
import { ReportsService } from './reports.service';
import { ReportSummaryQueryDto } from './dto/report-summary-query.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query() query: ReportSummaryQueryDto): Promise<ReportSummaryDTO> {
    return this.reports.getSummary(query.period ?? 'week');
  }
}
```

- [ ] **Step 4: Module** `reports.module.ts` + registra in `app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MapModule } from '../map/map.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({ imports: [MapModule, BookingsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
```

> In `app.module.ts` aggiungi `ReportsModule` all'array `imports`. Verifica che `MapModule` esporti `MapService` e `BookingsModule` esporti `RenewalCampaignsService`; se non li esporta, aggiungi gli `exports` nei rispettivi module (modifica minima).

- [ ] **Step 5: Build (nest) + typecheck**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: `nest build` EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/reports apps/api/src/app.module.ts apps/api/src/map/map.module.ts apps/api/src/bookings/bookings.module.ts
git commit -m "feat(api): GET /reports/summary (ReportsModule, riuso Map+prelazione)"
```

---

### Task 2.5: e2e endpoint — TDD

**Files:**
- Create: `apps/api/test/reports.e2e-spec.ts`

- [ ] **Step 1: Scrivi l'e2e** (modella lo scaffold da `customer-bookings.e2e-spec.ts`):

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Role } from '@coralyn/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers'; // stessi helper degli altri e2e

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Reports (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let t1: string; let s1: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'RPT A' } })).id;
    await createUser(prisma, { email: 'rpt.s1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    t1 = await login(app, 'rpt.s1@e2e.test', 'pw1');
  });

  afterAll(async () => { await app.close(); });

  it('200 con la forma del summary e default period=week', async () => {
    const res = await request(app.getHttpServer()).get('/api/reports/summary').set(...bearer(t1)).expect(200);
    expect(res.body.period).toBe('week');
    expect(res.body.kpis).toHaveProperty('revenue');
    expect(res.body.kpis).toHaveProperty('outstanding');
    expect(res.body.kpis).toHaveProperty('occupancyPct');
    expect(res.body.kpis).toHaveProperty('activeSubscriptions');
    expect(Array.isArray(res.body.revenueSeries)).toBe(true);
    expect(res.body.revenueSeries).toHaveLength(7);
    expect(Array.isArray(res.body.expiringRenewals)).toBe(true);
  });

  it('period invalido → 400', async () => {
    await request(app.getHttpServer()).get('/api/reports/summary?period=year').set(...bearer(t1)).expect(400);
  });

  it('senza campagna rinnovi aperta → expiringRenewals vuoto', async () => {
    const res = await request(app.getHttpServer()).get('/api/reports/summary').set(...bearer(t1)).expect(200);
    expect(res.body.expiringRenewals).toEqual([]);
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).get('/api/reports/summary').expect(401);
  });
});
```

> Nota: usa gli **helper e2e esistenti** (`createUser`, `login`) — verifica il path reale (`./helpers` o inline come negli altri spec) e allinea l'import. Assicurati che `coralyn_test` sia migrato (`prisma migrate deploy`, gotcha noto).

- [ ] **Step 2: Esegui — deve fallire poi passare**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- reports`
Expected: PASS (4 test). Se rosso per dati mancanti, aggiusta il seed nel `beforeAll`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/reports.e2e-spec.ts
git commit -m "test(api): e2e GET /reports/summary (forma, 400, empty renewals, 401)"
```

---

# LAYER 3 — ReportView sui dati reali

### Task 3.1: queryKeys + composable + colori + MSW

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`, `apps/web-staff/src/mocks/server.ts`
- Create: `apps/web-staff/src/features/report/useReport.ts`, `apps/web-staff/src/lib/chartColors.ts`

- [ ] **Step 1: queryKey** in `queryKeys.ts` (aggiungi alla mappa):

```ts
  reportSummary: (tenantId: string, period: string) => ['report', tenantId, 'summary', period] as const,
```

- [ ] **Step 2: Composable** `useReport.ts`:

```ts
import type { Ref } from 'vue';
import type { ReportSummaryDTO, ReportPeriod } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

export function useReportSummary(period: Ref<ReportPeriod>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.reportSummary(session.establishmentId, period.value),
    queryFn: () => apiFetch<ReportSummaryDTO>(`/reports/summary?period=${period.value}`),
  });
}
```

> Verifica la firma esatta di `queryResource` (in `@/lib/useQueryResource`) e allinea `queryKey`/`queryFn` reattivi al pattern di `useDayMap`.

- [ ] **Step 3: Colori grafici** `chartColors.ts` (risolve i token in valori concreti — ECharts SVG non risolve `var()`):

```ts
import type { SlotState } from '@coralyn/contracts';

const STATE_VAR: Record<SlotState, string> = {
  free: '--color-state-free', season: '--color-state-season', daily: '--color-state-daily', booked: '--color-state-booked',
};

export function resolveVar(name: string): string {
  if (typeof window === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}
export const stateColor = (s: SlotState): string => resolveVar(STATE_VAR[s]);
export const accentColor = (): string => resolveVar('--color-accent');
```

- [ ] **Step 4: Handler MSW** in `mocks/server.ts` (accanto agli altri `http.get`):

```ts
  http.get('/api/reports/summary', ({ request }) => {
    const period = new URL(request.url).searchParams.get('period') ?? 'week';
    return HttpResponse.json({
      period,
      kpis: { revenue: 2340, outstanding: 180, occupancyPct: 78, activeSubscriptions: 64 },
      revenueSeries: [
        { label: 'Lun', value: 1280 }, { label: 'Mar', value: 1540 }, { label: 'Mer', value: 1180 },
        { label: 'Gio', value: 1720 }, { label: 'Ven', value: 1960 }, { label: 'Sab', value: 2340 }, { label: 'Dom', value: 1760 },
      ],
      umbrellaStateMix: [
        { state: 'season', count: 48, pct: 48 }, { state: 'daily', count: 18, pct: 18 },
        { state: 'booked', count: 12, pct: 12 }, { state: 'free', count: 22, pct: 22 },
      ],
      expiringRenewals: [
        { customerId: 'c-1', customerName: 'Mario Rossi', umbrellaLabel: '8', seniority: 6, deadline: '2026-07-04' },
      ],
    });
  }),
```

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/report/useReport.ts apps/web-staff/src/lib/chartColors.ts apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): useReportSummary + chartColors + seed MSW /reports/summary"
```

---

### Task 3.2: `ReportView` dal mock ai dati reali — TDD

**Files:**
- Modify: `apps/web-staff/src/features/report/ReportView.vue`
- Test: `apps/web-staff/src/features/report/ReportView.spec.ts`

- [ ] **Step 1: Test che fallisce** in `ReportView.spec.ts` (stub `VChart` per non far girare ECharts):

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import ReportView from './ReportView.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div />' } };

describe('ReportView', () => {
  afterEach(() => server.resetHandlers());

  it('mostra i KPI dai dati reali, incluso "Da incassare" (via "Presenze")', async () => {
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(w.text()).toContain('Da incassare');
    expect(w.text()).not.toContain('Presenze');
    expect(w.text()).toContain('64'); // abbonamenti attivi
  });

  it('cambiando periodo ri-interroga l\'endpoint', async () => {
    const seen: string[] = [];
    server.use(http.get('/api/reports/summary', ({ request }) => {
      const p = new URL(request.url).searchParams.get('period') ?? 'week';
      seen.push(p);
      return HttpResponse.json({ period: p, kpis: { revenue: 0, outstanding: 0, occupancyPct: 0, activeSubscriptions: 0 }, revenueSeries: [], umbrellaStateMix: [], expiringRenewals: [] });
    }));
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    const seasonBtn = w.findAll('button').find((b) => b.text().includes('Stagione'));
    await seasonBtn!.trigger('click');
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(seen).toContain('season');
  });

  it('senza scadenze mostra un empty-state, non righe', async () => {
    server.use(http.get('/api/reports/summary', () =>
      HttpResponse.json({ period: 'week', kpis: { revenue: 0, outstanding: 0, occupancyPct: 0, activeSubscriptions: 0 }, revenueSeries: [], umbrellaStateMix: [], expiringRenewals: [] })));
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(w.text()).toContain('Nessun abbonamento in scadenza');
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- ReportView`
Expected: FAIL (KPI mock statici, nessun "Da incassare"/empty-state/selettore).

- [ ] **Step 3: Riscrivi `ReportView.vue`** sui dati reali:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ReportPeriod } from '@coralyn/contracts';
import { KpiCard, ChartBar, ChartDonut, SegmentedControl, Card, Avatar, Button, Icon, formatEuro } from '@coralyn/ui-kit';
import { useReportSummary } from './useReport';
import { stateColor, accentColor } from '@/lib/chartColors';
import { STATE_LABEL } from '@/lib/statusMaps';

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

    <div class="mb-[18px] grid grid-cols-4 gap-3.5">
      <KpiCard icon="euro" iconBg="var(--color-accent-tint)" iconInk="var(--color-accent)" label="Incasso" :value="formatEuro(data?.kpis.revenue ?? 0)" />
      <KpiCard icon="clock" iconBg="var(--color-warning-bg)" iconInk="var(--color-warning-ink)" :label="`Da incassare${snapshotSuffix}`" :value="formatEuro(data?.kpis.outstanding ?? 0)" />
      <KpiCard icon="chart" iconBg="var(--color-brand-tint)" iconInk="var(--color-brand-ink)" :label="`Occupazione${snapshotSuffix}`" :value="`${data?.kpis.occupancyPct ?? 0}%`" />
      <KpiCard icon="star" iconBg="var(--color-success-bg)" iconInk="var(--color-success-ink)" :label="`Abbonamenti${snapshotSuffix}`" :value="String(data?.kpis.activeSubscriptions ?? 0)" />
    </div>

    <div class="mb-3.5 grid grid-cols-[1.6fr_1fr] gap-3.5">
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
          <Button variant="secondary" @click="$router.push(`/customers/${r.customerId}`)"><Icon name="renew" :size="14" />Rinnova</Button>
        </div>
      </div>
      <p v-else class="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Nessun abbonamento in scadenza.</p>
    </div></Card>
  </section>
</template>
```

> Note d'esecuzione: (1) conferma che `STATE_LABEL` in `@/lib/statusMaps` mappa `SlotState`→etichetta IT (in `MapView` c'è un `STATE_LABEL` locale; se non è esportato da statusMaps, esportalo o replica la mappa). (2) `formatEuro` è già esportato dal ui-kit (usato in MapView). (3) «Rinnova» naviga alla scheda cliente (flusso rinnovo esistente); se esiste una rotta rinnovo dedicata, puntala.

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter web-staff test -- ReportView`
Expected: PASS (3 test).

- [ ] **Step 5: Suite completa + typecheck (non regredire)**

Run: `corepack pnpm --filter web-staff test && corepack pnpm --filter web-staff typecheck`
Expected: web-staff ≥ 173 (170 + 3); typecheck EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/report/ReportView.vue apps/web-staff/src/features/report/ReportView.spec.ts
git commit -m "feat(web-staff): ReportView su dati reali (KPI/ECharts/scadenze, selettore periodo) — TDD"
```

---

## Self-Review (autore)

**Spec coverage:**
- ECharts SVG/modulare/wrapper/a11y → Task 1.1–1.5 ✅ · ADR-0038 → 1.5 ✅
- KPI (Incasso/Da incassare/Occupazione/Abbonamenti; niente Presenze) → 3.2 ✅
- Selettore periodo + endpoint parametrizzato → 2.4 (DTO `@IsIn`) + 3.2 ✅
- Semantica periodo (periodo guida solo revenue; resto snapshot "ora" con label) → `revenueKpi`/`revenueBuckets` (2.2) + `snapshotSuffix` (3.2) ✅
- Grafici incassi + stato ombrelloni → ChartBar/ChartDonut + 3.2 ✅ · heatmap deferita (fuori scope) ✅
- Scadenze via prelazione D-011, read-only, «Rinnova» naviga, empty-state → 2.3 (fonte unica) + 2.4 (enrich) + 3.2 (empty-state/nav) ✅
- Fallback a tabella a11y → ChartBar/ChartDonut ✅
- Tenant-scope/RLS, nessuna migrazione → `forTenant` in 2.4, nessuno schema toccato ✅

**Placeholder scan:** nessun "TODO/TBD"; le "Note d'esecuzione" indicano verifiche puntuali su firme reali (queryResource, RenewalWindowItemDTO, STATE_LABEL, helper e2e), non lavoro lasciato indietro.

**Type consistency:** `ReportSummaryDTO`/`ReportPeriod`/`SlotState` coerenti tra contracts (2.1), projection (2.2), service (2.4), composable (3.1), view (3.2). `ChartDatum`/`DonutDatum` coerenti tra builder (1.2) e wrapper (1.3/1.4).

**Rischi noti (evidenziati come note, non placeholder):** ECharts in jsdom → risolto con stub `VChart` in tutti i test FE/ui-kit; `MapService`/`RenewalCampaignsService` da esportare dai rispettivi module; `coralyn_test` migrato prima degli e2e.
