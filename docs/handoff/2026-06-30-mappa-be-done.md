# Handoff 2026-06-30 (sera) — Modulo `mappa` (modello + lettura) COMPLETATO + delega successiva

> Documento di consegna. Qui c'è **lo stato attuale** dopo l'implementazione del backend
> mappa (entità + endpoint di lettura) e lo sgancio della `MappaView` dal mock, più la
> **delega dell'increment successivo**. Il task di partenza è
> [2026-06-30-mappa-be.md](2026-06-30-mappa-be.md) (storico, ora completato).

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** (vincolo del progetto):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR),
> tutte le `docs/specs/`, tutte le `docs/design/`, tutti i `docs/plans/` e i `docs/handoff/`.
> Più `README.md` di root e `packages/contracts/src/index.ts`.

---

## 1. Stato attuale del repo (branch `feat/mappa-be`, da PR/merge su `main`)

Tutto verificato. Test verdi: **ui-kit 14 · web-staff 40 · api unit 9 · api e2e 22**
(e2e contro `coralyn_test`); `pnpm -r build` + typecheck OK; Docker full-stack ricostruito
(`--profile full up -d --build`) con `GET /api/mappa` via `:8080` che ritorna la struttura
seedata (login `admin@coralyn.dev`).

### Cosa è stato aggiunto in questa sessione

**Backend** — 5 nuove entità mappa + 1 area di endpoint di lettura:
- Prisma: `Settore`, `Fila`, `Ombrellone`, `Tipologia`, `Fascia` — **tutte tenant-scoped**
  (`stabilimentoId` + RLS `tenant_isolation`, ADR-0010). Migrazione `20260630093817_mappa`:
  tabelle generate da Prisma + **RLS SQL grezza** appesa a mano (stesso pattern di `…_rls`).
  - `Ombrellone`: `@@unique([stabilimentoId, etichetta])`, `tipologiaId` nullable (NULL = Normale,
    ADR-0016), `posizionePresentazione Json?` **modellata ma inutilizzata** (layer visivo D-005).
  - `Fascia`: `oraInizio`/`oraFine` come SQL `time` (`@db.Time(0)`), **non** esposti nel DTO.
- Endpoint: `GET /api/mappa?data=YYYY-MM-DD` → `MappaGiornoDTO`. Protetto dalla `JwtAuthGuard`
  globale (401 senza Bearer). `data` opzionale (default oggi, ISO, validata + echeggiata).
- `MappaModule` (controller + service) + **proiezione pura** `proiettaMappaGiorno` (unit-testata).
  - **`statoPerFascia` = `libero`** per ogni fascia (chiavi = id delle fasce ritornate). È il
    **confine d'incremento**: gli stati reali (abbonato/giornaliero/prenotato) arrivano con le
    **prenotazioni**. Dichiarato con commento nel codice (`mappa.projection.ts`).
- Seed (`prisma/seed.ts`): struttura demo **idempotente** per `DEV_STABILIMENTO_ID` —
  2 tipologie (Mini-palma `leaf`, Palma `palmtree`), 2 fasce (Mattina/Pomeriggio), 2 settori
  (Centro ordine 1, Speciali ordine 99), 4 file, **34 ombrelloni** (Fila 1/2 mini, Fila 3
  normali, Palme P1–P4). Gli upsert mappa girano **dentro una transazione con la GUC
  `app.current_tenant`** (le tabelle hanno RLS FORCE → il PrismaClient diretto sarebbe bloccato).

**Frontend** — `web-staff`:
- `MappaView` ora gira sul **backend reale** in dev: il mock `/api/mappa` è stato **spostato**
  da `mocks/handlers.ts` (dev, ora vuoto → worker su `bypass`) a `mocks/server.ts` (solo test,
  fixture `mappaSeed` conservata). `MappaView.spec` resta verde sulla fixture.
- `useMappaGiorno.ts` passa `session.dataAttiva`: `apiFetch('/mappa?data=' + dataAttiva)`.
- **Contratti `@coralyn/contracts` invariati** (erano già definiti).

### Cosa esiste DAVVERO ora (mappa misurata)

- **Backend**: 8 entità in DB (`Stabilimento`, `Cliente`, `Utente`, + `Settore`/`Fila`/
  `Ombrellone`/`Tipologia`/`Fascia`). Endpoint: auth (`login`/`me`), clienti (CRUD), **mappa
  (GET lettura)**, health. `PrismaService.forTenant` + GUC `app.current_tenant` su tutte le query.
- **NON esistono ancora**: setup-form/CRUD mappa (ADR-0014), prenotazioni, catalogo/listino,
  abbonamenti, cassa, audit. Staff-mgmt: `Utente` presente ma **niente CRUD** e **RBAC non
  applicato** (nessun `@RequireRole`).
- **Frontend** REALI (backend vero): Login, Clienti (lista+dettaglio), **Mappa (lettura)**.
  STATICHE (demo hardcoded): Prenotazioni, Listino, Report, Stabilimento. Nella `MappaView` il
  drawer prenotazione/pagamento e il modale "Nuova prenotazione" restano **mock seam** (CTA
  presenti ma non collegate: serviranno le prenotazioni).

---

## 2. Increment successivo (delega)

**Decisione (accordi scritti):** dopo la mappa, le due strade aperte sono **prenotazioni** e
**staff-mgmt D-025**. La scelta naturale è **prenotazioni**: accendono gli `statoPerFascia`
reali sulla mappa (oggi tutto `libero`), sbloccano cassa/pricing e danno valore operativo
immediato; lo staff-mgmt D-025 è *deferred* a impatto basso. Confermare in apertura sessione.

