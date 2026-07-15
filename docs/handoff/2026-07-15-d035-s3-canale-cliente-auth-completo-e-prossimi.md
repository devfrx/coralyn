# Handoff — D-035 S3 (fondazione auth canale cliente) COMPLETA e mergiata · prossimi: push + S4 + backlog D-0xx

> **Data:** 2026-07-15 · **Autore sessione:** agente D-035 S3 (Tasks 7→12).
> **TL;DR:** **S3 completa** — la fondazione auth del **canale cliente self-service** è implementata (TDD),
> documentata (ADR-0049 + design docs) e **mergiata FF in `main` locale** (17 commit, `ba585e6`→`1368218`).
> **La decisione di auth/tenant-routing pubblico — che l'handoff precedente lasciava da brainstormare — è già
> presa e implementata** ([ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)):
> accesso **provisioned dal lido** (enrollment token opaco + PIN), **tenant derivato dal token** (denormalizzato,
> fuori-RLS), guard dedicato che popola `req.tenantId` → `forTenant`/RLS invariati. Risolte
> **[D-026]/[D-027]/[D-029]** per il canale cliente; **[D-028]** confermato non-trigger. **Resta S4** (feature
> release `source='customer'` + app `web-customer` PWA/QR + [D-037] 401 FE) — **NON serve ri-brainstormare
> l'auth**, è additiva sopra S3. ⚠️ **`main` locale NON è pushato** e ci sono **3 test pre-esistenti
> date-fragili** da fixare (sotto). Metodo: [ADR-0009] (design docs = DoD) + [ADR-0002] (rubric). Registro:
> [`deferred.md`](../architecture/deferred.md).

---

## 1. Stato `git` & baseline

- **`main` locale** = `1368218` (+ 1 commit docs-coherence di questa chiusura). **17 commit avanti su
  `origin/main`** (`ba585e6`→`1368218`), **⚠️ NON pushati** (l'utente ha scelto "merge locale, no push"). Branch
  `feat/customer-channel-d035-s3` **eliminato** (FF, nessun merge commit).
- **All'avvio prossima sessione:** `git fetch --all --prune`; qui il locale è **avanti** (non stale come al
  solito [[coralyn-machine-sync]]) → verifica che `origin/main` non abbia divergenze impreviste, poi **push**
  con OK utente (`git push origin main`).
- **Baseline (LIVE su `main` locale):** **api unit 238** · **api e2e 342 passati** (+11 nuovi S3: activate 3,
  refresh 2, me+logout 3, isolation 2, throttle 1) · typecheck (`tsc -p tsconfig.json --noEmit`) **pulito**.
  FE (web-staff/ui-kit/web-platform) **non toccato** in S3 — ri-contare a inizio S4.
- ⚠️ **3 fallimenti e2e PRE-ESISTENTI** in [`bookings.e2e-spec.ts`](../../apps/api/test/bookings.e2e-spec.ts)
  `describe('macchina a stati CTA (hardening)')` — **non** regressione S3 (file bookings **byte-identici** a
  pre-slice, provato con `git diff eea1385 -- …`). Causa: i test fanno `POST /absence-releases` con
  `date:'2026-07-10'` aspettandosi 200, ma [`bookings.service.ts:895`](../../apps/api/src/bookings/bookings.service.ts)
  rifiuta le date passate (`D < today` → `422 PAST_DATE`); con la data di sistema ≥ 2026-07-11 falliscono.
  **Fix (task già flaggato):** rendere le date di release relative a `todayInRome()` invece di hardcodarle.
- **D-049 risolta:** `test/jest-e2e.json` ha già `testTimeout: 20000` → il full-run e2e è stabile **senza**
  `--testTimeout` manuale (l'avvertenza dell'handoff precedente è superata).

## 2. Cosa è stato fatto (S3, Tasks 7→12 — TDD rosso→verde, un commit per task)

Modulo isolato [`apps/api/src/customer-auth/`](../../apps/api/src/customer-auth/). Tasks 1-6 (tabelle, contracts,
`CustomerTokenService`, `generatePin`, `CustomerJwtGuard`, provisioning/revoca) erano già committati da sessioni
precedenti; questa sessione ha chiuso 7→12:

