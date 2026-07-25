# Handoff 2026-07-25 (sessione 5): Fase E eseguita, in attesa delle decisioni di Fase F

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-25 Fase D mergiata](2026-07-25-fase-d-mergiata.md), che resta valido tranne dove questo
> documento lo corregge (§1b e §3).

---

## 0. In una riga

**Fase E dell'audit è eseguita e verificata**, su branch `chore/audit-2026-07-25-fase-e`
(**1 commit, NON mergiato**: manca il tuo ok). `pnpm run verify` → exit 0, e2e 459 → **483**.
Ogni difetto è stato **riprodotto con un test rosso prima del fix**; ogni presidio è stato
**provato per mutazione**, 8 su 8.

Restano aperte le fasi **F → H** e le decisioni di §5.1. **La Fase F è il punto in cui ci si ferma
per decidere**: §5.2 mette le opzioni sul tavolo.

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste. Poi, in ordine: questo documento (§3 i gotcha, §4 il
metodo), il [report d'audit §4](../audit/2026-07-25-audit-completo.md) per il piano ordinato per
dipendenza, e `git log --format=%B -3` per il razionale — i messaggi di commit di questo repo sono
più densi della documentazione.

Prima di toccare l'API: **allinea `.env` alla porta 5432** (§3, Ambiente — sono **due** file, non
uno). Il gate è `pnpm run verify` (lint + typecheck + unit); le **e2e sono un comando a parte** e
richiedono Postgres.

---

## 1. Cosa è stato fatto

Un commit, `2300389`. Il razionale completo è nel messaggio (`git log --format=%B -1`); qui solo
ciò che cambia il modo di lavorare sul repo.

| Presidio | Oggetto DB | Finding |
|---|---|---|
| una sola sospensione **aperta** per abbonamento | `BookingSuspension_bookingId_open_key` (`WHERE "endDate" IS NULL`) | P2-007 |
| una sola assenza **attiva** per (abbonamento, giorno) | `AbsenceRelease_bookingId_date_active_key` (`WHERE "canceledAt" IS NULL`) | P2-007 |
| un solo rinnovo **confermato** per origine | `Booking_previousBookingId_confirmed_key` (`WHERE … IS NOT NULL AND status = 'confirmed'`) | P2-007 |
| `umbrellaId` della coverage DB-autoritativo | `coverage_fill_slot_minutes()` estesa + trigger ricreato su `UPDATE OF "bookingId", "umbrellaId"` + FK verso `Umbrella` (RESTRICT) | P2-005 |
| range validi | CHECK `booking_range_valid`, `suspension_range_valid` | §5.3 di Fase D |
| query reali | `Booking(establishmentId, customerId)`, `Booking(establishmentId, collectionDate)` | P9-004 |

### 1a. Tre cose scoperte eseguendo, che i finding non dicevano

1. **ADR-0046 dichiarava `umbrellaId` «mantenuto DB-autoritativo dai trigger» dall'origine, e non
   lo era.** Il trigger popolava **solo** i minuti. Il documento correva avanti al codice da 17
   giorni — è il finding P2-005 scritto dentro un ADR, senza che nessuno lo leggesse come difetto.
   L'ADR è stato allineato **segnalando che la riga è diventata vera adesso**, non che lo è sempre
   stata (stessa distinzione di D-037 in Fase D).
2. **Due test esistenti erano costruiti su premesse che i nuovi vincoli invalidano.** Quello di
   `coverage_range_valid` scriveva un `Booking` invertito per colpire il CHECK sulla *coverage*: con
   `booking_range_valid` sarebbe fallito prima, e il regex (`23514`) lo avrebbe lasciato **passare
   per il constraint sbagliato**. Quello del trigger su `UPDATE OF bookingId` ora collide davvero
   con `coverage_no_overlap` — prima passava **solo perché la chiave di partizionamento restava
   stantia**, cioè l'occupazione fantasma in persona. Diviso in due test, uno per comportamento.
