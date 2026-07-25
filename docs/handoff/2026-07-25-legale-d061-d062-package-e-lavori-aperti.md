# Handoff 2026-07-25: slice legale D-061/D-062 + package `@coralyn/legal` + lavori aperti

> **Punto d'ingresso unico.** Stato, baseline verde misurata, gotcha cumulativi (sostituiscono la
> rilettura degli handoff precedenti), metodo atteso e lavori aperti.

> **Stato aggiornato il 2026-07-25 (sessione successiva).** I due branch descritti qui sotto sono
> stati **mergiati su `main` e pushati** con ok esplicito dell'utente, e la ricostruzione
> dell'handoff 5.6a è stata **scartata** — vedi §1a, che è stata riscritta.

Al momento della scrittura di questo documento: `main = 24c41ba = origin/main`, e tutto il lavoro
viveva su **due branch non mergiati**:

| Branch | Commit | Contenuto | Esito |
|---|---|---|---|
| `docs/handoff-5-6a-ricostruito` | 2 | handoff 5.6a ricostruito + riga `.gitignore` per `RUNBOOK.local.md` | ricostruzione **scartata**, riga `.gitignore` mergiata |
| `feat/legal-d061-d062` | 8 | documenti legali + package `@coralyn/legal` + ADR-0056 + fix deploy | **mergiato** (rebase + FF) |

---

## 1. Cosa è stato fatto

### 1a. L'handoff 5.6a NON era mancante — correzione

> **Questa sezione è stata riscritta il 2026-07-25.** Il testo originale affermava che l'handoff
> della sessione 5.6a «non era mai stato scritto» e ne documentava la ricostruzione. **L'affermazione
> era falsa**, e vale la pena conservare il perché: è una lezione sul confine tra una verifica
> corretta e una conclusione sbagliata.

La verifica eseguita allora — `git log --all --diff-filter=A` più un controllo degli stash — era
**corretta**, e correttamente non trovava nulla. Ma rispondeva a «esiste in *questo clone*?», non a
«esiste?». L'handoff **era stato scritto**, dall'utente, il **2026-07-24 alle 20:01** — commit
**`74d277b`**, `docs(handoff): 2026-07-24 (3a) privacy 5.6a mergiata + lavori aperti` — e viveva su
un altro clone, non ancora pushato. È comparso su `origin/main` mentre questa slice era in corso, e
ha fatto **respingere il push**.

**Lezione riutilizzabile:** `--all` copre i ref *locali*. Prima di dichiarare che qualcosa non
esiste, `git fetch` — l'assenza da un clone non è assenza.

