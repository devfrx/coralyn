# Handoff — Error-surface slice CHIUSA (D-041 + D-050 + D-049) · prossimi

> **Data:** 2026-07-10 · **Autore sessione:** agente error-surface (Task 1→5).
> **TL;DR:** lo slice **error-surface** è **completo**: un `PrismaExceptionFilter` globale
> (`P2002`→409 [D-041], `P2023`→400 [D-050]) registrato via **`APP_FILTER`** chiude uniformemente
> il gap 500→status-pulito su tutti i controller (incluso il catalog, senza spargere
> `ParseUUIDPipe`); il full-run e2e è ora stabile senza flag manuale (`testTimeout` [D-049]);
> eliminata la duplicazione del bootstrap e2e (`createTestApp()`). **Nessun nuovo ADR**
> (error-surface puro). Verifica LIVE su Docker **delegata al controller** (fuori scope di questa
> sessione). Baseline finale verde: api unit **232** · api e2e **330** · web-staff **375**
> (non toccato) · typecheck pulito.

---

## 1. Stato `git` & baseline

- **`main` locale = `abbabc1`** (punto di partenza dello slice). Branch di lavoro
  **`feat/error-surface-d041-d050-d049`**, creato da `abbabc1`, **4 commit implementativi + 1
  commit docs (questa sessione)**:
  - `08ebee5` — `testTimeout: 20000` in `apps/api/test/jest-e2e.json` (D-049).
  - `0c6d25e` — `PrismaExceptionFilter` globale (`P2002`→409 D-041, `P2023`→400 D-050) via
    `APP_FILTER`.
  - `7bc17ef` — estrazione `createTestApp()`, eliminata duplicazione bootstrap e2e (22 suite / 24
    blocchi `beforeAll`).
  - `7397ba9` — e2e `catalog-error-surface.e2e-spec.ts` (13 casi, id malformato catalog → 400).
  - *(questa sessione)* — `docs: chiudi D-041/D-050/D-049 (error-surface) + handoff`.
- **Merge FF su `main` e push:** **gated**, in attesa di OK esplicito dell'utente (dopo whole-branch
  review, come da metodo — non eseguita in questa sessione, è Task 5 = solo docs+verifica).
- **Verifica LIVE su Docker:** **NON eseguita in questa sessione** (esplicitamente esclusa dal
  brief — "il controller farà la verifica Docker separatamente"). Il container `api` **non è stato
  ricostruito**; il codice sul branch non è ancora quello in esecuzione nel container. Prima del
  merge, ricostruire (`docker compose --profile full up -d --build api`) e verificare almeno
  `DELETE /api/seasons/not-a-uuid` → **400** (era 500).
- **Baseline finale (verificata REALE in questa sessione, tutta verde):**
  - api unit: `corepack pnpm test --runInBand` → **232 passed** (41 suite; era 229, +3 = i test del
    mapper `mapPrismaKnownError`).
  - api e2e: `corepack pnpm test:e2e --runInBand` → **330 passed** (26 suite; era 317, +13 =
    `catalog-error-surface.e2e-spec.ts`). Docker DB era già up (container `coralyn-db`/`coralyn-api`
    sani da sessioni precedenti) — nessun reset necessario.
  - typecheck: `corepack pnpm exec tsc -p tsconfig.json --noEmit` → **0 errori** (exit 0).
  - web-staff: **non toccato**, non rieseguito (era 375, invariato per costruzione — lo slice tocca
    solo `apps/api`).

## 2. Cosa è stato fatto (i 4 task implementativi + questo Task 5)

### D-049 — `testTimeout` esplicito nella config e2e (`08ebee5`)
`apps/api/test/jest-e2e.json` non fissava `testTimeout`: il full-run flakava al default 5s dei hook
sotto carico (app-init dei ~25 bootstrap Nest sequenziali). Aggiunta la chiave
`"testTimeout": 20000` → full-run stabile **senza** passare `--testTimeout` a mano. I tempi reali
di init restano < 5s a macchina scarica, quindi il margine non maschera regressioni di performance.

### D-041 + D-050 — `PrismaExceptionFilter` globale via `APP_FILTER` (`0c6d25e`)
Nuovo `apps/api/src/common/prisma-exception.filter.ts`:
- `mapPrismaKnownError(code: string)` — funzione **pura**: `P2002`→
  `{status: 409, message: 'Operazione in conflitto: esiste già una risorsa con questi dati.'}`,
  `P2023`→`{status: 400, message: 'Identificatore non valido.'}`, altrimenti `null` (delega).
- `PrismaExceptionFilter extends BaseExceptionFilter` — se il mapper ritorna `null` chiama
  `super.catch(exception, host)` → **comportamento di default invariato** (500 + log) per i codici
  non gestiti (`P2003` FK, `P2025` not-found, `P2034` deadlock, ecc.).
- Registrato in `AppModule` via `providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }]`
  — **non** in `main.ts` con `useGlobalFilters`.

