# Handoff — D-037 (web-staff 401) + Rework Mappa «Riva» + iterazione full-bleed

> **Data:** 2026-07-21 · **Autore sessione:** agente rework mappa.
> **TL;DR:** Chiusi tre blocchi di lavoro, tutti **mergiati FF su `main` e pushati** (`origin/main =
> 621c36b`), **verde**: web-staff **451/451**, typecheck pulito. (1) **D-037** — gestione globale del
> `401` in `web-staff` (logout+redirect). (2) **Rework completo della Mappa** in direzione «Riva»
> (11 task TDD subagent-driven): cella **Tessera**, scena mare/sabbia, dettaglio in **Drawer overlay**,
> occupazione, legenda-filtro, ricerca, hovercard. (3) **Iterazione full-bleed** su richiesta utente:
> scena a tutta vista, mare+toolbar **sticky**, filtri nella toolbar e legenda in **Popover** (nuovo
> primitivo ui-kit). ⚠️ **Prova visiva in browser MAI fatta** (login gate) — è l'unico gate residuo.

---

## 1. Cosa è stato fatto (in ordine cronologico)

### A) D-037 — gestione globale del `401` in `web-staff` (commit `41032f3`)
Un token JWT scaduto in navigazione client-side mostrava lo stato d'errore di **ogni vista** invece di
rimandare al login. Fix: `onError` globale del `QueryClient` (non un interceptor in `http.ts`, che è
volutamente disaccoppiato da Pinia/router). Logica pura in
[`apps/web-staff/src/lib/onApiError.ts`](../../apps/web-staff/src/lib/onApiError.ts)
(`handleUnauthorized`), agganciata a `QueryCache`/`MutationCache` in
[`queryClient.ts`](../../apps/web-staff/src/lib/queryClient.ts). **Agisce solo se `session.authenticated`**
→ un 401 da login errato o da `rehydrate` scaduto resta gestito localmente, niente redirect-loop.
Preserva la rotta in `?redirect`, che `LoginView` onora **solo per path interni** (guardia
anti-open-redirect). web-staff non ha refresh (D-026 non esteso allo staff) → solo logout+redirect.
Deferred.md: **D-037 chiusa** (era già risolta per `web-customer`). Baseline: 413 → **421**.

### B) Rework Mappa «Riva» — 11 task TDD (commit `6bd3e38..1f70da9`, poi fix `d73cc40`)
Flusso completo **brainstorming → spec → piano → subagent-driven-development** (implementer haiku/sonnet
+ reviewer sonnet per task, review finale whole-branch **opus**).
- **Spec:** [`docs/superpowers/specs/2026-07-21-map-redesign-riva-design.md`](../superpowers/specs/2026-07-21-map-redesign-riva-design.md)
  (⚠️ descrive il design **iniziale**; per lo stato corrente vale il living doc, vedi §C).
- **Piano:** [`docs/superpowers/plans/2026-07-21-map-redesign-riva.md`](../superpowers/plans/2026-07-21-map-redesign-riva.md).
- **Mockup di esplorazione:** [`docs/design/mockups/map-redesign-esplorazione.html`](../design/mockups/map-redesign-esplorazione.html).

Cosa contiene:
- **Cella «Tessera»** (`packages/ui-kit/src/components/UmbrellaCell.vue`): quadrato arrotondato, **split
  per fascia a colonne verticali** (prima fascia a sinistra), ombra «da sole», stati `dimmed`/`found`.
  **API pubblica invariata** (props esistenti + `dimmed`/`found` opzionali) → nessun impatto sui
  chiamanti. I 4 assi di ADR-0020 restano; nessun nuovo ADR.
- **`SegmentedControl`** esteso con `options[].hint?` (usato per la % occupazione sui tab settore).
- **`HoverCard`** nuovo primitivo ui-kit (reka-ui) — consultazione al passaggio sulle celle, `disabled`
  su touch.
- **`mapDerive.ts`** — funzioni pure testate: `isOccupied`/`rowOccupancy`/`sectorOccupancyPct`,
  `matchesQuery`, `namesByUmbrella`. **Metrica occupazione:** occupata = **≥1 fascia ≠ `free`**
  (`covered` conta come occupata → disponibilità operativa, **diversa** dalla metrica Report/D-048).
- **Dettaglio in `Drawer` overlay** (ex-pannello inline) → **riallinea il codice ad ADR-0019**; mappa
  sempre a piena larghezza.
- **Scena «Riva»** (`apps/web-staff/src/styles/map-scene.css`): mare a orizzonte con 3 velature in drift
  lento, bagnasciuga, grana di sabbia. Rimossa la vecchia barretta «Mare».
- **Occupazione** (% sui tab, righello per fila), **legenda-filtro** (chip toggle → `dimmed`),
  **ricerca** (etichetta/cliente, debounce, switch settore, scrollIntoView), **hovercard**.
- **design-system §13** riscritto + token nuovi. Baseline: 421 → **447**.