**Riconciliazione** (decisione dell'utente): l'originale `74d277b` **vince** e resta al suo path; il
commit di ricostruzione è stato **eliminato** ribasando `main` su `origin/main`. La riga `.gitignore`
per `RUNBOOK.local.md`, che stava sullo stesso branch, è stata mantenuta. Il link in §7 punta allo
stesso filename e continua a risolvere, su un documento migliore.

**Cosa il documento vero contiene e la ricostruzione no:** una §5.1 «Residui diretti di 5.6a» con i
**«3 follow-up dalla review Opus»** che la ricostruzione aveva dichiarato irrecuperabili (li credeva
persi in `.superpowers/`, gitignorato). Sono recuperati e riportati in §5 qui sotto.

**Cosa la ricostruzione aveva di suo**, e che non si perde perché è già nella tabella di §2: la
baseline dell'originale scrive «web-staff (incl. ui-kit) 608», ma
`pnpm --filter @coralyn/web-staff test` **non** esegue ui-kit, che è una suite a sé (190). I due
numeri vanno letti separati.

### 1b. Documenti legali D-061/D-062 (`docs/legal/`)

Quattro documenti + indice: [privacy policy operatori](../legal/privacy-policy-operatori.md),
[imprint](../legal/imprint.md), [DPA art. 28](../legal/dpa-coralyn-lido.md),
[registro art. 30](../legal/registro-trattamenti.md).

**Passati da tre review su Opus** (normativa, tecnica avversariale, re-review). Le review hanno
trovato **8 bloccanti + ~17 rischi**, tutti chiusi. Nessun dato societario inventato: sono
`[COMPILARE]` espliciti. **18 punti ⚖️** con identificatori stabili per il legale.

Rilievi che vale la pena conoscere, perché sono lezioni riutilizzabili:

- **RLS non è «su tutte le tabelle di dominio»**: è su **22 tabelle tenant-scoped**, e **6 restano
  fuori** (`User`, `Establishment`, `CredentialSetupToken`, `PlatformAuditLog`,
  `CustomerEnrollmentToken`, `CustomerSession`). Per quelle 6 l'isolamento è **applicativo**, non di
  database. Il DPA prometteva che un solo difetto applicativo non basta a esporre dati altrui: vero
  per 22, **falso per 6**.
- **`PlatformAuditLog` non è PII-free**: persiste l'email dell'admin del lido.
- **Tutte e tre le app sono PWA con precaching Workbox**: la Cache Storage è una **seconda**
  memorizzazione sul dispositivo oltre a `localStorage`. Non cambia la conclusione «niente banner»
  (asset propri = strettamente necessari), ma «unica memorizzazione» era falso e verificabile.
- **Provv. Garante n. 284 del 17/04/2026 sui tracking pixel nelle email** (GU n. 98 del 29/04/2026,
  adeguamento entro ~29/10/2026): **non si applica oggi** perché il template è testo + link, e c'è
  un test che vieta `<img>`. Ma `deploy/.env.prod.example` propone Resend, e questi provider
  attivano spesso l'open-tracking **di default**: da spegnere al deploy.

### 1c. Package `@coralyn/legal` + pubblicazione (ADR-0056)

Nuovo package `packages/legal` con contenuti versionati e componenti, consumato da `web-staff` e
`web-platform`. **Motivo**: il contenuto del piano B è identico per le due app, quindi duplicarlo
venderebbe la possibilità di una divergenza silenziosa tra due documenti legali.

Rotte **`/legale/informativa`** e **`/legale/note`**, pubbliche di proposito (art. 7 D.Lgs. 70/2003
«diretta e permanente»; art. 14.3(a) GDPR verso chi non ha ancora un account). Link nel piè di pagina
del login. Rinvio all'informativa **nell'email di invito e di reset** → **⚖️-18 chiuso**.

### 1d. Il difetto introdotto e corretto (leggilo: è il pezzo più istruttivo)

Le rotte operatori erano inizialmente su **`/privacy`**, lo stesso path dell'informativa al bagnante
di `web-customer`. Insieme al fallback a **percorso relativo** di `privacyPreviewUrl` (attivo quando
`VITE_WEB_CUSTOMER_URL` manca), l'operatore che apriva «anteprima informativa» restava sull'origin di
`web-staff` e vedeva **la policy operatori al posto dell'informativa del cliente**, con `?e=`
ignorato e **nessun errore**. Prima della rotta quel link falliva in modo visibile: **la rotta ha
trasformato un errore rumoroso in uno silenzioso.** L'ha scoperto l'utente, non i test.

Tre rimedi, **nessuno sufficiente da solo**:

1. **Path distinti** sotto `/legale/`, con test per app che **vietano la ricomparsa di `/privacy`**.
2. **Fallback relativo eliminato**: senza la env, `privacyPreviewUrl` torna stringa vuota e il
   promemoria resta **testo senza link**.
3. **`strictPort`** nei tre `vite.config.ts` (5173/5174/5175): senza, Vite scivolava sulla prima
   porta libera, quindi era **l'ordine di avvio** a decidere quale app stesse dove.

### 1e. Buco di produzione chiuso

`VITE_WEB_CUSTOMER_URL` è **build-time** (Vite la inlinea nel bundle): il Dockerfile di `web-staff`
non aveva `ARG` e il compose di produzione non passava build args → **il link non sarebbe mai
comparso in produzione**, e impostarla come env di runtime non avrebbe fatto nulla. Aggiunti `ARG` +
build arg che riusa `CUSTOMER_APP_URL` da `.env.prod` (una sola fonte per l'origin dell'app clienti).

## 2. Baseline verde (misurata il 2026-07-25 su `feat/legal-d061-d062`, una suite alla volta)

| Suite | Esito |
|---|---|
| `@coralyn/legal` | **11 / 11** (1 file) |
| ui-kit | **190 / 190** (36 file) |
| web-staff | **617 / 617** (96 file) |
| web-platform | **23 / 23** (7 file) |
| web-customer | **29 / 29** (6 file) |
| api unit | **283 / 283** (50 suite) |
| api e2e | **406 / 406** (39 suite) |
| `pnpm -r typecheck` | **exit 0** (6 progetti) |

**eslint**: pulito sui file toccati. Restano **15 errori preesistenti** in file non toccati
(`apps/web-staff/src/mocks/server.ts`, alcuni spec di `web-platform`, `LegalProfileModal.spec.ts`) e
**4 link rotti** in ADR preesistenti (0016, 0023, 0030, 0043). Segnalati, non corretti di straforo.

## 3. Gotcha che costano ore (cumulativi)

### Ambiente — i più insidiosi

- **I container Docker si auto-riavviano con Docker Desktop e RUBANO la porta 3000.** Il progetto
  compose dei container esistenti si chiama **`new`** (volume `new_coralyn-pgdata`), non `coralyn`, e
  **le immagini sono vecchie** (`new-api` buildata il 2026-07-07: non conosce canale cliente, D-051,
  noleggi, 5.6a). Sintomo tipico: **404 su rotte che esistono nel codice**. Ferma i container
  applicativi prima di lavorare: `docker stop coralyn-api coralyn-web coralyn-web-platform`.
- **NON lanciare `docker compose up -d db` da questa cartella**: creerebbe un progetto `coralyn`
  parallelo con volume **vuoto**. Usa `docker start coralyn-db coralyn-mailpit`.
- **Il DB è sulla 5433**, non 5432 (viene da un `docker-compose.override.yml` gitignorato e assente).
- **File locali gitignorati e assenti dopo un clone**: `node_modules/`, `.env`, `.env.test`,
  `apps/api/.env`, `apps/web-staff/.env`, `docker-compose.override.yml`, `.superpowers/`.
  **Tutti i comandi di bootstrap sono in [`RUNBOOK.local.md`](../../RUNBOOK.local.md)** (gitignorato,
  scritto in questa sessione, con credenziali dev verificate e flusso token cliente end-to-end).
- **L'API legge `apps/api/.env`**, non il `.env` della root (`ConfigModule` senza `envFilePath` →
  cwd del processo, che con `pnpm --filter` è la cartella del package). Tienili allineati.