### Se prenotazioni (consigliato)
- Modello `Prenotazione` (vedi [data-model](../design/data-model.md)): tenant-scoped + RLS,
  legame `Cliente`/`Ombrellone`/`Fascia`/`Pacchetto`, date, stato, incasso base (ADR-0011),
  rinnovo self-link (ADR-0012). **Invariante anti-overlap per slot** (ADR-0013).
- La **proiezione mappa diventa slot-aware**: `proiettaMappaGiorno` dovrà derivare lo stato per
  (ombrellone, data, fascia) dalle prenotazioni confermate invece di `libero` fisso. Il confine è
  già isolato in `apps/api/src/mappa/mappa.projection.ts`.
- DTO prenotazioni in `@coralyn/contracts` (additivi). Collegare drawer/modale `MappaView`.

### Se staff-mgmt D-025
- `Utente` CRUD + `attivo`/`creatoIl`, `@RequireRole(admin)`, sezione FE in `StabilimentoView`.

---

## 3. Verifica per layer (com'è stata fatta) + comandi

- **Migrazione**: `prisma migrate dev --create-only --name mappa` → tabelle; RLS appesa a mano;
  `prisma migrate dev` applica + `generate`. RLS verificata: `rowsecurity = t` su tutte e 5.
- **api unit** (`pnpm --filter @coralyn/api test`): 9 verdi (proiezione: statoPerFascia libero,
  chiavi = fasce, default data = oggi).
- **api e2e** (`coralyn_test`): applica `migrate deploy` con la `DATABASE_URL` di `.env.test`,
  poi `JWT_SECRET`/`JWT_EXPIRES_IN` + `test:e2e`. 22 verdi (401, struttura, **isolamento tenant**,
  ordinamento per `ordineLogico`, echo `data`, 400 su data malformata).
- **FE** (`pnpm --filter @coralyn/web-staff test` + `build`): 40 verdi; build OK.
- **Docker**: `docker compose --profile full up -d --build`; entrypoint `migrate deploy` + seed
  (`SEED_ON_START=true`, `NODE_ENV=development` forzato). `GET /api/mappa` via `:8080` con Bearer
  ritorna 2 settori / 2 tipologie / 2 fasce / 34 ombrelloni, `statoPerFascia` libero; 401 senza.
- `pnpm -r build` verde. `rg -i -uu driftly` invariato (solo narrativa storica).

---

## 4. Insidie note (aggiornate)

- **RLS FORCE sulle tabelle mappa**: il PrismaClient **diretto** (anche del seed) è soggetto a
  RLS → ogni scrittura/lettura deve passare da `forTenant` **o** da una transazione con
  `set_config('app.current_tenant', …, true)`. Il seed lo fa esplicitamente.
- **`@db.Time` + Prisma**: `oraInizio`/`oraFine` si scrivono con `Date` (`new Date('1970-01-01T08:00:00Z')`);
  non sono mai proiettati nel DTO.
- **`prisma generate` PRIMA di `nest build`**; in locale dopo ogni cambio schema.
- **DB locale su host `5433`** (override gitignored; 5432 occupata). Per i comandi prisma in
  locale: passa `DATABASE_URL='…@localhost:5433/coralyn_dev…'` inline (il root `.env` non è
  auto-caricato da `pnpm --filter`). e2e: stessa cosa su `coralyn_test` + `JWT_SECRET`/`JWT_EXPIRES_IN`.
- **Seed idempotente** (upsert per id stabili); guardia `NODE_ENV=production`; entrypoint forza dev.
- **pnpm via corepack** `pnpm@11.9.0` (`CI=true` per install non-interattivo).
- **Dev server stantio**: killa il vecchio `pnpm dev` dopo un reinstall; pulisci `node_modules/.vite`.
- **Sweep nomi**: `rg -uu`. `.gitattributes` forza LF su `*.sh`/`Dockerfile`/`nginx.conf` (le
  migrazioni `*.sql` non sono coperte: git può mostrare warning LF→CRLF, innocuo).
- **Docker exec -w + Git Bash** storpia i path → usa PowerShell o `MSYS_NO_PATHCONV=1`.

---

## 5. File di riferimento (nuovi/toccati in questa sessione)

- **Spec/Piano:** [docs/specs/2026-06-30-mappa-backend-design.md](../specs/2026-06-30-mappa-backend-design.md),
  [docs/plans/2026-06-30-mappa-be.md](../plans/2026-06-30-mappa-be.md).
- **Backend:** `apps/api/prisma/schema.prisma` (+5 model), `apps/api/prisma/migrations/20260630093817_mappa/`,
  `apps/api/src/mappa/` (`mappa.projection.ts` + `.spec.ts`, `mappa.service.ts`, `mappa.controller.ts`,
  `dto/mappa-query.dto.ts`, `mappa.module.ts`), `apps/api/src/app.module.ts`, `apps/api/prisma/seed.ts`,
  `apps/api/test/mappa.e2e-spec.ts`, `apps/api/test/helpers/seed-mappa.ts`.
- **Frontend:** `apps/web-staff/src/mocks/handlers.ts`, `mocks/server.ts`,
  `features/mappa/useMappaGiorno.ts` (la fixture `mocks/data/seed.ts` è conservata).
- **Contracts (invariati):** `packages/contracts/src/index.ts` (`MappaGiornoDTO` & co).
</content>
