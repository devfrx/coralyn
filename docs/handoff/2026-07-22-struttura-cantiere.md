# Handoff — Overhaul editor Struttura «il Cantiere» (canvas + ispettore, bulk, guidato)

> **Data:** 2026-07-22 · **Autore sessione:** agente struttura-cantiere.
> **TL;DR:** L'editor `/establishment/structure` è stato rifatto da liste+5-modali a **«Cantiere»**:
> scena Riva a riposo come canvas (riuso mattoni `map-scene.css`, `UmbrellaCell` con resa «rest») +
> **ispettore contestuale** a 8 pannelli, **bulk** backend (`bulk-delete` salta-protetti,
> `bulk-assign-type`), **multi-select** (toggle + Maiusc+clic + Esc con guard), **setup guidato a
> passi derivati**, generatore con **cap 500 visibile**, contatori overview non più stale.
> **Mergiato FF su `main` e pushato** (`origin/main = 980f3f7`, 22 commit da `3cdb53c`),
> **verde**: web-staff **516/516**, api unit 254/254, e2e 30/33 suite (3 rosse = time-bomb date
> PRE-esistente, chip di fix creato), web-platform 17/17, web-customer 25/25, typecheck pulito.
> **Gate visivo utente: fatto** (con 2 fix da feedback, inclusi) e **merge autorizzato esplicitamente**.

---

## 1. Cosa è stato fatto

- **Spec** [`2026-07-22-struttura-cantiere-design.md`](../superpowers/specs/2026-07-22-struttura-cantiere-design.md)
  (brainstorming: canvas+ispettore scelto contro WYSIWYG-puro e liste+anteprima) + **mockup interattivo**
  [`struttura-redesign-esplorazione.html`](../design/mockups/struttura-redesign-esplorazione.html) +
  **piano 15 task** eseguito subagent-driven con reviewer per task.
- **Backend (additivo, zero migrazioni)**: `POST /establishment/umbrellas/bulk-delete` (una transazione,
  **salta** gli ombrelloni con prenotazioni, `{deleted, skipped}` — mai 409 sul batch, speculare al
  generate) e `bulk-assign-type` (`{updated}`, 422 su tipologia estranea, null=Normale). E2e matrice
  in `establishment-umbrellas-bulk.e2e-spec.ts`. Cap del generate **60→500** (`@Max(500)`).
- **ui-kit**: `UmbrellaCell.slotStates` ora opzionale → resa **«rest»** (fill `--color-warm-025`, ink
  `--color-ink-700`); `[]` resta `'free'` (semantica mappa invariata); emit `select` inoltra il
  MouseEvent (retro-compatibile). Icona `zap` aggiunta al registry.
- **web-staff**: il monolite (424 righe) è ora shell + `StructureScene`/`StructureRow` +
  `panels/` (Beach/Sector/Row/Umbrella/Multi + 3 create) + `structureSelection.ts` (tipo `Selection`,
  `findUmbrella`, `GENERATE_MAX`). Ispettore in aside su `lg+`, **Drawer sotto** (entrambi i rami
  sempre cablati — vedi gotcha). Tipologie CRUD inline nel pannello-radice. ConfirmDialog SOLO
  distruttivo. Toast su ogni esito. **Tutte** le mutation invalidano `establishmentStructure` +
  `establishmentOverview` (helper `structureKeys` — chiuso il drift dei contatori).
- **Setup guidato**: card a 3 passi con **passo derivato dall'albero** (0 settori→1, 0 file→2,
  0 ombrelloni→3; sparisce al primo ombrellone; completati spuntati; il passo attivo apre il
  pannello giusto). Fix da feedback utente al gate visivo (prima spariva al primo settore).
- **Docs**: ADR-0052 (paradigma per-form confermato, ADR-0014 non contraddetto), design-system
  §13.1 (variante rest) + **§14 nuova** (Cantiere; sezioni successive rinumerate →17).

## 2. Stato `git` & verifica

- **`main = 980f3f7`**, push `3cdb53c..980f3f7` (22 commit: spec, piano, 14 task + fix-loop + 2
  post-gate). Branch `feat/struttura-cantiere` eliminato. Working tree pulito.
- Verifica finale **di prima mano dal controller + riverificata dai reviewer**: web-staff 516/516,
  api unit 254/254, e2e 361/379 (30/33 suite — le 3 rosse sono il time-bomb sotto), web-platform
  17/17, web-customer 25/25, `pnpm -r typecheck` pulito.
- **Review finale whole-branch (fable): READY TO MERGE, 0 Critical/Important.** Gate visivo utente
  fatto (ha prodotto 2 fix, inclusi e ri-approvati). Merge autorizzato esplicitamente dall'utente.

## 3. Gotcha tecnici (per il prossimo agente)

- **Suite in parallelo = risultati spazzatura su questa macchina**: 5 run concorrenti (vitest×2,
  jest×2, typecheck) hanno prodotto 57 falsi rossi con errori di collection e import da 40×.
  **Girare le suite in SEQUENZA**; i numeri sotto contesa non vanno mai creduti.