- **Il Prisma CLI non legge il `.env` di root**: passa `DATABASE_URL` inline.
- **`migrate deploy` va dato su ENTRAMBI i DB** (`coralyn_dev` e `coralyn_test`), o le e2e falliscono.
- **`corepack pnpm ...` può cancellare il client Prisma** → `prisma generate` prima di
  `pnpm -r typecheck`. Se `prisma generate` dà **`EPERM`** sulla DLL, un processo la tiene aperta:
  se lo schema non è cambiato il client esistente va bene, verifica col typecheck invece di forzare.
- **Suite di pacchetti diversi SEMPRE una alla volta.** e2e sequenziali (`maxWorkers: 1`: requisito,
  non preferenza). Se falliscono **tutte** in connessione a `:5433` → Docker è giù.
- **Le porte dev sono ora FISSE** (`strictPort`): staff 5173, platform 5174, customer 5175. Se una è
  occupata l'avvio **fallisce**: è voluto. Cerca il processo residuo invece di cambiare porta.

### Le due superfici privacy — non confonderle mai

|  | Informativa **bagnante** | Policy **operatori** |
|---|---|---|
| App e path | `web-customer`, **`/privacy?e=<id>`** | `web-staff`/`web-platform`, **`/legale/informativa`** |
| Titolare | **il lido** (varia per tenant) | **Coralyn** (uno solo) |
| Versione in testa | **1.x** | **0.x** |
| Dove si compila | form Stabilimento → Profilo legale (per-lido) | **modificando il codice** in `packages/legal/src/*.content.ts` |
| Da dove ci si arriva | promemoria nel flusso **Clienti**, link **esterno** | piè di pagina del **login** |

