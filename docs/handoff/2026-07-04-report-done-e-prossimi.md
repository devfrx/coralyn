# Handoff / Delega — Report cruscotto FATTO · prossimo Stabilimento · D-0xx aperti

> Documento di consegna per la **prossima sessione/macchina**. **Supera** l'handoff
> [2026-07-04-mappa-abbonamento-e-prossimi.md](2026-07-04-mappa-abbonamento-e-prossimi.md) (il cui "prossimo passo" —
> il Report — è ora **fatto e su `main`**). Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**:
> per ogni slice creativo → mock/spec → RISOLVI le decisioni con l'utente (brainstorming) → **piano TDD**
> (`superpowers:writing-plans`) → esecuzione **subagent-driven, un commit per layer, test-first** → review finale →
> **DOPO ogni slice: presenta lo stato e attendi conferma.**

---

## 0. Situazione GIT (all'avvio fai il sync §9; fidati di `git log`, non degli SHA qui)
- **`main` = `origin/main`** con il **Report cruscotto** e i cleanup di chiusura. Working tree pulito, **nessun branch
  di lavoro locale aperto**.
- **Nessuna migrazione pendente.** Prossimo **ADR libero: 0039**. Prossimo **D libero: D-037**.
- ⚠️ **`origin/feat/scheda-cliente-360`** è un branch remoto storico ormai **molto indietro** da main (tutto il suo
  lavoro è su main). Prune remoto **opzionale**, richiede ok esplicito dell'utente.
- ⚠️ **Push su `main` richiede ok ESPLICITO dell'utente** (il classifier blocca il push sul default branch senza
  autorizzazione chiara — è successo più volte).

## 1. Stato attuale — cosa è su `main` (sessione 2026-07-04)
Tutto mergiato FF, in ordine: Scheda Cliente 360° + redesign · **fix mappa** (pomeriggio incassabile) · bottone
**«Abbonamento»** + rimozione «Presenza» · **D-035** · **REPORT CRUSCOTTO** · cleanup (rimozione `BarChart`/`StackedBar` morti).

**Report cruscotto (ultimo slice, subagent-driven, 11 task TDD + review opus + 2 fix + LIVE):**
- **Backend:** `GET /api/reports/summary?period=today|week|season` — nuovo `apps/api/src/reports/` (`ReportsModule`,
  `ReportsService`, `report.projection.ts` puro, query DTO `@IsIn`). Tenant-scoped (`forTenant`), **read-only**,
  **nessuna migrazione**. Riusa `MapService.getDayMap` (occupazione+mix di oggi) e `RenewalCampaignsService.getActiveCampaign`
  (scadenze, fonte unica prelazione D-011). e2e con dati seminati (season>week, campagna aperta).
- **ui-kit / grafici (ADR-0038):** **Apache ECharts** via `vue-echarts`, renderer **SVG**, import modulari; wrapper
  `ChartBar`/`ChartDonut` (+ builder di option PURI `echarts-option.ts`) con **fallback a tabella per l'a11y**. I test
  stubbano `VChart` (jsdom non renderizza ECharts) — vedi gotcha §6.
