# Handoff — DataTable QoL: wrapping, paginazione, ordinamento, stati + rimozione TD*

> **Data:** 2026-07-21 · **Autore sessione:** agente DataTable QoL.
> **TL;DR:** Evoluzione completa del componente `DataTable` di `ui-kit` (wrapping per colonna,
> ordinamento client-side, paginazione controlled-capable, stati integrati, sticky, densità),
> **migrazione di TUTTE le tabelle del monorepo** all'API data-driven, e **rimozione delle costanti
> `TD*`**. Tutto **mergiato FF su `main` e pushato** (`origin/main = 943153b`), **verde**: web-staff
> **476/476**, web-platform **16/16**, typecheck pulito su tutti e 4 i workspace. ⚠️ **Prova visiva in
> browser MAI fatta** (login gate) — resta l'unico gate residuo, condiviso con la Mappa.

---

## 1. Cosa è stato fatto

### A) Componente `DataTable` evoluto (5 task TDD, commit `3d33859..cabf005`)
Tutte le nuove capacità sono **additive** sull'API data-driven; l'API a slot resta funzionante ma
**congelata** (nessuna feature nuova). Vincolo di retro-compatibilità rispettato: i 9 usi preesistenti
compilavano invariati a ogni passo.

- **Logica pura** in [`packages/ui-kit/src/tableData.ts`](../../packages/ui-kit/src/tableData.ts)
  (`sortRows`/`paginate`/`pageCount`/`countLabel` + il tipo `DataTableColumn`). Volutamente **NON**
  un composable (`useTable`): un solo consumatore oggi = astrazione speculativa (YAGNI). Pure =
  testate in isolamento senza montare il componente. Sort: `localeCompare('it', { numeric: true,
  sensitivity: 'base' })` (ordinamento naturale «Fila 2 < Fila 10»), numeri numericamente,
  null/undefined **sempre in fondo** in entrambe le direzioni, copia non mutante.
- **Colonne estese** (`DataTableColumn`): `sortable`/`sortValue` (accessor per valori derivati, es.
  ordinare Cliente per nome risolto invece che per id — il dominio resta fuori da ui-kit, ADR-0033),
  `wrap: 'wrap'|'nowrap'|'truncate'` + `maxWidth` (con `title` nativo col valore intero, **solo se la
  cella non usa uno slot custom**), `hideBelow: 'sm'|'md'|'lg'` (classi Tailwind **statiche**
  `max-sm:hidden` ecc. — mai costruite per interpolazione, il JIT le richiede letterali), `numeric`
  ora implica `whitespace-nowrap` oltre a `tabular-nums`.
- **Ordinamento** client-side a 3 stati (asc → desc → nessuno), header sortable resi come `<button>`
  (tastiera), `aria-sort` sul `th` attivo, indicatore freccia 14px in `--color-accent` quando attivo.
  Si applica **prima** della paginazione. Click-target = intero `th` (`flex w-full`).
- **Paginazione** client-side opt-in (`pageSize`) + `v-model:page` via `defineModel`
  (controlled-capable, fallback interno) → pronto per un domani paginato server senza cambio d'API.
  **Cambio sort resetta a pagina 1** (fix della review finale); cambio `rows` resetta a pagina 1.
- **Footer** (`--color-raised`, 12.5px muted, `tabular-nums`): «1–20 di 87» + pager prev/next
  (`IconButton` chevron). Visibile con ≥1 riga e (`pageSize` o `showCount`).
- **Stati/interazione**: `emptyMessage` (rende `EmptyState` **dentro** la card, solo data-driven),
  `density="compact"` (`py-2`), `maxHeight` (scroll interno + `thead` sticky — vincolati insieme, vedi
  §3 gotcha), `row-click` emit (cursor solo se il chiamante aggancia il listener; hover sempre),
  `rowClass` per riga (es. tariffe archiviate `opacity-60`).