### C) Iterazione full-bleed (commit `93cd232`, coerenza `621c36b`)
Richiesta utente: «non un riquadro card, ma occupi tutta la vista; adegua e suddividi legenda e filtri».
Scelta utente = opzione (b) del brainstorming (legenda in pillola).
- **Scena full-bleed:** via cornice-card (bordo/raggio/ombra) e padding esterno. Lo scroll vive in uno
  **scroller interno** `.map-scroll` (`position:absolute; inset:0`) dentro `.map-stage`, così la grana
  (`::after` sullo stage che **non** scrolla) copre sempre il viewport.
- **Mare + bagnasciuga sticky in cima** (`.map-sea` top:0, `.map-shore` top:64px) → l'orizzonte non
  scrolla mai via.
- **Toolbar della scena** (`.map-toolbar`, sticky top:80px) su **vetro leggero** (`color-mix` +
  `backdrop-filter: blur`): tab settori, **chip filtro stato** (spostati qui, `role="group"`),
  ricerca, pillola **«Legenda»**.
- **Filtri ≠ legenda:** i chip di stato (comandi) stanno nella toolbar; l'informativo (Stato misto,
  nota per-fascia, Tipologia) vive nel **`Popover`** — **nuovo primitivo ui-kit** su reka-ui
  (`packages/ui-kit/src/components/Popover.vue`, click-based → funziona su touch). Icona `info`
  aggiunta al registry. Baseline: 447 → **451**.

**Il living doc `design-system.md` (§13.6/§13.8) è stato aggiornato all'iterazione ed è la verità
corrente.** La spec porta una nota d'iterazione in testa.

## 2. Stato `git` & verifica

- **`main = 621c36b`, pushato su `origin/main`.** Working tree pulito. Branch `feat/map-redesign-riva`
  mergiato FF e cancellato.
- **web-staff `npx vitest run`: 451/451** (77 file, include gli spec ui-kit). **`pnpm typecheck` pulito**
  (verificati dal controller, non solo riportati dai subagenti).
