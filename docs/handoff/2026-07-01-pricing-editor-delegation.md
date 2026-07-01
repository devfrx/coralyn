# Handoff / Delega — Editor CRUD del listino (D-032), da eseguire nella PROSSIMA sessione

> Documento di consegna. Il **refactor di astrazione FE (ADR-0033) è completo, mergiato FF su
> `main` e pushato**. La **spec di design per D-032 è pronta** (investigata a fondo, corretta
> dopo una verifica più approfondita — vedi §4). **L'esecuzione (piano TDD + implementazione) è
> delegata alla sessione successiva.**

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> `docs/architecture/` (README + `deferred.md` + `glossary.md`, in particolare le righe D-032/
> D-011), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (motore
> prezzo — **non toccare** `pricing.engine.ts`), [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)
> (componenti FE condivisi, appena costruiti — **riusali**), la spec
> [2026-07-01-pricing-editor-d032-design.md](../specs/2026-07-01-pricing-editor-d032-design.md)
> (**autoritativa, leggila per intero — contiene una correzione importante in §3/§9 rispetto a
> una bozza iniziale sbagliata**), `docs/design/design-system.md` §10 (ora aggiornato con i 4
> nuovi componenti `ui-kit`), `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **`main`** è aggiornato e pushato a `origin/main`, HEAD = `62471e9`. **Nessun branch pendente.**
- Commit rilevanti di questa sessione (in ordine): il refactor ADR-0033 (8 commit, da `d3176e9`
  a `b4b09c0`), un cleanup (`6e6f076`), un fix di coerenza docs (`04da6f5`), la spec D-032
  (`2e76bd8`), e una **correzione della spec** (`62471e9` — vedi §4, importante).
- **Nessuna migrazione DB pendente**: lo schema attuale è sufficiente per D-032 (vedi §4).

## 1. Cosa ha prodotto questa sessione

1. **Refactor astrazione FE (ADR-0033) completato ed eseguito task-by-task** (subagent-driven,
   review a due stadi per ogni task): 4 nuove primitive `ui-kit` (`EmptyState`, `Select`,
   `ModalFooter`, `PageToolbar`), utility pure (`formatEuro`/`initials`/`dateRange`), `DataTable`
   data-driven retro-compatibile, shared di dominio `web-staff/lib` (`useEntityLabels`,
   `statusMaps`, `useQueryResource` con thunk lazy per le invalidazioni), 5 viste migrate
   (Bookings, Renewals, SettlePaymentModal, Customers parziale, Map). **Zero regressione
   visiva verificata classe-per-classe** con `preview_inspect` prima/dopo su tutte le viste
   toccate. 3 viste **intenzionalmente non toccate** (CustomerDetailView, PricingView, ReportView
   — motivazioni tracciate nei commit e nella review finale). Mergiato FF, pushato.
2. **Fix ambientale (NON codice): container `coralyn-api` stantio.** I 404 su `/api/packages`,
   `/api/bookings/subscriptions`, `/api/bookings/quote` segnalati dall'utente **non erano bug di
   codice**: il container Docker era una build precedente ad A3.1/A3.2/A4.2 (verificato: il
   `dist/` in esecuzione aveva un solo `@Get()` in `bookings.controller.js`, mancava del tutto
   `dist/src/catalog/`). **Risolto con `docker compose --profile full up -d --build api`** — i 3
   endpoint ora rispondono 200 e il flusso "seleziona ombrellone → nuova prenotazione → preventivo
   → conferma" funziona end-to-end (verificato live: preventivo mostra `€ 28.00`, bottone
   "Conferma prenotazione" abilitato). **Nessun commit necessario** per questo fix. Vedi
   `[[coralyn-dev-preview-env]]` in memoria per il gotcha (da controllare **sempre** prima di
   assumere un 404 come bug reale).
3. **Coerenza docs verificata e corretta**: `docs/design/design-system.md` §10 aggiornato con
   l'inventario dei 4 nuovi componenti + descrizione corretta di `DataTable` (non è su TanStack
   Table, è hand-rolled con due API). Tutto il resto (README architettura, `deferred.md`,
   `glossary.md`, ADR-0033, root README, `contracts/index.ts`) verificato coerente, nessun altro
   fix necessario.
4. **Spec D-032 scritta e investigata a fondo**, poi **corretta** dopo una verifica più
   approfondita (vedi §4 sotto — leggere con attenzione).
5. **Il piano TDD dettagliato per D-032 NON è stato scritto** — delegato a questa sessione per
   budget di contesto (la spec è già investigativa e dettagliata a sufficienza per scriverlo).

## 2. IL TASK della prossima sessione

**Eseguire D-032** (editor CRUD del listino) seguendo il workflow ADR-0009: **scrivi il piano
TDD** (usa `superpowers:writing-plans`) a partire dalla spec
[2026-07-01-pricing-editor-d032-design.md](../specs/2026-07-01-pricing-editor-d032-design.md)
(già completa — non serve ri-investigare da zero, la spec cita già file:riga per ogni fatto),
poi **esegui task-by-task** (`superpowers:subagent-driven-development` o
`superpowers:executing-plans`), partendo da un **nuovo branch da `main`**. Un commit per layer
(backend → contratti → frontend), test-first.

### Scope in breve (dettaglio completo nella spec)
- **Nessuna migrazione DB**: il vincolo di non-ambiguità (`Rate_signature_key`, `NULLS NOT
  DISTINCT`) esiste già. Solo mapping applicativo dell'errore Postgres 23505 → 409.
- Backend: `GET/POST/DELETE /seasons` (crea/elimina anche `Pricing` 1:1, mai esposto
  all'utente), `POST/PATCH/DELETE /packages` (aggiunte a `PackagesController` esistente, che ha
  già `GET`), `GET/POST/PATCH/DELETE /rates`.
- `DELETE /seasons/:id`: le FK sono `ON DELETE RESTRICT` (confermato in DB, nessun cascade) →
  cascata **applicativa** esplicita in transazione (Rate → Pricing → Season).
- Contratti nuovi: `SeasonDTO`, `RateDTO` (+ Create/Update inputs), `CreatePackageInput`/
  `UpdatePackageInput`.
- Frontend: `PricingView.vue` da mock a reale — selettore stagione, card pacchetti con
  crea/modifica/elimina, tabella tariffe con crea/modifica/elimina. **Riusa** `PageToolbar`,
  `ModalFooter`, `Field`/`Input`/`Select`, `formatEuro`, `useQueryResource` (validazione diretta
  del refactor appena fatto). Qui, a differenza del refactor ADR-0033, **il redesign è
  permesso** (non c'è vincolo di fedeltà pixel al mock attuale, solo al linguaggio visivo).

## 3. Confini e scope — vedi spec §2 per l'elenco completo in/fuori scope

## 4. ⚠️ Correzione importante nella spec — leggere prima di fidarsi di "gap critici"

**Una bozza iniziale della spec affermava erroneamente che il vincolo di non-ambiguità su
`Rate` (richiesto da ADR-0032) mancasse dallo schema**, basandosi solo sulla lettura di
`schema.prisma` (che non ha `@@unique` su `Rate`). **Verifica più approfondita** (letta la
migrazione raw `apps/api/prisma/migrations/20260630203447_pricing/migration.sql` riga 134 **e**
interrogato il DB vivo con `pg_indexes`) **ha confermato che il vincolo esiste**: un indice raw
`Rate_signature_key` con `NULLS NOT DISTINCT`, scritto a mano perché Prisma non emette quella
clausola da `@@unique`. **La spec è stata corretta** (commit `62471e9`) prima di essere
consegnata. **Lezione per chi esegue il piano:** quando un fatto sembra "mancante" solo perché
non compare in `schema.prisma`, **verificare anche le migrazioni raw e il DB vivo** prima di
trattarlo come un gap da colmare — Prisma non è l'unica fonte di verità per vincoli che la sua
DSL non sa esprimere.

## 5. Insidie note (gotcha)

- **Container `coralyn-api` stantio**: vedi §1.2. Se in dev vedi 404 su endpoint che *dovrebbero*
  esistere secondo il codice sorgente, **rebuilda prima di sospettare un bug**:
  `docker compose --profile full up -d --build api`. Verifica con `docker inspect coralyn-api
  --format '{{.Created}}'` contro la data degli ultimi commit backend.
- **Login dev**: `admin@coralyn.dev` / `coralyn-admin-8473` (confermato funzionante dopo il
  rebuild di questa sessione). Se 401, il container potrebbe essere stato riseedato nel
  frattempo con la password default del seed (`coralyn-admin`) — riseedare con
  `DEV_ADMIN_PASSWORD=coralyn-admin-8473` resetta.
- **RLS FORCE** su tabelle `Rate`/`Season`/`Pricing`/`Package`: query raw `psql` senza impostare
  `app.current_tenant` mostrano 0 righe anche se i dati esistono — verificare via API con JWT,
  non con psql diretto.
- **`ui-kit` non ha build step**: `exports["."]` punta a `./src/index.ts`, `web-staff` lo
  consuma come sorgente. Nessun comando `pnpm --filter @coralyn/ui-kit build` esiste.
- **Conteggio test**: `pnpm --filter @coralyn/web-staff test` include ANCHE gli spec di
  `ui-kit` (per config esplicita in `vitest.config.ts`, non è un bug). Baseline **verificata dal
  vivo il 2026-07-01**: ui-kit isolato = **14 file / 41 test**; web-staff (con ui-kit incluso) =
  **29 file / 83 test** (cioè 15 file/42 test propri di web-staff + gli stessi 41 di ui-kit).
  **Non regredire questi numeri.** Api: **non riverificati in questa sessione** (il refactor era
  solo FE) — la baseline storica (handoff A4.2) era unit 68 / e2e 73: **riverificare dal vivo**
  prima di assumerla, dato che D-032 aggiungerà endpoint backend e quella baseline potrebbe
  essere cambiata nel frattempo.
- **4 clienti demo creati ad-hoc via API** in questa sessione per verifica visiva (Mario Rossi
  ×2, Anna Verdi, Luca Bianchi) — rumore di dev innocuo, ignorabile o ripulibile.
- **`CatalogModule`** è raggiungibile solo transitivamente (importato da `BookingsModule`, non
  elencato in `AppModule.imports`) — funziona, ma la spec raccomanda di aggiungerlo esplicitamente
  quando si aggiungono i nuovi controller (pulizia, zero rischio).

## 6. DOPO D-032 — riprendere la roadmap

Rimane aperta **D-011** (prelazione abbonamenti: finestre/scadenze/rilascio automatico/priorità
per anzianità, estende A4.2) come prossimo slice di dominio candidato. Presentare pro/contro e
attendere conferma (workflow ADR-0009), a meno che l'utente non indichi già una priorità diversa.

## 7. Stato test da preservare

ui-kit **41** test (14 file) · web-staff **83** test (29 file, include ui-kit) ·
`corepack pnpm -r build` + `corepack pnpm eslint .` verdi (verificati su `main` post-merge).
Api: **da riverificare dal vivo** (non toccata in questa sessione). Prossimo ADR libero: **0034**
(non ne serve uno nuovo per D-032, vedi spec frontmatter). Decisioni rimandate rilevanti aperte:
D-011, D-012, D-013, D-009, D-018, D-025, D-030, D-033 (D-032 in esecuzione).

## 8. Macchina "zagor" / "Jays" (sync)

All'avvio esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only
origin/main` prima di fidarti del tree o creare un branch. Path: `C:\Users\zagor\Desktop\coralyn`
(zagor) o `C:\Users\Jays\Desktop\new` (Jays).

