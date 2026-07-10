# Handoff — §4.3 (bug «da incassare») e §4.b (reset DB dev) CHIUSI · prossimi: §4.1 «Configura» + D-035 S3/S4 + backlog D-0xx

> **Data:** 2026-07-10 · **Autore sessione:** agente §4.3 + §4.b.
> **TL;DR:** chiusi e **mergiati FF + pushati** su `origin/main` due difetti dell'handoff precedente: **§4.3**
> (il «da incassare»/outstanding contava i **disdetti**; ora esclusi + «incassato» netto dei rimborsi + tipo/durata
> in lista — `0433652`) e **§4.b** (nuovo comando dev **`db:reset`**, abilitatore di §4.1 — `e488d82`). **Nessun
> nuovo ADR** (correttezza additiva; il reset è tooling dev). **Resta aperto** l'ultimo difetto §4 — **§4.1**
> (pagina «Configura» struttura, ora **sbloccato** dal reset) — e poi **D-035 S3/S4** (canale cliente) + backlog
> `deferred.md`. Metodo: **[ADR-0009]** (design docs versionati = DoD) + [ADR-0002] (rubric a 4 filtri). Registro
> autoritativo: [`deferred.md`](../architecture/deferred.md).

---

## 1. Stato `git` & baseline (post-merge+push)

- **`main` = `origin/main` = `e488d82`** (allineati, 0 divergenza). Due slice sopra il precedente `03bade6`:
  §4.3 = 1 commit (`0433652`); §4.b = 7 commit (`54fe8b7`→`e488d82`: spec, plan, T1-T3, doc-header, fix wave).
- **Baseline da NON regredire** (LIVE su `main`): api unit **227** · api e2e **309** (`--runInBand`; +9 reset-dev
  rispetto ai 300 post-§4.3) · web-staff **375** · ui-kit **111** · web-platform **16** · typecheck (api `tsc` +
  `vue-tsc -b --noEmit`) pulito.
- All'avvio prossima sessione: `git fetch --all --prune`, poi `git checkout main` e **ff** (il locale su zagor si
  apre spesso stale — [[coralyn-machine-sync]]).
- **⚠️ Full-run e2e flaky al default 5s** ([D-049](../architecture/deferred.md)): usa `--testTimeout=30000` per il
  full-run (`corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand --testTimeout=30000`);
  i mirati `-t '<pattern>'` non soffrono. **NON** lanciare web-staff `test` e api `test:e2e` in parallelo.