**Perché `APP_FILTER` e non `main.ts`:**
1. È attivo in **ogni** e2e per costruzione (le suite fanno `Test.createTestingModule({imports:
   [AppModule]})`), quindi zero drift test-vs-prod — nessuna suite può "dimenticare" di applicare il
   filtro.
2. `BaseExceptionFilter.super.catch` preserva il comportamento 500+log dei codici non mappati senza
   doverlo reimplementare.
3. Evita l'insidia nota di DI dell'`HttpAdapter` quando si registra un `ExceptionFilter` fuori dal
   ciclo di vita di Nest (in `main.ts` va risolto manualmente da `app.get(HttpAdapterHost)`).

Le difese locali **restano** prima linea con messaggi specifici e non sono state rimosse: (a)
`ParseUUIDPipe` sui `:id` struttura (`sectors`/`rows`/`umbrellas`/`umbrella-types`, da §4.1); (b)
`mapConflict`/check-proattivi 409 per-service (check-then-create). Il filtro è il **backstop
uniforme**, incluso sul **catalog** (`equipment-types`/`packages`/`rates`/`seasons`/`time-slots`)
— deliberatamente **senza** aggiungere `ParseUUIDPipe` lì: spargere pipe controller-per-controller
è la via pigra già segnalata in [D-050]; il filtro globale copre il catalog uniformemente in un
punto solo.

### Estrazione `createTestApp()` (`7bc17ef`)
Nuovo `apps/api/test/helpers/create-test-app.ts`: `createTestApp(moduleRef)` applica prefix `api` +
`ValidationPipe({whitelist,transform})` + `init()` — allineato a `main.ts`. **Non** applica il
filtro (già globale via `APP_FILTER`, evitare doppia registrazione). Migrate **22 e2e-spec** (24
blocchi `beforeAll` — `customers.e2e-spec.ts` ne ha due) dal bootstrap duplicato manuale. Le **3**
suite senza `useGlobalPipes`: 2 (`prisma.service.e2e-spec.ts`, `reset-dev.e2e-spec.ts`) non
bootstrappano un'app Nest (inapplicabile), 1 (`booking-overlap-constraint.e2e-spec.ts`) lasciata
manuale con un commento esplicativo (dipende dal comportamento senza pipe).

### e2e catalog-error-surface (`7397ba9`)
Nuovo `apps/api/test/catalog-error-surface.e2e-spec.ts`: 13 casi `it.each`, un id non-UUID
(`'not-a-uuid'`) sui `:id` di `equipment-types`/`packages` (PATCH/archive/restore/DELETE),
`rates`/`time-slots` (PATCH/DELETE), `seasons` (DELETE) → tutti **400** (prima del filtro erano
**500**, `P2023`). Confermato che **nessun** controller catalog usa `ParseUUIDPipe` → la suite
esercita genuinamente il filtro globale, non una difesa locale preesistente.

### Questo Task 5 — Documentazione + verifica finale
- `docs/architecture/deferred.md`: righe D-041/D-049/D-050 rimosse dalla tabella attiva, aggiunte in
  `## Risolte` (D-041+D-050 come voce combinata, D-049 separata) con baseline finale registrata.
- Questo handoff.
- Le 3 verifiche finali (Step 2 del brief) rieseguite e confermate **REALI** (numeri sopra).
- **Skippato per istruzione esplicita:** Step 3 del brief (verifica LIVE Docker) — il controller la
  farà separatamente.

## 3. Deferred M1 (minor, per il triage successivo)

Nel filtro, il campo `error` della risposta JSON è derivato da un **ternario sullo status**
(`mapped.status === HttpStatus.CONFLICT ? 'Conflict' : 'Bad Request'`) invece che dal mapper
stesso. Funziona per i 2 codici attuali, ma un futuro 3° codice mappato (es. `P2025`→404) andrebbe
a finire etichettato "Bad Request" per errore. Fix a costo quasi zero: far ritornare `error` da
`mapPrismaKnownError` insieme a `status`/`message`, e leggerlo dal mapped object nel filtro. Non
bloccante (0 impatto sui 2 codici correnti), tracciato qui per non perderlo.

## 4. GOTCHA / lezioni

- **Forma del comando `test:e2e` — NIENTE `--` prima dei flag.** Lo script npm di `test:e2e` è
  `jest --config ./test/jest-e2e.json`; il comando corretto per il full-run è
  `corepack pnpm test:e2e --runInBand` (**senza** `--` intermedio — pnpm passa gli argomenti extra
  allo script sottostante direttamente). Il brief originale (piano) usava
  `corepack pnpm test:e2e -- --runInBand`: **entrambe le forme hanno funzionato** in questa sessione
  (pnpm è tollerante), ma la guida finale del compito dice esplicitamente "NO `--` prima dei flag" —
  seguita qui. Per i run **mirati** con `-t '<nome>'`, **non omettere** `--config
  ./test/jest-e2e.json`: senza, jest usa la config di default e il match `-t` non trova nulla →
  **falso pass silenzioso** (0 test eseguiti "passano" per definizione).
