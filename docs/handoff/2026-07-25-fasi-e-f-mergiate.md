# Handoff 2026-07-25 (sessione 5): Fasi E ed F eseguite e MERGIATE. Restano G e H

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-25 Fase E eseguita](2026-07-25-fase-e-eseguita.md) e
> [2026-07-25 Fase D mergiata](2026-07-25-fase-d-mergiata.md), che restano validi solo dove questo
> documento non li corregge (§1c).

---

## 0. In una riga

**Fasi E ed F dell'audit sono eseguite, verificate e MERGIATE su `main`.** Nessun branch pendente.
`pnpm run verify` → exit 0. Ogni difetto è stato **riprodotto con un test rosso prima del fix**;
ogni presidio è stato **provato per mutazione** (12 su 12 rendono rossa la suite).

Restano **G** (test) e **H** (documentazione), più **[D-065](../architecture/deferred.md)** — il
package FE condiviso, **già approvato dall'utente** e delegato a questa sessione.

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste. Poi, in ordine: **§3 (i gotcha)** e **§4 (il metodo)**
di questo documento, il [report d'audit §4](../audit/2026-07-25-audit-completo.md) per il piano
ordinato per dipendenza, e `git log --format=%B -12` per il razionale — **i messaggi di commit di
questo repo sono più densi della documentazione, e questa non è una figura retorica**: contengono
le scoperte che i finding non avevano previsto.

Prima di toccare l'API: **allinea `.env` alla porta 5432** (§3 Ambiente — sono **due** file, non
uno). Il gate è `pnpm run verify` (lint + typecheck + unit); le **e2e sono un comando a parte** e
richiedono Postgres.

---

## 1. Cosa è stato fatto

### 1a. Fase E — presidi strutturali *(2 commit, chiude R-C)*

Il DB smette di ammettere tre stati che il dominio dichiara impossibili. Radice **R-3/R-C**:
«l'invariante vive nel codice applicativo perché il posto dove dichiararla una volta sola è vuoto».
Il principio era già ratificato (ADR-0037/0046: **guardia applicativa primaria, DB backstop della
race**) e applicato benissimo all'anti-overlap, e mai esteso ad altro.

| Presidio | Oggetto DB |
|---|---|
| una sola sospensione **aperta** per abbonamento | `BookingSuspension_bookingId_open_key` (`WHERE "endDate" IS NULL`) |
| una sola assenza **attiva** per (abbonamento, giorno) | `AbsenceRelease_bookingId_date_active_key` (`WHERE "canceledAt" IS NULL`) |
| un solo rinnovo **confermato** per origine | `Booking_previousBookingId_confirmed_key` |
| `umbrellaId` della coverage **DB-autoritativo** | `coverage_fill_slot_minutes()` estesa + trigger su `UPDATE OF "bookingId", "umbrellaId"` + FK verso `Umbrella` (RESTRICT) |
| range validi | CHECK `booking_range_valid`, `suspension_range_valid` |
| query reali | `Booking(establishmentId, customerId)`, `Booking(establishmentId, collectionDate)` |

**2 indici compositi, non i 3 chiesti da P9-004**: il terzo sarebbe stato ridondante con l'unico
parziale dei rinnovi (stessa colonna in testa, predicato implicato da entrambe le query).
Verificato con `EXPLAIN` su 25.000 prenotazioni sintetiche, non dedotto.

### 1b. Fase F — API dei moduli condivisi *(6 commit, chiude R-D/R-E)*

Le due decisioni strutturali sono state **esposte all'utente prima di implementare**; ha scelto per
entrambe l'opzione completa («la soluzione meno pigra, più coerente, professionale e senza debiti»).

- **`DataTable` generico** — **99** `as unknown as` azzerati (l'audit ne stimava 83: contava il solo
  web-staff). Il vincolo è `T extends object` e **non** `Record<string, unknown>`, ed è esattamente
  il motivo per cui i chiamanti castavano: i DTO di `@coralyn/contracts` sono dichiarati con
  `interface`, e un'interface non ha l'index signature implicita che `Record` richiede.
