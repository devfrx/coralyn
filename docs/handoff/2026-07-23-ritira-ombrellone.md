# Handoff — Feature «Ritira ombrellone» (D-055, soft-delete)

> **Data:** 2026-07-23 (sessione partita il 22) · **Autore sessione:** agente ritira-ombrellone.
> **TL;DR:** D-055 implementata per intero su branch `feat/ritira-ombrellone-d055`
> (**11 commit** da `af5339b`, head `8a2a61a`): `retiredAt` + **sgancio dalla fila** +
> **indice unico parziale** label-tra-attivi; endpoint admin retire/restore/retired
> idempotenti con guardia sulle prenotazioni confermate non concluse; nel Cantiere
> «Ritira» (pannello Ombrellone) e sezione «Ritirati» con Ripristina (pannello Spiaggia).
> 8 task subagent-driven con reviewer per task (2 fix-loop), **review finale whole-branch
> (fable): READY TO MERGE** dopo 1 Important vero (FK degradata da Prisma, revertita).
> Verde di prima mano: web-staff **533/533**, api unit **266/266**, e2e **34/34 · 387/387**,
> typecheck pulito (incluso tsc spec-incluso api), web-platform 17/17. web-customer **24/25**:
> 1 rosso **PRE-esistente su main** (time-bomb data reale, chip creato — vedi §4).
> **NON mergiato: restano gate visivo utente + ok esplicito.**

---

## 1. Cosa è stato fatto

Spec: [`2026-07-22-ritira-ombrellone-d055-design.md`](../superpowers/specs/2026-07-22-ritira-ombrellone-d055-design.md) ·
Piano: [`2026-07-22-ritira-ombrellone-d055.md`](../superpowers/plans/2026-07-22-ritira-ombrellone-d055.md) ·
ADR: [`ADR-0053`](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md).

1. **Schema** (`0b87975`, +fix `8a2a61a`) — `Umbrella.retiredAt DateTime?`, `retiredFrom String?`
   (snapshot «Settore · Fila»), `rowId String?` nullable con **`onDelete: Restrict` esplicito**;
   `@@unique` label sostituito da **indice unico parziale** SQL (`WHERE "retiredAt" IS NULL`,
   invisibile al DSL — commento-guardia nello schema). Fallout gestiti: map projection
   (`rowId: r.id`), storico bookings (`row?.sector` → `sectorName` opzionale), quote su
   ritirato → 422 fail-closed.
2. **API** (`bcf18d3`) — `POST :id/retire` (409 se confermate con `endDate >= oggi`,
   `toDbDate(todayInRome())` come la suspend; idempotente), `POST :id/restore` (`{rowId}`,
   409 su label occupata da un attivo, `logicalOrder` ricalcolato; idempotente),
   `GET retired`. Pattern = soft-archive dei pacchetti.
3. **Filtri** (`5cdea42`+pin `0317f8d`) — `retiredAt: null` su clash label
   (create/update/generate: le label dei ritirati tornano riusabili), creazione prenotazione,
   overview, metriche piattaforma, bulk. **Deliberatamente non filtrati**: guardia tipologie
   (commento in codice) e risoluzione label nei report (display storico). Copy 409 di Elimina
   ora suggerisce Ritira.
4. **E2e** (`eb46c82`) — 34ª suite: guardia futura vs storico passato, disdetta che sblocca,
   riuso label (indice parziale al lavoro), clash restore, round-trip completo, 422 su
   prenotazione. Date letterali, calendario congelato al 2026-07-15.
5. **FE** (`015063b`, `fe5e390`, `c644ed6`) — hook + MSW; «Ritira» in danger-zone con
   ConfirmDialog dedicato; sezione «Ritirati (N)» con select fila (stato **chiavato per id**)
   e Ripristina senza conferma (costruttiva). Admin-only ovunque.
6. **Docs** (`e005cee`+fix) — ADR-0053, ER e invariante label in data-model.md
   («unico tra gli ATTIVI»), design-system §14.3 (tabella pannelli).

## 2. Stato `git` & verifica

- **Branch `feat/ritira-ombrellone-d055` = `8a2a61a`** (11 commit da `af5339b` = main).
  **NON mergiato**: gate visivo utente + ok esplicito mancanti. Working tree pulito.
- Verifica controller IN SEQUENZA (a `20aa960`, pre fix-FK): web-staff 533/533 · api unit
  48/48 266/266 · tsc api 0 · `pnpm -r typecheck` pulito · e2e full 34/34 387/387 ·
  web-platform 17/17 · web-customer 24/25 (rosso pre-esistente, §4). Post fix-FK
  (`8a2a61a`, delta solo FK+ADR): tsc 0, unit 266/266, e2e retire 8/8 +
  sectors-rows 13/13 + structure 16/16.
- Api unit e e2e hanno mostrato **una volta ciascuna** il collection-flake noto dell'host
  (0 test rossi, suite mancanti); re-run puliti.