### B) Migrazione di TUTTE le tabelle (commit `aee8662..66ae57a`, `3c135cf`)
Le 4 viste che usavano l'API a slot (celle `<td>` copia-incolla — il debito che ADR-0033 voleva
chiudere) migrate una alla volta, ciascuna verde e reversibile:
- **CustomersView** (`aee8662`): sort su Cliente (`sortValue` cognome+nome), `pageSize: 25`,
  `row-click`, `emptyMessage`, truncate+`hideBelow` su Email/Note. RouterLink reale in cella con
  `@click.stop` (affordance a11y).
- **RentalsView** (`41bf555`), **PricingView tariffe** (`c5a4755`, niente `sortable` — l'ordinamento
  è di dominio `sortedRates`), **RentalCatalogView ×2** (`66ae57a`, `rowClass` per archiviate).
- **EstablishmentsListView** in `web-platform` (`3c135cf`): era l'ultima tabella scritta a mano (nemmeno
  via DataTable) — migrata a data-driven. Assertion `est-row` adattata a `tbody tr` (l'API data-driven
  non replica il `data-testid` sul `<tr>`).

Opt-in nelle viste **già** data-driven: BookingsView (`hideBelow` su Tipo/Pacchetto, truncate
Pacchetto — niente paginazione, lista day-scoped), CustomerPaymentsCard (`density="compact"`).
RenewalsView **invariata** (colonne già adeguate, liste brevi — YAGNI).

### C) Rimozione costanti `TD*` (commit `5b24c81`)
A migrazione completata, **zero consumatori residui** (verificato con grep su tutto il monorepo) →
rimossi `packages/ui-kit/src/styles/table.ts` + il suo spec + l'export da `index.ts`. Le classi cella
vivono ora in **un solo punto**: il builder `cellClass` dentro `DataTable.vue`. È una piccola
evoluzione interna rispetto ad ADR-0033 §3.6 (le costanti erano export pubblico ui-kit senza consumatori
esterni — ui-kit è pacchetto interno); documentata nel living doc, non serviva nuovo ADR.

### D) Docs (commit `c13765f`, `591f9f6`, `df933e3`, `874f004`, `943153b`)
- **Spec**: [`docs/superpowers/specs/2026-07-21-datatable-qol-design.md`](../superpowers/specs/2026-07-21-datatable-qol-design.md).
- **Piano**: [`docs/superpowers/plans/2026-07-21-datatable-qol.md`](../superpowers/plans/2026-07-21-datatable-qol.md) (10 task TDD).
- **design-system §10** (voce DataTable): riscritta e **verificata accurata al 100% contro il codice
  shippato** (cross-check finale). ⚠️ La voce dichiara esplicitamente un **drift preesistente**:
  l'header hardcoda `tracking-[.07em]` (0.07em) e **non consuma** il token `--tracking-caps` (0.05em) —
  vedi §4 deferred.

## 2. Stato `git` & verifica

- **`main = 943153b`, pushato su `origin/main`.** Working tree pulito. Branch `feat/datatable-qol` e
  `feat/datatable-platform-cleanup` mergiati FF ed eliminati. 17 commit sopra `c97e233` (inizio sessione).
- **web-staff `npx vitest run`: 476/476** (77 file). **web-platform: 16/16** (6 file). **`pnpm -r run
  typecheck`: pulito su tutti e 4 i workspace** (ui-kit, web-staff, web-platform, web-customer).
  Tutto **verificato di prima mano dal controller**, non solo riportato dai subagenti.
- ⚠️ **Prova visiva in browser: MAI fatta** (login gate). È l'unico gate residuo — condiviso con la
  Mappa della sessione precedente.

## 3. Gotcha tecnici (per il prossimo agente)

- **`title` automatico solo senza slot**: `cellTitle` scatta solo per `wrap: 'truncate'` **e** se la
  colonna **non** usa uno slot `#cell-<key>` (il contenuto slot è derivato → il chiamante mette il
  `:title` a mano sullo span, come CustomersView sulle Note / BookingsView sul Pacchetto). Se migri una
  vista con celle truncate rese via slot, **ricòrdati il `:title` sullo span**.
