# Handoff 2026-06-30 (notte) — Stato post rename-inglese + scelta del prossimo increment

> Documento di consegna per il **prossimo agente/sessione**. Qui c'è **lo stato attuale**
> del repo (dopo: modulo mappa BE + rename totale codice/DB in inglese ADR-0030) e le
> **opzioni per il prossimo increment**, che l'utente deciderà **insieme all'agente** prima
> di scrivere codice.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** (vincolo del progetto,
> [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)): l'intera
> `docs/architecture/` (README + `deferred.md` + `glossary.md` + **tutti** gli ADR in
> `decisions/`), **tutte** le `docs/specs/`, **tutte** le `docs/design/`
> (in particolare `data-model.md`, `design-system.md`, `flows.md`), **tutti** i `docs/plans/`
> e i `docs/handoff/`. Più `README.md` di root e `packages/contracts/src/index.ts`. Gli ADR e
> gli handoff **storici** usano la vecchia nomenclatura italiana: il ponte IT↔EN è il
> [glossario](../architecture/glossary.md) (vedi nota in
> [ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)).

---

## 0. Situazione GIT

- **`main` → `a26eab8`, pushato su `origin/main` (allineato).** Contiene **tutto** il lavoro:
  identità & auth, scheda cliente, redesign FE, **modulo mappa** (modello + lettura) e il
  **rename totale codice/DB in inglese** (ADR-0030) + doc allineati.
- I branch locali `feat/mappa-be` e `chore/english-naming` sono **completamente contenuti in
  `main`** (ridondanti): si possono eliminare (`git branch -d feat/mappa-be chore/english-naming`).
  `feat/coralyn-redesign-fe` su origin è un branch vecchio, ignorabile.

➡️ **Punto di partenza per il prossimo increment: `main` (aggiornato e pushato).** Crea un
**nuovo branch dedicato** dal `main` per il lavoro che decidi con l'utente (vedi §2).

---

## 1. Stato attuale del repo (tip `chore/english-naming`)

Tutto verificato. **Test verdi: ui-kit 14 · web-staff 40 · api unit 9 · api e2e 22**
(e2e contro `coralyn_test`). `pnpm -r build` + `eslint .` verdi. Docker full-stack
(`--profile full up -d --build`) OK: `GET /api/map` via `:8080` ritorna la struttura seedata,
old `/api/mappa` → 404, no-Bearer → 401. Render browser della `MapView` dal backend reale
verificato (UI italiana, dati/codice inglesi).

### Convenzione linguistica CORRENTE ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md), supera 0003)
- **Codice e DB interamente in inglese**, nomi DB **nativi** (no `@@map`): model/tabelle/colonne/
  enum/DTO/simboli/file/cartelle/rotte/token CSS.
- **UI a video e documentazione restano in italiano.** Mappatura IT↔EN nel
  [glossario](../architecture/glossary.md). Il *meccanismo* di isolamento resta `tenant`
  (`tenantId`/`forTenant`/`TenantContext`/GUC `app.current_tenant`); l'entità di business è
  `Establishment`.

### Backend (`apps/api`) — cosa esiste DAVVERO
- **Prisma (8 model)**: `Establishment`, `Customer` (RLS), `User` (no RLS, enum `Role`
  admin/staff/superuser), + mappa: `Sector`, `Row`, `Umbrella`, `UmbrellaType`, `TimeSlot`
  (tutte RLS `tenant_isolation` FORCE). **Migrazione unica** `…_init` inglese (la storia è stata
  **squashata** in ADR-0030: pre-release, nessun dato di prod) + RLS SQL grezza appesa a mano.
- **Moduli/endpoint**: `identity` (`POST /api/auth/login`, `GET /api/auth/me`), `customers`
  (`GET|POST /api/customers`, `GET|PATCH /api/customers/:id`), `map` (`GET /api/map?date=YYYY-MM-DD`
  → `DayMapDTO`), `health` (`@Public()`). `JwtAuthGuard` globale (tenant dal JWT, ADR-0026).
  `PrismaService.forTenant(tenantId, fn)` imposta la GUC; RLS filtra.
