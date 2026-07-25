# Handoff 2026-07-25 (sessione 4): Fase D eseguita, branch pronto e NON mergiato

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-25 Fase C mergiata](2026-07-25-fase-c-mergiata-ci-verde-prossime-fasi.md), che resta
> valido tranne dove questo documento lo corregge (§1 e §3).

---

## 0. In una riga

**Fase D dell'audit è eseguita e verificata sul branch `chore/audit-2026-07-25-fase-d`
(6 commit sopra `main` = `37a585f`). NON è mergiata: serve il tuo ok.**
`pnpm run verify` → exit 0. Ogni difetto è stato **riprodotto con un test rosso prima del fix**;
ogni fix è stato **provato per mutazione**.

---

## 1. Cosa è stato fatto

Sei commit, uno per finding. Il razionale completo è nei messaggi: `git log --format=%B main..HEAD`
è la fonte più densa. Qui solo ciò che cambia il modo di lavorare sul repo.

| Commit | Finding | Cosa è cambiato |
|---|---|---|
| `0292e52` | AUD-007 | `bookings/coverage.carve.ts` — l'aritmetica del carve in **una** funzione pura + CHECK DB `coverage_range_valid` |
| `e5d37a9` | AUD-008 | `P2003 → 409` in `mapPrismaKnownError` + count mancanti in `SeasonsService.remove` |
| `aa8a5f1` | AUD-009 | thunk in tutti i composable con id di `useCustomers.ts` |
| `acf0ed5` | AUD-010 | logout con revoca server-side + redirect su fine sessione in `CustomerShell` |
| `7436739` | AUD-011 | `@IsUuidShape()` + lint che vieta `@IsUUID` + `prisma/dev-ids.ts` condiviso |
| `6eac767` | P2-008, P2-009, P1-004 | contatore PIN atomico, articolo archiviato non noleggiabile, cliente anonimizzato nei 4 write-path |

### 1a. Tre cose scoperte eseguendo, che i finding non dicevano

1. **`seed-report-demo.ts` non poteva funzionare.** Il finding P1-003 segnalava che i due seed
   avevano helper id divergenti e che il commento «Stesso helper id di seed.ts» era falso. La
   conseguenza vera è più grave: quello script **riferisce** per id fasce, ombrelloni e stagioni
   che crea `seed.ts` (`u(2,n)`, `u(5,n)`, `u(7,n)`), quindi puntava a righe inesistenti. Ora
   entrambi importano `prisma/dev-ids.ts`.
2. **La guardia «cliente anonimizzato» che *già esisteva* non aveva test.** Il finding P1-004 dice
   «presente in `transfer`». È vero — e cancellandola la suite restava verde. Trovato con la
   mutazione, non leggendo. Il ramo `NEW_CUSTOMER_ANON` ha ora un e2e.
3. **La documentazione legale era più accurata del codice.** `registro-trattamenti.md:173` e
   `dpa-coralyn-lido.md:234` dichiarano l'anonimizzazione «**irreversibile** in place». Non lo era:
   `PATCH /customers/:id` ripopolava i campi PII **senza** azzerare `anonymizedAt`, cioè dati
   personali freschi su un record che `list()` continua a nascondere. Il codice è stato allineato
   al documento (409), non viceversa: **nessun testo legale è stato modificato.**

### 1b. Correzione al testo di un documento precedente

L'handoff di Fase C, §3 «API», diceva: «`PrismaExceptionFilter` lascia **P2025 a 500 di proposito**;
**P2003 pure**». La prima metà resta vera, la seconda **non più**: P2003 è ora 409. Stessa cosa per
«**non usare `@IsUUID()`** … 14 campi lo usano ancora» (zero, e il lint lo impedisce) e per «i
composable di `useCustomers.ts` prendono l'id per VALORE» (per thunk). Le tre righe sono corrette
in §3 qui sotto, che sostituisce quella lista.

---

## 2. Baseline verde — nuovi numeri

| Suite | Comando | Prima | Ora |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190 | 190 |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 | 23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 29 | **35** |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 427 | **428** |
| api unit | `pnpm --filter @coralyn/api test` | 310 | **330** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 450 | **459** |
| tutto insieme | **`pnpm run verify`** | exit 0 | **exit 0** |
| lint | `pnpm run lint` | 0 err / 66 warn | **0 err / 67 warn** |
| typecheck | `pnpm run typecheck` | exit 0 | exit 0, 7 progetti |

**Totale: 1476 test distinti** (erano 1440, **+36**).

Il +1 di warning è un `as any` in una spec di `web-customer`, identico ai sei che quel file già
conteneva (nei test `no-explicit-any` è `warn` per scelta, vedi `eslint.config.mjs`).