- **`QueryBoundary`/`ErrorState`** — chiude **AUD-012**. `mutationResource` aveva un toast d'errore
  di default, `queryResource` no: otto viste su dodici non consultavano mai `isError`.
- **`sideEffects` in `ui-kit`** — `web-customer` da **1008 KB a 528 KB** di asset, ECharts eliminato.
- **`CryptoModule` `@Global`** — `PasswordHasher` era ri-provveduto da **cinque** moduli.
- **`Field`/`Select`** — `aria-labelledby` per le **32** combobox senza nome accessibile (AUD-013).
- **`lib/seasons.ts`** — la regola «quale stagione vale per questa data» era in **4 copie con 2
  semantiche**: il banco noleggi usava la stagione coprente, gli editor `seasons[0]`.
- **AUD-014 / D-037** — `web-platform` ha ora la gestione globale del 401. **D-037 è chiusa.**

### 1c. Correzioni ai documenti — e cosa insegnano

Quattro documenti **vivi** affermavano fatti sul codice che il codice non implementava. Tutti e
quattro sono stati corretti nel merito, con la distinzione fra «è sempre stato vero» e «lo è
diventato adesso» — perché senza, chi legge non sa di quanto altro fidarsi nella stessa riga.

| Documento | Affermava | Realtà |
|---|---|---|
| **ADR-0046** | `umbrellaId` «mantenuto DB-autoritativo dai trigger» | ❌ **Falso da 17 giorni**: il trigger popolava solo i minuti. È P2-005 scritto dentro un ADR senza che nessuno lo leggesse come difetto. ✅ Vero da adesso |
| **ADR-0038** | «import modulari (**tree-shaking**)» | ❌ La registrazione modulare era giusta, ma senza `sideEffects` il tree-shaking **non era mai stato autorizzato**. ✅ Vero da adesso |
| **ADR-0017** | «logica e **a11y** dalla libreria» | ❌ Reka UI dà ruoli, stati e tastiera — **non il nome accessibile**, che è nostro e mancava su 32 combobox. ✅ Vero da adesso |
| handoff Fase D | «`apps/api/.env` punta a 5433» | ❌ **Incompleto**: i file su 5433 erano **due** (anche quello di root) |
| handoff Fase D | «`configureApp` condivisa da 37 delle **41** suite» | ⚠️ **37 su 42** ora. Il numeratore regge, il denominatore no |

> **La lezione che vale più dei singoli fix**: tre ADR su tre dichiaravano vero ciò che il codice
> non faceva, e **nessun test lo avrebbe reso rosso**. Non sono stati scritti in malafede: sono
> stati scritti *decidendo*, e la decisione era giusta — a non seguire è stato il codice. Dove una
> riga di documentazione afferma un fatto sul codice, la domanda giusta non è «è ancora vera?» ma
> **«cosa la renderebbe rossa se smettesse di esserlo?»**.

---

## 2. Baseline verde

| Suite | Comando | Inizio sessione | Ora |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190 | **207** |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 | **29** |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 | 35 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 428 | **436** |
| api unit | `pnpm --filter @coralyn/api test` | 330 | 330 |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 459 (41 suite) | **483 (42 suite)** |
| tutto insieme | **`pnpm run verify`** | exit 0 | **exit 0** |
| lint | `pnpm run lint` | 0 err / 67 warn | 0 err / 67 warn |
| typecheck | `pnpm run typecheck` | exit 0, 7 progetti | exit 0, 7 progetti |

**Totale: 1531 test distinti** (erano 1476, **+55**).

**Regola di verifica invariata**: dopo ogni fix questi numeri non scendono, typecheck exit 0, lint
non sale sopra 0 errori.

---

## 3. Gotcha — verificati sul codice mergiato, non ereditati

### DB e migration

- **Le tre invarianti di stato dell'abbonamento sono presidiate dal DB.** Le guardie applicative
  restano la prima linea e danno 409 leggibili: il DB non ti salva dal messaggio, ti salva dalla race.
- **Il predicato PARZIALE è load-bearing, non un'ottimizzazione.** Un unique pieno vieterebbe i
  flussi legittimi di **annulla-e-rifai**. Sostituendolo con uno pieno, **tre test diventano rossi**.
