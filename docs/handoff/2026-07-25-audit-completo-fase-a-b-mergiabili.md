# Handoff 2026-07-25 (sessione 2): audit completo del repo + Fase A/B eseguite

> **Punto d'ingresso unico.** Stato, baseline rimisurata, gotcha cumulativi **con le correzioni a
> quelli dell'handoff precedente**, metodo atteso, e le fasi C→H già pianificate.

> **Questo handoff SOSTITUISCE come punto d'ingresso
> [2026-07-25 legale D-061/D-062](2026-07-25-legale-d061-d062-package-e-lavori-aperti.md).** Quello
> resta valido per la slice legale; ma **tre dei suoi gotcha sono falsi** e sono corretti in §3.

---

## 0. In una riga

`main` è invariata a `62eb63f`. Il lavoro vive su due branch, **nessuno mergiato**: serve ok esplicito.
**`chore/audit-2026-07-25-fase-a-b`** (4 commit) e **`chore/audit-2026-07-25-fase-c`**, che parte dal
primo e aggiunge la Fase C.

| Commit | Contenuto |
|---|---|
| `d8ceafe` | `docs(audit)` — il report completo + 9 report di partizione + baseline |
| `374007e` | `fix(sicurezza)` — Fase A: guardia DB nelle e2e, allow-list `.dockerignore` |
| `6f618f5` | `chore(qualita)` — Fase B: `verify` + CI, config Jest, lint |
| `32ff919` | `docs(handoff)` — questo documento |
| ↳ *branch Fase C* | autorizzazione fail-closed a permessi · trust proxy + throttling login · schema env · guardia del seed · ADR-0057 + D-063/D-064 |

---

## 1. Cosa è stato fatto

### 1a. Audit completo — 145 finding, 12 radici

Perimetro: **tutto il repo**, partizionato in 9 aree × 11 livelli (architettura, dominio/dati,
pattern, funzioni, errori, test, dipendenze, config, sicurezza, performance, documentazione).
Copertura **dichiarata**, nessun campionamento silenzioso: `apps/api` 157/157 file non-spec,
`web-staff` 105/105, gli altri frontend e i package al completo, tutte le 28 migration, tutti i 45
DTO, tutti i 25 controller, tutti i 294 `.md` (2725 link risolti meccanicamente), tutti i 199 spec.

**Il report è in [`docs/audit/`](../audit/2026-07-25-audit-completo.md)** — quello è il contenuto
vero, questo handoff ne è solo l'indice. I 9 report di partizione sono in `docs/audit/findings/`.

**La radice principale**, identificata **indipendentemente da tutte e 9 le partizioni**: non
esisteva alcun anello che trasformasse una decisione in un vincolo eseguibile. 57 ADR, un registro
del debito, e una rubrica (ADR-0002) che dice «il debito tracciato è ammesso, quello silenzioso no»
— ma nessuna CI, nessun hook, nessuno script aggregato. La sproporzione lo dice meglio di qualsiasi
analisi: **il repo ratifica per ADR la variante `danger` di un `IconButton` e non aveva mai deciso
di non avere una CI.**

### 1b. Cosa REGGE — leggilo, cambia la lettura di tutto il resto

Non è un repo in cattivo stato. È un repo con presidi progettati bene e senza automazione che li
mantenesse. Verificato contro il codice, non dedotto:

- **L'affermazione contrattuale «RLS su 22 tabelle tenant-scoped, 6 fuori» è ACCURATA**, tabella per
  tabella contro schema e 28 migration. Tutte e 22 con `USING` **e** `WITH CHECK`, espressione
  fail-closed, i 3 `NO FORCE` temporanei richiusi nella stessa migration, ruolo `NOBYPASSRLS` in dev
  **e** prod. È l'affermazione più delicata dei documenti legali e tiene.
- **Zero segreti nella storia git** (1010 commit scansionati).
- **Zero `any`/`@ts-ignore`/TODO in `apps/api/src`.** Nessun ciclo fra moduli. Zero reka-ui/echarts
  fuori da `ui-kit`. Nessuna union di dominio divergente. Zero voci orfane negli `.env.example`.