- **FE:** `ReportView.vue` da mock a dati reali: 4 KPI (Incasso periodo · **Da incassare** · Occupazione · Abbonamenti;
  «Presenze» **eliminato**), selettore periodo (il periodo guida **solo l'incasso**; gli altri sono snapshot **"ora"**),
  grafici incassi + stato ombrelloni, pannello scadenze **read-only** con «Rinnova» che **naviga** alla scheda cliente
  + empty-state. Composable `useReportSummary` + `chartColors.ts` (risolve i token in valori concreti).
- **Verificato LIVE** nel browser (dati demo): grafici rendono, KPI/scadenze popolati, 0 errori console.
- **Seed demo riusabile:** `pnpm --filter @coralyn/api run seed:demo` (con `DATABASE_URL` su `coralyn_dev`) → clienti +
  abbonamenti che coprono oggi + incassi su 7 giorni + insoluti + campagna rinnovi aperta.

**Test (verificati fine sessione):** ui-kit **70** · web-staff **178** · api unit **118** · api e2e **165** · typecheck pulito.

## 2. IL PROSSIMO PASSO — Stabilimento (vista read-only)
- [`EstablishmentView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue) è **mock**. Il mock
  «Stabilimento» mostra card **Informazioni / Struttura / Utenti e ruoli / Sessione**.
- La parte **team/utenti/ruoli** tocca **RBAC = [D-025](../architecture/deferred.md)** (deferito, security):
  gestione utenti staff + decoratori di ruolo sugli endpoint. **Primo passo consigliato: vista read-only**
  (Informazioni stabilimento + struttura, senza inviti/gestione utenti), lasciando la parte team gated a D-025.
- **Prima azione:** mostra il mock «Stabilimento» all'utente (§3), decidi con lui lo scope (read-only vs quanto di D-025
  affrontare), poi spec → piano TDD → subagent-driven.

## 3. Come VEDERE i mock (React SPA "Bundled Page", una schermata alla volta)
`docs/design/mockups/gestionale-lidi-aspirazionale.html` (~625KB, **NON leggerlo raw**). In `.claude/launch.json` come
config **`mockups`** (`python -m http.server 8090`): `preview_start` "mockups" → naviga a
`http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`. Mostra una schermata alla volta (nav via
sidebar; per sotto-schermate — Scheda cliente, Stabilimento — clicca una riga o il selettore stabilimento; usa
`preview_eval` + `document.elementFromPoint` se i click sintetici non triggerano gli handler React). Misura i valori con
`getComputedStyle` e **mappa sui token, non copiare hex**.

## 4. Le schermate del mock — stato reale del FE (per pianificare le prossime)
Il mock copre 8 schermate + auth. Stato attuale del codice:
- **Mappa** — reale (mappa + drawer + fix pomeriggio + «Abbonamento»).
- **Prenotazioni** ([`BookingsView.vue`](../../apps/web-staff/src/features/bookings/)) — reale (A1/A2/A3 + incasso).
- **Clienti** + **Scheda cliente** — reali (anagrafica + Scheda 360° redisegnata).
- **Listino** ([`PricingView`](../../apps/web-staff/src/features/pricing/)) — reale (editor CRUD D-032).
- **Report** — **reale** (questo slice).
- **Rinnovi** (prelazione D-011) — reale.
- **Stabilimento** — **mock** → prossimo slice (§2).
- **Struttura** — parte della gestione stabilimento/planimetria; il modello mappa è a settori/file
  ([ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)); l'editor planimetrico libero è **D-005** (deferito).
- **Auth/landing** (Login/Registrazione/«Crea il tuo stabilimento») — schermate reali (seam auth; registrazione = D-002
  self-service è **rifiutata**, provisioning = fornitore+inviti ADR-0028).

## 5. D-0xx aperti (registro [`deferred.md`](../architecture/deferred.md)) — i più rilevanti per il prodotto
Conferma sempre la scelta con l'utente prima di partire.
- **D-025 — Gestione utenti & RBAC** — **prerequisito** per la parte team/inviti dello Stabilimento (§2).
- **D-024 — GDPR cliente** (soft-delete/anonimizzazione). Reso naturale dalla Scheda cliente (ruota attorno alle
  prenotazioni). Slice medio.
- **D-012 — Cabine/servizi accessori prenotabili** (nuova risorsa gemella dell'Ombrellone). Alto valore-prodotto ma
  **slice grande** (risorsa + disponibilità + pricing).
- **D-035 — Servizio clienti parallelo + "assenze comunicate" abbonati** (visione di prodotto discussa con l'utente
  2026-07-04; sblocca la rivendita del posto abbonato liberato; richiede un canale cliente separato). Grosso.
- **D-036 — Report avanzato** (heatmap occupazione, medie storiche, export, rinnovo inline) — deferito dallo slice Report.
- Altri: **D-013** (sospensione/cessione abbonamento), **D-033** (pricing periodico multi-stagione), **D-005**
  (planimetria libera), **D-034** (forfait periodico — **deprioritizzato**, non riproporlo per primo), **D-026/D-027/D-028/D-029**
  (hardening auth, gated su esposizione pubblica).

## 6. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/`**; `apps/api` consuma il **buildato**. Dopo modifiche a
  `packages/contracts/src/index.ts`: `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api.
- **Container dev stale = 404 sui nuovi endpoint** (successo col Report: l'api girava da ore, senza `/reports/summary`).
  Dopo cambi BE da testare in dev: **rebuild** `docker compose --profile full up -d --build api web`.
- **`coralyn_test` può essere stale** → `cd apps/api; DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy`.
- ⚠️ **`seed.ts` fa UPSERT dell'admin**: se lo lanci SENZA `DEV_ADMIN_PASSWORD`, **resetta la password** al default
  `coralyn-admin` (rompe il login atteso `coralyn-admin-8473`). Passa SEMPRE `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- **ECharts + jsdom:** i test montano i grafici con `VChart` **stubbato** (`global.stubs`); i wrapper hanno
  `defineOptions({ components: { VChart } })` perché lo stub venga risolto. Se aggiungi grafici, replica il pattern.
- **Tool Bash su Windows** (Git Bash, POSIX): **NON** usare here-string PowerShell `@'…'@`; per commit multi-riga usa
  `-m` ripetuti o `git commit -F file`. La cwd del Bash tool **persiste** tra chiamate (usa path assoluti).
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`;
  web-staff `--filter web-staff test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.
  **web-staff globa le spec di ui-kit** (i test ui-kit contano sia standalone sia dentro web-staff).
- **`.env`/`.env.test` alla ROOT** (gitignored) → `coralyn_*`. Login dev `admin@coralyn.dev` / `coralyn-admin-8473`;
  API `localhost:3000/api` (health `/health`); web `localhost:8080`; DB host `5433`.

## 7. Ancore di codice (VERIFICATE 2026-07-04)
- **Report:** [`apps/api/src/reports/`](../../apps/api/src/reports/) (`reports.controller.ts`, `reports.service.ts`,
  `report.projection.ts`); FE [`apps/web-staff/src/features/report/`](../../apps/web-staff/src/features/report/)
  (`ReportView.vue`, `useReport.ts`); grafici [`packages/ui-kit/src/components/`](../../packages/ui-kit/src/components/)
  (`ChartBar.vue`, `ChartDonut.vue`, `echarts-option.ts`), [`echarts.ts`](../../packages/ui-kit/src/echarts.ts),
  [`chartColors.ts`](../../apps/web-staff/src/lib/chartColors.ts). DTO in [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) (`ReportSummaryDTO`).
- **Prossimo (Stabilimento):** [`EstablishmentView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue);
  identità/utenti [`apps/api/src/identity/`](../../apps/api/src/identity/) (per D-025).
- **Riuso:** `MapService` ([`apps/api/src/map/map.service.ts`](../../apps/api/src/map/map.service.ts)),
  prelazione [`renewal-campaigns.service.ts`](../../apps/api/src/bookings/renewal-campaigns.service.ts)
  (`getActiveCampaign`/`buildWindows`), ui-kit `SectionCard`/`Callout`/`StatTile`/`KpiCard`/`SegmentedControl`/`DataTable`.
- **Seed demo:** [`apps/api/prisma/seed-report-demo.ts`](../../apps/api/prisma/seed-report-demo.ts) (script `seed:demo`).

## 8. Follow-up minori tracciati (non bloccanti — dalla review finale)
- **`SegmentedControl` tipizzazione**: `modelValue: string` generico — con opzioni tipizzate potrebbe far fluire un
  valore fuori-tipo nel `Ref<ReportPeriod>`. Basso rischio (opzioni hard-coded). Stringere con generico `<T extends string>`
  o `satisfies` sulle opzioni.
- **`BarChart`/`StackedBar` RIMOSSI** in chiusura sessione (erano morti, sostituiti da ChartBar/ChartDonut) — nessuna azione.
- **Report avanzato** = D-036 (tracciato).

## 9. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Per uno slice creativo:
`superpowers:brainstorming` (mock + decisioni) → `superpowers:writing-plans` (piano TDD) →
`superpowers:subagent-driven-development` (implementer NON annida + review a due stadi, un commit per layer) → review
finale → **presenta e attendi conferma**. Merge su `main` = FF, **con ok esplicito dell'utente**. ⚠️ Rebuild container
prima di testare in dev.

## 10. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: `main` = `origin/main` con il **Report cruscotto** FATTO (endpoint `GET /api/reports/summary` read-only +
> grafici **ECharts** nel ui-kit/**ADR-0038** + `ReportView` reale con KPI/selettore-periodo/scadenze; «Presenze»
> eliminato). Prima, in sessione: Scheda Cliente 360°+redesign, fix mappa pomeriggio, bottone «Abbonamento» (+rimozione
> «Presenza»), **D-035**. Verde: ui-kit 70 · web-staff 178 · api unit 118 · api e2e 165 · typecheck pulito. ADR fino
> 0038 (prox 0039); **D libero D-037**. Doc coerenti (audit fatto).
>
> MACCHINA: SEMPRE `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. ⚠️ Rebuild
> container prima di testare in dev: `docker compose --profile full up -d --build api web` (stale = 404). ⚠️ Se rilanci
> `seed.ts` passa `DEV_ADMIN_PASSWORD=coralyn-admin-8473` (altrimenti resetta la password admin). DB `localhost:5433`;
> login `admin@coralyn.dev` / `coralyn-admin-8473`; web `localhost:8080`. Push su `main` solo con mio ok esplicito.
>
> PRIMA COSA (ADR-0009): leggi questo handoff `docs/handoff/2026-07-04-report-done-e-prossimi.md` (stato §1, prossimo §2,
> come vedere i mock §3, altre schermate §4, D-0xx §5, gotcha §6, ancore §7, follow-up §8), poi il ledger
> `.superpowers/sdd/progress.md` se presente.
>
> TASK, in sequenza (mostrandomi i mock una schermata alla volta): (1) **Stabilimento** — mostrami il mock, decidiamo
> lo scope (vista read-only Informazioni/Struttura; la parte team/utenti tocca **RBAC = D-025** — decidiamo quanto
> affrontare), poi spec → piano TDD → subagent-driven. (2) Poi in ordine, confermando con me: **D-024** (GDPR cliente)
> o **D-012** (cabine/servizi) — D-034 deprioritizzato. (3) Visione più grande quando vorrai: **D-035** (canale cliente
> + "assenze comunicate"). Igiene: `origin/feat/scheda-cliente-360` è storico e molto indietro (prune quando vuoi,
> chiedimi). DOPO ogni slice/pagina: presentami lo stato e attendi conferma prima del successivo.