- **Non lanciare `@coralyn/web-staff test` e `@coralyn/api test:e2e` in parallelo** — contendono
  `prepare`/`build:contracts` (osservato in slice precedenti, [D-049] pre-fix). Non testato di
  nuovo qui perché web-staff non è stato toccato/rieseguito.
- **DB `coralyn_dev` e working tree condivisi tra sessioni** — verificare lo stato di Docker
  (`docker ps`) prima di assumere che l'e2e serva un reset; in questa sessione i container erano già
  `healthy` da sessioni precedenti, nessun reset necessario per il full-run e2e (che usa comunque
  tenant e2e isolati creati/distrutti dentro le suite, non il tenant dev).
- **`ParseUUIDPipe`/`@IsUUID()` di default = v1–5** (non "any"): gli id Prisma sono sempre v4
  (`@default(uuid())`) → passano sempre; solo id hand-crafted/legacy non-v4 falliscono. Non
  allentare la semantica per "coprire" quel caso — è dato-legacy, non un bug (vedi handoff
  precedente §4.1).

## 5. Prossime priorità (da decidere con l'utente)

Con error-surface chiuso, **tutti i difetti §4 + il gap error-surface catalog sono risolti**.
Resta, in ordine di peso:

- **D-035 S3 → S4** (canale cliente self-service) — la decisione **più pesante** del backlog:
  **S3** = auth/identità cliente (il `Customer` non ha login oggi) + la decisione strutturale del
  **tenant-routing pubblico** (sottodominio/path/QR, oggi inesistente) — atterrano
  [D-026]/[D-027]/[D-028]/[D-029]. **S4** = canale PWA/QR per la release "assenza comunicata" (riusa
  S1+S2 già mergiate, `AbsenceRelease.source='customer'` già predisposto senza retrofit) +
  [D-037] (gestione 401 FE). **Brainstorming OBBLIGATORIO** prima di scrivere qualunque spec —
  decisione architetturale nuova (routing pubblico + auth cliente), non un incremento CRUD.
  Invariante non negoziabile: rivendita **solo** su release esplicita del cliente, **zero cassa**
  sull'abbonato ([ADR-0048]).
- **D-040** — estrazione `EstablishmentStructureView.vue` (~406 righe, editor «Configura» ora
  "chiuso" — buon momento per il refactor puro, nessun cambio di comportamento).
- **Backlog `deferred.md` residuo:** [D-036] report avanzato (heatmap, occupazione media) ·
  [D-038] drag-reorder struttura · [D-047] audit di tenant per azioni admin-in-tenant · [D-012]
  cabine/servizi accessori (**l'utente lo ritiene poco utile — NON partire senza sua
  riconferma**) · M1 (§3 sopra, minor cosmetico sul filtro, cheap fix quando si tocca di nuovo il
  file).
- **Verifica LIVE Docker** di questo slice (Step 3 del brief originale) — da fare separatamente
  prima del merge FF: ricostruire il container `api` e confermare `DELETE
  /api/seasons/not-a-uuid` → 400 (era 500) sul path reale, non solo nei test.

## 6. Metodo (replicare)

Gate review spec → (**brainstorming** se modulo/decisione strutturale — **obbligatorio per S3**) →
**writing-plans** (TDD) → **subagent-driven** (implementer col modello per costo/rischio + review a
due stadi + whole-branch opus) → **verifica LIVE su Docker** → **presentare e attendere OK
esplicito** per il merge FF **e** per il push (entrambi con ok utente). Preferenza utente: nelle
scelte "coerente vs scorciatoia" sempre la soluzione **professionale/senza-debiti**.

## 7. Riferimenti

- Handoff precedente: [2026-07-10-configura-4-1-chiuso-guardie-e-param-uuid.md](2026-07-10-configura-4-1-chiuso-guardie-e-param-uuid.md).
- Piano di questo slice: [2026-07-10-error-surface-d041-d050-d049.md](../superpowers/plans/2026-07-10-error-surface-d041-d050-d049.md).
- Registro [`deferred.md`](../architecture/deferred.md) · Rubric [ADR-0002] · Design docs [ADR-0009] · Assenze [ADR-0048].

[ADR-0002]: ../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../architecture/decisions/0009-documentazione-di-design.md
[ADR-0048]: ../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-012]: ../architecture/deferred.md
[D-026]: ../architecture/deferred.md
[D-027]: ../architecture/deferred.md
[D-028]: ../architecture/deferred.md
[D-029]: ../architecture/deferred.md
[D-036]: ../architecture/deferred.md
[D-037]: ../architecture/deferred.md
[D-038]: ../architecture/deferred.md
[D-040]: ../architecture/deferred.md
[D-041]: ../architecture/deferred.md
[D-047]: ../architecture/deferred.md
[D-049]: ../architecture/deferred.md
[D-050]: ../architecture/deferred.md