- **`hideBelow` = classi statiche**: solo `max-sm:hidden`/`max-md:hidden`/`max-lg:hidden` letterali
  (mappa `HIDE`). Mai costruirle per interpolazione: il JIT di Tailwind non le vedrebbe.
- **Sticky header vincolato a `maxHeight`**: dentro la card (`overflow-hidden` + `overflow-x-auto`),
  `position: sticky` rispetto allo scroll di **pagina** non funziona (antenato con overflow). Sticky
  regge **solo** nello scroll interno che `maxHeight` attiva. Le due prop sono una cosa sola.
- **`hasRowClick` rilevato una volta al setup** via `getCurrentInstance()` (`onRow-click`/`onRowClick`):
  cursor-pointer solo se il chiamante aggancia l'emit. Righe cliccabili **senza** affordance tastiera
  (role/tabindex/Enter) — oggi mitigato perché l'unico consumatore (Customers) ha il RouterLink reale in
  cella. Se arriva un consumatore che rende la riga cliccabile **senza** un link interno, va aggiunta
  l'affordance tastiera.
- **Ordinamento vs valori derivati**: `row[key]` di default; per celle che mostrano un valore risolto
  via slot (nome da id, label da enum) serve `sortValue` — altrimenti si ordina per il valore raw
  (spesso un id). Il dominio entra **solo** via accessor passato dalla vista (ADR-0033: zero
  `@coralyn/contracts` in ui-kit).
- **Regola cross-file (confermata di nuovo)**: gira **sempre** l'intera suite del pacchetto toccato
  (`npx vitest run` da `apps/web-staff`, include gli spec ui-kit; e `apps/web-platform` a sé), mai il
  solo spec. jsdom non vede la resa (truncate/sticky/hover/breakpoint) → i test coprono il
  **comportamento** (classi, emit, aria), la resa va vista nel browser.
- **⚠️ Collisione file di report scratch (METODOLOGICO, successo 2 volte)**: i subagent scrivono i
  report in `.superpowers/sdd/task-N-report.md`. Quel path era **già occupato** da report della sessione
  Mappa (stessa numerazione `task-8`/`task-10`). Due subagent hanno sovrascritto report stantii —
  innocuo (git-ignored scratch, esiti già in handoff/git), ma **è emerso come security-warning
  «Irreversible Local Destruction»**. Per il prossimo piano subagent-driven: **prefissa i file scratch
  col nome del piano** (es. `task-dt-8-report.md`) o pulisci `.superpowers/sdd/` a inizio sessione, per
  non collidere con artefatti di sessioni precedenti.
- **Preview/verifica web-staff** (memoria [[coralyn-web-staff-preview-verify]]): dev senza MSW nel
  browser, proxy `/api` → backend reale :3000 (spesso **già acceso** nello stack Docker — verifica
  `GET http://127.0.0.1:3000/health` prima di avviarla). DB :5433, `.env` — vedi
  [[coralyn-host-test-env]]. **Login gate** blocca gli screenshot dell'agente. Cliente col seed più
  ricco: `c-1` (Mario Rossi). Quirk porta preview: leggi la porta reale dai `preview_logs`.
  **web-platform** è un'app separata (console multi-stabilimento) con la sua vista Lidi ora migrata —
  se la provi in browser, verifica anche quella.

## 4. Prossimi passi (in ordine)

1. **PROVA VISIVA in browser** (unico gate residuo, condiviso con la Mappa): login utente nella
   Browser pane, poi giudicare a **375 / 768 / 1280** (+ dark). Per le tabelle: sort/paginazione/truncate
   Note su **Clienti** (`pageSize: 25`), le **7 colonne di Prenotazioni** in stretto (`hideBelow`),
   footer e indicatori in **dark**, la lista **Lidi** in web-platform. Per la Mappa: vedi l'handoff
   precedente [`2026-07-21-map-redesign-riva.md`](2026-07-21-map-redesign-riva.md) §4.1. Non delegabile:
   serve il login dell'utente.
