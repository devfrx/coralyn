# Delega — Esecuzione del Piano 1 (Core Foundation & Multi-tenant RLS)

> **Cos'è questo documento.** È un **messaggio di delega autosufficiente** da incollare
> all'inizio di una **sessione dedicata** in cui un agente esegue il
> [Piano 1 backend](../plans/2026-06-28-core-foundation.md) di Driftly. Procede in
> **parallelo** alla pianificazione del frontend; il confine di coordinamento è
> `packages/contracts`. Tutto ciò che serve per eseguire correttamente è qui sotto o nei
> documenti linkati.

---

## 0. Il tuo compito in una frase

Esegui **interamente** il [Piano 1](../plans/2026-06-28-core-foundation.md): metti in piedi
il monorepo `@driftly/*`, un backend NestJS funzionante con PostgreSQL/Prisma, e **dimostra
con test** l'isolamento multi-tenant tramite **Row-Level Security** (il rischio #1 dello
spec). Niente di più, niente di meno: **non** anticipare moduli successivi (auth, pricing,
mappa…), che appartengono ai piani 2+.

## 1. Skill e metodo (obbligatorio)

- All'inizio sessione applica la disciplina **`superpowers:using-superpowers`**.
- Esegui il piano con **`superpowers:subagent-driven-development`** (raccomandato) oppure
  **`superpowers:executing-plans`**: task per task, spuntando i checkbox `- [ ]`.
- Dove il piano prescrive **TDD** (Task 3 health, Task 6 RLS, Task 7 e2e): scrivi prima il
  test che fallisce, poi l'implementazione minima — **non saltare il passaggio "rosso"**.
- Prima di chiudere, usa **`superpowers:verification-before-completion`**: nessuna
  affermazione di "fatto" senza l'output dei comandi a supporto.

## 2. Contesto prodotto (cosa stai costruendo)

- **Driftly** (codename provvisorio — il brand è rimandato, [D-017](../architecture/deferred.md))
  è un **gestionale SaaS multi-tenant per lidi balneari** (stabilimenti balneari).
- È in costruzione il **Core operativo (MVP)**: mappa ombrelloni, prenotazioni/abbonamenti,
  clienti, listino. Vedi la [spec del Core (Approvato)](../specs/2026-06-27-core-operativo-design.md).
- **Stato del repo adesso:** contiene **solo `docs/`** (nessun codice). La fondazione che
  crei tu nei Task 1–2 è la prima riga di codice del progetto. Git è pulito.
- **Disambiguazione di dominio critica:** `Cliente` = **il bagnante**. Il **tenant** è lo
  **`Stabilimento`** — non chiamarlo mai "cliente" nel codice. Vedi il
  [glossario](../architecture/glossary.md).

## 3. Principi NON negoziabili (l'utente ci tiene molto)

1. **Decision rubric ([ADR-0002](../architecture/decisions/0002-decision-rubric.md))** — ogni
   decisione pesata su 4 filtri: **professionalità, convenzioni, modularità, zero debito**.
2. **Un ADR per ogni decisione architetturale** — file numerati **immutabili** in
   `docs/architecture/decisions/`; i cambi di rotta si fanno via *supersede* (mai cancellare);
   i rinvii vanno in [`deferred.md`](../architecture/deferred.md) con motivazione. Se durante
   l'esecuzione prendi una decisione di design non già coperta, **fermati e scrivi un ADR**
   (o registrala come deferred) — non introdurre scelte silenziose.
3. **Lingua ([ADR-0003](../architecture/decisions/0003-language-convention.md))** — codice in
   **inglese**; **termini di dominio in italiano** (`Stabilimento`, `Cliente`, `Ombrellone`,
   `Fila`, `Fascia`, `Abbonamento`…) come *ubiquitous language*; documentazione in italiano.
4. **Commit atomici per decisione** — un commit per task/step come indicato nel piano,
   messaggi tecnici in inglese, **ognuno** con trailer:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
5. **Stile dell'utente** — ragiona a fondo; quando una scelta è aperta, dai una
   **raccomandazione netta motivata per rubrica**, non un elenco neutro. **Comunica in
   italiano.** (Vedi `MEMORY.md`.)

## 4. Ambiente (già disponibile)

- **Node 24**, **pnpm 10**, **Docker 29**. Radice repo: `C:/Users/Jays/Desktop/new`.
- **OS Windows 11**, shell primaria **PowerShell**; è disponibile anche **Bash** (sh POSIX).
  I comandi del piano sono scritti in sintassi POSIX → eseguili con lo strumento Bash, oppure
  adattali a PowerShell. Attenzione alle differenze (`&&`, qui-string, redirezioni).
- I file `.env` e `.env.test` sono **gitignored**; committa solo `.env.example`.

## 5. Documenti da leggere (in quest'ordine, prima di toccare codice)

1. [Piano 1 — Core Foundation](../plans/2026-06-28-core-foundation.md) — **il copione da eseguire**.
2. [Spec del Core](../specs/2026-06-27-core-operativo-design.md) — il *perché* funzionale.
3. ADR di riferimento del piano: [0007 stile architetturale](../architecture/decisions/0007-stile-architetturale.md),
   [0008 stack & layout](../architecture/decisions/0008-stack-e-layout.md),
   [0010 isolamento multi-tenant (RLS)](../architecture/decisions/0010-isolamento-multi-tenant.md).
4. [Modello dati](../design/data-model.md) — entità e invarianti (tenant scoping, anti-overlap…).
5. [Architettura viva](../architecture/README.md) e `MEMORY.md`.

