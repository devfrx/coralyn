# Handoff — Responsività app-wide `web-staff` + audit time-bomb + nota mockup

> **Data:** 2026-07-21 · **Autore sessione:** agente responsività web-staff.
> **TL;DR:** Resa **responsive app-wide** la SPA `web-staff` (prima desktop-assumption puro: 1 sola classe
> responsive in tutta la codebase). Sotto `lg` (1024) la sidebar diventa **drawer off-canvas** (hamburger),
> le griglie collassano, le tabelle scrollano in orizzontale; ≥ `lg` **nessuna regressione**. Fatto con
> flusso brainstorming → spec → piano → **subagent-driven** (implementer+reviewer per task, review finale).
> In coda, chiusi due differiti: **audit time-bomb** (6 test resi date-relative, trovati con probe a orologio
> futuro) e **nota nel mockup** (scelta: non ri-mockare schermate già shippate). **`main` verde: 413/413,
> typecheck pulito, pushato.** ⚠️ **Divergenza docs↔codice da decidere** (drawer vs rail di icone — vedi §3).
> ⚠️ **Prova visiva mai fatta** (login gate).

---

## 1. Cosa è stato fatto

### A) Responsività app-wide (feature principale, mergiata in `main` a `f7d71ed`)
Contratto di breakpoint semantico: **`< lg` = compatto** (tablet portrait + telefono) · **`≥ lg` = esteso**
(tablet landscape + desktop). Default Tailwind v4, nessun breakpoint custom.

- **Fondazione shell** (Fase 1):
  - **`NavDrawer`** nuovo primitivo `ui-kit` (`packages/ui-kit/src/components/NavDrawer.vue`): off-canvas
    **sinistro** su reka-ui `Dialog` (focus-trap/Esc/`aria-modal` gratis), colore sidebar, senza chrome
    titolo+X. Keyframe additive `nav-in`/`nav-out` in `theme.css`. Export in `index.ts`.
  - **`SidebarNav`** (`apps/web-staff/src/app/SidebarNav.vue`): estratto il contenuto nav in **un solo posto**;
    `Sidebar.vue` è ora un guscio `<aside class="hidden … lg:flex">` che lo monta.
  - **`useMediaQuery`** (`apps/web-staff/src/lib/useMediaQuery.ts`): composable **difensivo** (jsdom non ha
    `matchMedia` → ritorna `ref(false)` senza lanciare).
  - **`Topbar`**: hamburger `lg:hidden` che emette `open-nav`; icona `menu` registrata nel registry ui-kit.
  - **`AppShell`**: stato `navOpen`; apre il drawer dall'hamburger; lo chiude su **cambio route** (copre voci
    nav, switcher, logout) e al **passaggio ≥ lg**.
- **Griglie** (Fase 2, `Task 7`): scala di collasso coerente su **7 viste / 17 griglie** (KPI 4-col →
  `grid-cols-2 lg:grid-cols-4`; 3-col → `1 sm:2 lg:3`; form 2-col → `1 sm:2`; frazioni main/side e
  master/detail → colonna singola sotto `lg`). Preservati `items-start`/`min-w-0` che evitano overflow-grid.
- **Tabelle** (`DataTable` ui-kit): risolto **una volta sola** — wrapper interno `overflow-x-auto` (prima
  `overflow-hidden` clippava le tabelle dense).
- **Rifinitura** (Fase 3): `MapView` impila mappa+dettaglio sotto `lg`; titolo `Topbar` troncabile a stretto.
- **Review finale** (`f7d71ed`): fixati 2 Minor (hover hamburger invisibile perché uguale al bg header →
  `--color-surface`; type-hygiene in `useMediaQuery`). 1 Minor lasciato di proposito: overlay
  `rgba(11,53,67,.3)` in `NavDrawer` = **stesso pattern condiviso** di `Drawer`/`Modal` (tokenizzarlo solo qui
  creerebbe incoerenza → eventuale cleanup trasversale con `color-mix`).