3. **Il terzo indice composito chiesto da P9-004 sarebbe stato ridondante.** L'indice unico parziale
   dei rinnovi ha `previousBookingId` in testa e un predicato implicato da entrambe le query, che
   filtrano `status='confirmed'`. Verificato con `EXPLAIN` su 25.000 prenotazioni sintetiche (in
   transazione, poi `ROLLBACK`), non dedotto: **2 indici, non 3**, e il perché è nella migration.

### 1b. Correzioni ai documenti precedenti

| Affermazione ereditata | Esito |
|---|---|
| «`configureApp` è condivisa da **37 delle 41** suite e2e» | ⚠️ **37 su 42** ora. Il 37 non cambia (la suite nuova fa bootstrap manuale), il denominatore sì. ⛔ Attenzione: `grep -l createTestApp` ne conta **38** perché `booking-overlap-constraint` *nomina* `createTestApp()` in un commento per spiegare perché non lo usa — contare le chiamate, non le occorrenze |
| «**`apps/api/.env`** punta ancora a 5433» | ❌ **Incompleto: i file sono due.** Anche il **`.env` di root** era su 5433. Entrambi allineati a 5432 in questa sessione (sono gitignorati). La radice è in `reset-dev.ts:7,10`, dove la 5433 è **hardcodata nel codice versionato** (AUD-019, aperto) |
| ADR-0046: «`umbrellaId` … mantenuto DB-autoritativo» | ❌ Era **falso quando è stato scritto**. ✅ **Vero da adesso** — vedi §1a.1 |

---

## 2. Baseline verde — nuovi numeri

| Suite | Comando | Prima | Ora |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 190 | 190 |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 | 23 |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 | 35 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 428 | 428 |
| api unit | `pnpm --filter @coralyn/api test` | 330 | 330 |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 459 (41 suite) | **483 (42 suite)** |
| tutto insieme | **`pnpm run verify`** | exit 0 | **exit 0** |
| lint | `pnpm run lint` | 0 err / 67 warn | 0 err / **67 warn** |
| typecheck | `pnpm run typecheck` | exit 0, 7 progetti | exit 0, 7 progetti |

**Totale: 1500 test distinti** (erano 1476, **+24**). Zero regressioni: nessuna suite esistente è
stata toccata dai nuovi vincoli, tranne i due test di §1a.2 che sono stati **corretti nel merito**.

**Regola di verifica invariata**: dopo ogni fix questi numeri non scendono, typecheck exit 0, lint
non sale sopra 0 errori.

---

## 3. Gotcha — sostituisce la lista dell'handoff di Fase D

### Nuovi, dalla Fase E

- **Le tre invarianti di stato dell'abbonamento sono ora presidiate dal DB.** Le guardie applicative
  restano la prima linea e continuano a dare 409 leggibili: se ne aggiungi una, il DB non ti salva
  dal messaggio, ti salva dalla race.