- **map**: proiezione pura `projectDayMap` — **`stateBySlot` = `free` per ogni slot** (confine
  d'incremento: gli stati reali arrivano con le prenotazioni). Seed demo idempotente per il
  tenant dev: 2 `UmbrellaType` (Mini-palma `leaf`, Palma `palmtree`), 2 `TimeSlot`
  (Mattina/Pomeriggio), 2 `Sector` (Centro, Speciali ordine 99), 4 `Row`, **34 `Umbrella`**.
- **NON esistono ancora**: prenotazioni, catalogo/listino/pricing, abbonamenti, cassa, audit,
  setup-form mappa (CRUD), staff-mgmt CRUD/RBAC.

### Frontend (`apps/web-staff`)
- **REALI (backend vero)**: Login, Customers (lista+dettaglio, `/customers`), **Map (`/map`)**.
- **STATICHE / mock seam** (demo hardcoded): `bookings` (`/bookings`), `pricing` (`/pricing`),
  `report`, `establishment`. Nella `MapView` il drawer prenotazione/pagamento e il modale
  "Nuova prenotazione" sono CTA **non collegate** (serviranno le prenotazioni).
- `contracts` (`packages/contracts/src/index.ts`): DTO inglesi già pronti per la mappa
  (`DayMapDTO`, `SectorDTO`, `RowDTO`, `UmbrellaDTO`, `UmbrellaTypeDTO`, `TimeSlotDTO`,
  `SlotState` = `free|season|daily|booked`). **Non** esistono ancora DTO prenotazioni/listino.
- Placeholder hardcoded noti (UI, da rendere reali con i rispettivi increment): sottotitolo
  "47 ombrelloni" in `router/index.ts`, `establishmentName` 'Lido Maestrale' e team in
  `EstablishmentView` / `session.ts` (attendono un endpoint stabilimento).

---

## 2. Prossimo increment — OPZIONI (decidere con l'utente)

Tutte rispettano [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md):
**breve design spec in `docs/specs/` → piano TDD in `docs/plans/` → implementazione test-first**,
commit per layer, branch dedicato, poi PR/merge.

### Opzione A — Prenotazioni (Bookings) — *consigliata*
**Perché:** accende gli `stateBySlot` reali sulla mappa (oggi tutto `free`), è il cuore
operativo, sblocca cassa/pricing. Il confine è **già isolato** in
`apps/api/src/map/map.projection.ts` (oggi forza `free`).
- Modello `Booking` ([ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md),
  [data-model](../design/data-model.md)): tenant-scoped + RLS, legami
  `Customer`/`Umbrella`/`TimeSlot`(+`Package` futuro), `startDate`/`endDate`,
  `type` (daily|periodic|subscription), `status`, **incasso base** (`paymentStatus`,
  `amountCollected`, `paymentMethod`, `collectionDate` — [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)),
  rinnovo self-link `previousBookingId` ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)).
- **Invariante anti-overlap per slot** ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
  nessuna `Booking` confermata sovrapposta su stesso `Umbrella` + intervallo date intersecante +
  `TimeSlot` uguale/sovrapposto.
- **`projectDayMap` diventa slot-aware**: deriva lo stato (free/season/daily/booked) per
  (umbrella, data, timeSlot) dalle prenotazioni confermate.
- DTO prenotazioni **additivi** in `@coralyn/contracts`. Collegare drawer/modale `MapView`.
- ⚠️ **Grande**: valutare di **spezzarlo** (es. slice 1 = modello `Booking` + disponibilità +
  proiezione mappa slot-aware con `type=daily`; pricing/`Package`/abbonamenti in slice successivi).
  Il pricing engine (`Pricing`/`Rate`, [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md))
  è la parte più delicata: probabilmente un increment a sé.

### Opzione B — Setup-form mappa (CRUD) — [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)
Admin crea Sector→Row→Umbrella con numerazione automatica → la mappa nasce da dati reali
invece che dal seed. Endpoint CRUD tenant-scoped + form FU. Medio. Utile ma non sblocca valore
operativo come le prenotazioni.