- **`BookingCoverage.umbrellaId` non è più scrivibile dal chiamante**: il trigger lo sovrascrive
  sempre col valore del `Booking` madre. Un valore sbagliato non dà errore, viene **corretto in
  silenzio** — come già accadeva per i minuti.
- ⚠️ **Sotto RLS non si può asserire il NOME dell'indice violato.** Postgres **omette il `DETAIL`**
  a chi non può vedere la riga in conflitto, e Prisma ricava `meta.target` da lì → dentro
  `forTenant` `target` è **`null`**, fuori è `["bookingId"]`. Si legge `pg_indexes`, che in cambio
  pinna anche il **predicato**.
- **`coralyn` è superuser e BYPASSRLS, `coralyn_app` no**: per un pre-flight sui dati serve
  `coralyn`, altrimenti RLS restituisce zero righe e la verifica **sembra pulita quando non lo è**.
- **Gli indici dichiarati in `schema.prisma` sono difesi dal drift detection di Prisma**; quelli
  parziali, invisibili al DSL, no → **quelli, e solo quelli, hanno bisogno di un test**.
- **`migrate deploy` va dato su ENTRAMBI i DB.** Migration sempre `--create-only`, **leggile**, RLS
  **appesa a mano** (idioma `tenant_isolation` verbatim) — ma **solo per tabelle nuove**.
- **Il carve della coverage ha UN solo posto**: `bookings/coverage.carve.ts`.
- **`P2003` è mappato a 409**; **P2025 resta a 500 di proposito**.

### Frontend

- **`DataTable` è generico su `T extends object`.** Non reintrodurre cast: passa `rows` tipizzate e
  dichiara `DataTableColumn<TuoDTO>[]`. L'unico accesso per chiave sta dentro il componente.
- ⚠️ **Vue Test Utils NON propaga i parametri di tipo di `<script setup generic>`**: dentro
  `mount()` `T` collassa sempre al vincolo. È dello **strumento**, non del componente — nei `.vue`
  l'inferenza funziona. Nello spec si tipizza sul vincolo e si restringe negli helper.
- **`QueryBoundary` decide la precedenza: errore → attesa → vuoto → contenuto.** L'errore vince
  sull'attesa perché TanStack lascia `isFetching` a true durante un retry. Dentro la finestra
  anti-flicker **non si rende nulla**.
- **Nelle viste-tabella il boundary porta SOLO l'errore**: attesa e vuoto restano di `DataTable`.
- ⚠️ **Avvolgere un elemento con un `v-if` che ha un `<template v-else>` FRATELLO rompe la
  compilazione**: il `v-if` va sul wrapper, e la condizione deve includere l'errore.
- ⚠️ **Verificare il tree-shaking cercando `zrender` NON funziona**: in `web-staff` quella stringa
  non sopravvive alla minificazione e la sua assenza sembra una rimozione. I marker che reggono
  sono `echarts`/`ECharts`/`getZr`. In `web-staff` ECharts **deve esserci**, nel chunk lazy di
  `ReportView`.
- **`sideEffects` in `packages/ui-kit/package.json`**: aggiungere un file all'elenco solo se ha un
  effetto al top level; **toglierne uno che ce l'ha lo fa sparire a runtime**, e il sintomo è una
  schermata bianca, non un errore di build.
- **`Field` pubblica l'id della propria etichetta via `provide`**, `Select` lo consuma con
  `aria-labelledby`: un `<label>` **non etichetta** un `<button role="combobox">`.
- **`lib/seasons.ts` è la regola unica** di «quale stagione vale per questa data». Non ricalcolarla.
- **`mutationResource` ha un toast d'errore di default, `queryResource` no** → per le query usa
  `QueryBoundary`.
- Contenuti dei `Modal` **teleportati**: nei test `document.querySelector`, **non** `w.get`.
- **reka-ui solo in `packages/ui-kit`**; **web-customer NON usa MSW nei test** (benché `msw` sia fra
  le sue dipendenze: serve al service worker).
- **`VITE_*` è BUILD-TIME**; **Tailwind v4 non scansiona i package** (serve `@source`).
- **Niente em dash nel testo utente** — `docs/` è FUORI da quel perimetro.