- **T7 — `activate`** (`POST /customer/activate`, `@Public()`): consumo **one-time** (claim atomico
  `updateMany` con `activatedAt:null`) + PIN (2° fattore, argon2id) con **lock** a `CUSTOMER_PIN_MAX_ATTEMPTS`;
  ogni fallimento **401 generico** (D-029). `d404b32`.
- **T8 — `refresh`** (`POST /customer/refresh`): rotazione del refresh (`rotatedFromId`) + **theft-detection**
  (riuso di un refresh già ruotato ⇒ revoca **intera catena** `enrollmentTokenId`). `945e90e`.
- **T9 — `logout` + `GET /customer/me`**: logout revoca la sessione dal refresh; `me` con `CustomerJwtGuard`
  legge il profilo tenant-scoped via `forTenant`. `d1729d9`.
- **T10 — isolamento** (e2e): un access JWT del tenant A non risolve dati di B; enrollment di A non attivabile
  col PIN di B. Ho esteso [`customer-access.e2e-spec.ts`](../../apps/api/test/customer-access.e2e-spec.ts) con un
  **tenant B** completo nel setup. `ae89137`.
- **T11 — rate-limit** `@nestjs/throttler@^6.4.0` (**risolto a 6.5.0**): `ThrottlerModule.forRootAsync`
  (storage default, **niente APP_GUARD globale**) + `@UseGuards(ThrottlerGuard)` **a livello classe** sul solo
  `CustomerAuthController` → throttle **solo** `/customer/*`; limite env `CUSTOMER_THROTTLE_LIMIT` (default 10/60s).
  La suite funzionale alza il limite a 1000 nel `beforeAll` (evita 429 spuri); il 429 vero è in
  [`customer-throttle.e2e-spec.ts`](../../apps/api/test/customer-throttle.e2e-spec.ts). `1b4ee7b`.
- **T12 — docs (DoD [ADR-0009])**: nuovo **[ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)**;
  [`data-model.md`](../design/data-model.md) (2 entità ER + invariante); [`flows.md §9`](../design/flows.md)
  (macchina a stati accesso + rotazione/theft-detection); [`deferred.md`](../architecture/deferred.md)
  (D-026/027/029 → **Risolte**; D-028/035/037 aggiornate). `d6aa1af`.
- **Loose-end T1** (`1368218`): carve-out `reset-dev` (le 2 tabelle fuori-RLS in `KEEP_LIST` + test) e
  rifiniture al piano — erano incompiuti nel working tree, ora committati.

**Architettura (il cuore, [ADR-0049]):** 3 strati di credenziali — enrollment one-time (QR/link, provisioned) →
refresh device-bound rotante → access JWT `kind:'customer'` (30m). Tenant **derivato dal token**
(`establishmentId` denormalizzato sulle 2 tabelle **fuori-RLS** `CustomerEnrollmentToken`/`CustomerSession`,
mirror `CredentialSetupToken`/[ADR-0026]); `CustomerJwtGuard` (controller-scoped, rotte `@Public()` vs guard
staff) valida l'access JWT e popola `req.tenantId` → `forTenant`/RLS **invariati**. Ownership a 2 assi: RLS =
tenant, principal (`req.customer.id`) = cliente-nel-tenant. Segreti **solo-hash** (token `sha256`, PIN argon2id).

## 3. GOTCHA / lezioni (importante per la prossima sessione)

- **⚠️ pnpm `virtual-store-dir-max-length` mismatch su questa macchina.** `node_modules` è stato creato con
  `virtualStoreDirMaxLength=120` ma pnpm 11.9 (host Windows) usa un default diverso → **`pnpm add <pkg>`
  fallisce** con `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF` (e `--config`/`.npmrc`/env non lo aggirano). **Via
  che funziona:** aggiungere la dep **a mano in `package.json`** + `corepack pnpm install --no-frozen-lockfile`
  (il plain `install` NON scatta la guardia; `add` sì). Questo **ricrea `node_modules`** → **rigenerare il
  Prisma Client** subito dopo (`corepack pnpm --filter @coralyn/api exec prisma generate`), altrimenti i model
  spariscono. Verificato: typecheck + suite verdi dopo la rigenerazione. `pnpm-lock.yaml` committato.