- **Parete PII della console piattaforma intatta.** Igiene di listener e timer completa.
- Il pezzo più forte della suite: `booking-overlap-constraint.e2e-spec.ts` verifica che un trigger
  scatti su `UPDATE OF bookingId` **e non scatti** sulle altre colonne.
- La spec migliore del repo: `packages/legal/src/legal.spec.ts` usa asserzioni **negative** su frasi
  vietate, ancorate ad ADR-0055. **È il modello da replicare.**

### 1c. Fase A — i due danni attivi (commit `374007e`)

**Le e2e cancellavano il DB di sviluppo su un clone pulito.** Catena verificata anello per anello:
`.env.test` non versionato → il suo caricamento era un no-op silenzioso → `ConfigModule.forRoot()`
senza `envFilePath` ricadeva su `apps/api/.env` (cwd) → `coralyn_dev` → 11 `deleteMany({})`
incondizionati → e l'unica guardia esistente **accettava esplicitamente `coralyn_dev`**.

Il fix è ancorato al **nome della risorsa**, non a un segnale d'ambiente: qualunque sia la
provenienza di `DATABASE_URL`, le e2e girano solo su un DB che contiene `coralyn_test`. Stesso
principio che `reset-dev.core.ts` applica già con `current_database()`.

**Scelta deliberata, diversa da quella proposta nel report**: la precedenza dell'ambiente sul file è
**mantenuta**, perché serve alla CI per iniettare il DB del proprio servizio Postgres. Non è più un
rischio: la guardia vale comunque.

**`RUNBOOK.local.md` (contiene un `JWT_SECRET`)** era in `.gitignore` ma non in `.dockerignore`, e
con `COPY . .` finiva in ogni immagine API. `.dockerignore` è ora **allow-list**, perché una
deny-list dimentica per costruzione i file nuovi.

### 1d. Fase B — il gate eseguibile (commit `6f618f5`)

- `pnpm run verify` = `lint → typecheck → test`. `packages/contracts` ha ora il proprio `typecheck`:
  era l'unico progetto fuori dalla verifica ricorsiva, cioè **proprio quello che definisce il
  contratto FE/BE**. Da 6 progetti su 7 a **7 su 7**.
- **CI** in `.github/workflows/verify.yml`, due job: `static` (non tocca il DB, deve restare veloce)
  e `e2e` (Postgres reale + ricrea il ruolo con `NOSUPERUSER NOBYPASSRLS`, senza il quale `FORCE ROW
  LEVEL SECURITY` non sarebbe effettivo e i test di isolamento passerebbero **per il motivo
  sbagliato**).
- **OOM di Jest chiuso**: `maxWorkers: '50%'` + `workerIdleMemoryLimit`. Da 49/50 suite a **50/50**.
- **Doppio conteggio ui-kit chiuso**: rimosso l'include da `web-staff/vitest.config.ts`.
- **Lint 73 → 0**, copertura da 494 a **603 file** inclusi i **109 `.vue` prima invisibili**.

---

## 2. Baseline verde (rimisurata dopo i fix)

| Suite | Comando | Esito |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11/11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190/190 (36 file) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23/23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 29/29 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **427/427 (60 file)** |
| api unit | `pnpm --filter @coralyn/api test` | 283 → **310/310 (52 suite)** dopo la Fase C |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 406 → **450/450 (41 suite)** dopo la Fase C |
| tutto insieme | **`pnpm run verify`** | **exit 0** |
| lint | `pnpm run lint` | **0 errori**, 66 warning, 603 file |
| typecheck | `pnpm run typecheck` | exit 0, **7 progetti** |

**Totale dopo la Fase A+B: 1369 test distinti** (non 1559: quella somma contava due volte i 190 di
ui-kit). **Dopo la Fase C: 1440.**

---

## 3. Gotcha cumulativi

### ⛔ TRE CORREZIONI ai gotcha dell'handoff precedente