---

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina può essere
> C:\Users\Jays\Desktop\new).
>
> STATO: il refactor di astrazione componenti FE (ADR-0033) è COMPLETO, mergiato FF su main e
> pushato (HEAD 62471e9). Zero regressione visiva verificata live. Un fix ambientale (container
> API stantio, NON un bug di codice) è stato risolto rebuildando il container. La spec di design
> per D-032 (editor CRUD del listino) è pronta e già corretta dopo una verifica approfondita.
> Nessun branch pendente.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only
> origin/main` prima di fidarti del tree o creare un branch.
>
> PRIMA COSA (ADR-0009): leggi TUTTA la documentazione, in particolare l'handoff
> `docs/handoff/2026-07-01-pricing-editor-delegation.md` (questo doc — contiene una correzione
> importante su un "gap" che in realtà non esiste, §4), poi `docs/architecture/` (README +
> deferred + glossary + ADR-0032/0033), la spec autoritativa
> `docs/specs/2026-07-01-pricing-editor-d032-design.md`, `docs/design/design-system.md` §10.
>
> TASK: scrivi il piano TDD per D-032 (a partire dalla spec, già investigativa) e implementalo
> task-by-task (subagent-driven), un commit per layer (backend → contratti → frontend),
> test-first, partendo da un NUOVO branch da main. Nessuna migrazione DB serve (il vincolo di
> non-ambiguità Rate esiste già — leggi §4 dell'handoff prima di "correggere" quel punto).
> Non regredire i conteggi test (ui-kit 41 · web-staff 83 · api da riverificare dal vivo).
>
> DOPO D-032: presentami pro/contro per il prossimo slice (D-011 prelazione abbonamenti, o altro
> se preferisci), poi attendi la mia conferma.