- **Struttura `customer-access.e2e-spec.ts`:** i blocchi (activate/refresh/me/logout/isolation) sono **annidati**
  nel `describe` esterno per ereditare `app`/`prisma`/`adminToken`/`bookingId` e il `beforeAll`/`afterAll`. Helper
  `provision(bId?, aToken?)` (parametrizzato per il tenant B) e `activate()`. `-t '<pattern>'` matcha per nome
  annidato (es. `-t 'Customer activate'`).
- **`activationUrl` è relativo in test** (`CUSTOMER_APP_URL` non settato in `.env.test`) → estrai il token con
  regex `match(/token=([^&]+)/)`, **non** `new URL()`. In prod va settato `CUSTOMER_APP_URL`.
- **Env e2e:** `test/jest-setup-env.ts` carica `.env.test` **solo se la chiave non è già in `process.env`** →
  l'override di `CUSTOMER_THROTTLE_LIMIT` nel `beforeAll` funziona (settato prima del compile dell'app).
- **Comandi test (forma esatta):** unit `corepack pnpm --filter @coralyn/api test --runInBand -t '<pattern>'`;
  e2e `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t '<pattern>'` — **NON** ri-passare `--config`
  (già nello script → 0 test falso-pass). **Non** lanciare web-staff `test` e api `test:e2e` in parallelo.
- **DB dev/test:** container Docker su `5433` (`coralyn-db`); migration allineate (`prisma migrate status` OK).
  Reset dev via `db:reset` (⚠️ passare `DEV_ADMIN_PASSWORD` al reseed o login admin → 401; vedi handoff
  2026-07-10).

## 4. Prossimo: D-035 **S4** — canale cliente FE (release self-service). NON ri-brainstormare l'auth.

La spec S3+S4 è già scritta:
[`2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md`](../superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md).
S4 è **additiva** sopra l'auth S3 (che è **decisa e implementata** — [ADR-0049]). Scope concordato (dal
Self-Review del [piano S3](../superpowers/plans/2026-07-10-canale-cliente-auth-d035-s3.md), «Gap voluti S4»):

1. **`GET /me/subscriptions`** (endpoint cliente, `CustomerJwtGuard` + `@CurrentCustomer`): gli abbonamenti del
   cliente autenticato (tenant + `customerId` dal principal).
2. **Release lato cliente**: parametrizzare `ReleaseAbsenceInput.source` (già `operator|customer` sul modello,
   [ADR-0048], **zero retrofit**) e aggiungere **ownership** su `releaseAbsence`/`cancelAbsenceRelease` — il
   cliente può liberare **solo** i propri abbonamenti (vincola `customerId = req.customer.id`, non basta l'RLS
   tenant). Riusa la **meccanica S2 hardened** (carve giorno-singolo, consenso-gated, vincolante).
3. **App `web-customer`** (nuovo scaffold Vite/PWA — pattern [ADR-0041] come `web-platform`): flusso attiva
   (token da QR/link + PIN) → sessione (refresh rotante, storage sicuro) → lista abbonamenti → segnala assenza.
   Qui atterra **[D-037]** (gestione **globale** del `401` nel data-layer FE: interceptor → refresh o re-login;
   serve anche a web-staff).
4. **Consegna dell'`activationUrl`+PIN**: in S3 sono restituiti dal `POST /bookings/:id/customer-access` (mostrati
   una volta all'operatore). S4 può aggiungere consegna via email/QR nella Scheda cliente (riusa
   [ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md) / Mailpit).

**Invariante non negoziabile (regge da S1+S2):** rivendita **solo** su release esplicita; **nessuna presunzione
d'assenza**; release a **zero cassa** sull'abbonato ([ADR-0048]). **Consenso** (`absenceConsentAt`) resta il gate.

## 5. Altri D-0xx aperti (backlog [`deferred.md`](../architecture/deferred.md)) — da valutare con l'utente