**Regola di verifica invariata**: dopo ogni fix questi numeri non scendono, typecheck exit 0, lint
non sale sopra 0 errori.

---

## 3. Gotcha — sostituisce la lista dell'handoff di Fase C

### Nuovi, dalla Fase D

- **Il carve della coverage ha UN solo posto**: `apps/api/src/bookings/coverage.carve.ts`. Se una
  nuova operazione libera tempo sull'occupazione, usa `carveInterval` + `applyCarve` — non
  riscrivere testa e coda a mano. È già successo quattro volte, e la quarta copia ha prodotto un
  500 in produzione del repo.
- **`carveInterval` decide rispetto al FRAMMENTO, mai allo span di contratto.** Su coverage
  frammentata (assenza comunicata, sospensione precedente) sono cose diverse: è esattamente il
  punto in cui `suspend` sbagliava.
- **Il DB rifiuta ora una coverage con `startDate > endDate`** (CHECK `coverage_range_valid`). Una
  migration da applicare a `coralyn_dev` **e** `coralyn_test`.
- **`P2003` è mappato a 409**, non più a 500. Il messaggio del filtro è generico di proposito: se
  vuoi un errore che nomini la dipendenza, la guardia va nel service (cfr. `SeasonsService.remove`,
  `deletePackage`, `TimeSlotsService.remove`). **P2025 resta a 500 di proposito.**
- **`@IsUUID` è vietato dal lint** (`no-restricted-imports` su `apps/api/**`). Il decoratore giusto
  è `@IsUuidShape()` in `common/is-uuid-shape.ts`. `@Matches(UUID_SHAPE, {...})` resta in ~15 DTO:
  è la stessa policy scritta in modo più verboso, **non** un errore — vedi §5.3.
- **Gli id sintetici dei seed vengono da `prisma/dev-ids.ts`**, importato da entrambi gli script.
  Non ridefinire `u()` localmente.
- **I composable di `useCustomers.ts` prendono gli id per THUNK**, come `useRates`. `RouterView` non
  ha `:key`: una vista di dettaglio viene **patchata**, non ricreata, quando cambia `:id`.
- **`web-customer` ha due uscite distinte**: `logout()` (esplicita, revoca lato server) e
  `clearSession()` (la sessione è già morta, non spende una richiesta). A portare via l'utente pensa
  `CustomerShell` osservando `authenticated` — l'interceptor non conosce il router.
- **`customers/active-customer.ts` è la definizione di «cliente attivo»**: usala nei percorsi di
  scrittura. È una funzione libera che prende il `tx` e non un metodo di `CustomersService` perché
  `CustomersModule` importa già `BookingsModule` (la dipendenza inversa sarebbe un ciclo).
- **`getById` NON filtra i clienti anonimizzati, ed è voluto**: la Scheda cliente li mostra nello
  stato «rimosso». Filtrarlo romperebbe la vista.

### Dalla Fase C — invariati

- **Le e2e dei controller di dominio fanno login come `admin`.** Nessuno dei file
  `seasons/rates/packages/equipment-types/time-slots/renewal-campaigns/rental-items/rental-tariffs/rentals`
  crea un utente `staff`. **Una stretta involontaria dei permessi non fa fallire la suite.** L'unico
  presidio è `authorization-staff.e2e-spec.ts`: se cambi un permesso, **estendi quel file**.
- **Un endpoint nuovo senza `@RequiresPermission` dà 403**, e `authorization-coverage.spec.ts` lo
  intercetta in CI. Lo stesso test fallisce anche per un permesso **mai usato**.
- **Throttler**: `@Throttle({ default: {...} })` come sovrascrittura per-rotta. Una seconda
  definizione *nominata* verrebbe valutata su **tutte** le rotte throttled.
- **`configureApp` è condivisa** da `main.ts` e da tutte le 41 suite e2e.
- **Una env obbligatoria nuova va aggiunta a tutti e tre gli example**, altrimenti CI e e2e non
  partono.
- **Il seed rifiuta un database che non si chiami `coralyn_dev`/`coralyn_test`** (prefisso).
- **Il repository è PUBBLICO.** Ogni valore in un file versionato è leggibile da chiunque.

### Ambiente

- **Il DB è sulla 5432.** `.env.test` è allineato; **`apps/api/.env` punta ancora a `:5433`** ed è
  il file che `start:dev` legge → il server di sviluppo non si connette finché non lo allinei. (In
  questa sessione è stato corretto solo il commento di `seed-report-demo.ts`, che citava la 5433:
  `apps/api/.env` è gitignorato e non è stato toccato.)
