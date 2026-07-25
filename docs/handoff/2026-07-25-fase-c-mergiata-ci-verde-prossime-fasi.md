# Handoff 2026-07-25 (sessione 3): Fase C mergiata, CI verde, fasi D→H aperte

> ⚠️ **Superato da [2026-07-25 Fase D eseguita](2026-07-25-fase-d-eseguita-non-mergiata.md)**, che è
> ora il punto d'ingresso. Questo resta valido come racconto della Fase C; le righe rese false dalla
> Fase D sono state **corrette qui sotto**, non annotate.
>
> A sua volta sostituisce
> [2026-07-25 audit completo Fase A/B](2026-07-25-audit-completo-fase-a-b-mergiabili.md), di cui
> corregge **due affermazioni** (§1c). Quello resta valido come racconto dell'audit.

---

## 0. In una riga

**`main` = `f44e793` (poi il commit di questa chiusura), tutto mergiato e spinto su `origin`.**
Fasi A, B e C dell'audit sono in produzione del repo. La **CI gira ed è verde**. Nessun lavoro
pendente su branch. Le fasi **D → H** sono aperte e pianificate.

---

## 1. Cosa è stato fatto in questa sessione (Fase C)

Quattro fix alla radice, un ADR, due deferred nuove. Ogni commit ha il razionale completo nel
messaggio: `git log --format=%B` è la fonte più densa.

### 1a. Autorizzazione fail-closed, dichiarata per permesso — `a0d864d`

`RolesGuard` **non esiste più**. Al suo posto `PermissionsGuard` + `@RequiresPermission`:
**una rotta senza dichiarazione riceve 403**.
Decisione in [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md).

- Il vocabolario è l'enum `Permission` (19 voci, `apps/api/src/identity/permission.ts`), alla
  granularità delle sezioni della sidebar. I valori stringa sono **stabili**: finiranno in
  configurazione quando l'admin potrà concederli ([D-063](../architecture/deferred.md)).
- `PERMISSION_ROLES` è una tabella **statica** che riproduce **esattamente** la copertura
  precedente: l'inversione chiude il buco strutturale **senza cambiare cosa un operatore può fare**.
- Perché permessi e non ruoli: la destinazione è nota, e annotare ~60 endpoint due volte avrebbe
  significato ripassare su ciascuno proprio nella passata in cui una svista diventa un varco.

### 1b. Perimetro dell'auth staff — `6d15b6e`

- `configureApp(app)` **condivisa** fra `main.ts` e `test/helpers/create-test-app.ts`: le e2e non
  girano più su un'app configurata diversamente dalla produzione.
- `trust proxy` = numero di hop da `TRUST_PROXY_HOPS` (2 in produzione), **mai `true`**. Senza,
  `req.ip` era identico per ogni richiesta passata dal proxy e il rate-limit del canale cliente era
  un bucket **globale**: superata la soglia in aggregato, il refresh riceve 429 e l'app sloggia.
- `ThrottlerGuard` **per metodo** sulle 3 rotte `@Public` di `AuthController` (20/60s da env).
- Hash civetta sul ramo «email inesistente» → chiuso l'oracolo di timing. `@MaxLength(128)` sulle
  password. D-027 e D-029 sono ora **chiuse anche per il canale staff**.

### 1c. Configurazione validata all'avvio — `fa13ac7`

`validate` con class-validator (nessuna dipendenza nuova). **Valida senza trasformare**: i lettori
esistenti fanno `Number(...)` e `=== 'true'`, coercire li romperebbe in silenzio. `CUSTOMER_APP_URL`
è ora obbligatoria **sempre**. Chiude P7-011 per costruzione: il compose dev che non la passava
adesso non parte.

### 1d. Guardia del seed sulla risorsa — `746c956`

`prisma/dev-database.ts` verifica `current_database()`, condiviso con `reset-dev`. L'entrypoint può
continuare a forzare `NODE_ENV=development` senza aprire nulla. Rimossi i fallback letterali delle
credenziali admin e l'`|| echo` che mascherava ogni fallimento.

