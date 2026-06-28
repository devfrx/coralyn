# Delega — Esecuzione Plan 1, Task 3–7 (Backend Core: NestJS + Postgres + RLS)

> **Cos'è questo documento.** Messaggio di delega **autosufficiente** da incollare all'inizio
> di una **sessione dedicata** che esegue i **Task 3–7** del
> [Plan 1 backend](../plans/2026-06-28-core-foundation.md). I Task 1–2 sono già fatti e il
> **frontend (slice 1) è già stato mergiato su `main`**. Il confine di coordinamento è
> `packages/contracts`, che ora è un **contratto reale** consumato dal frontend. Tutto ciò
> che serve è qui sotto o nei documenti linkati.

---

## 0. Il tuo compito in una frase

Completa il [Plan 1](../plans/2026-06-28-core-foundation.md): **Task 3** (NestJS + `GET /health`),
**Task 4** (Postgres via Docker + ruolo applicativo non-superuser), **Task 5** (Prisma: schema
`Stabilimento`+`Cliente`, migrazione, `PrismaService`), **Task 6** (RLS + `forTenant` + test di
isolamento — *lo spike, rischio #1*), **Task 7** (tenant context via header + `GET/POST /clienti`
isolato, e2e). **Niente di più:** non implementare la mappa né altri moduli (appartengono ai Plan 3+).

## 1. Skill e metodo (obbligatorio)

- A inizio sessione applica **`superpowers:using-superpowers`**.
- Esegui con **`superpowers:subagent-driven-development`** (raccomandato) o
  **`superpowers:executing-plans`**: un task alla volta, spuntando i checkbox `- [ ]` del piano.
- Dove il piano prescrive **TDD** (Task 3 health, Task 6 RLS, Task 7 e2e): scrivi prima il test
  che **fallisce**, poi l'implementazione minima.
- Prima di chiudere: **`superpowers:verification-before-completion`** — nessun "fatto" senza
  l'output dei comandi a supporto.

## 2. Stato attuale del repo (il tuo punto di partenza)

- Branch **`main`**, **working tree pulita**.
- **FATTO** (non rifare): Task 1 (scaffold monorepo pnpm), Task 2 (`@driftly/contracts`),
  **ADR-0016** (tipologia ombrellone / numerazione reale / speciali).
- **FRONTEND GIÀ MERGIATO** (slice 1, **in gran parte mock — nulla di reale lato dati**):
  `apps/web-staff` (Vue 3 + Vite + PWA + **MSW** + **TanStack Query** + Pinia), `packages/ui-kit`
  (componenti + design tokens), ADR **0017–0021**, `docs/design/design-system.md`, spec e plan FE,
  deferred D-020/D-021. Il FE gira **su mock MSW**: non dipende ancora da un backend vivo.
- **`apps/api` NON esiste ancora**: lo crei tu nel Task 3.
- **`pnpm install`** è pulito (*Already up to date*) e **`pnpm --filter @driftly/contracts build`**
  passa. Foundation Task 1–2 intatta.
- **Ambiente**: **Node 24**, **pnpm 11.9.0** *(N.B.: il piano scrive `10.33.3` ma il
  `packageManager` è già pinnato a `11.9.0` — usa quello)*, **Docker 29**. OS **Windows 11**,
  shell **PowerShell** + **Bash** (sh POSIX): i comandi del piano sono POSIX → eseguili col tool
  Bash o adattali.
- **Commit chiave** (per orientarti):
  - `76bdc78` scaffold monorepo · `b4f5358` contracts skeleton · `ffb1668` ADR-0016
  - `7cb7e5d` **contracts: map DTOs [FE handshake]** · merge del frontend · `cc6769e` reconcile `Tipologia.icona`

## 3. Documenti da leggere (in quest'ordine, prima di toccare codice)

1. [Plan 1 — Core Foundation](../plans/2026-06-28-core-foundation.md) — **il copione**: esegui i
   **Task 3–7** (i Task 1–2 sono spuntati).