- **Review**: 8/8 task Approved (fix-loop su Task 3: pin mancante; Task 8: 422→404 in ADR).
  Finale whole-branch fable: 1 Important — **la FK `rowId` era stata degradata da Prisma a
  `ON DELETE SET NULL`** rendendo opzionale la relation (stato fantasma sganciato-ma-attivo
  possibile via race su delete-fila) → revertita a Restrict esplicito (`8a2a61a`), ADR
  aggiornato → re-review: **READY TO MERGE**.

## 3. Gotcha (nuovi o confermati)

- **Relation Prisma resa opzionale ⇒ la FK cambia default in silenzio** (Restrict→SetNull):
  d'ora in poi ogni relation opzionale nuova dichiari `onDelete` esplicito.
- **`prisma migrate dev` applica solo a `coralyn_dev`**: dopo ogni migration serve
  `migrate deploy` anche su `coralyn_test` o le e2e falliscono in modo fuorviante
  (successo nel Task 4; memoria host-test-env aggiornata).
- **L'indice parziale è invisibile al DSL Prisma**: un futuro `migrate dev` che tocca
  `Umbrella` può generarne il DROP — il commento nello schema è la guardia; il canary e2e
  che tenta il duplicato attivo raw è raccomandato al prossimo branch su Umbrella.
- La suite **unit web-customer NON è congelata** (a differenza delle e2e api): le date
  letterali marciscono allo scattare della mezzanotte reale (§4).
- Nel pannello Ombrellone `mutate`+`onSuccess` va bene (il pannello resta montato fino alla
  risposta); il gotcha `mutateAsync` vale solo per i flussi che smontano prima.

## 4. Rosso pre-esistente web-customer (NON di questo branch)

`AbsenceReleaseModal.spec.ts` («alla conferma chiama la mutation…») hardcoda
`'2026-07-22'`: dal 23 reale è passato → la validazione data≥oggi blocca la conferma.
Il branch tocca **0 file** web-customer (verificato con `git diff --stat`). Il test gemello
usa già `dateInput.min || todayIso()`: il fix è rendere il primo uguale, NON aggiornare il
letterale. **Chip creato** (task_a5ae3fa8).

## 5. Backlog triato dalla review finale (nessuno bloccante)

- Wiring `retiredFrom` lato read nello storico prenotazioni (`sectorName` oggi undefined
  per i ritirati) + reason dedicata `UMBRELLA_RETIRED` nel quote (migliora il messaggio
  del rinnovo fallito).
- `update`/`remove` singoli operano anche sui ritirati via API (le bulk no; UI non ci
  arriva) — valutare guardia «è ritirato: ripristinalo prima».
- Test FE «staff vede la lista ritirati» codifica uno stato impossibile (staff = 403
  sull'endpoint; MSW permissivo) — riallineare con handler 403.
- GET `/map` post-retire non asserita in e2e (esclusione strutturale, rischio basso).
- Canary indice parziale (vedi §3) · passaggio a11y sui Select di BeachPanel senza label.
- Race read-committed guardia/update: pattern condiviso con tutto il repo, dichiarato in
  ADR-0053 — ship-as-is.

## 6. Prossimi passi

1. **Gate visivo utente** (feature UI nuova): login su dev, provare Ritira → archivio →
   Ripristina dal Cantiere. Nota dati dev: il DB bonificato ha 0 ombrelloni — per provare
   il flusso servono ombrelloni con e senza storico.
2. **Merge SOLO con ok esplicito**; alla chiusura: deferred.md → D-055 risolta.
3. Chip aperti: typecheck api (task_8e2c58fd) · time-bomb web-customer (task_a5ae3fa8).

## 7. Metodo

brainstorming (2 scelte utente col criterio «professionale/senza debiti»: indice parziale;
archivio+Ripristina) → spec → writing-plans (8 task; 2 errori del piano corretti in corsa:
§14.4→§14.3, `new Date(todayInRome())`→`toDbDate(...)`) → subagent-driven (haiku sul
trascrittivo, sonnet sul resto, reviewer sonnet per task, finale fable). Il fix-loop ha
pagato tre volte: pin mancante (Task 3), ADR che mentiva sul codice (Task 8), e la FK
degradata — un Important **vero** che nessun reviewer per-task poteva vedere (vive nel
confronto tra due migration di task diversi).

## 8. Ancore

- API: `apps/api/src/establishment/umbrellas.{service,controller}.ts` ·
  `prisma/migrations/20260722212844_*` e `20260722225212_*` · `test/establishment-umbrellas-retire.e2e-spec.ts`.
- FE: `apps/web-staff/src/features/establishment/panels/{UmbrellaPanel,BeachPanel}.vue` ·
  `useEstablishmentStructure.ts` · spec in `EstablishmentStructureView.spec.ts`.
- Contracts: `RetiredUmbrellaDTO`, `RestoreUmbrellaInput`.
- Ledger: `.superpowers/sdd/progress.md`, sezione «ritira-ombrellone» (scratch `task-se-N`).
- Handoff precedente: [`2026-07-22-mappa-kind-tabpanel.md`](2026-07-22-mappa-kind-tabpanel.md).
