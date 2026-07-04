# Spec — Report (cruscotto operativo) · 2026-07-04

> Design approvato in brainstorming (2026-07-04). Read-only, tenant-scoped, **nessuna migrazione**.
> Terminale: `superpowers:writing-plans` → piano TDD a layer, subagent-driven, un commit per layer.

## 1. Obiettivo
Portare [`ReportView.vue`](../../../apps/web-staff/src/features/report/ReportView.vue) dal mock statico a un
**cruscotto operativo su dati reali**: KPI, grafici interattivi, scadenze abbonamenti. È il primo consumo di
**dati aggregati** del prodotto (finora solo liste/CRUD).

## 2. Decisioni risolte (brainstorming 2026-07-04)
- **Libreria grafici = Apache ECharts** (via `vue-echarts`), **renderer SVG**, **import modulari** (tree-shaking),
  **theme Coralyn** generato dai design-token, incapsulata in **componenti ui-kit** (l'app resta agnostica dalla
  libreria). Decisione architetturale → **ADR-0038**. Scartate: Chart.js (canvas → perde theming-token e a11y), Unovis
  (ecosistema più piccolo). Rationale in [§8].
- **KPI (4)**: `Incasso` (periodo) · `Da incassare` (snapshot) · `Occupazione` (periodo) · `Abbonamenti attivi`
  (snapshot). Il KPI **"Presenze"** del mock è **ELIMINATO**: la presenza non è catturabile in un lido a prevalenza
  abbonati (stesso motivo della rimozione del bottone «Presenza» in mappa; vedi [D-035](../../architecture/deferred.md)).
- **Selettore periodo**: `Oggi` / `Settimana` / `Stagione` → `?period=today|week|season`.
- **Semantica periodo (correttezza, non pigrizia)**: il periodo guida **solo l'Incasso** (somma) — KPI `revenue` +
  grafico `revenueSeries`. È lo scopo primario del selettore ("quanto ho incassato oggi/settimana/stagione").
  `Occupazione`, `Da incassare`, `Abbonamenti attivi` e il mix stati sono **snapshot "ora"** (sono intrinsecamente
  correnti: un "da incassare della settimana scorsa" sarebbe un numero privo di senso; l'occupazione media di periodo è
  costosa e di basso valore in v1 → deferita, vedi §7). Quando `period ≠ today`, i tile snapshot sono **etichettati
  esplicitamente "ora/attuale"** perché non cambiano col periodo.
- **Grafici (2)**: `Incassi` (serie temporale bucketizzata) + `Stato ombrelloni` (donut). **Heatmap occupazione =
  DEFERITA** (incremento analitico futuro tracciato, non gold-plating in questo slice).
- **Scadenze**: riuso della **prelazione D-011** (`computeRenewalWindowState`, **fonte unica** già usata dalla Scheda
  Cliente). Pannello **read-only**; «Rinnova» **naviga** al flusso di rinnovo esistente (non lo reimplementa).
  **Empty-state** pulito se nessuna campagna rinnovi è aperta.
- **Accessibilità**: ogni grafico ha un **fallback a tabella dati** (progressive enhancement), coerente con gli
  `aria-label` della mappa.

## 3. Contratto — `ReportSummaryDTO` (in `@coralyn/contracts`, additivo)
```ts
type ReportPeriod = 'today' | 'week' | 'season';

interface ReportSummaryDTO {
  period: ReportPeriod;
  kpis: {
    revenue: number;              // incasso NEL periodo (Σ amountCollected su collectionDate nel periodo)
    outstanding: number;          // da incassare ORA (Σ totalPrice − amountCollected su confirmed non saldate)
    occupancyPct: number;         // occupazione ATTUALE (snapshot di oggi): slot occupati / slot totali
    activeSubscriptions: number;  // abbonamenti attivi ORA (subscription confirmed che coprono oggi)
  };
  revenueSeries: { label: string; value: number }[]; // today+week → giorni (ultimi 7); season → settimane
  umbrellaStateMix: { state: SlotState; count: number; pct: number }[]; // snapshot di oggi
  expiringRenewals: {                                  // dalle finestre prelazione (campagna aperta)
    customerId: string; customerName: string; umbrellaLabel: string; seniority: number; deadline: string;
  }[];
}
```

