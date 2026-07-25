# Handoff 2026-07-25 (sessione 6): D-065 eseguita ma NON mergiata. Restano G e H

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-25 Fasi E ed F mergiate](2026-07-25-fasi-e-f-mergiate.md), che resta valido tranne dove
> questo documento lo corregge (§1c e §3). Quello a sua volta sostituiva gli handoff di Fase D e E.

---

## 0. In una riga

**[D-065](../architecture/deferred.md) è eseguita e verificata, ma vive su un branch NON mergiato**
(`chore/audit-2026-07-25-d065-data-layer`, commit `50adc52`) perché il merge su `main` richiede l'ok
esplicito dell'utente, che non è ancora arrivato. `main` è fermo a `49d3970`.

Restano **Fase G** (test) e **Fase H** (documentazione) del [§4 del report](../audit/2026-07-25-audit-completo.md).

### I primi cinque minuti, se arrivi a freddo

```bash
git fetch --all --prune && git status -sb && git log --oneline -3 main chore/audit-2026-07-25-d065-data-layer
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch` prima
di dichiarare che qualcosa non esiste.

**La prima domanda da fare all'utente è se mergiare il branch di D-065**, perché la Fase G tocca
`apps/api` e non collide, ma la H tocca gli stessi documenti che D-065 ha già corretto.