## 6. Cosa fa il Piano 1 (mappa dei 7 task)

1. **Scaffold monorepo** — `pnpm-workspace.yaml`, `package.json` root, `tsconfig.base.json`,
   `.editorconfig`/`.prettierrc.json`/`eslint.config.mjs`, `.gitignore`.
2. **`@driftly/contracts`** — pacchetto dei tipi condivisi FE/BE (skeleton: `Ruolo`, `ClienteDTO`),
   **buildato a `dist` con `tsc`** e consumato come workspace package.
3. **Skeleton NestJS + `GET /health`** (TDD).
4. **PostgreSQL via Docker + ruolo applicativo non-superuser** (per la RLS).
5. **Prisma** — schema (`Stabilimento`, `Cliente`), migrazione, `PrismaService`.
6. **Row-Level Security + `forTenant` + test di isolamento** — *lo spike*.
7. **Tenant context (header provvisorio) + `GET/POST /clienti` isolato** (e2e).

## 7. Trappole critiche (qui falliscono gli spike — leggi prima di Task 4–7)

- **La RLS e il ruolo DB.** I **superuser** PostgreSQL **bypassano** la RLS. L'app **deve**
  connettersi con il ruolo `driftly_app` (`NOSUPERUSER NOBYPASSRLS`, creato da
  `init/01-app-role.sql`). Se nei test "senza tenant" vedi comunque delle righe, quasi certamente
  ti stai connettendo come superuser: **verifica che `.env`/`.env.test` usino `driftly_app`**.
- **Lo script `init/` gira una sola volta.** `docker-entrypoint-initdb.d` viene eseguito **solo
  alla prima inizializzazione del volume**. Se il volume `driftly-pgdata` esiste già da prove
  precedenti, il ruolo/DB di test potrebbero mancare → `docker compose down -v` e risali.
- **Test contro il DB di test.** RLS (Task 6) ed e2e (Task 7) girano su `driftly_test` via
  `dotenv -e .env.test`. Non puntarli al DB di dev.
- **`FORCE ROW LEVEL SECURITY`.** Serve perché la policy valga **anche per il proprietario**
  della tabella (l'app è owner dello schema). È già nel SQL del piano: non ometterlo.
- **`contracts` come pacchetto buildato**, non path-alias a runtime: builda `@driftly/contracts`
  prima che `apps/api` lo consumi (`pnpm build:contracts`).

## 8. Come si eseguono i test (riassunto operativo)

```bash
# unit (health, RLS isolation)
pnpm --filter @driftly/api test
# il test RLS va eseguito contro il DB di test:
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test -- prisma.service
# e2e (isolamento per tenant attraverso l'API)
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e
```

## 9. Definition of Done (dal piano — non dichiarare "fatto" senza)

- `pnpm install` e build di `contracts` ok; `pnpm lint` pulito.
- `docker compose up -d` avvia Postgres; init crea `driftly_app` (non-superuser) e
  `driftly_test`; migrazioni applicate su `driftly_dev` **e** `driftly_test`.
- `GET /health` → `{ status: 'ok' }`.
- **Test RLS verdi**: un tenant vede solo i propri clienti; senza tenant non si vede nulla.
- **Test e2e verde**: isolamento per tenant attraverso l'API.
- Tutto committato; **working tree pulito**.

## 10. Coordinamento parallelo con il frontend (IL punto di coerenza)

La pianificazione del frontend procede **in parallelo** in un'altra sessione. Decisione
concordata con l'utente: **Opzione A — il backend possiede la base del monorepo.**

- **La fondazione è tua.** I **Task 1–2** (scaffold monorepo + skeleton `contracts`) creano la
  base condivisa. Operativamente è consigliato **committare Task 1–2 sul branch base e lasciare
  che il worktree del frontend forki da lì** prima di proseguire con Task 3–7: così non esistono
  due agenti che creano `pnpm-workspace.yaml`/`tsconfig.base.json`. Coordina questo checkpoint
  con chi orchestra le due sessioni.
- **Ownership (per evitare conflitti git):**
  - **Possiedi** `apps/api`, `apps/api/prisma` e sei **editor primario** di `packages/contracts`.
  - **Non toccare `apps/web-staff`** (è del frontend).
- **Il contratto è il confine.** Il frontend **proporrà i DTO** che gli servono (es. forme di
  `Cliente`, payload di creazione, enum di stato). Integra quelle richieste in
  `packages/contracts`, mantieni i **merge del solo contratto piccoli e frequenti**, e tieni i
  tipi coerenti con il [modello dati](../design/data-model.md). Non rinominare i termini di
  dominio (restano in italiano).
- **Nota sul tenant:** in questo piano il tenant arriva dall'header **provvisorio**
  `X-Stabilimento-Id`; sarà sostituito dal JWT nel Piano 2 impostando lo stesso `req.tenantId`
  (nessuna modifica ai moduli di dominio né a `TenantContext`). Il frontend lo sa: in mock userà
  lo stesso header.

## 11. Confini di questa sessione

- Lavora **solo** su backend + `contracts`. Niente frontend, niente moduli oltre il Piano 1.
- Se tocchi il dominio o aggiungi una decisione, **aggiorna i diagrammi/ADR** coerentemente
  ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)).
- Alla fine: riepiloga cosa è verde (con output dei test), cosa è committato, e qualunque
  scostamento dal piano (con ADR/deferred a supporto).