### Opzione C — Staff-mgmt & RBAC — [D-025](../architecture/deferred.md)
`User` CRUD (admin crea/elenca/disabilita staff) + colonne `active`/`createdAt` + decoratore
`@RequireRole(admin)` applicato + sezione FE in `EstablishmentView`. Piccolo/additivo (modello
`User` già presente). Impatto basso (deferred), ma chiude un buco (RBAC oggi non applicato: il
`role` è nel JWT ma non c'è `@RequireRole`).

**Raccomandazione:** A (prenotazioni), spezzata in slice. Decidere con l'utente lo scope del
primo slice.

---

## 3. Workflow & pattern da imitare

- **Pattern BE tenant-scoped**: ogni entità di business → `establishmentId` + relazione a
  `Establishment` + indice; **RLS `tenant_isolation` come SQL grezzo nella migrazione** (Prisma
  non la genera — vedi la migrazione `…_init`); **tutte** le query passano da
  `PrismaService.forTenant`. File di riferimento: `apps/api/src/map/*`,
  `apps/api/src/customers/*`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/prisma/seed.ts`.
- **Validazione input**: DTO `class-validator` + `ValidationPipe({ whitelist, transform })`
  globale (già in `main.ts`).
- **Proiezione DTO come funzione pura** unit-testabile (vedi `map.projection.ts`), service sottile.
- **e2e** (Jest+supertest) con isolamento tenant a 2 stabilimenti (vedi `test/map.e2e-spec.ts`,
  `test/helpers/seed-map.ts`, `seed-auth.ts`).
- **Contracts**: DTO inglesi condivisi FE/BE, additivi; non rinominare gli export esistenti.
- **FE**: `useQuery`/`useMutation` (TanStack) nei composable, `queryKeys` per chiave tenant-scoped,
  store `session` (`establishmentId`, `activeDate`, `role`). MSW: mock **solo nei test**
  (`mocks/server.ts`); in dev il worker fa `bypass` → backend reale.

---

## 4. Insidie note (verificate in queste sessioni)

- **RLS FORCE**: il `PrismaClient` **diretto** (anche del seed) è soggetto a RLS → scrivere/leggere
  le tabelle tenant-scoped solo dentro `forTenant` **o** una transazione con
  `set_config('app.current_tenant', …, true)` (il seed lo fa).
- **`prisma generate` PRIMA di `nest build`**; in locale dopo ogni cambio schema.
- **DB locale su host `5433`** (override `docker-compose.override.yml` gitignored; 5432 occupata).
  Comandi prisma in locale: passa `DATABASE_URL='…@localhost:5433/coralyn_dev…'` **inline** (il
  root `.env` non è auto-caricato da `pnpm --filter`). e2e: idem su `coralyn_test` +
  `JWT_SECRET`/`JWT_EXPIRES_IN` (vedi `.env.test`). Applica le migrazioni a `coralyn_test` con
  `migrate deploy` (o `migrate reset --force --skip-seed` dopo un cambio schema) prima degli e2e.
- **Dev server / Vite stantio**: dopo un rename o reinstall, **pulisci `apps/web-staff/node_modules/.vite`**
  e riavvia, altrimenti Vite serve moduli stantii (es. `@coralyn/contracts` vecchio → enum undefined).
- **Seed idempotente** (upsert id stabili); guardia `NODE_ENV=production`; l'entrypoint Docker forza
  `NODE_ENV=development` e `SEED_ON_START=true`.
- **`@db.Time` + Prisma**: `startTime`/`endTime` si scrivono con `Date` (`new Date('1970-01-01T08:00:00Z')`),
  non proiettati nel DTO.
- **pnpm via corepack** `pnpm@11.9.0` (`CI=true` per install non-interattivo).
- **`.gitattributes`** forza LF su `*.sh`/`Dockerfile`/`nginx.conf`; le migrazioni `*.sql` mostrano
  warning LF→CRLF innocuo. **Docker exec -w + Git Bash** storpia i path → PowerShell o `MSYS_NO_PATHCONV=1`.
- **Sweep nomi**: `rg -uu` cattura le dot-dir (`.claude/`), **ma include `node_modules`** → restringi
  ai sorgenti (`apps/*/src`, `packages/*/src`) o escludi `node_modules`.

---

## 5. File di riferimento

- **Modello & decisioni:** [data-model.md](../design/data-model.md) (ER inglese),
  [glossario](../architecture/glossary.md) (IT↔EN), ADR
  [0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)/[0011](../architecture/decisions/0011-incasso-base-nel-core.md)/[0012](../architecture/decisions/0012-gestione-abbonamenti.md)/[0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
  (prenotazioni/pricing/slot), [0014](../architecture/decisions/0014-setup-mappa-strutturato.md) (setup mappa),
  [0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS),
  [0030](../architecture/decisions/0030-codice-e-db-in-inglese.md) (lingua).
- **Spec Core:** [docs/specs/2026-06-27-core-operativo-design.md](../specs/2026-06-27-core-operativo-design.md).
- **Backend (pattern):** `apps/api/src/{map,customers,identity,prisma,tenant}/*`,
  `apps/api/prisma/{schema.prisma,seed.ts,migrations}`, `apps/api/test/*`.
- **Frontend:** `apps/web-staff/src/{features,stores,lib,mocks,router}/*`,
  `packages/ui-kit/src/*`, `packages/contracts/src/index.ts`.
- **Infra:** `docker-compose.yml`, `docker-compose.override.yml` (gitignored, DB 5433),
  `init/01-app-role.sql`, `apps/api/{Dockerfile,docker-entrypoint.sh}`, `.env.example`, `.env.test`.
- **Handoff precedenti (storici, nomenclatura IT):** `2026-06-30-mappa-be.md` (delega mappa),
  `2026-06-30-mappa-be-done.md` (consegna mappa), `2026-06-30-rename-coralyn.md`.
</content>