**`/privacy` è riservato al bagnante** e non deve mai comparire in `web-staff`/`web-platform`: due
test per app lo vietano. **Doppio artefatto**: `docs/legal/*.md` (per il legale) e
`packages/legal/src/*.content.ts` (per il prodotto) vanno aggiornati **insieme**.

### GDPR / ruoli

- Verso il bagnante il titolare è il **LIDO** (per-tenant), Coralyn è **responsabile**. Verso
  l'operatore il titolare è **Coralyn**. **Piani distinti, non mescolarli** — la contaminazione è
  già stata trovata una volta in review, dentro il DPA.
- Base giuridica = **contratto/obbligo legale, NON consenso**: niente checkbox «acconsento», nessun
  flag «informato» persistito.
- Le **basi giuridiche sono solo quelle dell'art. 6.1**. Artt. 5.2 e 32 sono obblighi, non basi.
- **Due nature di `[COMPILARE]`**: campi titolare = `NULL` nel DB, resi a render-time (spariscono
  quando il lido compila); **hosting/trasferimenti** = letterali hardcoded in
  `informativa.content.ts:44` e `:74` (sono dati di **Coralyn**, si compilano nel codice).

### API

- `JwtAuthGuard` + `RolesGuard` **globali** → ogni rotta non-staff vuole `@Public()`. Attenzione:
  `@Public()` **scavalca la guardia staff, non l'autenticazione**: 5 dei 13 handler che lo usano sono
  endpoint di dominio cliente protetti da `CustomerJwtGuard`.
- `PrismaExceptionFilter` lascia **P2025 a 500 di proposito** → il 404 va tradotto localmente.
- RLS via `forTenant` + policy `tenant_isolation` (**idioma da copiare verbatim**). Migration sempre
  **`--create-only`**, **leggile**, RLS **appesa a mano**.
- **Relation opzionale = FK `SET NULL` silenzioso → dichiara `onDelete`** (residui in D-059).
- Il login staff restituisce **`accessToken`** (non `token`); `POST /customer/activate` vuole
  **`enrollmentToken`** (non `token`) + `pin`.

### Frontend

- **`VITE_*` è BUILD-TIME**: inlineata nel bundle. In produzione va passata come **build arg**, non
  come env del container; cambiarla richiede un **rebuild**.
- **`docker compose --env-file .env.prod`** non è opzionale in produzione: le voci `env_file:` dei
  servizi non alimentano la sostituzione `${VAR}` nel file compose.
- **Tailwind v4 non scansiona i package**: serve `@source "../../../../packages/<nome>/src"` in
  `main.css` di ogni app consumatrice. Sintomo se manca: pagina senza stili.
- `CustomerMeDTO` **non** espone `establishmentId` al FE.
- **`queryResource` supporta `enabled`**: gatea le query condizionali, o una vista pubblica da
  sloggati spara la query autenticata → 401 → refresh → logout.
- Contenuti dei `Modal` **teleportati**: nei test `document.querySelector`, **non** `w.get`; **smonta
  prima** di pulire il body. `pushToast(message: string)`.
- `Popover` = **props + emit** (no `defineModel`). `Calendar` = **stringa ISO** + `pickCalendarDay`.
  `Select` = `selectOption` + sentinella `SELECT_EMPTY`. **reka-ui solo in `packages/ui-kit`**.
- **web-customer NON usa MSW** (`vi.mock` del composable); web-staff sì.
- **Niente em dash nel testo utente** — ma **`docs/` è FUORI da quel perimetro**.
- **Non registrare una rotta il cui componente lazy non esiste ancora** (no shim `*.vue`).

### Processo