- **⚠️ FIX SUBITO (task già flaggato):** i **3 test date-fragili** in `bookings.e2e-spec.ts` (§1) — renderli
  relativi a `todayInRome()`. Piccolo, ma sporca ogni full-run finché la data avanza.
- **D-037** — gestione globale `401` FE (web-staff **e** web-customer): naturale **dentro S4**.
- **D-005/D-038/D-040** — editor struttura «Configura»: layer pixel/coordinate (D-005), drag-reorder/re-parent
  (D-038), estrazione di `EstablishmentStructureView.vue` in composabili (D-040, ~406 righe). Erano legati al
  difetto §4.1 (dati legacy) dell'handoff 2026-07-10.
- **D-047** — audit di tenant per le azioni admin-in-tenant (include provisioning/revoca accesso cliente:
  `CustomerEnrollmentToken.createdByUserId` c'è, ma nessuna tabella audit dedicata).
- **D-028** — percorso privilegiato RLS per `User` (valutato in S3, **non-trigger**, resta hardening futuro).
- **D-036** (report avanzato/heatmap, lega a occupancy% D-048 §7) · **D-042/043/044/046** (platform console:
  impersonation, vista materializzata, `lastLoginAt`, deliverability invito).
- **Minori/infra:** D-015 (orari arbitrari), D-021 (zod runtime), D-023 (least-privilege DB), D-024 (consenso
  GDPR residuo), D-025 (cambio-ruolo residuo), D-031 (timezone per-tenant), D-033/034 (pricing
  multi-stagione/forfait), D-046. **D-012** (cabine/servizi) — ⚠️ l'utente lo ritiene poco utile, **non partire
  senza riconferma**.

## 6. Metodo (replicare — preferenze utente)

Gate review spec → (**brainstorming** obbligatorio se decisione strutturale — per S4 l'auth è già decisa, ma lo
scaffold `web-customer` e la UX del canale cliente lo giustificano) → **writing-plans** (TDD) →
**subagent-driven** (implementer per task; review a 2 stadi + whole-branch **opus**; fix Crit/Imp, Minor nel
ledger → triage finale) → **verifica LIVE su Docker** → **presentare e attendere OK esplicito** per merge FF
**e** per push (entrambi con OK utente). **Preferenza utente:** nelle scelte "coerente vs scorciatoia" vuole
sempre la **professionale/senza-debiti**; non proporre la scorciatoia come pari-merito. **DoD [ADR-0009]:** ogni
modifica a modello/flusso/UI/macchina-a-stati → aggiorna `docs/design/` nello stesso task; ogni debito → riga in
`deferred.md`.

## 7. Riferimenti

- Auth cliente: **[ADR-0049]** · spec [S3+S4](../superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md)
  · piano [S3](../superpowers/plans/2026-07-10-canale-cliente-auth-d035-s3.md).
- Codice: [`apps/api/src/customer-auth/`](../../apps/api/src/customer-auth/) ·
  e2e [`customer-access.e2e-spec.ts`](../../apps/api/test/customer-access.e2e-spec.ts) /
  [`customer-throttle.e2e-spec.ts`](../../apps/api/test/customer-throttle.e2e-spec.ts).
- Design docs: [`data-model.md`](../design/data-model.md) (ER) · [`flows.md §9`](../design/flows.md) (stati).
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · DoD [ADR-0009] · Assenze/consenso
  [ADR-0048] · Auth staff [ADR-0024] · Identità/RLS [ADR-0026] · Credential delivery [ADR-0042] · Hashing
  [ADR-0025] · App dedicata [ADR-0041].
- Handoff precedente: [2026-07-10-payments-4-3-e-reset-db-4-b-chiusi-e-prossimi.md](2026-07-10-payments-4-3-e-reset-db-4-b-chiusi-e-prossimi.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0025]: ../architecture/decisions/0025-hashing-password.md
[ADR-0026]: ../architecture/decisions/0026-identita-rls-utente.md
[ADR-0041]: ../architecture/decisions/0041-app-frontend-dedicata-platform.md
[ADR-0042]: ../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[ADR-0049]: ../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