## 4. Backend — endpoint (L2)
- **`GET /api/reports/summary?period=today|week|season`** — nuovo `ReportsModule`/`ReportsController` + `ReportsService`.
- **Tenant-scoped** via `forTenant` (RLS), autenticato (no `@Public`), **read-only**. `period` mancante → default `week`;
  `period` invalido → **400** (DTO `class-validator`, `@IsIn`).
- Aggregazioni in SQL/Prisma sui dati esistenti (nessuna nuova tabella): incassi da `Booking.amountCollected` +
  `collectionDate`; occupazione da map/`Booking` per data; abbonamenti da `Booking type=subscription`; scadenze dalle
  finestre prelazione (riuso `computeRenewalWindowState` / dati `RenewalCampaign`).
- **Unit** su un proiettore puro `report.projection.ts` (buckettizzazione, %, mix) + **e2e** (200 con dati seed;
  isolamento tenant; 400 su period invalido; empty `expiringRenewals` senza campagna).

## 5. ui-kit — fondazione grafici (L1)
- `vue-echarts` + core ECharts con **import selettivi** (BarChart/PieChart, TooltipComponent, GridComponent,
  SVGRenderer). Un **theme** `coralyn-echarts` costruito leggendo i token (palette stati, testo, griglia).
- Wrapper **`<ChartBar>`** (serie temporale) e **`<ChartDonut>`** (mix), props tipizzate `{ label, value }[]`,
  con slot/prop per il **fallback tabella** (`<table>` visivamente nascosta ma nel DOM/screen-reader).
- Ritiro dei mock `BarChart`/`StackedBar` (o retrocompat se ancora usati altrove — verificare in fase di piano).
- Test ui-kit: mount, mapping props→option ECharts, presenza tabella a11y con i valori.

## 6. FE — `ReportView` reale (L3)
- `useReportSummary(period)` (TanStack Query, `queryKeys`), selettore periodo (`SegmentedControl`) → re-query.
- 4 `KpiCard` (con "Da incassare"; label "ora" sui tile snapshot quando `period ≠ today`), `<ChartBar>` incassi,
  `<ChartDonut>` stato ombrelloni (**sempre snapshot attuale, etichettato "ora"** — un mix "di periodo" non è ben
  definito), pannello scadenze read-only (empty-state) con «Rinnova» → `router` al flusso rinnovo.
- Seed MSW per i test; component test (render KPI, cambio periodo ri-interroga, empty-state scadenze, fallback tabella).

## 7. Fuori scope / deferiti (tracciati, non tagliati in silenzio)
- **Heatmap occupazione** (giorno×fascia o settimana×giorno) → incremento analitico futuro.
- **Occupazione media di periodo** (settimana/stagione) → v1 mostra lo snapshot di oggi; la media storica per range è
  costosa e di basso valore ora.
- Selettore a **date arbitrarie**, **export** CSV/PDF, persistenza del periodo scelto.
- Azione di rinnovo **inline** nel Report (resta la navigazione al flusso esistente).

## 8. ADR-0038 (da redigere in L1) — adozione ECharts
Adottare una libreria grafici è una decisione d'architettura (come ADR-0021 per TanStack Query). ECharts scelta per:
SVG (theming-token + a11y preservati), interattività ricca (tooltip/hover/zoom/drill-down), ampiezza di tipi
(donut ora, heatmap in futuro), tree-shaking per il bundle PWA. Incapsulata nel ui-kit per isolare l'app dalla libreria.

## 9. Testing / DoD
TDD per layer. Non regredire: **web-staff 170 · ui-kit 65 · api unit 113 · api e2e (baseline sessione ~159, da
riverificare con Docker)** · typecheck pulito. Verifica LIVE del cruscotto quando Docker è su.