2. **Questo handoff** (contratto FE reale, trappole RLS, scope, DoD).
3. ADR di riferimento: [0010 RLS](../architecture/decisions/0010-isolamento-multi-tenant.md),
   [0008 stack/layout](../architecture/decisions/0008-stack-e-layout.md),
   [0007 stile](../architecture/decisions/0007-stile-architetturale.md).
4. [data-model](../design/data-model.md) — per il Task 5 servono **solo** `Stabilimento` e
   `Cliente`; il resto è contesto.
5. **IL CONTRATTO REALE** (novità): `packages/contracts/src/index.ts` e come il FE lo consuma
   (`apps/web-staff/src/lib/http.ts`, `apps/web-staff/src/mocks/`). Vedi §6.

## 4. Principi NON negoziabili

1. **Decision rubric ([ADR-0002](../architecture/decisions/0002-decision-rubric.md))** — ogni
   scelta pesata su 4 filtri (professionalità, convenzioni, modularità, zero debito);
   **raccomandazioni nette**, non elenchi neutri.
2. **Un ADR per ogni decisione architetturale** — file numerati **immutabili** in
   `docs/architecture/decisions/` (il prossimo libero è **0022**); cambi di rotta via *supersede*;
   rinvii in [`deferred.md`](../architecture/deferred.md). Niente scelte silenziose.
3. **Lingua ([ADR-0003](../architecture/decisions/0003-language-convention.md))** — codice **EN**;
   dominio **IT** (`Stabilimento`, `Cliente`, `Ombrellone`, `Fila`, `Settore`, `Fascia`,
   `Tipologia`…); docs **IT**.
4. **Commit atomici per task**, messaggi in inglese, **ognuno** col trailer:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
5. **Comunica in italiano.**

## 5. I 5 task (3–7) — mappa

3. **Skeleton NestJS + `GET /health`** (TDD).
4. **PostgreSQL via Docker + ruolo `driftly_app` non-superuser** (+ DB `driftly_test`) per la RLS.
5. **Prisma** — schema (`Stabilimento`, `Cliente`), prima migrazione, `PrismaService`.
6. **Row-Level Security + `forTenant` + test di isolamento** — *lo spike* (rischio #1 dello spec).
7. **Tenant context (header `X-Stabilimento-Id` provvisorio) + `GET/POST /clienti` isolato** (e2e).

## 6. Confine col frontend — IL CONTRATTO È ORA REALE

Il FE è mergiato e **consuma `@driftly/contracts`**. I Task 3–7 devono restare **compatibili**.

**Cosa il FE già si aspetta dal backend** (oggi servito da mock MSW su `/api/*`):
- **Tenant**: ogni richiesta porta l'header **`X-Stabilimento-Id: <uuid>`** (dev UUID
  `00000000-0000-0000-0000-000000000001`). ✅ **Combacia esattamente** col Task 7 del piano: il
  design provvisorio dell'header ha tenuto.
- **Base path `/api`**: il FE chiama `/api/clienti`, `/api/mappa`. Il piano espone `/clienti`
  senza prefisso → **aggiungi `app.setGlobalPrefix('api')`** in `main.ts` e allinea i path dei
  test e2e a `/api/clienti`. *(Piccola deviazione di allineamento col contratto — registrala.)*
- **Endpoint usati dal FE**:
  - `GET /api/clienti` → `ClienteDTO[]`
  - `POST /api/clienti` body `{ nome, cognome }` → `ClienteDTO` (**201**)
  - `GET /api/mappa` → `MappaGiornoDTO` (`?data=yyyy-mm-dd`)
- **`ClienteDTO` = `{ id, nome, cognome }`** (minimale; nessun `contatti`/`stabilimentoId` nel body).
  Il Task 7 del piano già produce esattamente questa forma. Consuma il tipo da `@driftly/contracts`.

**SCOPE — leggi due volte:** il **Plan 1 implementa SOLO `/health` + `/clienti`** (e la RLS su
`Cliente`). **`/mappa` NON è nel Plan 1** (è il modulo `mappa`, Plan 3+): **il FE continua a
mockarlo** via MSW. Il **Task 5 modella SOLO `Stabilimento` + `Cliente`** — **non** creare lo
schema mappa (`Settore`/`Fila`/`Ombrellone`/`Tipologia`/`Fascia`) né l'endpoint `/mappa` ora. I
DTO ricchi già in `contracts` sono per i piani futuri: **resisti alla tentazione**.