Poi, in ordine: **§3 (i gotcha)** e **§4 (il metodo)** di questo documento, il
[report d'audit §4](../audit/2026-07-25-audit-completo.md) per il piano ordinato per dipendenza, e
`git log --format=%B -14` per il razionale — **i messaggi di commit di questo repo sono più densi
della documentazione, e non è una figura retorica**: contengono le scoperte che i finding non
avevano previsto.

Il gate è `pnpm run verify` (lint + typecheck + unit); le **e2e sono un comando a parte** e
richiedono Postgres.

---

## 1. Cosa è stato fatto: D-065

### 1a. Il risultato

Nuovo package **`packages/data-layer` (`@coralyn/data-layer`)**, 32 test propri, più il sistema toast
completo portato in `ui-kit`. Chiude [D-065](../architecture/deferred.md), ratificato da
**[ADR-0058](../architecture/decisions/0058-package-data-layer-condiviso.md)**.

La decisione strutturale è stata **esposta all'utente prima di implementare**, con opzioni e
trade-off reali; ha scelto la fattorizzazione **per strati** su tutte e tre le app, e per la
collocazione del toast ha chiesto «la soluzione più professionale, più coerente e senza debiti».

| Strato | Contenuto | Consumatori |
|---|---|---|
| **base** | `ApiError`, `readErrorMessage`, `readJsonBody`, `API_BASE`, `queryResource`/`mutationResource`, `QUERY_DEFAULTS` | **tutte e tre** le app |
| **sessione semplice** | `createApiFetch`, `handleUnauthorized`, `createQueryClient` | `web-staff`, `web-platform` |

Criterio di appartenenza dichiarato: **«ciò che non conosce né il router, né lo store, né la chiave
di sessione dell'app che lo usa»**. È un criterio, non un elenco: la prossima aggiunta sa dove va.

### 1b. Le tre cose che la misura ha corretto, e che valgono più della chiusura

D-065 era scritta su tre premesse. **Tutte e tre erano sbagliate**, e si è visto aprendo i file.

| Premessa di D-065 | Realtà misurata |
|---|---|
| «Cinque file identici in **due** copie» | A commenti rimossi: `toasts.ts`, `useQueryResource.ts` e `ToastHost.vue` — quest'ultimo **nemmeno in elenco** — sono identici in **TRE** copie, `web-customer` inclusa. `onApiError.ts` e `queryClient.ts` avevano **codice identico** e divergevano **solo nei commenti** |
| «Il nodo tecnico è che `ApiError` è definito **per app**» | **Rovesciato**: la classe è testualmente identica in tutte e tre. Non era l'ostacolo, era **la chiave** — portarla nel package è ciò che fa attraversare `instanceof` al confine app↔package, cioè scioglie il vincolo che il commento di Fase F dichiarava bloccante. **Nessuna iniezione di tipo è servita** |
| «⚠️ Non toccare `web-customer`» | **Giusto ma troppo largo.** Vero per `apiFetch` (il refresh single-flight di ADR-0049 è rimasto fuori, e resta fuori); **falso** per i tre artefatti byte-identici, che con ADR-0049 non c'entrano nulla. Il vincolo come scritto avrebbe lasciato in piedi **tre duplicati misurati** |

> **La lezione**: un finding è un'ipotesi, non un verbale. Tre premesse su tre erano sbagliate, e
> nessuna richiedeva più di un `diff` per cadere. **Misurare il problema prima di risolverlo** ha
> cambiato il perimetro della soluzione, non solo i suoi dettagli.

### 1c. La duplicazione era scoperta, e lo si è provato invece di dedurlo

Prima di estrarre, le copie di `web-platform` — le uniche senza spec propri — sono state degradate
una alla volta:

| Mutazione | `web-staff` (ha gli spec) | `web-platform` (non li ha) |
|---|---|---|
| `apiFetch` smette di allegare il `Bearer` | **2 rossi** | **29/29 verdi** |
| `mutationResource` perde il toast d'errore | **6 rossi** | **29/29 verdi** |

La console superuser poteva smettere di autenticarsi senza che un solo test se ne accorgesse. **I
test non mancavano: erano puntati su una copia sola.** È questa asimmetria — non l'eleganza — la
ragione della decisione, ed è l'argomento che ha convinto più di qualunque conteggio di righe.

### 1d. Correzioni ai documenti — e cosa insegnano

Cinque affermazioni in documenti **vivi** sono state corrette **nel merito**, distinguendo sempre
«è sempre stato vero» da «lo è diventato».

| Documento | Affermava | Realtà |
|---|---|---|
| **ADR-0033 §5.3** | `useQueryResource` sta fra le astrazioni «**che conoscono il dominio**», in `apps/web-staff/src/lib/` | ❌ `queryResource`/`mutationResource` sono generiche su `T` e non nominano **nessuna** entità: il criterio della sezione non le selezionava. Sbagliata la **classificazione**, non la regola — che resta valida e invariata |
| **ADR-0049** | su refresh fallito, l'interceptor fa «`session.logout()` + redirect a `/attiva`» | ❌ **Falso da quando fu scritto**: l'handler è `clearSession`, che azzera lo stato e **non naviga**. Il redirect vive in `CustomerShell` (AUD-010, già corretto in Fase D ma **mai corretto nell'ADR**) |
| **deferred.md**, riga D-037 | «gemello **volontario**… le due app hanno ciascuna il proprio `ApiError`, e unificarle è una decisione strutturale» | ⚠️ **Vero quando fu scritto**, cessato lo stesso giorno: la decisione è stata presa |
| **deferred.md**, riga D-037 | «Il pattern **da copiare** è `web-staff/src/lib/onApiError.ts`» | ❌ Istruzione in presente verso un file che non esiste più. Non c'è un pattern da copiare, c'è `createQueryClient` da chiamare — **copiare era il problema** |
| **report d'audit**, blocco di stato | «Tutto il resto → 🔓 APERTO — fasi **E → H**» | ❌ Il **§4 dello stesso documento** marcava E ed F `✅ ESEGUITA`. Il report **contraddiceva sé stesso**: R-G che si ripresenta — il §4 veniva aggiornato eseguendo, il blocco in testa no |

Inoltre `docs/audit/2026-07-25-baseline.md` aveva una **regola di verifica** che rimandava alla
«tabella più recente», ferma alla **Fase C**: per tre fasi chi la seguiva verificava contro numeri
vecchi. Colmato con una sezione unica, e la regola ora dice anche cosa fare **quando un fix sposta
dei test invece di aggiungerne** (§2).

---

## 2. Baseline verde

| Suite | Comando | Inizio sessione | Ora |
|---|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 | 11 |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 207 | **212** |
| **`@coralyn/data-layer`** | `pnpm --filter @coralyn/data-layer test` | — | **32** |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 29 | **23** |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 | 35 |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | 436 | **413** |
| api unit | `pnpm --filter @coralyn/api test` | 330 | 330 |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | 483 (42 suite) | 483 (42 suite) |
| tutto insieme | **`pnpm run verify`** | exit 0 | **exit 0** |
| lint | `pnpm run lint` | 0 err / 67 warn | 0 err / 67 warn |
| typecheck | `pnpm run typecheck` | exit 0, 7 progetti | exit 0, **8 progetti** |

**Totale: 1539 test distinti** (erano 1531). Unitari: **1048 → 1056**.

⚠️ **I cali di `web-staff` (−23) e `web-platform` (−6) sono spostamenti, non perdite**, e vanno
letti così: 21 test cambiano casa (2 → `ui-kit`, 21 → `data-layer`) e **6 duplicati vengono
consolidati** — gli stessi sei, scritti due volte, che ora vincolano **entrambe** le app invece di
una ciascuna. Il saldo è **+14 nuovi − 6 consolidati = +8**.

**Regola di verifica aggiornata**: dopo ogni fix il **totale** non scende, ogni calo per-suite è
**spiegato da una riga della tabella** in `docs/audit/2026-07-25-baseline.md`, typecheck exit 0,
lint non sale sopra 0 errori. Un calo non spiegato resta una regressione.

`apps/api` **non è stata toccata** da D-065: le 483 e2e non sono impattate.

---

## 3. Gotcha — verificati in questa sessione, non ereditati

### 3a. Nuovi, da D-065

- **`ApiError` viene SEMPRE da `@coralyn/data-layer`.** Nessuna app la ri-esporta, nemmeno
  `web-customer` che pure compone il proprio `apiFetch`. Ridichiararla romperebbe in silenzio gli
  `instanceof` di `handleUnauthorized`, e **né il typecheck né il lint se ne accorgerebbero** (le due
  classi sono strutturalmente identiche) → il presidio è
  [`single-source.spec.ts`](../../packages/data-layer/src/single-source.spec.ts), che fallisce e
  **nomina il file colpevole**. Provato per mutazione.
- **`apps/*/src/lib/http.ts` è un composition root di tre righe**, non un modulo: dice soltanto dove
  sta il token di quell'app. Idem `queryClient.ts`.
- **`getSession` è un THUNK, non un valore.** `useSessionStore()` richiede Pinia già installata, e
  `queryClient.ts` viene valutato **prima** di `app.use(createPinia())`. Risolverlo alla creazione
  lancia in avvio.
- **`createApiFetch` rilegge il token a OGNI chiamata.** La factory è costruita all'import, cioè
  prima di qualunque login: catturare il token una volta sola lascerebbe l'app a mandare `null` per
  sempre. Vincolato da un test dedicato, perché **nessun altro se ne accorgerebbe** — tutti gli altri
  impostano il token prima della prima chiamata.
- ⚠️ **Il barrel di `ui-kit` trascina `~icons/lucide/*` e gli SFC.** Un package senza `.vue` che
  importi da `@coralyn/ui-kit` deve saper compilare quei moduli virtuali: servirebbero
  `@vitejs/plugin-vue`, `unplugin-icons` e `@iconify-json/lucide`. Per questo `ui-kit` espone
  **`@coralyn/ui-kit/toasts`** come subpath, usato **solo** da `data-layer`. **Le app continuano a
  importare dal barrel.**
- ⚠️ **`sideEffects: false` su `data-layer` è vero ma OGGI inerte** — misurato, non dedotto:
  togliere l'unico import di `web-customer` dal barrel lascia il bundle a **293.5 kB identici**. In
  `ui-kit` lo stesso campo vale 480 KB **solo perché** lì `echarts.ts` chiama `use([...])` al top
  level, un effetto che Rollup non può dimostrare puro e che lo obbliga a conservare tutto il grafo.
  Qui nessun modulo è impuro, quindi Rollup ci arriva da solo. **Se un domani entra un modulo con un
  effetto al top level va ELENCATO** invece di lasciare `false`: il sintomo di uno sbaglio è una
  schermata bianca, non un errore di build.
- **Il sistema toast è interamente in `ui-kit`**: `Toast.vue`, `ToastHost.vue` e la coda `toasts.ts`.
  Nessuna app ha più un `ToastHost` proprio.
- **Nei test, `mockResolvedValue(new Response(...))` riusa lo STESSO oggetto**, e il body di una
  `Response` si legge una volta sola: la seconda chiamata fallisce con «Body is unusable» per il
  motivo sbagliato. Serve `mockImplementation(() => Promise.resolve(new Response(...)))`.

### 3b. Ereditati e RI-verificati in questa sessione

- ✅ **`configureApp` è condivisa da 37 delle 42 suite e2e** — confermato contando le **chiamate**
  su righe non-commento. Le cifre che confondono, ora tutte spiegate: `grep -l createTestApp
  apps/api/test/*.e2e-spec.ts` → **38** (37 chiamanti + `booking-overlap-constraint`, che lo *nomina
  in un commento* per spiegare perché non lo usa); su tutta `apps/api/test/` → **39** (in più
  `helpers/create-test-app.ts`, che lo **definisce**). **Contare le chiamate, non le occorrenze, e
  dichiarare lo scope.**
- ✅ **`P2003` → 409** (`common/prisma-exception.filter.ts`); **`P2025` resta 500 di proposito**.
- ✅ **`@IsUUID` è vietato dal lint** (`no-restricted-imports` in `eslint.config.js`, scope
  `apps/api/**`): usa `@IsUuidShape()`.
- ✅ **`gh` NON è installato**: per la CI usa
  `https://api.github.com/repos/devfrx/coralyn/actions/runs`. La CI gira **solo su `main` e sulle
  PR**: spingere un branch non la attiva.
- ✅ **`coverage.carve.ts` esiste** in `apps/api/src/bookings/` ed è l'unico posto del carve.
- ⚠️ **I tre `.env` locali di QUESTA macchina sono già sulla 5432** (`.env`, `.env.test`,
  `apps/api/.env`). Il gotcha resta valido **per un clone nuovo**: la 5433 è ancora hardcodata nei
  commenti di `apps/api/prisma/reset-dev.ts:7,10`, **codice versionato** (AUD-019, aperto, Fase H).

### 3c. Ereditati, non ri-verificati in questa sessione

Restano validi come scritti nel [§3 dell'handoff precedente](2026-07-25-fasi-e-f-mergiate.md),
**ma non li ho riaperti uno per uno**: DB e migration (RLS appesa a mano solo per tabelle nuove,
`coralyn` superuser vs `coralyn_app`, nome dell'indice non asseribile sotto RLS), `DataTable`
generico, `QueryBoundary`, Vue Test Utils e `<script setup generic>`, i marker validi per ECharts,
`PasswordHasher` da `CryptoModule`, il calendario e2e congelato, le due superfici privacy.

- **`mutationResource` ha un toast d'errore di default, `queryResource` no** → per le query usa
  `QueryBoundary`. Vale ancora, ma **ora vive in `@coralyn/data-layer`**, non in `web-staff`.

---

## 4. Metodo atteso

### 4a. Regole di ingaggio

- **Skill `dev-discipline` + `dev-communication` sempre.** `systematic-debugging` **prima** di
  proporre un fix. `compliance-docs` per legale/GDPR. `design-docs` se tocchi dominio, dati, flussi o
  decisioni. `repo-audit` se il lavoro torna a essere sistemico.
- **Le decisioni strutturali sono dell'utente**, e si espongono **prima** di implementare, con
  opzioni e trade-off reali (**non un'opzione buona e due di paglia**). Ha funzionato in Fase F e di
  nuovo in D-065: ripetilo.
- **Ogni fix alla radice.** Se la radice è fuori portata, dirlo e lasciare il finding aperto.
- **Dati societari e scelte d'infrastruttura si chiedono, mai si inventano.**
- **Nessun merge su `main` senza ok esplicito.**

### 4b. Cosa ha pagato, e va ripetuto

- **Misura il PROBLEMA, non solo la soluzione.** Le tre premesse di D-065 sono cadute con un `diff`
  a commenti rimossi, e hanno cambiato il **perimetro**, non i dettagli. Un finding è un'ipotesi.
- **La mutazione come prova, anche per un refactor.** Per un bug si prova che il fix serve; per un
  refactor si prova che **la duplicazione è scoperta** — degradando una copia e guardando se qualcosa
  diventa rosso. In Fase E: dodici mutazioni, dodici suite rosse; la più istruttiva non era cancellare
  un indice ma renderlo **pieno invece che parziale**. **Cancellare l'oggetto prova che serve;
  degradarlo prova che serve *così*.**
- **Verificare anche il verso opposto.** Su `sideEffects` il rischio non era togliere troppo poco ma
  **troppo**: la verifica che contava era che ECharts **restasse** in `web-staff`.
- **Quando l'ipotesi cade, dirlo e correggere il testo.** Ho attribuito la crescita del bundle al
  barrel non tree-shakeable e aggiunto `sideEffects: false`. **Non ha cambiato nulla.** Il commento
  ora dice che è inerte e *perché*, invece di rivendicare un beneficio inesistente. Un commento che
  mente è peggio di nessun commento.
- **Se un'affermazione di un documento non ha un test, scrivilo.** Il presidio su `ApiError` unica
  nasce dalla domanda di Fase F: non «è ancora vera?» ma **«cosa la renderebbe rossa se smettesse di
  esserlo?»**.
- **Dichiarare i cali invece di nasconderli.** Consolidando 6 duplicati il conteggio scende: va detto
  e spiegato, e la regola di verifica va aggiornata perché sappia gestire il caso.

### 4c. Errori da non ripetere

- **Su template Vue si usa `Edit`, non regex cieche**: in `sed` le parentesi sono **letterali** e
  hanno già mangiato codice due volte (`periodLabel(row)` → `periodLabelrow`). In questa sessione le
  riscritture di import sono state fatte con **sostituzione di stringhe esatte** in Node, e il diff
  è stato riletto per intero (verificato: sui `.vue` **solo righe di import**).
- **Non riordinare ciò che era già a posto.** Il primo passaggio di riordino import ha spostato anche
  righe corrette, gonfiando il diff. Rifatto sui soli file dove l'import era **nuovo**.
- **Uno scan statico non vede gli import dinamici.** `await import('@/lib/toasts')` in 7 punti è
  sfuggito al primo passaggio: l'ha preso il `grep` dei residui, non lo scan. **Cerca sempre i
  residui dopo una rinomina.**
- Leggere un output di test **troncato da `tail`** e dedurne una conclusione: guardare l'elenco
  completo prima di concludere.

---

## 5. Lavori aperti

### 5.0 La domanda da fare per prima

**Mergiare `chore/audit-2026-07-25-d065-data-layer` su `main`?** Il branch è verde e completo. La
Fase G tocca `apps/api` e non collide; la Fase H tocca **gli stessi documenti** che D-065 ha già
corretto (`deferred.md`, il report d'audit, la baseline), quindi lavorarci sopra senza mergiare
prima significa conflitti garantiti.

### 5.1 Azioni dell'utente

1. **Decidere su [D-064](../architecture/deferred.md)**: `GET /establishment/overview` espone le
   email di tutti gli operatori anche allo staff. ⚠️ **Non chiudibile con un decoratore**: l'app-shell
   chiama quell'endpoint a **ogni caricamento** per il nome della stagione attiva
   (`SidebarNav.vue` → `useActiveSeason` → `useEstablishmentOverview`), quindi restringerlo lo
   romperebbe. Serve separare il payload.
2. Bloccanti legali pregressi: **dati societari di Coralyn**, **scelta infrastruttura** (hosting +
   email → sub-responsabili e trasferimenti extra-SEE), revisione dei **18 punti ⚖️**.
3. **Igiene branch** (§5.5): otto branch locali stantii, nessuno con lavoro unico.

### 5.2 Fase G — test *(chiude R-I/R-J)*

**È la fase più grande, e non è omogenea.** Non dipende da D-065 ed è lavorabile subito. Stima
onesta: **2–4 volte D-065** — e con una differenza di natura, perché D-065 spostava codice esistente
mentre la G scrive test su codice che non ne ha mai avuti, quindi è **probabile che faccia emergere
difetti veri** (come in Fase E, dove il rosso ha detto due volte cose che il finding non diceva).
Questi numeri vengono dal report, **non da una lettura del codice**: verificali.

Taglio proposto in tre slice:

**G1 — le difese di sicurezza + il fixture bugiardo** *(le più gravi; toccano gli stessi spec)*
- **Il fake `forTenant: (_t, cb) => cb(tx)` SCARTA il tenantId** in 7 spec (**AUD-026**): passare il
  tenant sbagliato è invisibile a tutti i 330 unit. Il fix è un fake che **asserisce** il tenant.
- **`JwtAuthGuard` senza unit spec** (**AUD-028**): invertire una riga rende pubblica l'intera API e
  **tutti i 330 unit restano verdi**. Più `token.service` kind e `CustomerSessionService`.
- **Invarianti con protezione ZERO** (**AUD-024**): «invalida i token precedenti/fratelli» mai
  asserito; la revoca dell'accesso cliente mai verificata sulle **sessioni vive**.
- **Il test cross-tenant lato operatore** il cui scaffolding fu rimosso senza scriverlo (P6-020).

**G2 — precedenza e isolamento** *(richiede Postgres)*
- **La precedenza del pricing è testata su 3 coppie su 15** (**AUD-025**): scambiare settore↔pacchetto
  in `specificity()` lascia **tutti e 17 i test verdi** e viola ADR-0032 §2.
- **RLS testata su 1 tabella su 22, in sola lettura**, e il `WITH CHECK` non è **mai** esercitato →
  test RLS **parametrico** derivato da `grep CREATE POLICY`.

**G3 — `bookings.service.ts`** *(da sola vale quanto D-065 o più)*
- **1024 LOC, zero unit test** (**AUD-027**).

### 5.3 Fase H — documentazione *(chiude R-G)*

- Correggere le affermazioni false **già verificate**: D-061 «unica memorizzazione», ⚖️-18 che cita
  `/privacy`, **`privacy-policy-operatori.md:68-73`** (due affermazioni false nel paragrafo che un
  legale legge per l'art. 14.3(a)), `data-model.md` con due entità inesistenti, README root, README
  di web-staff, guida deploy.
- **`docs/` ha 67 link markdown rotti** in 22 documenti — **misurato in questa sessione**, e
  **nessuno causato da D-065** (l'unico mio l'ho corretto). Sono per lo più rinomine mai propagate
  (`clienti/` → `customers/`) e profondità relative sbagliate. Lo script di misura è banale da
  riscrivere: estrai i target dei link markdown **relativi** (quelli che iniziano per punto) e
  verifica con `fs.existsSync` che il file esista. ⚠️ Attenzione a non scrivere la sintassi di un
  link *dentro* la prosa, o il checker conterà il proprio esempio fra i rotti — è successo qui.
  ⚠️ Il report d'audit avverte che
  **gli anchor `#sezione` non sono mai stati verificati**, quindi il numero vero è più alto.
- **Igiene di `deferred.md`**: ~74.000 caratteri, ≥7 voci chiuse ancora in tabella. La riga di D-037
  da sola è un monolito di diecimila caratteri con sette livelli di correzione annidati: va spezzata.
- **Spostare le asserzioni verificabili dai documenti ai test** — il modello è
  `single-source.spec.ts` (§3a).
- `reset-dev.ts:7,10` cita ancora la porta **5433** e «18 tabelle» invece di 22 (**P8-016**), ed è la
  radice per cui i `.env` di un clone nuovo nascono sbagliati (**AUD-019**).

### 5.4 Segnalazioni fuori scope, non fatte di proposito

- **`authToken.ts` di `web-staff` e `web-platform` differisce per UNA SOLA STRINGA** (la chiave di
  `localStorage`) e resta duplicato. Unificarlo con un `createTokenStore(key)` è legittimo, ma tocca
  gli store di sessione di tre app per ~1 KB di codice: raggio di verifica più largo, guadagno più
  piccolo. Dichiarato in [ADR-0058](../architecture/decisions/0058-package-data-layer-condiviso.md).
- **`main.ts` è byte-identico nelle tre app** ma risolve moduli **app-locali** (`./App.vue`,
  `./router`, `./stores/session`): condividerlo richiederebbe iniettarne quattro, cioè un bootstrap
  travestito da libreria. **Non è un candidato**, ed è utile saperlo per non riproporlo.
- **`mountApp` di `src/test/utils.ts` è identico nelle tre app** (`web-staff` ha in più due helper):
  infrastruttura di test, fattorizzabile, mai valutata.
- **~15 DTO usano ancora `@Matches(UUID_SHAPE, { message: '…' })`** invece di `@IsUuidShape()`.
  Applicano la policy **giusta**: convertirli cambierebbe i testi d'errore dell'API — decisione
  dell'utente.
- **La funzione del trigger conserva il nome `coverage_fill_slot_minutes`** benché ora erediti anche
  `umbrellaId`: rinominarla renderebbe sbagliati cinque documenti storici, a fronte di zero
  cambiamenti di sostanza.
- **`Booking.extras` resta una colonna JSONB morta** dichiarata come categoria di dati in 4 documenti
  legali (**P2-010**): materiale di Fase H, e tocca testo legale.
- **Nessuna paginazione in tutto lo stack** (**AUD-021**) e **il pre-check anti-overlap carica tutta
  la storia di coperture** (**AUD-020**): performance, fuori dal piano E→H.
- **`web-customer` non è stata verificata nel browser**: richiede un backend reale e un accesso
  cliente provisioned (quell'app non usa MSW).

### 5.5 Igiene del workspace

Otto branch locali, **nessuno con lavoro unico**: i cinque `chore/audit-2026-07-25-fase-*` sono
contenuti in `main`, gli altri tre sono duplicati pre-rebase (verificato per oggetto nelle sessioni
precedenti). ⚠️ **`chore/audit-2026-07-25-d065-data-layer` NON è in questo elenco**: contiene lavoro
unico e non mergiato.

```bash
git branch -D chore/audit-2026-07-25-fase-a-b chore/audit-2026-07-25-fase-c chore/audit-2026-07-25-fase-d chore/audit-2026-07-25-fase-e chore/audit-2026-07-25-fase-f backup/main-pre-reconcile-20260725 docs/handoff-5-6a-ricostruito feat/legal-d061-d062
```

Cancellare branch è una scelta dell'utente, non un effetto collaterale di una sessione di fix.

### 5.6 Numeri liberi

**Prossimo ADR libero: 0059.** **Prossima deferred libera: D-066.**

---

## 6. Ancore

- **Audit**: [report completo](../audit/2026-07-25-audit-completo.md) ·
  [baseline](../audit/2026-07-25-baseline.md) · [findings per partizione](../audit/findings/)
- **Data-layer condiviso**: [ADR-0058](../architecture/decisions/0058-package-data-layer-condiviso.md) ·
  [`packages/data-layer/src/`](../../packages/data-layer/src/)
- **Package condiviso (precedente per forma)**: [ADR-0056](../architecture/decisions/0056-package-legale-condiviso.md)
- **Frontend**: [ADR-0017](../architecture/decisions/0017-design-system-frontend.md) ·
  [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) ·
  [ADR-0038](../architecture/decisions/0038-libreria-grafici-echarts.md)
- **Occupazione e carve**: [ADR-0046](../architecture/decisions/0046-occupazione-a-intervalli-coverage.md)
  · [ADR-0037](../architecture/decisions/0037-anti-overlap-exclusion-constraint.md) ·
  [data-model.md](../design/data-model.md)
- **Autorizzazione**: [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
- **GDPR**: [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md) ·
  [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) ·
  [`docs/legal/`](../legal/README.md)
- **Calendario e2e congelato**: [2026-07-22](2026-07-22-e2e-frozen-calendar.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [Fasi E ed F mergiate](2026-07-25-fasi-e-f-mergiate.md)