### 1e. ⛔ Due correzioni a documenti precedenti

1. **L'«interim a costo zero» del report era sbagliato.** `@Roles(Role.Admin)` sui 9 controller
   scoperti avrebbe rotto Listino, Listino noleggi, Rinnovi e Noleggi per lo `staff` — che
   `SidebarNav.vue` mostra a **ogni** ruolo — e `overview`, che l'app-shell chiama a ogni
   caricamento. **E la suite sarebbe rimasta verde**: nessuno dei 9 file e2e crea un utente staff.
2. **La rotazione del `JWT_SECRET` era infondata.** Le impronte SHA-256 del valore in
   `RUNBOOK.local.md`, in `apps/api/.env` e in **`docker-compose.yml` (versionato)** coincidono: è
   il segnaposto `dev-secret-change-me-…`, su un repo **pubblico**. Non c'era nulla di segreto da
   ruotare. Resta invece da verificare che **la produzione non usi quel valore** (§5.1).

---

## 2. Baseline verde

| Suite | Comando | Esito |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190 (36 file) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 29 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 427 (60 file) |
| api unit | `pnpm --filter @coralyn/api test` | **310** (52 suite) |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **450** (41 suite) |
| tutto insieme | **`pnpm run verify`** | **exit 0** |
| lint | `pnpm run lint` | **0 errori**, 66 warning, 603 file |
| typecheck | `pnpm run typecheck` | exit 0, 7 progetti |
| **CI** | push su `main` | **verde**, entrambi i job |

**Totale: 1440 test distinti.**

**Regola di verifica**: dopo ogni fix questi numeri non scendono, il typecheck resta exit 0, il lint
non sale sopra 0 errori.

---

## 3. Gotcha cumulativi

### Nuovi, dalla Fase C — leggili prima di toccare l'API

- **Le e2e dei controller di dominio fanno login come `admin`.** Nessuno dei file
  `seasons/rates/packages/equipment-types/time-slots/renewal-campaigns/rental-items/rental-tariffs/rentals`
  crea un utente `staff`. **Una stretta involontaria dei permessi non fa fallire la suite.** L'unico
  presidio è `authorization-staff.e2e-spec.ts`: se cambi un permesso, **estendi quel file**.
- **Un endpoint nuovo senza `@RequiresPermission` dà 403**, e `authorization-coverage.spec.ts` lo
  intercetta in CI prima che tu lo scopra a mano. Lo stesso test fallisce anche per un permesso
  **mai usato**: non aggiungere voci all'enum in anticipo sull'endpoint.
- **Throttler**: usa `@Throttle({ default: {...} })` come **sovrascrittura per-rotta**. Una seconda
  definizione *nominata* verrebbe valutata su **tutte** le rotte throttled (v6 le applica tutte) e
  stringerebbe anche il canale cliente.
- **`configureApp` è condivisa** da `main.ts` e da tutte le e2e: modificarla tocca 41 suite.
- **Una env obbligatoria nuova va aggiunta a tutti e tre gli example** (`.env.example`,
  `.env.test.example`, `deploy/.env.prod.example`), altrimenti CI e e2e non partono.
- **Il seed rifiuta un database che non si chiami `coralyn_dev`/`coralyn_test`** (prefisso, non
  sottostringa).
- **Il repository è PUBBLICO.** Ogni valore in un file versionato è leggibile da chiunque:
  `docker-compose.yml` contiene in chiaro `JWT_SECRET`, `DEV_ADMIN_PASSWORD`,
  `PLATFORM_SUPERUSER_PASSWORD` e le credenziali Postgres. Sono **dev-only dichiarati** e vanno bene
  lì; non devono comparire in nessun ambiente reale.

### Ambiente

- **Il DB è sulla 5432.** `.env.test` di questa macchina è stato allineato; **`apps/api/.env` punta
  ancora a `:5433`** ed è il file che `start:dev` legge → il server di sviluppo non si connette
  finché non lo allinei.