### API

- `JwtAuthGuard` + `PermissionsGuard` **globali**. `@Public()` scavalca **entrambi**.
- **Un endpoint nuovo senza `@RequiresPermission` dà 403**, e `authorization-coverage.spec.ts` lo
  intercetta in CI — così come un permesso dichiarato nell'enum e mai usato.
- **Le e2e dei controller di dominio fanno login solo come `admin`**: una stretta dei permessi
  **NON** fa fallire la suite. L'unico presidio è `authorization-staff.e2e-spec.ts`.
- **`PasswordHasher` viene da `CryptoModule` (`@Global`)**: non ri-provvederlo. Vive in
  `src/crypto/`, non più in `src/identity/`.
- **`@IsUUID` è vietato dal lint**: usa `@IsUuidShape()` (`common/is-uuid-shape.ts`).
- **`configureApp` è condivisa** da `main.ts` e da **37 delle 42** suite e2e. ⚠️ `grep -l
  createTestApp` ne conta **38**, perché `booking-overlap-constraint` lo *nomina in un commento*
  per spiegare perché non lo usa: **contare le chiamate, non le occorrenze**.
- **Una env obbligatoria nuova va aggiunta a tutti e tre gli `.env*.example`**.

### Ambiente

- **Il DB è sulla 5432**, e i file da allineare sono **DUE**: `apps/api/.env` (che legge
  `start:dev`) **e il `.env` di root**. Entrambi gitignorati. Radice: la 5433 è hardcodata in
  `reset-dev.ts:7,10`, **codice versionato** (AUD-019, aperto).
- **Container Docker si auto-riavviano e RUBANO la porta 3000.** **NON** lanciare `docker compose up
  -d db` da questa cartella: usa `docker start coralyn-db coralyn-mailpit`.