- **Nota DB dev:** la verifica LIVE di §4.b ha **azzerato e riseminato** `coralyn_dev` (Mario Verdi/legacy → demo
  pulita del seed). Container ricostruiti non necessari (l'e2e usa il codice sorgente, non il container `api`).

## 2. Cosa è stato fatto

### §4.3 — «da incassare»/outstanding contava i disdetti (bug di cassa) — `0433652`
`systematic-debugging` → root cause: `terminate` lascia il disdetto `status='confirmed'` (setta solo
`terminatedAt`), ma le due derivazioni dell'outstanding filtravano **solo lo status** → il residuo non-esigibile
di un disdetto veniva contato. Fix:
- **Report** [`reports.service.ts:47`](../../apps/api/src/reports/reports.service.ts): al `where` di `unpaid` +
  `terminatedAt: null`.
- **Scheda cliente** [`CustomerPaymentsCard.vue`](../../apps/web-staff/src/features/customers/CustomerPaymentsCard.vue):
  «Saldo aperto» esclude i disdetti; «Incassato» ora **netto dei rimborsi** (`Σ amountCollected − refundedAmount`);
  nuova colonna **«Tipo»** + **durata** (`startDate–endDate`) per le periodiche.
- **Definizione concordata** = *«crediti reali»*: si escludono **solo** disdetti + annullati; gli **scaduti** non
  incassati **restano** (credito reale). NB: `cancel` è un **update** `status='cancelled'` (NON un DELETE) → gli
  annullati erano già esclusi (l'handoff precedente diceva il contrario — corretto).
- **Doc DoD** [`flows.md §8`](../design/flows.md) — nota «Aggregati di cassa derivati». TDD: e2e report + nuovo
  `CustomerPaymentsCard.spec.ts`. **LIVE** (Mario Verdi): saldo 992→**192** (−800 disdetto), incassato 800→**653.40**
  (−146.60 rimborso).

### §4.b — reset totale del DB dev (comando `db:reset`) — `e488d82`
Subagent-driven (3 task TDD + review a 2 stadi/task + whole-branch **opus** Ready-with-fixes → I1/I2/N1 chiusi).
Spec [`2026-07-10-reset-db-dev-design.md`](../superpowers/specs/2026-07-10-reset-db-dev-design.md), piano
[omonimo](../superpowers/plans/2026-07-10-reset-db-dev.md).
- **Cosa fa:** azzera i dati di **tutti** i tenant (le **18 tabelle RLS FORCE**) preservando **solo** `User` +
  `Establishment` (+ `CredentialSetupToken`/`PlatformAuditLog`/`_prisma_migrations`). File
  [`prisma/reset-dev.ts`](../../apps/api/prisma/reset-dev.ts) (CLI) +
  [`prisma/reset-dev.core.ts`](../../apps/api/prisma/reset-dev.core.ts) (cuore riusabile); script `db:reset`.
- **Selettore auto-manutenuto:** il set = tabelle con `relforcerowsecurity=true` (ogni nuova tabella tenant nasce
  RLS FORCE per convenzione → inclusa da sola). **Coherence guard**: incrocia RLS-FORCE vs colonna
  `establishmentId` (carve-out di `User`, non-RLS by design [ADR-0026]) e **aborta rumorosamente** sulla
  divergenza (una tenant che scordasse RLS FORCE non passa in silenzio). + keep-list assertion anti-catastrofe.
- **Esecuzione:** `TRUNCATE … RESTART IDENTITY CASCADE` (owner `coralyn_app` può; **TRUNCATE ignora l'RLS** → azzera
  tutti i tenant, order-independent). Guardie **nel core** (`resetTenantData`): `NODE_ENV≠production` +
  `current_database()~/^coralyn_(dev|test)/i` + **`--yes` obbligatorio** (default = **dry-run** con stima righe
  `n_live_tup` — un `COUNT` esatto sarebbe filtrato a 0 dall'RLS FORCE senza GUC).
- **Test:** 9 (7 puri + 2 integrazione in **transazione con rollback** non distruttiva — `TRUNCATE` è transazionale
  in Postgres). **LIVE** (Docker): dry-run non tocca nulla; `--yes` → `Customer/Booking/Sector=0`,
  `User/Establishment` preservati; reseed OK.
- **Esegui** (ts-node nudo NON auto-carica `.env`, come `seed:demo`):
  ```
  DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
    corepack pnpm --filter @coralyn/api run db:reset            # dry-run
  DATABASE_URL="…" corepack pnpm --filter @coralyn/api run db:reset -- --yes   # esecuzione
  # Ripristina la demo. ⚠️ Passa DEV_ADMIN_PASSWORD o il seed resetta la password admin al default
  # 'coralyn-admin' (upsert update:{passwordHash}) → 401 al login. In alternativa: seed dentro il container.
  DATABASE_URL="…" DEV_ADMIN_EMAIL="admin@coralyn.dev" DEV_ADMIN_PASSWORD="coralyn-admin-8473" \
    corepack pnpm --filter @coralyn/api exec prisma db seed
  ```

## 3. GOTCHA / lezioni

- **`cancel` è soft (status update), non DELETE** — gli annullati sono esclusi da report/scheda via `status`; i
  **disdetti** restano `confirmed` con `terminatedAt` → vanno esclusi su **quella** dimensione (§4.3).
- **RLS FORCE = marcatore di dato tenant** — usato come single-source-of-truth per il reset; `User` è l'eccezione
  (ha `establishmentId` ma è non-RLS, [ADR-0026]) → carve-out esplicito. **`TRUNCATE` non è filtrato dall'RLS**
  (a differenza di SELECT/INSERT/UPDATE/DELETE): l'owner azzera tutti i tenant senza GUC.
- **Stima righe, non COUNT** — con RLS FORCE senza GUC un `SELECT count(*)` torna 0; per il dry-run si usa
  `pg_stat_user_tables.n_live_tup` (non RLS-filtrato).
- **`TRUNCATE` è transazionale in Postgres** → si testa in una tx con rollback (zero impatto sul DB condiviso).
- **script ts-node nudi (`seed:demo`, `db:reset`) NON caricano `.env`** → passa `DATABASE_URL` a mano (header dei
  file lo documenta). Il main seed (`prisma db seed`) invece lo carica (via prisma CLI).
- **⚠️ `prisma db seed` dall'host resetta la PASSWORD ADMIN** → `seed.ts` fa `user.upsert({ update: { passwordHash } })`
  con `DEV_ADMIN_PASSWORD ?? 'coralyn-admin'`: se rilanciato da host **senza** `DEV_ADMIN_PASSWORD`, sovrascrive la
  password admin col default `'coralyn-admin'` → **401** al login (la password vera `coralyn-admin-8473` sta
  nell'env del container). Reseed corretto: passa `DEV_ADMIN_PASSWORD="coralyn-admin-8473"`, **oppure** rilancia il
  seed **dentro il container** (`docker exec coralyn-api …`, ha già l'env). Successo 2026-07-10 dopo la verifica
  LIVE di §4.b (il reseed da host aveva clobberato la password; ripristinata rilanciando col DEV_ADMIN_PASSWORD).
- **Full-run e2e flaky al default 5s** → [D-049](../architecture/deferred.md), usa `--testTimeout=30000`.
- **api e2e mirati** richiedono `--config ./test/jest-e2e.json` o jest matcha 0 test (falso pass). **api unit** =
  `corepack pnpm --filter @coralyn/api run test` (rootDir=src; i test di tool sotto `prisma/` vanno in `test/*.e2e-spec.ts`).

## 4. §4.1 — pagina «Configura» struttura stabilimento (ULTIMO difetto §4 aperto, ora SBLOCCATO)

Molti errori/bug segnalati, **sospetto dati legacy** nel DB dev (stato creato prima dei refactor struttura). **Il
reset §4.b è l'abilitatore:** riproduci su dati puliti —
```
DATABASE_URL="…" corepack pnpm --filter @coralyn/api run db:reset -- --yes
DATABASE_URL="…" DEV_ADMIN_PASSWORD="coralyn-admin-8473" corepack pnpm --filter @coralyn/api exec prisma db seed
```
(⚠️ `DEV_ADMIN_PASSWORD` obbligatorio nel reseed da host — vedi §3, altrimenti login admin → 401)
poi ricostruisci la struttura **da UI** (bottone «Configura» dello Stabilimento) e osserva quali difetti emergono
su stato pulito (vs. quali sparivano perché erano solo dati sporchi). Indagare
[`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue)
(~406 righe → lega a **D-040**, estrazione in composabili/child) + gli endpoint struttura (settori/file/ombrelloni/
tipologie in `CatalogModule`/map). Metodo: **`systematic-debugging`** (riprodurre prima di fixare) + DoD [ADR-0009]
+ rubric [ADR-0002]. Se il refactor D-040 aiuta il fix, valutarlo nella stessa slice.

## 5. D-035 S3 → S4 (canale cliente self-service) — decomposizione già concordata

Con S1+S2 (operatore) e §4.2 (hardening) e §4.3/§4.b chiuse, resta il **canale cliente**. Invariante non
negoziabile (regge in S1+S2): **rivendita SOLO su release esplicita registrata; nessuna presunzione d'assenza**;
release a **zero cassa** sull'abbonato ([ADR-0048]).

1. **S3 — auth/identità cliente.** Il `Customer` (oggi **senza login**, solo anagrafica, anonimizzabile GDPR — non
   è uno `User`) deve autenticarsi al **suo** canale: magic-link/OTP (→ Mailpit in dev) o token-QR per abbonamento.
   Qui atterrano le security-gated **[D-026]** (refresh/revoca) · **[D-027]** (rate-limit login) · **[D-028]** (RLS
   identità) · **[D-029]** (login a tempo costante). **⚠️ Forza la decisione di TENANT-ROUTING PUBBLICO che oggi
   NON esiste:** web-staff/platform risolvono il tenant dal **JWT** dopo login ([ADR-0024]), ma il bagnante arriva
   **prima** di autenticarsi → sottodominio / path / QR (spesso il più naturale). Frammento di **[D-002]** (infra
   SaaS, [ADR-0010]) tirato dentro D-035. **Decisione più pesante del modulo → aprire con gate review +
   brainstorming (obbligatorio).**
2. **S4 — PWA/QR self-service release.** Il cliente autenticato sceglie il giorno e invia la release — **riusa la
   meccanica S2 hardened** (`AbsenceRelease.source='customer'` **già predisposto**, additivo zero-retrofit). Qui
   atterra **[D-037]** (gestione globale `401` FE). Quarta superficie dell'app (nuovo scaffold Vite/PWA — [ADR-0041]).

## 6. Altri D-0xx aperti (backlog `deferred.md`) — da valutare con l'utente

- **D-049** — `testTimeout` esplicito in `test/jest-e2e.json` (NUOVO, questa sessione): rende il full-run e2e
  robusto senza `--testTimeout=30000` manuale. Fix one-line, non urgente.
- **D-036** — report cruscotto avanzato (heatmap/medie/export; lega all'occupancy% D-048 §7).
- **D-040** — estrazione di `EstablishmentStructureView.vue` (~406 righe) in composabili/child (**utile prima/durante
  §4.1**); **D-038** — drag-reorder/re-parent nell'editor struttura.
- **D-047** — audit di tenant per le azioni admin-in-tenant; **D-041** — filtro globale Prisma `P2002` → `409`.
- **D-012** — cabine/servizi accessori. **⚠️ l'utente lo ritiene poco utile — NON partire senza sua riconferma.**
- Minori/infra: D-015 (orari arbitrari), D-021 (zod runtime), D-023 (least-privilege DB), D-024 (consenso GDPR
  residuo), D-025 (cambio-ruolo residuo), D-031 (timezone per-tenant), D-033/034 (pricing multi-stagione/forfait),
  D-042/043/044/046 (platform console).

## 7. Metodo (replicare)
Gate review spec con l'utente → (**brainstorming** se modulo/decisione strutturale — **obbligatorio per S3**) →
**writing-plans** (TDD) → **subagent-driven** (implementer per task col modello per costo/rischio; review a **due
stadi** per task + whole-branch **opus**; fix solo Crit/Imp, Minor nel ledger `.superpowers/sdd/progress.md` →
triage alla review finale) → **verifica LIVE su Docker** → **presentare e attendere OK esplicito** per il merge FF
**e per il push** (entrambi con ok utente). **Preferenza utente:** nelle scelte "coerente vs scorciatoia" vuole
sempre la soluzione **professionale/senza-debiti/meno-pigra**; non proporre la scorciatoia come pari-merito.
**DoD [ADR-0009]:** ogni modifica a modello/flusso/UI/macchina-a-stati → aggiorna `docs/design/` (Mermaid/mockup)
nello stesso task; ogni debito consapevole → riga in `deferred.md`.

## 8. Riferimenti
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] ·
  Incasso [ADR-0011] · Assenze [ADR-0048] · Auth [ADR-0024] · Identità/RLS [ADR-0026] · Multi-tenant [ADR-0010] ·
  App platform [ADR-0041].
- §4.3: [`flows.md §8`](../design/flows.md). §4.b:
  [spec](../superpowers/specs/2026-07-10-reset-db-dev-design.md) · [piano](../superpowers/plans/2026-07-10-reset-db-dev.md).
- Handoff precedente (§4.2 hardening CTA, con §4 difetti): [2026-07-09-cta-state-machine-hardening-e-prossimi.md](2026-07-09-cta-state-machine-hardening-e-prossimi.md).

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0010]: ../architecture/decisions/0010-isolamento-multi-tenant.md
[ADR-0011]: ../architecture/decisions/0011-incasso-base-nel-core.md
[ADR-0024]: ../architecture/decisions/0024-strategia-auth.md
[ADR-0026]: ../architecture/decisions/0026-identita-rls-utente.md
[ADR-0041]: ../architecture/decisions/0041-app-frontend-dedicata-platform.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-002]: ../architecture/deferred.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