- **Container Docker si auto-riavviano e RUBANO la porta 3000.** Il progetto compose dei container
  esistenti si chiama **`new`**, non `coralyn`, e le immagini sono vecchie → **404 su rotte che
  esistono nel codice**.
- **NON lanciare `docker compose up -d db` da questa cartella**: creerebbe un progetto parallelo con
  volume vuoto. Usa `docker start coralyn-db coralyn-mailpit`.
- **L'API legge `apps/api/.env`**, non il `.env` di root (`ConfigModule` senza `envFilePath` → cwd).
- **Il Prisma CLI non legge il `.env` di root**: passa `DATABASE_URL` inline.
- **`migrate deploy` va dato su ENTRAMBI i DB** (`coralyn_dev` e `coralyn_test`).
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`).
- **Porte dev FISSE** (`strictPort`): staff 5173, platform 5174, customer 5175.
- **`RUNBOOK.local.md` e `docker-compose.override.yml` sono gitignorati e non hanno `.example`**: il
  setup locale non è ricostruibile dal repo (AUD-019, aperto).

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (per tenant) | **Coralyn** (uno solo) |
| Dove si compila | form Stabilimento → Profilo legale | **codice**, `packages/legal/src/*.content.ts` |

**`/privacy` è riservato al bagnante**: due test per app lo vietano. **Doppio artefatto**
`docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` da aggiornare **insieme** — e ⚠️ **oggi sono
divergenti**: `privacy-policy-operatori.md:68-73` ha un blocco «✅ Verificato sul codice» con **due
affermazioni false** (cita `/privacy` dove il codice usa `/legale/informativa`). Finding P4-006,
aperto, Fase H.

### API

- `JwtAuthGuard` + `PermissionsGuard` **globali**. `@Public()` scavalca **entrambi**; il canale
  cliente ha la propria autenticazione (`CustomerJwtGuard`).
- `PrismaExceptionFilter` lascia **P2025 a 500 di proposito**. **P2003 è mappato a 409** dalla Fase D
  (AUD-008 chiuso): il messaggio del filtro è generico, quello che nomina la dipendenza lo dà la
  guardia del service.
- RLS via `forTenant` + policy `tenant_isolation` (**idioma da copiare verbatim**). Migration sempre
  `--create-only`, **leggile**, RLS **appesa a mano**.
- **`common/uuid.ts` è la policy** (`UUID_SHAPE`, senza vincolo RFC): il decoratore è
  **`@IsUuidShape()`** (`common/is-uuid-shape.ts`). `@IsUUID()` **è vietato dal lint** dalla Fase D
  (AUD-011 chiuso): rifiuta gli id sintetici del seed.
- Il login staff restituisce **`accessToken`**; `POST /customer/activate` vuole **`enrollmentToken`**
  + `pin`.

### Frontend

- **`VITE_*` è BUILD-TIME**: in produzione va passata come **build arg**.
- **Tailwind v4 non scansiona i package**: serve `@source` in `main.css` di ogni app consumatrice.
- **`queryResource` supporta `enabled`**; **`mutationResource` ha un toast d'errore di default,
  `queryResource` no** → 9 viste su 12 rendono l'errore come «vuoto» (AUD-012, aperto).
- Contenuti dei `Modal` **teleportati**: nei test `document.querySelector`, **non** `w.get`.
- `Popover` = props + emit. `Calendar` = stringa ISO. `Select` = `selectOption` + `SELECT_EMPTY`.
  **reka-ui solo in `packages/ui-kit`.**
- **web-customer NON usa MSW**; web-staff sì.
- **Niente em dash nel testo utente** — `docs/` è FUORI da quel perimetro.
- **I composable con id prendono il THUNK**, in `useCustomers.ts` come in `useRates` (AUD-009 chiuso
  in Fase D). `RouterView` non ha `:key`: una vista di dettaglio viene patchata, non ricreata.
- **`SidebarNav.vue` mostra `operativeNav` a OGNI ruolo**: Mappa, Prenotazioni, Noleggi, Rinnovi,
  Clienti, Listino, Listino noleggi, Report. È la mappa reale di «cosa fa lo staff».

### Test

- **`packages/ui-kit` ha il proprio `vitest.config.ts` e il proprio `test`**: non re-includerlo in
  web-staff, o torna il doppio conteggio.
- **Le e2e rifiutano di partire** se `DATABASE_URL` non contiene `coralyn_test`. È voluto.
- **Calendario e2e congelato al 2026-07-15** — leggilo **prima** di scrivere e2e.
- **Il fake `forTenant: (_t, cb) => cb(tx)` SCARTA il tenantId**: nessuno unit test può accorgersi di
  un tenant sbagliato (AUD-026, aperto).

### Processo

- **`git log --all` copre solo i ref LOCALI. Fai `git fetch` prima di dichiarare che qualcosa non
  esiste.** Il repo ha **più di un clone attivo**.
- `.superpowers/` gitignorato. **Prossimo prefisso scratch libero: `task-sl-N`.**
- **Prossimo ADR libero: 0058. Prossima deferred libera: D-065.**
- **`gh` non è installato** su questa macchina: per leggere l'esito della CI si usa l'API pubblica
  (`https://api.github.com/repos/devfrx/coralyn/actions/runs`).
- **Nessun merge su `main` senza ok esplicito.**

---

## 4. Metodo atteso

- Skill `dev-discipline` + `dev-communication` **sempre**; `frontend-design` sul FE; `design-docs`
  quando tocchi dominio/dati/flussi/decisioni; **`compliance-docs` per qualunque lavoro legale/GDPR**;
  `repo-audit` se il lavoro torna a essere sistemico.
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.**
- **Le decisioni strutturali sono dell'utente**: si espongono con opzioni e trade-off reali, **prima**
  di implementare. Dati societari/hosting: chiederli, mai inventarli.
- **Ogni fix alla radice.** Se la radice è fuori portata, dirlo e lasciare il finding aperto — mai
  mascherarlo.

### Cosa ha pagato, e vale la pena ripetere

- **Verificare i finding prima di agirci.** In questa sessione **due** affermazioni ereditate si sono
  rivelate false aprendo i file: l'«interim a costo zero» e la rotazione del `JWT_SECRET`. Entrambe
  sarebbero costate — la prima rompendo il prodotto, la seconda facendo lavoro inutile.
- **La mutazione come prova.** `authorization-coverage.spec.ts` è stato verificato togliendo un
  decoratore e controllando che il test nominasse gli endpoint scoperti.
- **Il test deve poter fallire.** Se una suite non copre il ruolo che la modifica colpisce, resta
  verde mentre il prodotto si rompe. È successo, ed è il motivo di `authorization-staff.e2e-spec.ts`.
- **Correggere il testo falso, non annotarlo sotto.** Le righe rese false dalla Fase C sono state
  riscritte, non affiancate da una nota. È la radice R-G dell'audit.
- **Ancorare le guardie alla risorsa, non all'ambiente.** `NODE_ENV` lo sovrascrive un entrypoint;
  il nome del database no.

---

## 5. Lavori aperti

### 5.1 Azioni dell'utente

1. ~~Verificare il `JWT_SECRET` di produzione~~ — ✅ **DECADUTA il 2026-07-25: non esiste alcun VPS**
   (confermato dall'utente). Non c'era nulla da verificare. Resta una **precondizione al primo
   deploy**, già presidiata da `deploy/README.md:167` e dalla checklist `:343`: chi conosce quel
   segreto **forgia** token con qualunque ruolo su qualunque lido, RLS compresa (il tenant arriva dal
   token).
2. Restano i bloccanti legali pregressi: dati societari di Coralyn, scelta infrastruttura (hosting +
   email → sub-responsabili e trasferimenti extra-SEE), revisione dei 18 punti ⚖️.
3. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le email
   di tutti gli operatori anche allo staff. Separare `team[]` è un cambio di contratto FE/BE.

### 5.2 Fasi D → H — piano in [§4 del report](../audit/2026-07-25-audit-completo.md)

**✅ Fase D — bug di correttezza — ESEGUITA** sul branch `chore/audit-2026-07-25-fase-d`, non
mergiata: `carveInterval` puro + CHECK `coverage_range_valid` · `P2003 → 409` · thunk nei composable
di `useCustomers` · logout e redirect in `web-customer` · `@IsUuidShape()` + lint · `pinAttempts` con
`increment` · articolo archiviato non noleggiabile · guardia «cliente anonimizzato» nei 4 write-path.
Dettaglio in [2026-07-25 Fase D eseguita](2026-07-25-fase-d-eseguita-non-mergiata.md).

**Fase E — presidi strutturali** *(migration)*
Indici unici parziali (sospensione aperta, release attiva, rinnovo confermato) · FK su
`BookingCoverage.umbrellaId` + trigger che la rende DB-autoritativa · 3 indici compositi.

**Fase F — API dei moduli condivisi** *(⚠️ decisioni strutturali)*
Allargare `useActiveSeason`/`statusMaps`/`queryKeys`/`lib/dates` · `crypto.module.ts` `@Global` ·
`DataTable` generico (elimina 83 doppi cast) · etichettatura in `Field`/`Select` (32 combobox senza
nome accessibile) · `QueryBoundary`/`ErrorState` · `sideEffects` in `ui-kit` (ECharts fuori dal
bundle di una PWA mobile).

**Fase G — test**
Mirror unit delle difese di sicurezza (`JwtAuthGuard`, `token.service` kind, `CustomerSessionService`)
· fixture con lo **stato concorrente** sui test che oggi non possono fallire · fake `forTenant` che
**asserisce** il tenant · test RLS parametrico derivato da `grep CREATE POLICY` · **il test
cross-tenant lato operatore** il cui scaffolding è stato rimosso (P6-020).

**Fase H — documentazione**
Correggere le affermazioni false verificate (D-061 «unica memorizzazione», ⚖️-18 che cita `/privacy`,
`data-model.md` con `Package.equipment` rimosso da ADR-0036 e due entità inesistenti, README root
fermo al 01/07, README di web-staff, guida deploy) · igiene di `deferred.md` (73.680 caratteri, una
cella da 6.000, ≥7 voci chiuse ancora in tabella) · **spostare le asserzioni verificabili dai
documenti ai test**.

### 5.3 Slice pianificata a parte

**[D-063](../architecture/deferred.md) — permessi configurabili dall'admin del lido.** Il
prerequisito è fatto (ADR-0057): cambia solo *come* il permesso viene risolto. Brief di delega
completo — stato di partenza, tre decisioni aperte, principi, gotcha, findings correlati, come
verificare — in
[2026-07-25-permessi-configurabili-design.md](../superpowers/specs/2026-07-25-permessi-configurabili-design.md).

### 5.4 Follow-up minori

a11y combobox con `<label>` fratello · scorciatoie «Oggi + salti» nel `Calendar` e i 15
`<input type="date">` residui · flash-replay del rail fila · l'utente di prova disabilitato nel DB
dev (`verifica-informativa-5492@esempio.test`) · `reset-dev.ts:1-10` cita ancora la porta 5433 e «18
tabelle» invece di 22 (P8-016).

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
  · [brief D-063](../superpowers/specs/2026-07-25-permessi-configurabili-design.md)
- **Slice legale**: [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md) ·
  [`docs/legal/`](../legal/README.md)
- **GDPR pregresso**: [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) ·
  [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Handoff precedente** (racconto dell'audit; ⚠️ due affermazioni corrette in §1e):
  [2026-07-25 audit Fase A/B](2026-07-25-audit-completo-fase-a-b-mergiabili.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