- **`git log --all` copre solo i ref LOCALI. Fai `git fetch` prima di dichiarare che qualcosa non
  esiste.** Costato una ricostruzione intera buttata: l'handoff 5.6a esisteva su un altro clone e
  `--all` non poteva vederlo (vedi §1a). L'assenza da un clone non è assenza.
- **Il repo ha più di un clone attivo.** Prima di una sessione lunga, `git fetch` — `origin/main` può
  essere avanzata anche se l'handoff precedente la dava ferma.
- `.superpowers/` gitignorato; ledger `sdd/progress.md` append-only. **Prossimo prefisso scratch
  libero: `task-sl-N`.**
- **Prossimo ADR libero: 0057. Prossima deferred libera: D-063.**

## 4. Metodo atteso

- Skill `dev-discipline` + `dev-communication` **sempre**; `frontend-design` sul FE; `design-docs`
  quando tocchi dominio/dati/flussi/decisioni; **`compliance-docs` per qualunque lavoro legale/GDPR**.
- Lavoro multi-task: **brainstorming → writing-plans → subagent-driven-development**, reviewer per
  task + **review finale whole-branch su Opus**, **fix-loop con re-review**.
- **Per i bug: `systematic-debugging` PRIMA di proporre fix.**
- **Le decisioni sono dell'utente**: si raccolgono, non si assumono. Le scelte strutturali si
  **segnalano prima**. **Dati societari/hosting e validazione legale: chiederli, mai inventarli.**
- **Nessun merge su `main` senza ok esplicito.**

**Cosa ha pagato in questa sessione**, e vale la pena ripetere:

- **Due reviewer con lenti diverse** (normativa + verità tecnica avversariale) hanno trovato cose
  che un solo reviewer non avrebbe trovato. La lente «verifica ogni affermazione contro il codice» è
  quella che ha prodotto i rilievi più gravi.
- **La re-review dopo il fix-loop** ha trovato **7 problemi nuovi introdotti dalle correzioni**, di
  cui uno più grave dell'originale. Non saltarla.
- **Verificare invece di dedurre.** Tre affermazioni di questa sessione erano sbagliate e sono state
  scoperte solo aprendo il file o eseguendo il comando (il link «nascosto» che invece era relativo,
  la porta che Vite sceglie davvero, il conteggio delle tabelle RLS).

## 5. Lavori aperti

### Decisioni dell'utente, bloccanti per il legale

1. **Dati societari di Coralyn** — tabella canonica in [`docs/legal/README.md`](../legal/README.md).
   Non esistono ancora: sono `[COMPILARE]` ovunque.
2. **Scelta dell'infrastruttura** (hosting + provider email): determina sub-responsabili, ubicazione
   dei dati e trasferimenti extra-SEE. Blocca gli stessi `[COMPILARE]` **anche** nell'informativa al
   bagnante di 5.6a.
3. **Revisione legale** dei 18 punti ⚖️.

### Difetti di prodotto trovati in review, NON corretti

Documentati in [`docs/legal/README.md`](../legal/README.md), meritano una slice con
`systematic-debugging`:

- **La cancellazione GDPR non guarda i noleggi aperti.** Le guardie sul rapporto in corso contano
  solo le prenotazioni (`customers.service.ts:73-86`): un cliente con un **noleggio aperto** (non
  reso né annullato) è rimovibile **mentre il rapporto è attivo**, cosa che per le prenotazioni è
  bloccata con un 409. ⚠️ Il distacco `Rental.customerId → NULL` **non** è il difetto: realizza la
  cancellazione preservando la storia contabile in forma anonima (D-059 lo dice desiderabile).
- **L'anonimizzazione non revoca l'accesso del canale cliente**: enrollment e sessioni restano validi
  fino a scadenza (fino a **120 giorni**).

### Altri lavori disponibili

- **D-062 (5.6c)**: bozze pronte, mancano dati societari e firma. Nessun lavoro tecnico.
- **D-059**: relation opzionali con `SET NULL` implicito residue (`Umbrella.umbrellaTypeId`,
  `Booking.packageId`). Trigger: prossimo branch che tocca tipologie/pacchetti. `--create-only`.