### B) Audit time-bomb (`d5f2806`)
Metodo deterministico (niente occhio su 90+ date): suite girata con **orologio spostato** (`vi.useFakeTimers({toFake:['Date']})` + `setSystemTime` a **2027-07-21** e **2027-01-15**); i test che passano oggi ma falliscono nel futuro *sono* i bomb. Probe usato e **rimosso** (non committato). Trovati/sistemati **6 test in 2 file**, resi date-relative con `todayIso()`/`addDays(todayIso(), n)` preservando l'intento:
- `SuspendSubscriptionModal.spec.ts` — il fix della sessione precedente era **parziale**: la finestra
  dell'abbonamento era ancora hardcoded (`2026-05-01`/`09-30`) → sarebbe scoppiata passato settembre. Ora
  `makeSub()` calcola `±60gg` da `todayIso()` a runtime.
- `RentalsView.spec.ts` — override **per-test** di `/api/seasons` con stagione relativa a oggi (non tocca il
  seed globale, usato come fixture statico da altri spec).
- Verificato verde a clock reale **e** a entrambi i futuri. Report: `.superpowers/sdd/timebomb-audit-report.md`.

### C) Nota mockup (`68e4424`)
`docs/design/mockups/Coralyn.dc.html`: la sezione scheda cliente mostrava **stub «In arrivo»** (stato molto
più arretrato dell'app). **Scelta utente: NON ri-mockare** schermate già shippate (il mockup resta artefatto
di esplorazione pre-build, non copia parallela della UI). Aggiunta solo una **nota HTML** che rimanda all'app.

## 2. Stato `git` & verifica

- Branch di lavoro (già mergiati FF e cancellati): `feat/web-staff-responsive`, `chore/deferred-mockup-timebomb`.
- **`main` = `68e4424`, pushato su `origin/main`.** Ancore: spec `6cfe66b`, piano `ccfd416`, feature responsive
  fino a `f7d71ed`, audit `d5f2806`, nota mockup `68e4424`.
- **Verifica:** `apps/web-staff` **413/413** (73 file, include già gli spec `ui-kit`), `vue-tsc -b --noEmit`
  pulito.
- Spec/piano/report: `docs/superpowers/specs/2026-07-21-web-staff-responsive-design.md`,
  `docs/superpowers/plans/2026-07-21-web-staff-responsive.md`, `.superpowers/sdd/` (ledger + report per task).

## 3. ⚠️ DECISIONE APERTA — divergenza design-system ↔ codice shippato

Il codice shippato **diverge dalla strategia responsive documentata** (doc *vivo* + ADR). Non risolta di
proposito: è una decisione di design da **ratificare**, non da prendere in autonomia a fine sessione.
Trasparenza: durante il brainstorming la scelta "drawer vs rail" è stata fatta (utente → drawer), ma
**senza citare** `design-system.md`/ADR-0019 — lacuna di esplorazione (letto il codice a fondo, non il doc che
governava proprio quella scelta).

| Aspetto | Documentato (`design-system.md` §9, ADR-0019, ADR-0004) | Shippato |
|---|---|---|
| **Nav su tablet (768–1023)** | sidebar → **rail di icone** (`--sidebar-rail: 64px`, espandibile) | **drawer off-canvas** (hamburger) |
| **Telefono < 768** | **fuori MVP** (ADR-0004: "consultazione rapida") | **supportato** (mobile-graceful) |
| **Pannello mappa su tablet** | **bottom-sheet** trascinabile (ADR-0019) | solo **impilato** sotto `lg` (Task 8) |

> Nota: il "drawer contestuale" di ADR-0019 è il **pannello della mappa** (selezione ombrellone), *non* la nav.

**Serve una decisione utente** tra:
- **(a) Ratificare lo shippato** — aggiornare `design-system.md` §9 + **nuovo ADR** che supera/emenda ADR-0019
  (nav su tablet = drawer) e ADR-0004 (telefono = target graceful, non fuori MVP). *Raccomandato*: il lavoro è
  shippato, revisionato e frutto di scelta utente informata in sessione; il drawer è pattern moderno difendibile
  e il mobile-graceful era obiettivo esplicito ("senza debiti").
- **(b) Riallineare il codice ai doc** — reimplementare la nav tablet come **icon-rail** e (opz.) il bottom-sheet
  mappa. Costo: rifare lavoro già mergiato.

Finché non è deciso, `design-system.md` §9 **NON è stato toccato** (niente revisionismo unilaterale).