- **Container Docker si auto-riavviano e RUBANO la porta 3000.** Il progetto compose si chiama
  `new`, non `coralyn`, e le immagini sono vecchie → 404 su rotte che esistono nel codice.
- **NON lanciare `docker compose up -d db` da questa cartella**: userebbe un volume vuoto. Usa
  `docker start coralyn-db coralyn-mailpit`.
- **L'API legge `apps/api/.env`**, non il `.env` di root. **Il Prisma CLI non legge il `.env` di
  root**: passa `DATABASE_URL` inline. **`migrate deploy` va dato su ENTRAMBI i DB.**
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`).
- **Porte dev FISSE** (`strictPort`): staff 5173, platform 5174, customer 5175.

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (per tenant) | **Coralyn** (uno solo) |
| Dove si compila | form Stabilimento → Profilo legale | **codice**, `packages/legal/src/*.content.ts` |

**`/privacy` è riservato al bagnante**: due test per app lo vietano. **Doppio artefatto**
`docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` da aggiornare **insieme** — e ⚠️ **oggi sono
divergenti**: `privacy-policy-operatori.md:68-73` ha un blocco «✅ Verificato sul codice» con **due
affermazioni false**. Finding P4-006, aperto, Fase H.

### API — invariati

- `JwtAuthGuard` + `PermissionsGuard` **globali**. `@Public()` scavalca **entrambi**; il canale
  cliente ha la propria autenticazione (`CustomerJwtGuard`).
- RLS via `forTenant` + policy `tenant_isolation` (**idioma da copiare verbatim**). Migration sempre
  `--create-only`, **leggile**, RLS **appesa a mano**.
- Il login staff restituisce **`accessToken`**; `POST /customer/activate` vuole **`enrollmentToken`**
  + `pin`.

### Frontend — invariati

- **`VITE_*` è BUILD-TIME**: in produzione va passata come **build arg**.
- **Tailwind v4 non scansiona i package**: serve `@source` in `main.css` di ogni app consumatrice.
- **`mutationResource` ha un toast d'errore di default, `queryResource` no** → 9 viste su 12 rendono
  l'errore come «vuoto» (AUD-012, aperto).
- Contenuti dei `Modal` **teleportati**: nei test `document.querySelector`, **non** `w.get`.
- `Popover` = props + emit. `Calendar` = stringa ISO. `Select` = `selectOption` + `SELECT_EMPTY`.
  **reka-ui solo in `packages/ui-kit`.**
- **web-customer NON usa MSW**; web-staff sì.
- **Niente em dash nel testo utente** — `docs/` è FUORI da quel perimetro.
- **`SidebarNav.vue` mostra `operativeNav` a OGNI ruolo.**

### Test — invariati

- **`packages/ui-kit` ha il proprio `vitest.config.ts`**: non re-includerlo in web-staff.
- **Le e2e rifiutano di partire** se `DATABASE_URL` non contiene `coralyn_test`. È voluto.
- **Calendario e2e congelato al 2026-07-15** — leggilo **prima** di scrivere e2e.
- **Il fake `forTenant: (_t, cb) => cb(tx)` SCARTA il tenantId** (AUD-026, aperto).

### Processo

- **`git log --all` copre solo i ref LOCALI. Fai `git fetch`** prima di dichiarare che qualcosa non
  esiste: il repo ha **più di un clone attivo**.
- **Prossimo ADR libero: 0058. Prossima deferred libera: D-065.**
- **`gh` non è installato**: per l'esito CI usa l'API pubblica
  (`https://api.github.com/repos/devfrx/coralyn/actions/runs`).
- **Nessun merge su `main` senza ok esplicito.**

---

## 4. Metodo — cosa ha pagato in questa sessione

- **Riprodurre prima di correggere, sempre.** Sei difetti, sei test rossi prima del fix. Due volte
  il rosso ha detto qualcosa che il finding non diceva: il `500` di `suspend` arrivava da un
  `data_exception` e non dal constraint di overlap; i 5 tentativi PIN concorrenti ne consumavano
  **1**, non 2 o 3.
- **La mutazione come prova, anche sui fix riusciti.** Ha trovato un buco che la lettura non aveva
  visto: la guardia «cliente anonimizzato» della cessione era priva di test. Una suite che resta
  verde quando cancelli la riga che dovrebbe proteggere non protegge nulla.
- **Verificare il finding, non solo eseguirlo.** P1-003 parlava di un commento falso fra i due seed;
  aprendo i file, la conseguenza vera era che uno dei due script non poteva funzionare.
- **Correggere il testo falso invece di annotarlo.** Il commento in `bookings.service.ts` che
  codificava l'assunzione sbagliata è stato rimosso, non affiancato da una nota; le tre righe rese
  false dalla Fase D nell'handoff precedente sono riscritte qui, non aggiunte sotto.

---

## 5. Lavori aperti

### 5.1 Azioni tue

1. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le
   email di tutti gli operatori anche allo staff. Separare `team[]` è un cambio di contratto FE/BE.
2. Bloccanti legali pregressi: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei 18 punti ⚖️.

### 5.1b ✅ Chiuse in questa sessione

- **Merge della Fase D** — autorizzato dall'utente il 2026-07-25 ed eseguito (fast-forward).
- **`JWT_SECRET` di produzione** — **decade: non esiste alcun VPS** (confermato dall'utente il
  2026-07-25). Non c'era nulla da verificare, e non c'è oggi alcuna produzione che possa usare il
  segnaposto pubblico. **Non riaprirla come «azione pendente»**: è già una precondizione al primo
  deploy, presidiata da `deploy/README.md:167` (`openssl rand -base64 48`) e dalla checklist `:343`.
  Il rischio resta reale *quando* il deploy ci sarà — chi conosce quel segreto **forgia** token con
  qualunque ruolo su qualunque lido, RLS compresa — ma è una voce di runbook, non un lavoro aperto.

### 5.2 Fasi E → H — piano in [§4 del report](../audit/2026-07-25-audit-completo.md)

**Fase E — presidi strutturali** *(migration)*
Indici unici parziali (sospensione aperta, release attiva, rinnovo confermato) · FK su
`BookingCoverage.umbrellaId` + trigger che la rende DB-autoritativa · 3 indici compositi.

**Fase F — API dei moduli condivisi** *(⚠️ decisioni strutturali)*
Allargare `useActiveSeason`/`statusMaps`/`queryKeys`/`lib/dates` · `crypto.module.ts` `@Global` ·
`DataTable` generico (elimina 83 doppi cast) · etichettatura in `Field`/`Select` (32 combobox senza
nome accessibile) · `QueryBoundary`/`ErrorState` · `sideEffects` in `ui-kit`.

**Fase G — test**
Mirror unit delle difese di sicurezza (`JwtAuthGuard`, `token.service` kind, `CustomerSessionService`)
· fixture con lo **stato concorrente** sui test che oggi non possono fallire · fake `forTenant` che
**asserisce** il tenant · test RLS parametrico derivato da `grep CREATE POLICY` · **il test
cross-tenant lato operatore** il cui scaffolding è stato rimosso (P6-020).

**Fase H — documentazione**
Correggere le affermazioni false verificate (D-061 «unica memorizzazione», ⚖️-18 che cita `/privacy`,
`data-model.md` con due entità inesistenti, README root fermo al 01/07, README di web-staff, guida
deploy) · igiene di `deferred.md` (73.680 caratteri, ≥7 voci chiuse ancora in tabella) · **spostare
le asserzioni verificabili dai documenti ai test**.

### 5.3 Segnalazioni fuori scope, non fatte di proposito

- **~15 DTO usano ancora `@Matches(UUID_SHAPE, { message: '…' })`** invece di `@IsUuidShape()`.
  Applicano la policy **giusta**, quindi non è un difetto: è la stessa regola scritta in modo più
  verboso, con un messaggio per campo. Convertirli cambierebbe i testi d'errore dell'API — decisione
  tua, non un fix.
- **`Booking.startDate <= endDate` e `BookingSuspension.startDate <= endDate` non hanno CHECK.** Il
  CHECK di Fase D copre la sola `BookingCoverage`, com'era prescritto. Oggi le guardie applicative
  reggono (verificate); il presidio strutturale è materiale da Fase E.
- **`web-customer` non è stata verificata nel browser**: la vista richiede un backend reale e un
  accesso cliente provisioned (quell'app non usa MSW). Il comportamento è coperto dai test; la
  modifica di layout è una riga flex.

### 5.4 Follow-up minori

a11y combobox con `<label>` fratello · scorciatoie «Oggi + salti» nel `Calendar` e i 15
`<input type="date">` residui · flash-replay del rail fila · l'utente di prova disabilitato nel DB
dev (`verifica-informativa-5492@esempio.test`) · `reset-dev.ts:1-10` cita ancora la porta 5433 e «18
tabelle» invece di 22 (P8-016 — in questa sessione è stato corretto solo `seed-report-demo.ts`).

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline al 62eb63f](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
  · [brief D-063](../superpowers/specs/2026-07-25-permessi-configurabili-design.md)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md)
  · [ADR-0048](../architecture/decisions/0048-assenze-comunicate-release-occupazione.md) ·
  [data-model.md](../design/data-model.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Handoff precedente**: [2026-07-25 Fase C mergiata](2026-07-25-fase-c-mergiata-ci-verde-prossime-fasi.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