- **Il predicato PARZIALE è load-bearing, non un'ottimizzazione.** Un unique pieno vieterebbe i
  flussi legittimi di **annulla-e-rifai** (ri-sospendere dopo una riattivazione, ri-registrare
  un'assenza annullata, ri-rinnovare dopo un annullo). Metà dei test di
  `subscription-invariants-constraint.e2e-spec.ts` asserisce proprio quel negativo, ed è la metà che
  conta: sostituendo l'indice parziale con uno pieno **tre test diventano rossi**.
- **`BookingCoverage.umbrellaId` non è più scrivibile dal chiamante**: il trigger lo sovrascrive
  SEMPRE con quello del `Booking` madre, in INSERT e in `UPDATE OF "bookingId", "umbrellaId"`. Un
  valore sbagliato non dà errore, viene **corretto in silenzio** — come già accadeva per i minuti.
- ⚠️ **Sotto RLS non si può asserire il NOME dell'indice violato.** Postgres **omette il `DETAIL`**
  della violazione a un utente che non può vedere la riga in conflitto, e Prisma ricava `meta.target`
  proprio da lì → dentro `forTenant` `target` è **`null`**, fuori è `["bookingId"]`. Per pinnare un
  indice raw si legge `pg_indexes` (che pinna anche il **predicato**, cosa che il nome non farebbe).
- **`prisma migrate dev --create-only` genera correttamente FK e `@@index` compositi**: a mano vanno
  aggiunti solo indici parziali, CHECK e trigger. Nessuna nuova tabella ⇒ **nessuna policy RLS da
  appendere** questa volta (l'idioma `tenant_isolation` serve solo alle tabelle nuove).
- **Gli indici dichiarati in `schema.prisma` sono difesi dal drift detection di Prisma**; quelli
  parziali, invisibili al DSL, no → **quelli, e solo quelli, hanno bisogno di un test**.

### Dalla Fase D — invariati

- **Il carve della coverage ha UN solo posto**: `apps/api/src/bookings/coverage.carve.ts`. Non
  riscrivere testa e coda a mano: è già successo quattro volte, e la quarta copia ha prodotto un 500.
- **`carveInterval` decide rispetto al FRAMMENTO, mai allo span di contratto.**
- **`P2003` è mappato a 409**, non più a 500. **P2025 resta a 500 di proposito.**
- **`@IsUUID` è vietato dal lint**; il decoratore giusto è `@IsUuidShape()` in `common/is-uuid-shape.ts`.
- **Gli id sintetici dei seed vengono da `prisma/dev-ids.ts`**, importato da entrambi gli script.
- **I composable di `useCustomers.ts` prendono gli id per THUNK.** `RouterView` non ha `:key`.
- **`web-customer` ha due uscite distinte**: `logout()` e `clearSession()`; a portare via l'utente
  pensa `CustomerShell` osservando `authenticated`.
- **`customers/active-customer.ts` è la definizione di «cliente attivo»**; **`getById` NON filtra i
  clienti anonimizzati, ed è voluto**.

### Dalla Fase C — invariati

- **Le e2e dei controller di dominio fanno login come `admin`.** **Una stretta involontaria dei
  permessi non fa fallire la suite.** L'unico presidio è `authorization-staff.e2e-spec.ts`.
- **Un endpoint nuovo senza `@RequiresPermission` dà 403**, e `authorization-coverage.spec.ts` lo
  intercetta in CI. Lo stesso test fallisce anche per un permesso **mai usato**.
- **Throttler**: `@Throttle({ default: {...} })` per-rotta; una seconda definizione *nominata*
  verrebbe valutata su **tutte** le rotte throttled.
- **`configureApp` è condivisa** da `main.ts` e da **37 delle 42** suite e2e (§1b). Le cinque a
  bootstrap manuale — `booking-overlap-constraint`, `prisma.service`, `rate-fk-restrict`,
  `reset-dev`, `subscription-invariants-constraint` — sono suite **DB-level** che non fanno
  richieste HTTP, quindi prefix e ValidationPipe non servirebbero a nulla.
- **Una env obbligatoria nuova va aggiunta a tutti e tre gli example**, altrimenti CI e e2e non partono.
- **Il seed rifiuta un database che non si chiami `coralyn_dev`/`coralyn_test`** (prefisso).
- **Il repository è PUBBLICO.** Ogni valore in un file versionato è leggibile da chiunque.

### Ambiente

- **Il DB è sulla 5432**, e i file da allineare sono **DUE**: `apps/api/.env` (che legge
  `start:dev`) **e il `.env` di root**. Entrambi gitignorati, entrambi erano su 5433 (§1b). Radice:
  la 5433 è hardcodata in `reset-dev.ts:7,10`, **codice versionato** (AUD-019, aperto).
- **Container Docker si auto-riavviano e RUBANO la porta 3000.** Il progetto compose si chiama `new`.
- **NON lanciare `docker compose up -d db` da questa cartella**: userebbe un volume vuoto. Usa
  `docker start coralyn-db coralyn-mailpit`.
- **Il Prisma CLI non legge il `.env` di root**: passa `DATABASE_URL` inline. **`migrate deploy` va
  dato su ENTRAMBI i DB.** Migration sempre `--create-only`, **leggile**.
- **`coralyn` è superuser e BYPASSRLS, `coralyn_app` no**: per un'ispezione a tappeto dei dati
  (es. il pre-flight di una migration) serve `coralyn`, altrimenti RLS restituisce zero righe e la
  verifica sembra pulita quando non lo è.
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima del typecheck.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`).
- **Porte dev FISSE** (`strictPort`): staff 5173, platform 5174, customer 5175.

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (per tenant) | **Coralyn** (uno solo) |
| Dove si compila | form Stabilimento → Profilo legale | **codice**, `packages/legal/src/*.content.ts` |

**`/privacy` è riservato al bagnante**: `legal-routes.spec.ts` lo vieta in entrambe le app staff.
**Doppio artefatto** `docs/legal/*.md` ↔ `packages/legal/src/*.content.ts` da aggiornare **insieme**
— e ⚠️ **oggi sono divergenti** (**P4-006, aperto, Fase H**): il blocco «✅ Verificato sul codice»
in `privacy-policy-operatori.md:68-73` afferma che l'email credenziali rinvia a `/privacy` e che
«la rotta `/privacy` è pubblica in web-staff e web-platform». **Entrambe false.**

### API — invariati

- `JwtAuthGuard` + `PermissionsGuard` **globali**. `@Public()` scavalca **entrambi**; il canale
  cliente ha la propria autenticazione (`CustomerJwtGuard`).
- RLS via `forTenant` + policy `tenant_isolation` (**idioma da copiare verbatim** per tabelle nuove).
- Il login staff restituisce **`accessToken`**; `POST /customer/activate` vuole **`enrollmentToken`** + `pin`.

### Frontend — invariati

- **`VITE_*` è BUILD-TIME**: in produzione va passata come **build arg**.
- **Tailwind v4 non scansiona i package**: serve `@source` in `main.css` di ogni app consumatrice.
- **`mutationResource` ha un toast d'errore di default, `queryResource` no** → la maggior parte delle
  viste rende un guasto come «vuoto» invece che come errore (AUD-012, **aperto, Fase F**).
- Contenuti dei `Modal` **teleportati**: nei test `document.querySelector`, **non** `w.get`.
- **reka-ui solo in `packages/ui-kit`**; **web-customer NON usa MSW nei test** (benché `msw` sia fra
  le sue dipendenze: serve al service worker).
- **Niente em dash nel testo utente** — `docs/` è FUORI da quel perimetro.
- **`SidebarNav.vue` mostra `operativeNav` a OGNI ruolo.**

### Test — invariati

- **`packages/ui-kit` ha il proprio `vitest.config.ts`**: non re-includerlo in web-staff.
- **Le e2e rifiutano di partire** se `DATABASE_URL` non contiene `coralyn_test`. È voluto.
- **Calendario e2e congelato al 2026-07-15** — leggilo **prima** di scrivere e2e.
- **Il fake `forTenant: (_t, cb) => cb(tx)` SCARTA il tenantId** (AUD-026, aperto, Fase G).

### Processo

- **`git log --all` copre solo i ref LOCALI. Fai `git fetch`.**
- **Prossimo ADR libero: 0058. Prossima deferred libera: D-065.**
- **`gh` non è installato**: per l'esito CI usa `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **Nessun merge su `main` senza ok esplicito.**

---

## 4. Metodo atteso

### 4a. Regole di ingaggio

- **Skill `dev-discipline` + `dev-communication` sempre.** `systematic-debugging` **prima** di
  proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio, dati, flussi
  o decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- **Le decisioni strutturali sono dell'utente**, e si espongono **prima** di implementare, con
  opzioni e trade-off reali (non un'opzione buona e due di paglia).
- **Ogni fix alla radice.** Se la radice è fuori portata, dirlo e lasciare il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Nessun merge su `main` senza ok esplicito.**

### 4b. Cosa ha pagato, e va ripetuto

- **Riprodurre prima di correggere, sempre.** In Fase E: 10 test rossi prima della migration. Due
  volte il rosso ha detto qualcosa che il finding non diceva (§1a.2).
- **La mutazione come prova.** Otto mutazioni, otto suite rosse. La più istruttiva non è stata
  cancellare un indice ma **renderlo pieno invece che parziale**: tre test rossi, cioè la prova che
  il *predicato* è la parte che porta il peso. Cancellare l'oggetto prova che serve; degradarlo
  prova che serve **così**.
- **Pre-flight sui dati prima di una migration di vincoli.** Sette query su entrambi i DB (come
  `coralyn`, non `coralyn_app` — vedi §3 Ambiente) prima di scrivere una riga: una migration che
  fallisce sui dati esistenti è una migration rotta, e lo si scopre in un secondo.
- **Verificare il finding, non solo eseguirlo.** P9-004 chiedeva 3 indici; uno era ridondante, e la
  differenza fra saperlo e supporlo è un `EXPLAIN`.
- **Verificare anche i gotcha che stai per riscrivere.** «37 delle 41» era giusto nel numeratore e
  ora sbagliato nel denominatore; «`apps/api/.env` è su 5433» era **incompleto** (i file sono due).
  Il `grep -l` che sembra confermare un conteggio può star contando un **commento** (§1b).
- **Correggere il testo falso invece di annotarlo**, e **distinguere «è sempre stato vero» da «lo è
  diventato»**: ADR-0046 ha ricevuto entrambi i trattamenti.

---

## 5. Lavori aperti

### 5.1 Azioni tue

1. **Mergiare (o no) la Fase E**: branch `chore/audit-2026-07-25-fase-e`, 1 commit, CI non ancora
   girata sul branch.
2. **Decidere le opzioni di Fase F** — §5.2.
3. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le
   email di tutti gli operatori anche allo staff. Separare `team[]` è un cambio di contratto FE/BE.
4. Bloccanti legali pregressi: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei 18 punti ⚖️.

### 5.2 Fase F — le decisioni da prendere *(chiude R-D/R-E)*

Tre sono strutturali e si fermano qui; il resto è additivo e si può fare senza chiedere.

**a. `DataTable` generico** — oggi non è generico e il conto sono **83 `as unknown as`**, che sono
`@ts-ignore` travestiti che nessuna regola intercetta. Renderlo generico tocca **tutti e 10 i
consumatori** in due app: è un breaking change su un componente condiviso.

**b. `QueryBoundary` / `ErrorState`** — è una decisione di **direzione UI**, non solo tecnica:
`queryResource` non ha toast d'errore, quindi oggi **9 viste su 12 rendono un guasto come «vuoto»**
(AUD-012). Introdurre uno stato d'errore cambia ciò che l'operatore vede quando la rete cade — oggi
una spiaggia vuota, domani un errore con «Riprova».

**c. `sideEffects` in `ui-kit`** — sblocca il tree-shaking e toglie **~130 KB gzip di ECharts** dal
bundle di `web-customer`, che è una PWA mobile con 3 viste. È una modifica di **build**: dichiarare
puro un modulo che puro non è lo fa sparire a runtime, e il fallimento non è un errore di
compilazione ma una schermata bianca.

Additivi, nessuna decisione necessaria: allargare `useActiveSeason` (dietro cui c'è un **bug reale**:
il banco noleggi applica le tariffe di una stagione mentre l'editor ne modifica un'altra),
`statusMaps`, `queryKeys`, `lib/dates`; `crypto.module.ts` `@Global` (4 moduli ri-provvedono
`PasswordHasher`, uno citando un ciclo **inesistente**); etichettatura in `Field`/`Select`
(**32 combobox senza nome accessibile**, WCAG 4.1.2); **AUD-014 / [D-037](../architecture/deferred.md)
riaperta** — `web-platform` senza gestione globale del 401, fix meccanico (copiare
`web-staff/src/lib/onApiError.ts` e agganciarlo in `queryClient.ts`).

### 5.3 Fasi G → H

**Fase G — test.** Mirror unit delle difese di sicurezza (`JwtAuthGuard`, `token.service` kind,
`CustomerSessionService`) · fixture con lo **stato concorrente** sui test che oggi non possono
fallire · fake `forTenant` che **asserisce** il tenant · test RLS parametrico derivato da
`grep CREATE POLICY` · **il test cross-tenant lato operatore** il cui scaffolding è stato rimosso
(P6-020). **Non dipende dalle decisioni di Fase F**: è lavorabile in parallelo.

**Fase H — documentazione.** Correggere le affermazioni false verificate (D-061 «unica
memorizzazione», ⚖️-18 che cita `/privacy`, `privacy-policy-operatori.md:68-73`, `data-model.md` con
due entità inesistenti, README root, README di web-staff, guida deploy) · igiene di `deferred.md`
(73.680 caratteri, ≥7 voci chiuse ancora in tabella) · **spostare le asserzioni verificabili dai
documenti ai test**.

> Quest'ultimo punto ha guadagnato un esempio in Fase E: ADR-0046 affermava da 17 giorni un fatto sul
> codice che il codice non implementava, e **nessun test lo avrebbe reso rosso**. Dove una riga di
> documentazione afferma un fatto sul codice, la domanda giusta non è «è ancora vera?» ma «cosa la
> renderebbe rossa se smettesse di esserlo?».

### 5.4 Segnalazioni fuori scope, non fatte di proposito

- **~15 DTO usano ancora `@Matches(UUID_SHAPE, { message: '…' })`** invece di `@IsUuidShape()`.
  Applicano la policy **giusta**: convertirli cambierebbe i testi d'errore dell'API — decisione tua.
- **La funzione del trigger conserva il nome `coverage_fill_slot_minutes`** benché ora erediti anche
  `umbrellaId`. Rinominarla avrebbe reso sbagliati **cinque documenti storici** (piani e spec del
  2026-07-08) che non vanno riscritti, a fronte di zero cambiamenti di sostanza. Il contratto
  allargato è documentato in ADR-0046 e `data-model.md`.
- **`Booking.extras` resta una colonna JSONB morta** dichiarata come categoria di dati in 4 documenti
  legali (P2-010): è materiale di Fase H, e tocca testo legale.
- **La 5433 hardcodata in `reset-dev.ts:7,10`** è la radice per cui i `.env` locali nascono
  sbagliati (AUD-019). Non toccata: sta in Fase H con il resto di P8/P7.

### 5.5 Igiene del workspace

Sette branch locali stantii, **nessuno con lavoro unico** (verificato per oggetto nella sessione
precedente); a questi si aggiunge ora `chore/audit-2026-07-25-fase-e`, che invece **contiene la Fase
E e non va cancellato** finché non è mergiato.

```bash
git branch -D chore/audit-2026-07-25-fase-a-b chore/audit-2026-07-25-fase-c chore/audit-2026-07-25-fase-d backup/main-pre-reconcile-20260725 docs/handoff-5-6a-ricostruito feat/legal-d061-d062
```

Cancellare branch è una scelta tua, non un effetto collaterale di una sessione di fix.

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline al 62eb63f](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md)
  · [ADR-0037](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md) ·
  [ADR-0048](../architecture/decisions/0048-assenze-comunicate-release-occupazione.md) ·
  [data-model.md](../design/data-model.md)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Handoff precedente**: [2026-07-25 Fase D mergiata](2026-07-25-fase-d-mergiata.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
