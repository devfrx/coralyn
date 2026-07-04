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
Nuova dipendenza (tree-shakeable). Riferimento: spec `2026-07-04-report-cruscotto-design.md`.

**Implementazione (file):** `packages/ui-kit/src/echarts.ts` (registrazione moduli selettivi + renderer SVG),
`packages/ui-kit/src/components/echarts-option.ts` (builder di option PURI, unit-testati), `ChartBar.vue` +
`ChartDonut.vue` (wrapper con `VChart` + fallback tabella a11y), export in `packages/ui-kit/src/index.ts`. Backend:
endpoint `GET /api/reports/summary` in `apps/api/src/reports/` consuma i DTO; FE in `apps/web-staff/src/features/report/`.

I vecchi `BarChart.vue`/`StackedBar.vue` (viz statiche) erano usati solo dal mock del Report e sono stati **rimossi**
una volta migrato `ReportView` ai nuovi wrapper (nessun consumer residuo).

**Gotcha di test:** in jsdom ECharts non renderizza (serve `ResizeObserver`); i test montano i componenti con `VChart`
**stubbato**, e i wrapper aggiungono `defineOptions({ components: { VChart } })` perché VTU risolva lo stub (il
componente `vue-echarts` si registra col nome `echarts`, non `VChart`).