- **Follow-up a11y**: combobox con `<label>` fratello non associato (senza `for`) senza nome
  accessibile (es. `MapView`, campi del modale prenotazione).
- **Follow-up 5.3**: scorciatoie «Oggi + salti» nel `Calendar`; migrare i **16 `<input type="date">`**
  residui.
- **Follow-up rail fila (flash-replay)**: il flash non si ri-triggera sullo stesso intent su una fila
  diversa col pannello già aperto. Non bloccante.
- **Pulizie segnalate, mai fatte**: 15 errori eslint preesistenti; 4 link rotti negli ADR 0016, 0023,
  0030, 0043; un utente di prova disabilitato nel DB dev
  (`verifica-informativa-5492@esempio.test`, creato per verificare l'email e disattivato: l'API non
  espone un delete per gli utenti staff).

### Residui di 5.6a — RECUPERATI il 2026-07-25 (§5.1 dell'handoff vero, vedi §1a)

Questi erano dati per persi. Vengono dalla review Opus di 5.6a e sono tutti **minori e non
bloccanti**, ma non erano più tracciati da nessuna parte:

- **`PrivacyView` passa `eid.value` come snapshot** a `usePublicInformativa`: l'id **non è reattivo**
  se lo *stesso* componente montato cambia `?e=`. Impatto reale nullo oggi — il deep-link operatore
  apre un tab nuovo, quindi rimonta.
- **`Promise.all` di due read dentro una transazione interattiva** in `getTitolare`. Questione di
  stile: sequenziale sarebbe più prudente.
- **Tre gap di copertura test**: `create.establishmentId` nell'unit di `upsert`; e2e del
  **null-clearing** sul `PUT`; conversione `''`→`null` e clear di `dpoContact` nello spec del modal.
- **`ConfirmDialog` senza `description`**: se una conferma non passa `description` e non ha slot
  default, il body resta **vuoto**. Nessuna conferma attuale è in questo caso: è un mini-gap.

Nota su D-059: la §5.1 dell'handoff vero descrive `Rental.customerId` come **caso a parte** e con le
stesse parole usate qui («comportamento emergente, non una decisione»). È lo stesso punto del
difetto di prodotto (a) qui sopra, visto dal lato schema invece che dal lato guardia: vanno decisi
**insieme**.

## 6. Verifica visiva già fatta (non serve rifarla)

In questa sessione le pagine legali sono state verificate **nel browser**: `/legale/informativa` e
`/legale/note` rendono con gli stili in `web-staff`; `/privacy?e=…` su `web-staff` non mostra più
nulla (redirect al login); il promemoria in Clienti compare **senza link** senza la env e **con**
link verso `localhost:5175` con la env; l'informativa bagnante su `web-customer` mostra il titolare
per-lido (`?e=` diverso → titolare diverso). L'email è stata verificata su un messaggio **realmente
recapitato**, letto da Mailpit.

**Non verificato**: l'imprint su `web-platform` (solo su web-staff) e il rendering in produzione.

## 7. Ancore

- Slice legale: [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md) ·
  [piano](../superpowers/plans/2026-07-24-legal-package-d061.md) ·
  [`docs/legal/`](../legal/README.md).
- GDPR pregresso: [ADR-0055](../architecture/decisions/0055-informativa-art13-multi-tenant.md)
  (tre piani) · [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)
  (erasure) · [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md)
  (auth cliente) · [ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)
  (parete piattaforma).
- **Runbook di macchina**: `RUNBOOK.local.md` alla root (gitignorato).
- **Calendario e2e congelato al 2026-07-15** — leggilo **prima** di scrivere e2e:
  [2026-07-22](2026-07-22-e2e-frozen-calendar.md).
- Handoff precedenti: [5.6a](2026-07-24-privacy-5-6a-mergiata-e-lavori-aperti.md) (l'**originale**,
  `74d277b` — non la ricostruzione, vedi §1a) ·
  [5.3 Calendar](2026-07-24-calendar-daynav-fix-ui-e-lavori-aperti.md).
- Deferred: [deferred.md](../architecture/deferred.md).
