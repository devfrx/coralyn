# Handoff — 2026-07-08 · `BookingCoverage` mergiato · spec Sospensione scritta · prossimi (D-013 → D-035 + backlog D-0xx)

> Documento di consegna per la **prossima sessione**. Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**:
> brainstorming (decisioni risolte con l'utente) → `writing-plans` (TDD) → subagent-driven (un commit per
> layer, TDD, review a due stadi + whole-branch finale su **opus**) → verifica LIVE su Docker → **presenta e
> attendi conferma**. **Push su `main` = FF con ok ESPLICITO dell'utente.** **Leggi questo per primo.**

---

## 0. Situazione GIT (all'avvio fai il sync §7)
- **`main` = `origin/main` = `133cfc7`** — contiene la **fondazione `BookingCoverage`** (D-013 sospensione,
  Spec 1/2, [ADR-0046]) mergiata e pushata questa sessione.
- **Branch di lavoro `feat/subscription-suspension`** (da `main` `133cfc7`), tree pulito. Contiene **solo la
  spec** della sospensione vera:
  - `db324d8` docs: spec sospensione abbonamento (D-013 sotto-slice 3/3)
  - **NON pianificata, NON implementata.** Riprendi da qui: `git checkout feat/subscription-suspension`.
- **Prossimo ADR libero: 0047. Prossimo D libero: D-049.** Nessuna migrazione pendente su main.
- ⚠️ Molto lavoro arriva dall'altra macchina (Jays) — all'avvio `git fetch --all --prune`; il locale si apre
  spesso **stale** ([[coralyn-machine-sync]]; successo oggi: locale era behind 56 all'avvio).

## 1. Cosa è stato fatto questa sessione
1. **Priorità di dominio CONFERMATA dall'utente:** **D-013 sospensione → poi D-035** (canale cliente
   "assenze comunicate"). Motivazione: la sospensione e D-035 condividono il modello "libera il posto di un
   abbonato su atto esplicito" → si costruisce la fondazione una volta.
2. **Spec 1/2 — refactor `BookingCoverage` — IMPLEMENTATA + MERGIATA su `main`** (`133cfc7`, [ADR-0046]).
   L'occupazione fisica è passata da `Booking.startDate/endDate` (+ minuti + `booking_no_overlap`) a un child
   table **`BookingCoverage`** (1..N intervalli/prenotazione); il vincolo GiST anti-overlap è rilloccato come
   **`coverage_no_overlap`** (semantica identica, unico garante; vecchio constraint + colonne minuti su
   `Booking` **rimossi**). `Booking.startDate/endDate` = **span di contratto** (prezzo/rinnovo/**prelazione**/
   seniority, invariati); coverage = **occupazione fisica** (mappa/report/anti-overlap). **Behaviour-preserving**
   (1 coverage/booking = equivalente al pre-refactor). Eseguito parallel-change (expand→migrate→contract) in 4
   task, ognuno review-clean, **whole-branch opus = Ready to merge**, **LIVE Docker PASS**.
   Spec [2026-07-08-booking-coverage-refactor-design.md](../superpowers/specs/2026-07-08-booking-coverage-refactor-design.md),
   piano [omonimo](../superpowers/plans/2026-07-08-booking-coverage-refactor.md).
3. **Spec 2/2 — sospensione vera — SCRITTA** (branch `feat/subscription-suspension`, non pianificata).

## 2. PROSSIMO PASSO IMMEDIATO — pianificare + implementare la Sospensione (Spec 2)
**Spec autorevole:** [2026-07-08-subscription-suspension-design.md](../superpowers/specs/2026-07-08-subscription-suspension-design.md).
L'utente stava per rivederla quando ha chiuso: **prima azione = fargli confermare la spec** (gate review),
poi `writing-plans`. Sintesi del design confermato:
- Child table **`BookingSuspension`** (storia pura, RLS FORCE): `startDate` (S≥oggi), `endDate?` (R-1; NULL =
  **aperta**, da riattivare), `refundedAmount`, `reason?`, `reactivatedAt?`. Un abbonamento → più sospensioni
  non sovrapposte.
- **Due modalità** unificate da `endDate` nullable: **chiusa** `[S,R-1]` (spezza la copertura in
  `[start,S-1]`+`[R,end]`, `[R,end]` resta riservato) · **aperta** `[S,…)` (tronca a `[start,S-1]`, poi
  **Riattiva** `R` ri-aggiunge `[R,end]` con **pre-check anti-overlap → 409** se il rientro fu rivenduto).