- **⚠️ Prova visiva in browser: MAI fatta** (login gate — l'agente non può loggarsi). È l'unico gate
  residuo prima di considerare la feature davvero conclusa.

## 3. Gotcha tecnici (per il prossimo agente)

- **reka-ui SOLO dietro ui-kit** (ADR-0017): `web-staff` non lo importa mai. I primitivi Popper-based
  (`HoverCard`, `Popover`, `Drawer`, `Modal`, `NavDrawer`, `ConfirmDialog`) sono tutti wrapper ui-kit.
- **⚠️ `ResizeObserver` in jsdom (RICORRENTE — 3 volte):** i primitivi reka Popper-based (HoverCard,
  Popover) chiamano `ResizeObserver`, **assente in jsdom** → gli spec che li montano devono stubbarlo:
  `class ResizeObserverStub { observe(){} unobserve(){} disconnect(){} }` +
  `globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;`.
  È in `HoverCard.spec.ts`, `Popover.spec.ts` e ora `MapView.spec.ts`. **Se ricapita, valutare di
  spostarlo nel setup globale dei test** (`apps/web-staff/src/test/setup.ts` / equivalente ui-kit)
  invece di ripeterlo. Vedi memoria [[coralyn-web-staff-preview-verify]].
- **Contenuto reka in portal:** HoverCard/Popover/Drawer/Modal teleportano il contenuto in
  `document.body` (non nel wrapper VTU). Gli spec leggono da `document.body` e disambiguano con
  `data-test` univoci (`drawer-body` vs `modal-body`, `legend-panel`, `legend-pill`). Il contenuto è
  montato **solo quando aperto** (chiuso → `null`). Serve `attachTo: document.body` + `await nextTick()`
  dopo il click d'apertura.
- **Regola cross-file (confermata di nuovo):** togliere/spostare markup in `MapView.vue` rompe spesso
  assertion in altri test dello stesso file → girare **sempre** l'intera suite, mai il solo spec.
- **jsdom non vede la resa:** classi responsive, sticky, hover reale, drift velature, blur, layout ai
  breakpoint **non** sono testabili in jsdom. I test coprono il **comportamento**; la resa va vista nel
  browser. `useMediaQuery` è difensivo (ritorna `false` in jsdom) → hovercard `disabled` in test.
- **Full-bleed layout:** `MapView` `<section>` è `h-full` dentro `AppShell` (`<main>` flex-col →
  `<div class="min-h-0 flex-1 overflow-auto">`). Lo scroll della mappa è interno (`.map-scroll`), non
  il div di AppShell. Su viewport molto corte il `min-h-[560px]` della section può far scrollare il
  contenitore esterno (sticky ancorato allo scroller interno) — **da verificare a occhio** a 375px.
- **z-index scena:** mare/bagnasciuga `z-3`, toolbar `z-2`, contenuto `z-auto`, grana `::after` `z-0`
  (dietro `.map-scroll` z-1). La HoverCard/Popover content sono `z-[45]` (sopra scena, sotto il Drawer
  `z-50`/scrim). Non alzare oltre 45 senza controllare il Drawer.
- **`useMediaQuery` vive in `web-staff`** (`@/lib/useMediaQuery`), non in ui-kit.
- **Preview/verifica web-staff** (memoria [[coralyn-web-staff-preview-verify]]): in dev niente MSW nel
  browser, proxy `/api` → backend reale :3000 (l'API spesso **già gira** nello stack Docker dell'altro
  clone — verificare `GET http://127.0.0.1:3000/health` prima di avviarla). DB :5433, `.env` — vedi
  [[coralyn-host-test-env]]. **Login gate** blocca gli screenshot dell'agente. Cliente col seed più
  ricco: `c-1` (Mario Rossi). Quirk porta preview: leggere la porta reale dai `preview_logs`.

## 4. Prossimi passi (in ordine)

1. **PROVA VISIVA in browser** (unico gate residuo, era anche il deferred dell'handoff precedente):
   login utente nella Browser pane, poi giudicare a **375 / 768 / 1280** (+ dark):
   - effetto **full-bleed** e mare **sticky** durante lo scroll;
   - **toolbar di vetro** (intensità blur/velo — l'utente può volerla ritoccare);
   - **Tessera a 3+ fasce** (colonne strette: leggibilità del numero);
   - **hovercard** vicino ai bordi mare/vista (posizionamento);
   - **Drawer a 375px** (`max-w-[calc(100vw-24px)]`);
   - drift velature su tablet (performance).
2. **Deferred Minor** aperti dalla review finale whole-branch (nessuno bloccante — tutti «ship as-is»,
   registrati in `.superpowers/sdd/progress.md`):
   - **`--cell-size`/`--cell-size-touch`** documentati (§9) ma **non consumati via `var()`**: la cella
     hardcoda `size-11 lg:size-10`. Riconciliare (consumare il token **o** togliere la riga dal doc).
   - ResizeObserverStub ripetuto in 3 spec → eventuale hoist nel setup globale.
   - `rowOccupancy(r)` chiamato ~4×/riga nel template (immateriale a scala target).
   - traversata doppia per il primo match di ricerca; `Map.set` ridondante in `namesByUmbrella`.
3. **D-054** (deferred): bottom-sheet trascinabile per il pannello mappa in layout compatto — miglioria
   ergonomica, non requisito.
4. La spec del rework è **artefatto pre-full-bleed** (con nota d'iterazione): per lo stato corrente fa
   fede **`design-system.md` §13** + codice.

## 5. Metodo & principi usati (skills attive)

- **brainstorming → writing-plans → subagent-driven-development:** spec approvata a domande (una alla
  volta), piano a 11 task TDD bite-sized, esecuzione con implementer+reviewer freschi per task, ledger
  durevole in `.superpowers/sdd/progress.md`, review finale whole-branch su opus. **3 review hanno
  trovato problemi reali** (bianchi hardcoded T1, test vacuo T10, tre affermazioni doc-vs-codice errate
  T11) — tutti fixati e ri-revisionati.
- **dev-discipline:** riuso primitivi ui-kit, solo token semantici (i bianchi della cella e delle
  velature **tokenizzati** invece che hardcoded), YAGNI (niente KPI bar sulla mappa — c'è il Report),
  API della cella retro-compatibile.
- **dev-communication:** le decisioni strutturali (direzione scena, forma cella, dove vive il dettaglio,
  full-bleed vs card, filtri vs legenda) **segnalate e portate all'utente**, non decise in autonomia.
  Il malinteso «due contratti» e «rework» chiariti prima di eseguire.
- **design-docs:** mockup di esplorazione HTML self-contained prima di scrivere codice; ADR non serviva
  (nessuna decisione strutturale nuova — la forma è dettaglio del living doc); design-system tenuto
  allineato **nello stesso lavoro**, con un check di coerenza finale (che ha trovato e chiuso 4
  disallineamenti: token velature non documentati, §13.6 «legenda operativa» stantia dopo lo split).
- **frontend-design:** qualità dentro il design system Coralyn caldo (coral/teal), nessuna estetica
  nuova fuori dai token.

## 6. Ancore (file chiave)

- Codice mappa: `apps/web-staff/src/features/map/{MapView.vue, mapDerive.ts, useDayMap.ts}` +
  `apps/web-staff/src/styles/map-scene.css`.
- Primitivi nuovi/toccati: `packages/ui-kit/src/components/{UmbrellaCell,HoverCard,Popover,SegmentedControl,Drawer}.vue`,
  `packages/ui-kit/src/styles/theme.css`, `packages/ui-kit/src/icons/registry.ts`.
- Docs: `docs/design/design-system.md` §10/§13 (verità corrente), spec+piano+mockup sopra citati.
- Ledger esecuzione: `.superpowers/sdd/progress.md` (git-ignored scratch — recuperabile da `git log`).