- **Il Prisma CLI non legge il `.env` di root**: passa `DATABASE_URL` inline.
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`).
- **Calendario e2e congelato al 2026-07-15** — [leggilo](2026-07-22-e2e-frozen-calendar.md) **prima**
  di scrivere e2e.
- **Le e2e rifiutano di partire** se `DATABASE_URL` non contiene `coralyn_test`. È voluto.

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (per tenant) | **Coralyn** (uno solo) |
| Dove si compila | form Stabilimento → Profilo legale | **codice**, `packages/legal/src/*.content.ts` |

**Doppio artefatto** `docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` da aggiornare **insieme**
— e ⚠️ **oggi sono divergenti** (**P4-006, aperto, Fase H**).

### Processo

- **`git log --all` copre solo i ref LOCALI. Fai `git fetch`.**
- **Prossimo ADR libero: 0058. Prossima deferred libera: D-066** (D-065 è stata aperta oggi).
- **`gh` non è installato**: per l'esito CI usa
  `https://api.github.com/repos/devfrx/coralyn/actions/runs`. La CI gira **solo su `main` e sulle
  PR**: spingere un branch non la attiva.
- **Il repository è PUBBLICO.** Ogni valore in un file versionato è leggibile da chiunque.
- **Nessun merge su `main` senza ok esplicito.**

---

## 4. Metodo atteso

### 4a. Regole di ingaggio

- **Skill `dev-discipline` + `dev-communication` sempre.** `systematic-debugging` **prima** di
  proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio, dati, flussi
  o decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- **Le decisioni strutturali sono dell'utente**, e si espongono **prima** di implementare, con
  opzioni e trade-off reali (**non un'opzione buona e due di paglia**). In Fase F le due decisioni
  sono state esposte e l'utente ha scelto: ha funzionato, ripetilo.
- **Ogni fix alla radice.** Se la radice è fuori portata, dirlo e lasciare il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Nessun merge su `main` senza ok esplicito.**

### 4b. Cosa ha pagato, e va ripetuto

- **Riprodurre prima di correggere, sempre.** In Fase E: 10 test rossi prima della migration. Due
  volte il rosso ha detto qualcosa che il finding non diceva.
- **La mutazione come prova.** Dodici mutazioni, dodici suite rosse. La più istruttiva non è stata
  cancellare un indice ma **renderlo pieno invece che parziale**: tre test rossi, cioè la prova che
  è il *predicato* a portare il peso. **Cancellare l'oggetto prova che serve; degradarlo prova che
  serve così.**
- **Misurare invece di stimare.** Il terzo indice di P9-004 era ridondante (`EXPLAIN` su 25.000
  righe); i cast erano 99 e non 83; il bundle è sceso di 480 KB misurati prima/dopo. Ogni numero di
  questo handoff è stato prodotto da un comando, non da una stima.
- **Verificare anche il verso opposto di un fix.** Su `sideEffects` il rischio non era togliere
  troppo poco ma **troppo**: la verifica che contava era che ECharts restasse in `web-staff`.
- **Pre-flight sui dati prima di una migration di vincoli.** Sette query su entrambi i DB: una
  migration che fallisce sui dati esistenti è una migration rotta, e lo si scopre in un secondo.
- **Verificare il finding, non solo eseguirlo**, e **verificare anche i gotcha che stai per
  riscrivere**: «37 delle 41» era giusto nel numeratore e sbagliato nel denominatore; il `grep -l`
  che sembrava confermarlo stava contando un **commento**.
- **Correggere il testo falso invece di annotarlo**, e **distinguere «è sempre stato vero» da «lo è
  diventato»** (§1c).

### 4c. Errori miei da non ripetere

- **Due volte** una sostituzione `sed`/`perl` su un template Vue ha mangiato codice, perché le
  parentesi in `sed` sono **letterali**: `s/(row).../` ha trasformato `periodLabel(row)` in
  `periodLabelrow` e `rowOccupancy(r).` in `rowOccupancyr.`. Il typecheck le ha prese entrambe, ma
  **su template si usa `Edit`, non regex cieche**.
- Ho letto un output di test **troncato da `tail`** e ne ho dedotto che «la maggior parte dei
  call-site inferisce»: era falso, fallivano tutti. **Guardare l'elenco completo prima di
  concludere.**

---

## 5. Lavori aperti

### 5.1 Azioni tue

1. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le
   email di tutti gli operatori anche allo staff. Separare `team[]` è un cambio di contratto FE/BE.
   ⚠️ Non è chiudibile con un decoratore: l'app-shell chiama quell'endpoint a **ogni caricamento**
   per il nome della stagione attiva, quindi restringerlo lo romperebbe.
2. Bloccanti legali pregressi: **dati societari di Coralyn**, **scelta infrastruttura** (hosting +
   email → sub-responsabili e trasferimenti extra-SEE), revisione dei **18 punti ⚖️**.
3. **Igiene branch** (§5.4): otto branch locali stantii, nessuno con lavoro unico.

### 5.2 [D-065](../architecture/deferred.md) — package FE condiviso *(approvata, da fare)*

**L'utente l'ha approvata il 2026-07-25.** `http.ts`, `toasts.ts`, `queryClient.ts`,
`useQueryResource.ts` e `onApiError.ts` esistono in **due copie identiche** in `web-staff` e
`web-platform`. La Fase F ha aggiunto la quinta **di proposito**, per non prendere una decisione
strutturale dentro un fix.

Il nodo tecnico: **`ApiError` è definito per app** in `http.ts`. Il precedente per forma e
confezionamento è **[ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)**
(`@coralyn/legal`). Serve un **ADR nuovo, 0058**.
⚠️ **Non toccare `web-customer`**: ha un data-layer **diverso** e non duplicato (refresh token
single-flight, ADR-0049) — accorparlo sarebbe una falsa fattorizzazione.

### 5.3 Fase G — test *(chiude R-I/R-J)*

Non dipende da D-065 ed è lavorabile subito.

- **Il fake `forTenant: (_t, cb) => cb(tx)` SCARTA il tenantId** in 7 spec → passare il tenant
  sbagliato è invisibile a tutti i 330 unit (**AUD-026**). Il fix è un fake che **asserisce** il tenant.
- **Mirror unit delle difese di sicurezza**: `JwtAuthGuard` (invertire una riga rende pubblica
  l'intera API e tutti gli unit restano verdi, **AUD-028**), `token.service` kind, `CustomerSessionService`.
- **Invarianti con protezione ZERO** (**AUD-024**): «invalida i token precedenti/fratelli» mai
  asserito; la revoca dell'accesso cliente mai verificata sulle **sessioni vive**.
- **La precedenza del pricing è testata su 3 coppie su 15** (**AUD-025**): scambiare settore↔pacchetto
  in `specificity()` lascia tutti i 17 test verdi e viola ADR-0032 §2.
- **RLS testata su 1 tabella su 22, in sola lettura**; il `WITH CHECK` non è mai esercitato → test
  RLS **parametrico** derivato da `grep CREATE POLICY`.
- **Il test cross-tenant lato operatore** il cui scaffolding è stato rimosso (P6-020).
- **`bookings.service.ts`: 1024 LOC, zero unit test** (**AUD-027**).

### 5.4 Fase H — documentazione *(chiude R-G)*

- Correggere le affermazioni false **già verificate**: D-061 «unica memorizzazione», ⚖️-18 che cita
  `/privacy`, **`privacy-policy-operatori.md:68-73`** (due affermazioni false nel paragrafo che un
  legale legge per l'art. 14.3(a)), `data-model.md` con due entità inesistenti, README root,
  README di web-staff, guida deploy.
- **Igiene di `deferred.md`**: 73.680 caratteri, ≥7 voci chiuse ancora in tabella.
- **Spostare le asserzioni verificabili dai documenti ai test** — vedi il riquadro in §1c.
- `reset-dev.ts:1-10` cita ancora la porta **5433** e «18 tabelle» invece di 22 (**P8-016**), ed è
  la radice per cui i `.env` locali nascono sbagliati (**AUD-019**).

### 5.5 Segnalazioni fuori scope, non fatte di proposito

- **~15 DTO usano ancora `@Matches(UUID_SHAPE, { message: '…' })`** invece di `@IsUuidShape()`.
  Applicano la policy **giusta**: convertirli cambierebbe i testi d'errore dell'API — decisione tua.
- **La funzione del trigger conserva il nome `coverage_fill_slot_minutes`** benché ora erediti anche
  `umbrellaId`. Rinominarla avrebbe reso sbagliati **cinque documenti storici** che non vanno
  riscritti, a fronte di zero cambiamenti di sostanza.
- **`Booking.extras` resta una colonna JSONB morta** dichiarata come categoria di dati in 4
  documenti legali (**P2-010**): materiale di Fase H, e tocca testo legale.
- **Nessuna paginazione in tutto lo stack** (**AUD-021**) e **il pre-check anti-overlap carica tutta
  la storia di coperture** (**AUD-020**): performance, fuori dal piano E→H.
- **`web-customer` non è stata verificata nel browser**: richiede un backend reale e un accesso
  cliente provisioned (quell'app non usa MSW).

### 5.6 Igiene del workspace

Otto branch locali, **nessuno con lavoro unico**: `chore/audit-2026-07-25-fase-a-b`, `-fase-c`,
`-fase-d`, `-fase-e`, `-fase-f` sono tutti contenuti in `main`; gli altri tre sono duplicati
pre-rebase (verificato per oggetto nelle sessioni precedenti).

```bash
git branch -D chore/audit-2026-07-25-fase-a-b chore/audit-2026-07-25-fase-c chore/audit-2026-07-25-fase-d chore/audit-2026-07-25-fase-e chore/audit-2026-07-25-fase-f backup/main-pre-reconcile-20260725 docs/handoff-5-6a-ricostruito feat/legal-d061-d062
```

Cancellare branch è una scelta dell'utente, non un effetto collaterale di una sessione di fix.

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md)
  · [ADR-0037](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md) ·
  [data-model.md](../design/data-model.md)
- **Frontend**: [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) ·
  [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) ·
  [ADR-0038](../architecture/decisions/0038-libreria-grafici-echarts.md)
- **Package condiviso (precedente)**: [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedenti**: [Fase E](2026-07-25-fase-e-eseguita.md) · [Fase D](2026-07-25-fase-d-mergiata.md)