## 4. Gotcha tecnici (per il prossimo agente)

- **reka-ui solo dietro ui-kit.** `web-staff` non dipende da reka-ui: le primitive Dialog (focus-trap/Esc/ARIA)
  passano da wrapper ui-kit (`Modal`/`Drawer`/`ConfirmDialog`/**`NavDrawer`**). Non importare reka-ui in web-staff.
- **jsdom non ha `matchMedia`** → `useMediaQuery` è difensivo (inerte in test). Il ramo "chiudi drawer a ≥lg"
  quindi **non** è esercitato dai test unit; la correttezza ai breakpoint va vista nel browser.
- **Le classi responsive non sono testabili in jsdom** (niente layout reale): i test coprono il *comportamento*
  (toggle drawer, chiusura su route), non la resa. Verifica visiva = pass browser (vedi §5.2).
- **Regola cross-file / time-bomb** (confermata di nuovo): togliere/aggiungere in un componente può rompere spec
  altrove; girare **sempre** l'intera suite (`npx vitest run` da `apps/web-staff`, che include anche `ui-kit`),
  mai solo lo spec toccato.
- **Time-bomb**: pattern di rilevamento = probe con `vi.useFakeTimers({toFake:['Date']})` + `setSystemTime`
  a date future, poi rendere gli spec **date-relative** con `todayIso()`/`addDays()`. Lezione: verificare che
  un fix "date-relative" copra **tutte** le date nello spec (il caso Suspend era stato fixato solo a metà).
- **`DataTable`** ora ha `overflow-x-auto` interno: le tabelle dense scrollano invece di sfondare/clippare.
- **Preview/verifica web-staff** (memoria [[coralyn-web-staff-preview-verify]]): in dev niente MSW nel browser,
  proxy `/api` → backend reale :3000 (+ DB :5433, `.env`); **login gate** blocca gli screenshot dell'agente →
  la prova visiva richiede il login dell'utente. Cliente col seed più ricco: `c-1`.

## 5. Prossimi passi (deferred, in ordine)

1. **DECISIONE strategia responsive** (§3) — è la prima cosa. Da essa dipende se aggiornare `design-system.md`
   §9 + scrivere un ADR di supersession, oppure reimplementare (rail + bottom-sheet). **Non procedere con altra
   UI responsive prima di aver deciso**, per non accumulare divergenza.
2. **Prova visiva** (era `Task 10` del piano, mai fatto): login utente nella Browser pane + pass a **375 / 768 /
   1280** (+ dark) su ogni route, screenshot come evidenza. Bloccata solo dal login.
3. **Backlog Minor** (non bloccanti): overlay `rgba` hardcoded in `NavDrawer`/`Drawer`/`Modal` → eventuale
   tokenizzazione trasversale con `color-mix`. (Il Minor di `useMediaQuery` e l'hover hamburger sono già fixati.)
4. **Chiusi in questa sessione** (non rifare): audit time-bomb (#4) e nota mockup (#3) dell'handoff precedente.
   Resta aperto dall'handoff precedente solo l'item **prova visiva** (= punto 2 qui).

## 6. Principi & metodo usati (skills attive)

- **brainstorming → writing-plans → subagent-driven-development**: spec approvata dall'utente, piano a 10 task
  bite-sized TDD, esecuzione con implementer+reviewer freschi per task (modello `sonnet`), ledger durevole in
  `.superpowers/sdd/progress.md`, review finale whole-branch.
- **dev-discipline**: riuso primitivi ui-kit, solo token semantici, convenzioni repo (reka-ui dietro ui-kit,
  layout inline come le altre viste), YAGNI (no card-list mobile speculative, no primitivo di layout nuovo).
  *Lacuna*: non ho consultato `design-system.md`/ADR-0019 in fase di esplorazione → §3.
- **dev-communication**: decisione strutturale (strategia responsive) segnalata, non decisa in autonomia; scope
  del sync mockup (rebuild vs skip) portato all'utente quando è emerso il vero stato; divergenza docs↔codice
  **segnalata prima** di chiudere.
- **frontend-design**: qualità dentro il design system Coralyn (coral/teal caldo), niente estetica nuova.