- **`mutate()` di vue-query perde le callback se il componente si smonta** prima della risposta
  (`onScopeDispose` disiscrive l'observer). Se il flusso chiude il pannello e POI deve fare altro
  (compose crea-fila→generate), usare `mutateAsync().then()`. L'invalidazione e il toast d'errore
  di `mutationResource` vivono nelle *options* → sopravvivono comunque all'unmount.
- **Ogni pannello va montato in DUE rami: aside desktop E Drawer mobile.** Il ramo Drawer
  dimenticato è stato un Important al Task 10 (invisibile ai test: lo spec stubba desktop).
  Esistono regression test mobile per fila/ombrellone/multi. Refactor `InspectorPanels` nel chip
  «Cantiere polish» per eliminare la duplicazione alla radice.
- **Esc globale + dialog**: il listener della shell è registrato prima di quelli dei dialog reka-ui
  → guardia `document.querySelector('[role="dialog"], [role="alertdialog"]')` prima di `reset()`.
- **`enableAutoUnmount(afterEach)` è obbligatorio** negli spec che montano viste con listener su
  `window`: l'`afterEach` che azzerava solo `innerHTML` lasciava wrapper zombie con reattività viva
  → `TypeError nextSibling` in test successivi. (Diagnosi round-2: NON era un bug reka-ui/jsdom.)
- **Fallthrough `disabled`+`loading` su Button** (stessa classe del ModalFooter, handoff
  loading-states §3.1): `:disabled` esterno sovrascrive quello interno → includere sempre il
  pending: `:disabled="cond || m.isPending.value"`.
- **DB test/dev**: container `coralyn-db` (user `coralyn`, db `coralyn_dev`; l'app usa
  `coralyn_app@127.0.0.1:5433`). Se le e2e falliscono TUTTE in connessione → Docker Desktop è giù.
- **Il guard di delete conta TUTTE le prenotazioni** (nessun filtro stato/date) e la FK
  `Booking.umbrellaId` è RESTRICT: un ombrellone con storico (anche solo scaduto/cancellato =
  «fantasma») **non è eliminabile by design** → vedi deferred «Ritira ombrellone».

## 4. Prossimi passi / deferred (non bloccanti)

1. **Chip «Cantiere polish»** (task_60fa4a39): estrazione `InspectorPanels` (dedup aside/Drawer),
   watch per-id nei pannelli (form resettati dai refetch), `res.count` nel bulk-delete, prop
   `isAdmin` su MultiPanel, test sentinel `'__none__'`, copy «Massimo 500» interpolata da
   `GENERATE_MAX`, nit doc §14.4, ARIA tablist senza pattern tastiera.
2. **Chip time-bomb e2e** (task_673403dd): bookings/customer-bookings/subscription-cession rossi
   per date hardcoded ormai passate (18 test, anche su main) — rendere le date relative.
3. **Feature «Ritira ombrellone» (soft-delete)** — tracciata come **D-055** in `deferred.md`: gap
   dimostrato sul campo — la disdetta anticipata libera il posto in mappa ma non sblocca
   l'eliminazione; oggi l'unica via è distruggere storico contabile (fatto 3 volte su richiesta
   esplicita utente in questa sessione, dati dev). Da progettare con brainstorming.
4. **Dati/`MapView`** — tracciato come **D-056**: MapView discrimina Speciali per NOME-stringa
   invece che per `kind` (difetto pre-esistente, ~L52); nel seed dev «Speciali» è `kind: grid`.
5. Minori triati ship-as-is: elenco nel ledger `.superpowers/sdd/progress.md` (sezione
   struttura-cantiere).

## 5. Metodo (skills attive)

brainstorming → mockup interattivo → spec a sezioni → writing-plans (15 task, self-review con 3 bug
del piano presi) → subagent-driven (haiku per trascrizioni, sonnet per integrazioni, reviewer sonnet,
review finale fable). **La disciplina ha pagato**: 3 Important presi in review (eyebrow duplicata,
ramo Drawer mancante, collisione Esc/dialog), 1 bug reale vue-query scovato dall'implementer, 1
diagnosi errata dell'implementer smontata dal reviewer con contro-repro (round 3 → fix alla radice).
Il gate visivo utente ha prodotto 2 fix veri (guidato derivato, cap 500): il gate serve.

## 6. Ancore

- Feature: `apps/web-staff/src/features/establishment/` (shell, scena, `panels/`, `structureSelection.ts`).
- Bulk: `apps/api/src/establishment/umbrellas.{service,controller}.ts` + `dto/bulk-*.dto.ts`.
- Cella: `packages/ui-kit/src/components/UmbrellaCell.vue` · Scene CSS: `apps/web-staff/src/styles/structure-scene.css` (+`map-scene.css` ora cross-feature).
- Docs: ADR-0052 · design-system §13.1/§14 · spec/piano/mockup citati in §1.
- Handoff precedente: [`2026-07-22-loading-states.md`](2026-07-22-loading-states.md).