- **Rivendita nel buco abilitata** (atto esplicito, coerente con l'invariante D-035). **Solo da oggi in
  avanti.** Rimborso **mirror-disdetta** (suggerimento pro-rata FE, operatore sovrascrive, server valida bound),
  **aggregato su `Booking.refundedAmount`**; per l'aperta si salda **alla riattivazione**.
- Endpoint admin-only `POST /bookings/:id/suspend` e `/reactivate` (ritornano `BookingDTO`; il FE invalida la
  Scheda). `CustomerBookingDTO += suspensions[]`. UI nella Scheda cliente accanto a "Disdici".
- **Contratto invariato** (prelazione/rinnovo intatti) e **report/occupancy invariati** (leggono già coverage
  + `refundedAmount`) = payoff della fondazione.
- Punti delicati per il piano: la **meccanica del carve** con i boundary (spec §4.1), gli **invarianti** (§6 —
  la chiusa richiede ritorno *entro* la stagione, altrimenti rimanda alla disdetta), il **conflitto di
  riattivazione** (§3-#5). **Nessun nuovo ADR** (additiva sulla fondazione).
- Ordine piano suggerito (spec §15): schema+migration+contracts → service `suspend` chiusa+carve+invarianti →
  service aperta+`reactivate`+conflitto → controller+e2e → FE card+2 modali+mock.

## 3. Backlog dominio D-0xx (registro autoritativo: [`deferred.md`](../architecture/deferred.md)) — CONFERMA priorità
Ordine di valore/sequenza discusso questa sessione (l'utente ha scelto D-013→D-035; il resto è da riconfermare):
- **D-013 (dopo la sospensione):** resta solo **cessione/subentro** dell'abbonamento (cambio intestatario).
  Piccola, additiva. Chiude D-013.
- **D-035 — canale cliente "assenze comunicate"** (IL prossimo grande, priorità confermata dopo D-013).
  ⚠️ È un **MODULO**, non una slice: nuovo attore (il cliente), superficie PWA/QR, auth per quell'attore,
  **consenso "assenze comunicate"** sull'abbonamento, **release per-fascia+giorno** (riusa il carve su
  `BookingCoverage`, granularità per-giorno). **Invariante non negoziabile:** rivendita SOLO su segnalazione
  esplicita del cliente (niente presunzione d'assenza). Client-facing ⇒ tira dentro la sicurezza gated
  (D-026/027/029) come **prerequisiti**. Primo passo: **brainstorm-per-decomporlo** in sub-progetti.
- **D-036 — report cruscotto avanzato** (heatmap, medie di periodo, serie stagione, export, rinnovo inline).
  Contiene un nodo di correttezza: la **ridefinizione formale dell'occupancy%** sotto slot sovrapposte/sospesi
  (deferita da D-048 §7). Additivo, basso rischio.
- **D-012 — cabine/servizi accessori** prenotabili. ⚠️ **Priorità da riconfermare: l'utente lo ritiene poco
  utile per la sua realtà.** Additivo (stesso pattern ombrellone) ma non partire senza suo ok.
- **D-015 — orari arbitrari** (fasce fini). Basso; il modello `Fascia` è generalizzabile su richiesta.
- **Security-gated (non innescati finché il deploy è interno; diventano prereq DENTRO D-035 client-facing):**
  D-026 refresh/revoca token · D-027 rate-limit login · D-028 RLS su `User` · D-029 login a tempo costante ·
  D-037 gestione globale `401` nel data-layer FE · D-041 filtro `P2002→409` globale · D-047 audit di tenant
  per azioni admin-in-tenant · D-046 deliverability inviti in console.
- **Refactor:** D-040 estrazione `EstablishmentStructureView.vue` in composabili (la vista è cresciuta con le
  Fasi UI) · D-038 drag-reorder struttura.
- **Altri deferiti a basso impatto** (vedi registro): D-002/003/004/005/006/007/008/009/010/014/016/018/019/
  020/021/023/031/033/034/042/043/044.

## 4. Altri thread pendenti (non-D) — verifica, non dati-finti-in-app
- **Fix mappa (chip `task_4e9fef8a`, 2026-07-03):** "periodica-pomeriggio invisibile / box fasce non
  cliccabili". **Probabilmente RISOLTO** dalla slice N-fasce (drawer a N box reali selezionabili) —
  **verifica** sulla mappa LIVE prima di considerarlo aperto; se residuo, è FE in `MapView.vue`.
- **Hardcode Sidebar** ("Stagione 2026" / ruolo "Amministratore"): **GIÀ SISTEMATI** (commit `a77cd03`,
  derivano ora da sessione/stagione reale). Non più pendenti.
- **MSW (`apps/web-staff/src/mocks/`)** è **SOLO per i test**: in dev/prod il FE colpisce il backend reale via
  proxy Vite. **Non** è "dato finto in app".

## 5. Baseline test (da NON regredire) — verificata LIVE questa sessione su `main` `133cfc7`
api unit **209** · api e2e **249** (`--runInBand`) · web-staff **316** · ui-kit **111** · web-platform **16** ·
typecheck **pulito**. ⚠️ e2e paralleli **flaky** su zagor → SEMPRE `--runInBand` (targettabile con `-- <pattern>`).

## 6. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **pnpm, MAI npm** ([[coralyn-pnpm-not-npm]]): `corepack pnpm` da root; `CI=true corepack pnpm install` se
  chiede purge senza TTY. **Il purge azzera il Prisma client** → se i test api falliscono con errori Prisma:
  `corepack pnpm --filter @coralyn/api exec prisma generate`.
- **`@coralyn/contracts` compila in `dist/` (gitignored):** dopo modifica a `src/index.ts` →
  `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test (api E FE). La sospensione
  TOCCA i contracts (`SuspensionDTO`, input) → rebuild obbligatorio.
- **Migrazioni raw SQL** (trigger/constraint/RLS invisibili a Prisma): `migrate deploy` a **dev E test DB**,
  **MAI `db push`**. Tabelle nuove tenant-scoped → **RLS `ENABLE`+`FORCE` + policy `tenant_isolation`** (pattern
  in `20260708064029_booking_coverage/migration.sql`; per tabelle con backfill, INSERT **prima** di abilitare
  FORCE, `NO FORCE`/`FORCE` attorno alla lettura). `BookingSuspension` è **vuota** → nessun backfill.
- **api e2e ts-jest TYPE-CHECKA** → allinea contracts+consumer nello stesso layer; `--runInBand`.
- **Modello `BookingCoverage` (fondazione, da conoscere per la sospensione):** occupazione = intervalli su
  `BookingCoverage` (non più su `Booking`); l'anti-overlap è `coverage_no_overlap` (matcher
  `isBookingOverlapExclusion` in `booking.errors.ts` matcha questo nome). Ogni write d'occupazione deve tenere
  la coverage in sync (create inserisce 1 coverage; `terminate` tronca la coverage; cancel → trigger status-sync
  `Booking→coverage`). Il pre-check anti-overlap in `priceAndWrite` legge le **coverage**. Le letture di
  **contratto** (prelazione/rinnovo/prezzo/stagione/GDPR) restano su `Booking.startDate/endDate` — **la
  sospensione NON deve toccarle** (un sospeso conserva i diritti).
- **Rotte api sotto prefisso `/api`** (es. `POST /api/auth/login` → `{accessToken}`; `GET /api/map?date=`).
- **`web-staff/vitest.config.ts` GLOBA gli spec ui-kit** → uno spec ui-kit conta in ENTRAMBE le suite.
- **Container**: `docker compose --profile full up -d --build [api web web-platform]`. Porte web-staff **8080**,
  web-platform **8081**, api **3000**, db **5433**, Mailpit **8025**. Login admin
  `admin@coralyn.dev`/`coralyn-admin-8473`; superuser `super@coralyn.dev`/`coralyn-super-9182`. Email → Mailpit
  ([[coralyn-dev-email-mailpit]]).

## 7. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune`; **NON** fare reset che perda `feat/subscription-suspension`; fai
`git checkout feat/subscription-suspension` (o riparti da `main` per un altro D con ok utente). Path zagor
`C:\Users\zagor\Desktop\coralyn` / Jays `C:\Users\Jays\Desktop\new`. Rebuild container + `@coralyn/contracts`
prima di testare in dev. Per slice creative: `brainstorming` (RISOLVI le decisioni con l'utente) →
`writing-plans` → `subagent-driven-development` (review 2 stadi per layer + whole-branch su **opus**) → verifica
LIVE → **presenta e attendi conferma**. Traccia in `.superpowers/sdd/progress.md` (ledger; contiene lo storico
dettagliato di questa slice). Push su `main` = **FF con ok ESPLICITO**.

## 8. Ancore di codice per la Sospensione (VERIFICATE 2026-07-08, `main` `133cfc7`)
- **Template disdetta (mirror da seguire):** [bookings.service.ts](../../apps/api/src/bookings/bookings.service.ts)
  `terminate()` (invarianti + tronca `Booking.endDate` **e** la coverage via `tx.bookingCoverage.updateMany`);
  [bookings.controller.ts](../../apps/api/src/bookings/bookings.controller.ts) (`@Post(':id/terminate')`
  `@Roles(Role.Admin)`); [contracts](../../packages/contracts/src/index.ts) (`TerminateSubscriptionInput`,
  `BookingDTO.refundedAmount/terminatedAt`); FE Scheda cliente
  [CustomerSubscriptionsCard.vue](../../apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue) +
  `TerminateSubscriptionModal.vue`.
- **Fondazione coverage:** `model BookingCoverage` in [schema.prisma](../../apps/api/prisma/schema.prisma);
  carve/lettura coverage in [bookings.service.ts](../../apps/api/src/bookings/bookings.service.ts)
  (`priceAndWrite` inserisce coverage; `terminate` la tronca); migration
  `apps/api/prisma/migrations/20260708064029_booking_coverage/` (tabella+trigger+constraint+RLS — modello per
  la migration `BookingSuspension`).
- **Proiezione Scheda:** [customer-booking.projection.ts](../../apps/api/src/bookings/customer-booking.projection.ts)
  (aggiungere `suspensions[]` al DTO).

## 9. Messaggio di delega (apertura prossima sessione)
Fornito separatamente nel turno di chat che accompagna questo handoff.
