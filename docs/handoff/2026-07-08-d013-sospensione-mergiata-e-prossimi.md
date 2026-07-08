# Handoff — D-013 sospensione MERGIATA · prossime implementazioni

> **Data:** 2026-07-08 · **Autore sessione:** agente D-013 sospensione (sotto-slice 3/3).
> **TL;DR:** la **sospensione temporanea dell'abbonamento** (D-013, ultima sotto-slice funzionale) è
> **implementata, revisionata (whole-branch opus), verificata LIVE su Docker e mergiata FF su `main`**.
> Resta deferito di D-013 **solo cessione/subentro**. Registro autoritativo:
> [`deferred.md`](../architecture/deferred.md). Metodo/documentazione: **[ADR-0009]** (design docs versionati)
> e [ADR-0002](../architecture/decisions/0002-decision-rubric.md) (rubric).

---

## 1. Stato `git` & baseline (post-merge)

- **`main`** contiene la sospensione (merge **fast-forward** del branch `feat/subscription-suspension`, 11 commit
  feature `7ecd841..2568229` + design/piano `ab67557` + questo handoff/deferred). Il branch di lavoro non
  serve più: la prossima slice parte da `main` (fetch + ff).
- **Baseline da NON regredire** (LIVE su `main`): api unit **213** · api e2e **264** (`--runInBand`) ·
  web-staff **332** · ui-kit **111** · web-platform **16** · typecheck (api + `vue-tsc`) pulito.
  (Erano 209/249/316 prima di questa slice — solo aggiunte, zero regressioni.)
- All'avvio prossima sessione: `git fetch --all --prune`, poi `git checkout main` e **ff** (il locale si apre
  spesso stale — vedi memoria "Coralyn machine sync").

## 2. Cosa è stato fatto in questa sessione (D-013 sospensione)

Un abbonato libera un periodo del proprio abbonamento (rivendita abilitata nel buco) e poi riprende. Agisce
**solo sull'occupazione** (`BookingCoverage`, [ADR-0046]) — **mai** sullo span di contratto su `Booking`:
prezzo, rinnovo, **prelazione**, seniority restano invariati (un sospeso conserva i diritti). **Nessun nuovo ADR**
(additivo sulla fondazione coverage).

- **Modello dati:** nuova `BookingSuspension` (tenant-scoped **RLS ENABLE+FORCE + policy `tenant_isolation`**,
  pura storia/accountability; `endDate` nullable = discriminatore aperta/chiusa; `reactivatedAt`). Migration
  `…_booking_suspension` applicata a **dev + test**.
- **API:** `POST /bookings/:id/suspend` (chiusa `[S,R-1]` con carve testa+coda / aperta `[S,…)` con troncamento)
  e `POST /bookings/:id/reactivate` (ricopre `[R,end]` + pre-check anti-overlap → **409** se walk-in nella coda),
  **admin-only**, mirror di `terminate`. Invarianti in tx (422/409/404/403). Rimborso **suggerito nel FE**
  (server valida solo i bound), aggregato su `Booking.refundedAmount` (netto = `amountCollected − refundedAmount`
  fonte unica). `CustomerBookingDTO.suspensions[]` in projection.
- **FE (web-staff):** `suspensionRefund.ts` (pro-rata puro), hooks `useSuspend/useReactivateSubscription`,
  `SuspendSubscriptionModal` (toggle **Chiusa/Aperta** via `SegmentedControl`), `ReactivateSubscriptionModal`,
  righe stato + bottoni **Sospendi/Riattiva** in `CustomerSubscriptionsCard`, wiring in `CustomerDetailView`,
  handler MSW.
- **Contracts:** `SuspensionDTO`, `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`,
  `CustomerBookingDTO.suspensions?` (additivi; `BookingDTO` invariato).
- **Design docs ([ADR-0009], aggiornati contestualmente):** [`data-model.md`](../design/data-model.md) — ER
  portato allo stato corrente (aggiunti `BookingCoverage` e i campi disdetta, che erano mergiati ma **non
  documentati**, oltre a `BookingSuspension`); [`flows.md`](../design/flows.md) — macchina a stati + flusso del
  carve; [`mockups/subscription-suspension-modal.html`](../design/mockups/subscription-suspension-modal.html).
- **Verifica LIVE (Docker `--profile full`, Postgres reale + auth reale):** closed suspend 200 (span invariante,
  refund aggregato), buco rivendibile (201), testa/coda riservate (409), open+reattiva, conflitto riattiva 409,
  redirect-disdetta 422, `suspensions[]` completo nella Scheda. ✔
- **Spec/piano:** [spec](../superpowers/specs/2026-07-08-subscription-suspension-design.md) ·
  [piano](../superpowers/plans/2026-07-08-subscription-suspension.md).

### Debito residuo (Minor, non bloccanti — dalla whole-branch review)
Tutti tracciati, nessuno tocca la correttezza: input rimborso senza `:max` UI (il server valida); asserzione
e2e "second-hole resell" nice-to-have; test che non fissa l'overwrite di `reason` alla riattiva; churn
cosmetico da `prisma format` in `schema.prisma`; hook test asseriscono il body ma non l'invalidazione. Da
raccogliere in un eventuale pass di pulizia, **non prioritari**.

## 3. Priorità di dominio (CONFERMATA dall'utente) — cosa fare dopo, in ordine

Il registro **[`deferred.md`](../architecture/deferred.md) è la fonte autoritativa** delle voci D-0xx: leggilo
prima di pianificare. Ordine concordato:

1. **D-013 cessione/subentro** (piccola, chiude D-013). Subentro di un nuovo cliente su un abbonamento
   esistente / passaggio di titolarità. Additiva sul modello `Booking` (probabile campo/relazione di
   subentro); mirror del pattern disdetta/sospensione (admin-only, tx tenant-scoped). **Prossimo ADR 0047,
   prossimo D D-049** se servono.
2. **D-035 — Servizio clienti parallelo + "assenze comunicate"** (canale rivolto al **cliente del lido**,
   distinto dal gestionale operatore). È un **MODULO**, non una slice: **primo passo = `brainstorming` per
   decomporlo** in sotto-spec (poi una spec per sotto-dominio). **Invariante di dominio irrinunciabile:** la
   rivendita del posto di un abbonato è lecita **solo su segnalazione esplicita del cliente** — la sospensione
   D-013 è già l'"atto esplicito operatore↔abbonato"; D-035 aggiunge il canale-cliente della segnalazione.
   Lega a D-006 (hold/notifiche) e alla sospensione appena fatta.
3. **Backlog** (dopo, non ordinato rigidamente — valutare con l'utente):
   - **D-036** — Report cruscotto avanzato (heatmap occupazione, incassi a bucket, export CSV/PDF, rinnovo
     inline). L'occupazione istantanea è già corretta via coverage; qui è analitica/aggregazione.
   - **D-012** — Cabine/servizi accessori come risorse prenotabili. ⚠️ **L'utente lo ritiene poco utile: NON
     partire senza suo ok esplicito.**
   - **D-015** — Disponibilità a orari arbitrari (fasce libere).
   - **Security-gated** (esposizione pubblica / hardening): **D-026** refresh/revoca token, **D-027** rate-limit
     login, **D-028** RLS su `User`, **D-029** login a tempo costante, **D-037** gestione globale `401` nel
     data-layer FE, **D-041** filtro Prisma `P2002→409`, **D-047** audit azioni admin-in-tenant.
   - **Refactor/DX:** **D-040** estrazione `EstablishmentStructureView.vue` in composabili, **D-038**
     drag-reorder + re-parent struttura.

## 4. Gotcha chiave (ricorrenti — validi per ogni prossima slice)

- **pnpm, mai npm** (corepack; `npm install` corrompe `node_modules`). Dopo purge/install → `prisma generate`
  (il purge azzera il Prisma client).
- **Rebuild `@coralyn/contracts`** (`corepack pnpm -C packages/contracts build`) dopo ogni modifica a
  `src/index.ts`, **prima** di typecheck/e2e api e typecheck FE (i consumer importano da `dist/`, gitignored).
- **Migrazioni:** `prisma migrate` a **dev E test DB**, mai `db push`. **Convenzione test-DB (scoperta questa
  sessione):** i file env stanno alla **radice repo** (non `apps/api/.env.test`); comando:
  `pnpm dlx dotenv-cli -e <file> -- pnpm --filter @coralyn/api exec prisma migrate deploy`.
- **Nuove tabelle tenant:** `ENABLE + FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` con espressione
  `nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"` (copia da `BookingCoverage`).
- **API e2e:** ts-jest **type-checka** la suite → sempre `--runInBand`. Rotte sotto **`/api`**.
- **Occupazione vs contratto:** l'anti-overlap (`coverage_no_overlap`) e l'occupazione vivono su
  **`BookingCoverage`**; prelazione/rinnovo/prezzo leggono lo **span nominale su `Booking`**. Ogni feature che
  "libera tempo" agisce sulla copertura, **non** sullo span.
- **Data operativa** = `todayInRome()` (fuso `Europe/Rome`); nei test/live le date stanno nella stagione 2026.
- **Email dev** → Mailpit `:8025` (per design, non è un bug).

## 5. Metodo di lavoro (rispettato questa sessione — replicare)

1. **Gate review** della spec con l'utente prima di pianificare (scelte strutturali → si fermano e si chiede).
2. **`brainstorming`** per feature/moduli nuovi (D-035 lo richiede) → **`writing-plans`** (TDD, ordine per layer).
3. **`subagent-driven-development`**: implementer fresco per task (modello scelto per costo/rischio: cheap per
   trascrizione, opus per il cuore di dominio) + **review a due stadi** (spec + qualità) per task + **whole-branch
   review su opus** alla fine. Fix solo Critical/Important; Minor tracciati.
4. **[ADR-0009] Definition of Done:** modello dati/flusso/UI cambiati → **aggiornare `docs/design/`
   (ER/stati/mockup) nello stesso task**, non "dopo". Decisione strutturale → ADR.
5. **Verifica LIVE su Docker** (`docker compose --profile full up -d --build api web`; login
   `admin@coralyn.dev` / `coralyn-admin-8473`; il container `full` è pre-changes finché non lo ricompili).
6. **Presentare e attendere OK esplicito** per merge FF e **per il push su `main`** (push = solo con ok).

## 6. Riferimenti autoritativi

- Registro: [`deferred.md`](../architecture/deferred.md) · Rubric: [ADR-0002] · Design docs: [ADR-0009] ·
  Occupazione a intervalli: [ADR-0046] · Incasso/rimborso: [ADR-0011] · Auth: [ADR-0024].
- Sospensione: [spec](../superpowers/specs/2026-07-08-subscription-suspension-design.md) ·
  [piano](../superpowers/plans/2026-07-08-subscription-suspension.md).
- Disdetta (sotto-slice 1/3): [spec](../superpowers/specs/2026-07-06-subscription-termination-refund-design.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0011]: ../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0046]: ../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
