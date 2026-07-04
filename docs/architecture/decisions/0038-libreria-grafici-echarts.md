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