1. **«Il DB è sulla 5433, non 5432» è FALSO** rispetto al repo. `docker-compose.yml` versionato mappa
   `5432:5432`, `.env.example` dice `5432`, il container espone `5432`. La 5433 vive **solo** nei
   `.env` locali gitignorati di quella macchina, scritti per un `docker-compose.override.yml` che
   **non esiste più**. → **un clone pulito funziona; è la macchina locale a essere disallineata.**
   ⚠️ Da oggi le e2e **falliscono con un messaggio chiaro** invece di ricadere in silenzio sul DB
   sbagliato. Per lanciarle su quella macchina: allinea `.env.test` a `5432`, oppure passa
   `DATABASE_URL` inline (l'ambiente vince sul file).
2. **«15 errori eslint preesistenti» non era sbagliato: era a scope parziale.**
   `eslint apps/web-staff apps/web-platform` dava esattamente 15, sui file elencati. `pnpm lint`
   dalla root ne dava 73, perché includeva `apps/api` (45) e `web-customer` (13). **Oggi sono 0.**
3. **«`pnpm --filter @coralyn/web-staff test` NON esegue ui-kit» era FALSO.** Lo eseguiva per
   configurazione esplicita, e i 190 di ui-kit erano **dentro** i 617. La §1a di quell'handoff
   correggeva un dato che era giusto. **Ora l'include è rimosso e i due numeri sono davvero
   separati** (427 + 190).

### Ambiente

- **Container Docker si auto-riavviano con Docker Desktop e RUBANO la porta 3000.** Il progetto
  compose dei container esistenti si chiama **`new`**, non `coralyn`, e le immagini sono vecchie.
  Sintomo tipico: **404 su rotte che esistono nel codice**.
- **NON lanciare `docker compose up -d db` da questa cartella**: creerebbe un progetto parallelo con
  volume vuoto. Usa `docker start coralyn-db coralyn-mailpit`.
- **L'API legge `apps/api/.env`**, non il `.env` di root (`ConfigModule` senza `envFilePath` → cwd).
- **Il Prisma CLI non legge il `.env` di root**: passa `DATABASE_URL` inline.
- **`migrate deploy` va dato su ENTRAMBI i DB** (`coralyn_dev` e `coralyn_test`).
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`: requisito).
- **Porte dev FISSE** (`strictPort`): staff 5173, platform 5174, customer 5175.
- **`RUNBOOK.local.md` e `docker-compose.override.yml` sono gitignorati e non hanno `.example`**: il
  setup locale **non è ricostruibile dal repo** (finding AUD-019, aperto).

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (per tenant) | **Coralyn** (uno solo) |
| Dove si compila | form Stabilimento → Profilo legale | **codice**, `packages/legal/src/*.content.ts` |

**`/privacy` è riservato al bagnante**: due test per app lo vietano. **Doppio artefatto**
`docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` da aggiornare **insieme** — e ⚠️ **oggi sono
divergenti**: `privacy-policy-operatori.md:68-73` ha un blocco «✅ Verificato sul codice» con **due
affermazioni false** (cita `/privacy` dove il codice usa `/legale/informativa`). Finding P4-006.

### API

- `JwtAuthGuard` + `PermissionsGuard` **globali** → ogni rotta non-staff vuole `@Public()`.
  `@Public()` scavalca **entrambi**, non l'autenticazione del canale cliente (`CustomerJwtGuard`).
- ⚠️ **AGGIORNATO in Fase C**: `RolesGuard` non esiste più. Il guard **nega in assenza di
  dichiarazione** e la dichiarazione è `@RequiresPermission(Permission.X)`
  ([ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)). Una rotta
  nuova senza decoratore dà **403**, e `authorization-coverage.spec.ts` la intercetta in CI prima.
  Il comportamento per admin/staff è invariato: `PERMISSION_ROLES` riproduce la copertura di prima.
- **Le e2e dei controller di dominio fanno login come `admin`**: il ruolo `staff` è esercitato solo
  da `authorization-staff.e2e-spec.ts`. Se stringi un permesso, **estendi quel file** o la suite
  resta verde mentre il prodotto si rompe.
- `PrismaExceptionFilter` lascia **P2025 a 500 di proposito**; **P2003 pure**, e questo produce 500
  su `DELETE /seasons/:id` (AUD-008, aperto).
- RLS via `forTenant` + policy `tenant_isolation` (**idioma da copiare verbatim**). Migration sempre
  `--create-only`, **leggile**, RLS **appesa a mano**.
- **`common/uuid.ts` è la policy** (`UUID_SHAPE`, senza vincolo RFC): **non usare `@IsUUID()`**, che
  rifiuta gli id sintetici del seed. 14 campi lo usano ancora (AUD-011, aperto).
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
- **I composable di `useCustomers.ts` prendono l'id per VALORE, quelli di `useRates` per THUNK.** Il
  thunk è il pattern corretto e documentato: il valore congela la reattività (AUD-009, aperto).

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
- **Prossimo ADR libero: 0058. Prossima deferred libera: D-065.** (0057, D-063 e D-064 presi in Fase C.)
- **Nessun merge su `main` senza ok esplicito.**

---

## 4. Metodo atteso

- Skill `dev-discipline` + `dev-communication` **sempre**; `frontend-design` sul FE; `design-docs`
  quando tocchi dominio/dati/flussi/decisioni; **`compliance-docs` per qualunque lavoro legale/GDPR**;
  **`repo-audit` se il lavoro torna a essere sistemico**.
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.**
- **Le decisioni sono dell'utente**: si raccolgono, non si assumono. Le scelte strutturali si
  **segnalano prima**. Dati societari/hosting: chiederli, mai inventarli.

### Cosa ha pagato in questa sessione, e vale la pena ripetere

- **Verificare personalmente i finding degli agenti prima di riportarli.** Su 145 finding, tre claim
  forti sono stati confermati aprendo il codice (la catena della cancellazione del DB dev, il
  doppio conteggio ui-kit, la causa dell'OOM) e **una caratterizzazione è stata corretta**: i «15
  errori lint» non erano una misura sbagliata ma una misura a scope parziale.
- **La mutazione come prova.** Il finding di test più utile non è «manca un test», è «cancella questa
  riga di produzione e la suite resta verde». Ogni finding di P6 porta la mutazione precisa.
- **Dichiarare la copertura, sempre.** Ogni agente ha elencato cosa NON ha letto. È ciò che rende il
  report utilizzabile invece che rassicurante.
- **Il negativo è informazione.** Metà del valore dell'audit sta in ciò che è stato verificato e
  trovato **sano** (RLS 22/6, zero segreti, nessun ciclo, parete PII): senza quello non si sa dove
  NON serve guardare.
- **Ancorare le guardie alla risorsa, non all'ambiente.** `NODE_ENV` lo sovrascrive un entrypoint;
  il nome del database no. Il repo aveva già il pattern giusto in `reset-dev.core.ts` e non lo aveva
  generalizzato.

---

## 5. Lavori aperti

### 5.1 Azioni dell'utente, bloccanti

1. ⚠️ **Ruotare il `JWT_SECRET`.** Il valore di `RUNBOOK.local.md` **è già nei layer di ogni immagine
   API costruita finora**. `.dockerignore` chiude il futuro, non sana il passato: le immagini
   esistenti vanno ricostruite.
2. **Mergiare (o no) i due branch.** `chore/audit-2026-07-25-fase-a-b` (4 commit) e
   `chore/audit-2026-07-25-fase-c`, che parte dal primo. Entrambi con `verify` verde.
3. **La CI non è mai stata eseguita.** Il primo push la esercita: il job `e2e` (setup del ruolo DB,
   `migrate deploy`) potrebbe aver bisogno di ritocchi. ⚠️ In Fase C `.env.test.example` ha
   guadagnato `CUSTOMER_APP_URL`, che la CI copia: senza, nessuna e2e partirebbe.
4. ~~`.env.test` locale su `:5433`~~ → **risolto in Fase C**: allineato a `:5432` (la porta che il
   container espone) e completato con `CUSTOMER_APP_URL`. Le e2e girano senza override inline.
   Resta disallineato `apps/api/.env`, che punta ancora a `:5433` per `coralyn_dev`: è il file che
   `start:dev` legge, quindi il server di sviluppo locale **non si connette** finché non lo allinei.
5. Restano i bloccanti legali pregressi: dati societari di Coralyn, scelta infrastruttura
   (hosting + email → sub-responsabili e trasferimenti extra-SEE), revisione dei 18 punti ⚖️.

### 5.2 Fasi C → H — già pianificate nel report, in ordine di dipendenza

Il piano completo con i trade-off è in
[`docs/audit/2026-07-25-audit-completo.md`](../audit/2026-07-25-audit-completo.md) §4.

**✅ Fase C — da opt-in a opt-out — ESEGUITA** *(branch `chore/audit-2026-07-25-fase-c`)*
Guard **fail-closed** con vocabolario a **permessi** ([ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md))
· `configureApp` condivisa + `trust proxy` + throttling method-scoped del login + hash civetta +
`@MaxLength(128)` · schema di validazione env (chiude anche P7-011) · guardia del seed su
`current_database()`.
⛔ L'«interim a costo zero» che questo handoff riportava **era sbagliato**: `@Roles(Role.Admin)` sui
9 controller avrebbe rotto Listino, Listino noleggi, Rinnovi e Noleggi per lo `staff` — che la
sidebar mostra a ogni ruolo — **lasciando la suite verde**, perché quei 9 file e2e fanno login solo
come `admin`. Dettaglio nel riquadro in cima al report.
Restano aperti: [D-063](../architecture/deferred.md) (permessi configurabili dall'admin, con
[brief di delega](../superpowers/specs/2026-07-25-permessi-configurabili-design.md)) e
[D-064](../architecture/deferred.md) (`team[]` nella overview, cambio di contratto FE/BE).

**Fase D — bug di correttezza** *(indipendenti, riproducibili)*
`carveInterval` puro condiviso da suspend/releaseAbsence/terminate + `CHECK (startDate <= endDate)` ·
`P2003 → 409` · thunk nei composable di `useCustomers` · redirect e logout in `web-customer` ·
`@IsUuidShape()` + lint che vieti `@IsUUID` · `pinAttempts` con `increment` · articolo archiviato
non noleggiabile · guardia «cliente anonimizzato» nei 4 write-path.

**Fase E — presidi strutturali** *(migration)*
Indici unici parziali (sospensione aperta, release attiva, rinnovo confermato) · FK su
`BookingCoverage.umbrellaId` + trigger che la rende DB-autoritativa · 3 indici compositi per le
query reali.

**Fase F — API dei moduli condivisi** *(⚠️ decisioni strutturali)*
Allargare `useActiveSeason`/`statusMaps`/`queryKeys`/`lib/dates` · `crypto.module.ts` `@Global` ·
`DataTable` generico (elimina 83 doppi cast) · etichettatura in `Field`/`Select` (32 combobox senza
nome accessibile) · `QueryBoundary`/`ErrorState` · `sideEffects` in `ui-kit` (ECharts fuori dal
bundle di una PWA mobile).

**Fase G — test**
Mirror unit delle difese di sicurezza (4-10 righe l'uno: `JwtAuthGuard`, `token.service` kind,
`CustomerSessionService`) · fixture con lo **stato concorrente** sui test che oggi non possono
fallire · fake `forTenant` che **asserisce** il tenant · test RLS parametrico derivato da
`grep CREATE POLICY` · **il test cross-tenant lato operatore** il cui scaffolding è stato rimosso
in questa sessione (P6-020).

**Fase H — documentazione**
Correggere le affermazioni false verificate (D-061 «unica memorizzazione», ⚖️-18 che cita
`/privacy`, `data-model.md` con `Package.equipment` rimosso da ADR-0036 e due entità inesistenti,
indice ADR fermo a 0051, README root fermo al 01/07, README di web-staff, guida deploy che fa
cercare un log che l'app non stampa) · igiene di `deferred.md` (73.680 caratteri, una cella da
6.000, ≥7 voci chiuse ancora in tabella) · **spostare le asserzioni verificabili dai documenti ai
test**.

### 5.3 Follow-up minori, invariati dall'handoff precedente

a11y combobox con `<label>` fratello · scorciatoie «Oggi + salti» nel `Calendar` e i 15
`<input type="date">` residui · flash-replay del rail fila · l'utente di prova disabilitato nel DB
dev (`verifica-informativa-5492@esempio.test`).

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Slice legale**: [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md) ·
  [`docs/legal/`](../legal/README.md)
- **GDPR pregresso**: [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md) ·
  [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Handoff precedente** (slice legale; ⚠️ tre gotcha corretti in §3):
  [2026-07-25 legale](2026-07-25-legale-d061-d062-package-e-lavori-aperti.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