**`contracts` è additivo:** il FE dipende dagli export attuali → puoi **aggiungere** tipi, mai
**rinominare/rimuovere**. Ricostruisci `@driftly/contracts` (`pnpm build:contracts`) prima che
`apps/api` lo consumi.

**Seed dev tenant (consigliato):** perché in futuro il FE possa girare contro il backend reale,
serve uno `Stabilimento` con id `00000000-0000-0000-0000-000000000001`. Aggiungi un piccolo seed
o documenta come crearlo (non obbligatorio per i test del Plan 1, che creano i propri tenant).

## 7. Trappole critiche RLS (leggi prima di Task 4–7)

- **Ruolo DB.** I **superuser** PostgreSQL **bypassano** la RLS. L'app **deve** connettersi con
  `driftly_app` (`NOSUPERUSER NOBYPASSRLS`, creato da `init/01-app-role.sql`). Se nei test "senza
  tenant" vedi comunque righe → ti stai connettendo come superuser: verifica che
  `.env`/`.env.test` usino `driftly_app`.
- **`init/` gira una sola volta.** `docker-entrypoint-initdb.d` viene eseguito **solo alla prima
  inizializzazione del volume**. Se `driftly-pgdata` esiste già da prove precedenti, ruolo/DB di
  test potrebbero mancare → `docker compose down -v` e risali.
- **Test contro il DB di test.** RLS (Task 6) ed e2e (Task 7) girano su `driftly_test` via
  `dotenv -e .env.test`. Non puntarli al DB di dev.
- **`FORCE ROW LEVEL SECURITY`.** Serve perché la policy valga **anche per il proprietario** della
  tabella (l'app è owner dello schema). È già nel SQL del piano: non ometterlo.
- **`.env` / `.env.test` sono gitignored**; committa solo `.env.example`.

## 8. Come si eseguono i test

```bash
# unit (health)
pnpm --filter @driftly/api test
# RLS isolation (contro il DB di test)
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test -- prisma.service
# e2e (isolamento per tenant attraverso l'API)
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e
```

## 9. Definition of Done (Plan 1)

- `pnpm install` ok; `pnpm lint` pulito; `@driftly/contracts` builda.
- `docker compose up -d` avvia Postgres; init crea `driftly_app` (non-superuser) e `driftly_test`;
  migrazioni applicate su `driftly_dev` **e** `driftly_test`.
- `GET /health` → `{ status: 'ok' }`.
- **Test RLS verdi**: un tenant vede solo i propri clienti; senza tenant non si vede nulla.
- **Test e2e verde**: isolamento per tenant attraverso l'API; path allineati al contratto FE
  (`/api/clienti` con header `X-Stabilimento-Id`).
- Tutto committato; **working tree pulita**.

## 10. Coordinamento / ownership

- **Possiedi** `apps/api`, `apps/api/prisma`; sei **editor primario** di `packages/contracts`
  (**solo aggiunte additive**). **NON toccare** `apps/web-staff` né `packages/ui-kit` (frontend).
- **Branch**: modello a **branch sequenziali, NIENTE worktree** (scelta dell'utente). Il frontend
  è già mergiato su `main`; il backend possiede la base → **lavora su `main`** (o un breve
  `feat/api` mergiato a `main`). Concorda col chi orchestra.
- Se prendi una decisione di design non coperta → **ADR** (prossimo: 0022) o **deferred**, mai
  silenziosa. Se tocchi il dominio, aggiorna data-model/diagrammi
  ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).

## 11. Confini di questa sessione

- **Solo** backend + `contracts` (additivo). Niente frontend, niente moduli oltre il Plan 1,
  **niente `/mappa`** né schema mappa.
- Alla fine: riepiloga cosa è **verde** (con output dei test), cosa è **committato**, e qualunque
  **scostamento** dal piano (con ADR/deferred a supporto). Aggiorna `MEMORY.md` se cambia lo stato.
