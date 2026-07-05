# Handoff / Delega — `Configura` struttura COMPLETO su `main` (Slice 1+2+3) · roadmap prodotto

> Documento di consegna per la **prossima sessione/agente**. **Supera**
> [2026-07-04-configura-spec-piano-e-prossimi.md](2026-07-04-configura-spec-piano-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming →
> piano TDD → esecuzione **subagent-driven, un commit per layer, TDD** → review a due stadi → verifica LIVE → presenta.
> **Leggi questo per primo.**

---

## 0. Situazione GIT — LEGGERE CON ATTENZIONE
- **`origin/main` = `2348cad`**: **`Configura` COMPLETO** (Stabilimento → «Configura» → «Struttura della spiaggia»,
  editor logico settori/file/ombrelloni/tipologie). Tutto pushato, verde, verificato LIVE. `main` = `origin/main`.
- **Tutti i branch locali di Configura sono stati mergiati (FF) ed eliminati.** Localmente resta **solo `main`**.
- **4 branch remoti storici** restano su origin: `origin/feat/api-identita-auth`, `origin/feat/bookings-daily`,
  `origin/feat/bookings-payment`, `origin/feat/coralyn-redesign-fe` (+ eventuali altri già mergiati). **Prune opzionale**;
  ⚠️ **la deletion remota NON è auto-autorizzata** — chiedi prima.
- **11 commit di Configura su `main`** (3 slice × {contracts, api, web-staff} + 2 piani docs + 1 fix seed), in ordine:
  `e0f2f60`(contracts S1) → `646da21`(api S1) → `83f2dae`(web S1) → `7a10626`(contracts S2) → `534d481`(api S2) →
  `f91c841`(web S2) → `a4f02a9`(piano S2) → `748a316`(contracts S3) → `e53b5a1`(api S3) → `c4f07d4`(web S3) →
  `dd22c82`(piano S3) → `2348cad`(fix seed v4).
- **Migrazioni aggiunte** (tutte applicate a dev **e** test): `20260704211424_add_sector_kind`,
  `20260704212542_umbrella_type_unique_name`, `20260705120000_sector_unique_name`. **Nessuna migrazione pendente.**
- ⚠️ **Push su `main` richiede ok ESPLICITO** dell'utente (classifier blocca il default branch).
- **Prossimo ADR libero: 0040.** **Prossimo D libero: D-042** (D-040/D-041 appena registrati, vedi §3).

## 1. Stato attuale — `Configura` COMPLETO su `origin/main`
Editor **logico** della struttura, tutto **admin-only** (`@Roles(Role.Admin)`, RolesGuard globale ADR-0039), tenant-scoped
via `prisma.forTenant`. Fedele al mockup «Struttura della spiaggia». Il layer **pixel** (coordinate libere) resta **D-005**.

- **Slice 1 — Struttura (lettura) + Tipologie:** migrazione `Sector.kind` (`grid|special`); `GET /api/establishment/structure`
  (albero proiettato); CRUD `/api/establishment/umbrella-types` (nome unico per tenant `@@unique` + clash case-insensitive
  → 409; icona `@IsIn`; delete-guard 409 se in uso). FE: vista albero read-only + card Tipologie CRUD + rotta admin-gated
  `/establishment/structure` + bottone «Configura».
- **Slice 2 — Settori + File:** CRUD `/api/establishment/sectors` (nome unico `@@unique` + case-insensitive → 409;
  `kind @IsIn`; delete-guard 409 se ha file **o** tariffe) e `/api/establishment/rows` (sectorId del tenant → 404;
  delete-guard 409 se ha ombrelloni **o** tariffe). FE: modali «Nuovo/Modifica settore» + «Nuova/Modifica fila», rename/elimina,
  `ConfirmDialog` generalizzato; pannello destro editabile.
- **Slice 3 — Ombrelloni + Genera:** CRUD `/api/establishment/umbrellas` (etichetta **esatta** unica `@@unique` → 409;
  tipologia estranea → **422**; delete-guard 409 se ha prenotazioni `Booking.umbrellaId`) + `POST /umbrellas/generate`
  (numerazione automatica `prefix+n`, **salta** le esistenti, `logicalOrder` progressivo, ritorna `{created, skipped, umbrellas}`,
  `count` 1..60). FE: chip cliccabili → modale ombrellone; «+ Aggiungi»/«Genera» per fila; modale «Genera» con anteprima;
  «Nuova fila» **compone** create-fila + generate (chiude la modale al create → niente doppio-create se il generate fallisce).
- **Fix seed (`2348cad`):** il seed generava id **non-v4** (nibble versione `0`) che `@IsUUID` rifiutava con 400 su
  `rowId`/`sectorId`/`umbrellaTypeId` nei body → sulle entità **seedate** «Aggiungi»/«Genera»/«Nuova fila» davano 400.
  `u()` ora emette **uuid v4 validi** (`…-4000-8000-…`); stesso helper → riferimenti interni coerenti. ⚠️ **Il dev DB è stato
  RE-SEEDATO via `prisma migrate reset`** (il seed fa upsert-by-id → serviva reset). Produzione non era affetta.

**Test baseline (post-Configura, NON regredire):** ui-kit **70** · web-staff **210** · api unit **167** · api e2e **214** ·
typecheck pulito. (Erano 70 / 191 / 134 / 182 a inizio Configura.)

## 2. IL PROSSIMO PASSO (confermare sempre con l'utente)
Configura è chiuso. Sequenza prodotto suggerita (dal registro, §4 dell'handoff precedente):
1. **D-024** GDPR cliente (soft-delete/anonimizzazione) — igiene dati, spesso richiesto presto.
2. **D-012** cabine/servizi accessori (risorsa "gemella" di Ombrellone) — ora che l'editor struttura esiste, si estende bene.
3. **D-035** canale cliente + "assenze comunicate" (visione grande, riempie i posti abbonati liberati) — vedi deferred.md.
4. Altri: **D-036** report avanzato · **D-013** sospensione/cessione abbonamento · **D-033** pricing periodico ·
   **D-034** forfait periodico (**DEPRIORITIZZATO**).
Per ognuno: `brainstorming` → `writing-plans` → `subagent-driven-development` → verifica LIVE → presenta.

## 3. Follow-up di Configura appena registrati (deferred.md) + aperti rilevanti
- **D-040** — estrazione di `EstablishmentStructureView.vue` (~406 righe, 4 entità + 5 modali) in composabili/child-component
  per-entità + esportare da `@coralyn/contracts` le union condivise `SectorKind`/`UmbrellaIconKey` (oggi `SECTOR_KINDS` è
  duplicato nei 2 DTO settore, la union icone in 4 punti). Refactor puro, test già a copertura.
- **D-041** — `ExceptionFilter` globale Prisma `P2002 → 409` per chiudere uniformemente la finestra TOCTOU *check-then-create*
  di tutti i service CRUD (oggi una collisione **concorrente** rara affiora come 500 anziché 409; l'integrità è già garantita
  dai `@@unique`). Additivo, un filtro in `main.ts`.
- **D-038** drag-reorder settori/file/ombrelloni (+re-parent) — `sortOrder`/`logicalOrder` esistono → additivo.
- **D-037** gestione globale `401` nel data-layer FE (interceptor logout+redirect) — app-wide, additivo.
- **D-005** editor **pixel** (coordinate libere su foto, `Umbrella.presentationPosition` JSON inutilizzato) — progetto a sé.
- Hardening auth gated su esposizione pubblica: **D-026** refresh/revoca · **D-027** rate-limit login · **D-028** RLS su `User`
  · **D-029** login a tempo costante. Fonte autorevole: [`deferred.md`](../architecture/deferred.md).
- **Follow-up minore:** `/auth/me` non espone il nome stabilimento → la nav usa il default `'Lido Maestrale'` mentre la pagina
  Stabilimento mostra il nome reale. Fix quando si tocca `/me`/sessione.

## 4. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifiche a `packages/contracts/src/index.ts`
  → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** di typecheck/test api/web.
- **Container dev stale = 404**: dopo cambi BE/FE → `docker compose --profile full up -d --build api web`.
- **`RolesGuard` è GLOBALE**: dopo modifiche a guard/rotte ri-esegui **tutta** la suite api (unit + e2e).
- **Tabelle mappa (`Sector`/`Row`/`Umbrella`/`UmbrellaType`) sono RLS FORCE**: ogni scrittura/lettura in
  `prisma.forTenant(tenantId, tx => …)`; i `create` passano **`establishmentId: tenantId` esplicito**. `Rate.sectorId`/`rowId`
  e `Booking.umbrellaId` sono le FK che le guardie 409 contano. Una **query di conteggio via psql diretto senza GUC** vede 0
  righe (RLS) → per contare imposta `SELECT set_config('app.current_tenant','…', false);` nella stessa sessione.
- ⚠️ **`prisma migrate dev` NON gira non-interattivo** in questa harness: genera l'SQL con `migrate diff`, **hand-authora** la
  cartella migrazione, applica con `migrate deploy` a `coralyn_dev` **e** `coralyn_test`, poi `generate` (come fatto per le 3
  migrazioni di Configura). ⚠️ Controlla che l'SQL non contenga un `DROP INDEX "Rate_signature_key"` spurio (**D-039**).
- ⚠️ **Il seed (`seed.ts`) usa `u()` → id v4 validi** (`…-4000-8000-…`). Se cambi gli id del seed serve **`prisma migrate reset
  --force`** (upsert-by-id → un cambio di id lascerebbe righe orfane). Lancia sempre con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
  `DEV_ESTABLISHMENT_ID = 00000000-0000-0000-0000-000000000001` (tenant, non validato da `@IsUUID` perché arriva dal JWT).
- **DB**: dev `coralyn_dev`, test `coralyn_test`, entrambi `localhost:5433`, utente/pass `coralyn_app`. Prisma non auto-carica il
  `.env` di root da `apps/api` → `DATABASE_URL` inline per i comandi migrate/seed.
- **Bash tool Windows** (Git Bash/POSIX): heredoc per i commit, path assoluti. Per `docker compose exec`/`docker exec` con path
  assoluti usa `MSYS_NO_PATHCONV=1`. Attento a `$UID` (readonly in bash) — usa un altro nome di variabile.
- **Login API**: il campo del token è **`accessToken`** (non `token`); `POST /api/auth/login` → `{ accessToken, user }`.
  Login `admin@coralyn.dev`/`coralyn-admin-8473`.
- **Preview LIVE FE**: `preview_start "web-staff"` (Vite) ripiega su **5174** se 5173 è occupata mentre il proxy del preview è
  su un'altra porta → **naviga diretto a `http://localhost:5174/…`**. Il tab del preview a volte finisce su `chrome-error://`
  tra un'eval e l'altra: la verifica **più affidabile** è contro il **web Docker `8080`** (nginx, build di produzione) + `fetch`
  autenticato per le mutazioni. Sessione FE scaduta ≠ bug (token 8h) → re-login.
- **Vitest + ui-kit `Modal`/`ConfirmDialog`** (reka-ui portal → teleport su `document.body`): nei test usa
  `mountApp(View, { attachTo: document.body })` + `document.querySelector` + `w.unmount()`; il bottone conferma del
  `ConfirmDialog` ha testo `Elimina`.
- **Icone ui-kit**: chiavi in `packages/ui-kit/src/icons/registry.ts` (cestino = `trash-2`, palma = `palmtree`). Verifica prima.

## 5. Ancore di codice (VERIFICATE 2026-07-05)
- **Configura API**: [`apps/api/src/establishment/`](../../apps/api/src/establishment/) —
  `establishment-structure.controller.ts`/`.service.ts`/`.projection.ts` (mapper puri `toStructure{Umbrella,Row,Sector}`) +
  `establishment-structure.select.ts` (`UMBRELLA_SELECT`/`ROW_SELECT`/`SECTOR_SELECT`, `Prisma.validator`);
  `umbrella-types.{service,controller}.ts`, `sectors.{service,controller}.ts`, `rows.{service,controller}.ts`,
  `umbrellas.{service,controller}.ts` (+ `.spec.ts` per ognuno); `dto/` (create/update per ogni entità + `generate-umbrellas.dto.ts`);
  `establishment.module.ts` (registra tutti i controller/service). e2e: `apps/api/test/establishment-structure.e2e-spec.ts`,
  `establishment-sectors-rows.e2e-spec.ts`, `establishment-umbrellas.e2e-spec.ts`.
- **Pattern CRUD di riferimento** (mirror): `umbrella-types.service.ts` (normalizeName + clash case-insensitive) e
  `apps/api/src/catalog/time-slots.service.ts` (delete-guard che conta le `Rate`).
- **Configura FE**: [`apps/web-staff/src/features/establishment/`](../../apps/web-staff/src/features/establishment/) —
  `EstablishmentStructureView.vue` (+`.spec.ts`, 17 test), `useEstablishmentStructure.ts` (query + 13 mutation);
  MSW in `apps/web-staff/src/mocks/server.ts`; rotta admin-gated in `apps/web-staff/src/router/index.ts` (`meta.role`).
- **Spec + piani**: spec [2026-07-04-stabilimento-configura-struttura-design.md](../superpowers/specs/2026-07-04-stabilimento-configura-struttura-design.md);
  piani Slice 1/2/3 in `docs/superpowers/plans/2026-07-0{4,5}-stabilimento-configura-slice*.md`.

## 6. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune`. Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays).
Lavoro creativo: `brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida + review a due stadi,
un commit per layer) → verifica LIVE → presenta e attendi conferma. Merge su `main` = **FF con ok esplicito**. ⚠️ Rebuild
container prima di testare in dev; rebuild `@coralyn/contracts` dopo checkout.