2. **Drift `--tracking-caps`** (deferred, dichiarato in design-system §10): l'header del DataTable
   hardcoda `tracking-[.07em]` (0.07em) mentre il token `--tracking-caps` vale 0.05em e nel doc §3
   dichiara «header tabella» come suo caso d'uso. È un drift **preesistente** a questo lavoro (non
   introdotto qui). Decisione da prendere con l'utente: (a) far consumare il token al componente
   (cambia la resa: 0.07→0.05em, va vista in browser), oppure (b) aggiornare il commento del token per
   non promettere un uso che non c'è. **Non deciso in autonomia** (tocca la resa visiva shippata).
3. **Pattern empty-state non uniforme** (deferred minor dalla review finale): dopo questo lavoro
   coesistono 3 pattern nelle viste — `emptyMessage` in-card (Customers/Rentals), `EmptyState` esterno
   condizionato (Pricing/RentalCatalog, **giustificato**: la condizione è `activeSeasonId`, non «0
   righe»), e `v-if="rows.length"` + `EmptyState` esterno (Bookings, Renewals — **non toccati**, fuori
   scope). Il terzo è debito residuo armonizzabile in un follow-up a costo quasi zero.
4. **Skeleton di caricamento**: feature separata **deferita esplicitamente dall'utente** in
   brainstorming (non è nel piano). Le viste oggi mostrano «Caricamento…» testuale o niente.

## 5. Metodo & principi usati (skills attive)

- **brainstorming → writing-plans → subagent-driven-development**: spec approvata a domande (una alla
  volta, decisioni strutturali portate all'utente: client vs server-side, scope QoL, responsive
  strategy, approccio A vs B vs C), piano a 10 task TDD bite-sized, esecuzione con implementer (haiku
  per i task a codice completo nel brief, sonnet per le migrazioni con giudizio sui tipi DTO reali) +
  reviewer (sonnet) freschi per task, ledger durevole in `.superpowers/sdd/progress.md`, review finale
  whole-branch su **fable**. **La review finale ha trovato 1 problema reale** (il cambio di sort non
  resettava la pagina — attrito UX che il branch voleva proprio eliminare) + 3 minor, tutti fixati e
  ri-verificati prima del merge. I 9 minor accumulati dai task review: tutti triagiati «ship as-is».
- **dev-discipline**: riuso primitivi ui-kit, solo token semantici (nessun hex fuori da theme.css),
  YAGNI (niente composable headless per un solo consumatore; niente paginazione server non richiesta),
  API additiva retro-compatibile, chiusura del debito TD* invece di aggirarlo.
- **dev-communication**: le decisioni strutturali (paginazione client vs server, approccio di
  migrazione, il drift `--tracking-caps`) **segnalate e portate all'utente**, non decise in autonomia.
  Il follow-up web-platform proposto e confermato prima di eseguirlo.
- **design-docs / frontend-design**: design-system §10 tenuto allineato **nello stesso lavoro**, con un
  check di coerenza finale doc↔codice (ha trovato e chiuso l'elenco consumatori incompleto); qualità
  dentro il design system Coralyn caldo, nessuna estetica nuova fuori dai token.

## 6. Ancore (file chiave)

- Componente: [`packages/ui-kit/src/components/DataTable.vue`](../../packages/ui-kit/src/components/DataTable.vue)
  + logica pura [`packages/ui-kit/src/tableData.ts`](../../packages/ui-kit/src/tableData.ts) + spec
  `DataTable.spec.ts`/`tableData.spec.ts`. Export in `packages/ui-kit/src/index.ts`.
- Viste migrate: `apps/web-staff/src/features/{customers/CustomersView,rentals/RentalsView,
  rentals/RentalCatalogView,pricing/PricingView}.vue`, opt-in in `bookings/BookingsView.vue` e
  `customers/CustomerPaymentsCard.vue`; `apps/web-platform/src/features/establishments/EstablishmentsListView.vue`.
- Docs: `docs/design/design-system.md` §10 (verità corrente), spec+piano sopra citati.
- Ledger esecuzione: `.superpowers/sdd/progress.md` (git-ignored scratch — recuperabile da `git log`).
