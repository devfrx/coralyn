# Handoff 2026-07-29 (sessione 13): D-038 ha spec e piano, il codice è tutto da scrivere

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-28 D-063 chiusa e mergiata](2026-07-28-d063-chiusa-e-mergiata.md), che resta **superato**.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

> ⚠️ **Documento superato** dall'handoff
> [2026-07-30](2026-07-30-drag-reorder-implementata-mancano-review-e-prova-visiva.md), che è il punto
> d'ingresso corrente. Le coordinate `file:riga` qui dentro sono contro `main` al 2026-07-29, prima
> che il codice della slice esistesse: nell'albero consegnato molte cadono su codice vicino ma
> diverso. Quelle riverificate il 2026-07-30 portano la nuova coordinata e la vecchia accanto.

---

## 0. In una riga

**Nessuna riga di codice è stata scritta.** La sessione ha prodotto **spec e piano per D-038**
(riordino dell'ombrellone per trascinamento), sul branch `feat/drag-reorder-ombrelloni-d038`,
spinto e **non mergiato**. Tutto ciò che regge quel disegno è stato **misurato sul codice e sul
database**, non dedotto dai documenti — perché in questa sessione l'utente mi ha colto **tre volte**
a citare documenti come se fossero prove.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -4
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

`main` = `68a061c`. Il lavoro vive su **`feat/drag-reorder-ombrelloni-d038`** (`6a7c43a`).

Poi, in ordine: **§1 (ambiente)**, **§2 (cosa non si rilitiga)**, **§4 (gotcha)**, **§5 (metodo)**,
**§6 (da dove ripartire)**.

⚠️ **Il lavoro NON riparte da una decisione: riparte dal Task 1 del piano.** La scelta di cosa fare
è già stata presa con l'utente ed è al §2. Non riaprirla.

---

## 1. Ambiente

### 1a. I cinque file gitignorati

| File | Template versionato | Nota |
|---|---|---|
| `.env` | ✅ [`.env.example`](../../.env.example) | completo e commentato |
| `apps/api/.env` | ⚠️ **nessuno** | **byte-identico a `.env`**: copia lo stesso file due volte |
| `.env.test` | ✅ [`.env.test.example`](../../.env.test.example) | |
| `apps/web-staff/.env` | ✅ [`apps/web-staff/.env.example`](../../apps/web-staff/.env.example) | |
| `RUNBOOK.local.md` | — | stantio sui numeri, utile sul *perché*. Non linkarlo: è gitignorato |

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** Quattro handoff di fila li hanno dati per
assenti ed erano tutti al loro posto — **anche in questa sessione**. Se mancano davvero i valori
(JWT dev, password di `admin@coralyn.dev` e `super@coralyn.dev`), quelli sì vanno chiesti
all'utente: **il repo è PUBBLICO.**

⚠️ `JWT_SECRET` contiene la stringa `change-me` ma **non** è il segnaposto di `.env.example`.
Confronta col template, non col testo.

⚠️ **Perché `apps/api/.env` è un duplicato**: `ConfigModule.forRoot` non passa `envFilePath`, dotenv
risolve dalla **cwd**, e `pnpm --filter @coralyn/api …` la mette in `apps/api/`.

### 1b. La sequenza che porta a un verde

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @coralyn/contracts build
pnpm --filter @coralyn/api exec prisma generate
```

⚠️ **`prisma generate` PRIMA del typecheck**, sempre.

### 1c. Docker, i due database, il seed

```bash
docker compose up -d && docker compose ps   # db su 5432, mailpit su 1025/8025
```

- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.

Migration su **entrambi** i database:

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_dev?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5432/coralyn_test?schema=public" \
  pnpm --filter @coralyn/api exec prisma migrate deploy
```

- ⚠️⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Per generare l'SQL usa
  `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, poi scrivi a
  mano `prisma/migrations/<ts>_<nome>/migration.sql` e fai `migrate deploy`. Il timestamp dev'essere
  **posteriore** all'ultima migration. *(D-038 **non ha migration**: vedi §2.)*
- ⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: le label
  esistono attive sotto uuid casuali (ombrelloni creati via app) e collidono con l'indice parziale.
  **Non "correggere" il seed.** Conseguenza operativa:
  `SEED_ON_START=false docker compose --profile full up -d`.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**
- `coralyn` è superuser e **BYPASSRLS**, `coralyn_app` no: per **ispezionare i dati** serve
  `coralyn`, o l'RLS ti dà zero righe e la verifica *sembra* pulita. Esempio usato in questa
  sessione: `docker exec coralyn-db psql -U coralyn -d coralyn_dev -c '…'`.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Queste decisioni sono state prese **con l'utente**, in questa sessione, e sono chiuse. Riaprirle
significa rifare una conversazione già fatta.

| # | Decisione |
|---|---|
| 1 | **Lo scope è D-038, non D-005.** Si fa il **riordino logico** per trascinamento. La planimetria a coordinate libere resta deferita. `Umbrella.presentationPosition` **non si tocca**: è la sede di D-005, e usarlo qui creerebbe due nozioni di posizione concorrenti |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile, niente selezione multipla trascinabile |
| 3 | **Destinazione ammessa**: una fila del proprio settore, **o di un altro settore dello stesso `kind`**. Mai `grid → special` |
| 4 | **Sul prezzo: disclosure, non blocco.** E la stessa disclosure va estesa a `restore`, che oggi cambia settore in silenzio |
| 5 | **Nessun equivalente da tastiera** → la feature è **solo `lg+`**. Sotto 1024px il riordino non esiste, il limite è **dichiarato**, e il caso scoperto diventa **D-071** |
| 6 | **Restano nello scope**: disclosure su `restore`, presidio sulle due stringhe di semantica dell'ordine, le correzioni documentali della spec §9 |
| 7 | **File e settori NON si riordinano.** D-038 si chiude **solo per l'ombrellone** |

⚠️ Sul punto 5: l'utente ha scelto conoscendo il trade-off, che gli era stato esposto. **Non
riproporlo.** Va invece *implementato* il suo effetto (maniglia assente sotto `lg`), non subito.

---

## 3. Baseline su `main` (`68a061c`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1 file) |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **473 (61)** |
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | **68 (5)** ← riverificato in questa sessione |
| api unit | `pnpm --filter @coralyn/api test` | **414 (60)** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **529 (44)** |
| tutto insieme | **`pnpm run test`** | **1268 / 185** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

**Criterio di «ambiente rimesso in piedi»**: `pnpm run test` a **1268/185** e `test:e2e` a
**529/44**. Se i numeri non tornano è l'ambiente, non il codice.

---

## 4. Gotcha

### 4a. Nuovi, misurati in questa sessione — i letali per D-038

- ⚠️⚠️ **`ValidationPipe` è `{ whitelist: true, transform: true }` SENZA `forbidNonWhitelisted`**
  (`apps/api/src/configure-app.ts:18`). Un campo presente nel body ma assente dal DTO viene
  **scartato in silenzio, con 200**. Un `PATCH { rowId }` sull'endpoint esistente sembra funzionare
  e non scrive nulla.
- ⚠️⚠️ **Il ramo idempotente di `restore` ignora `input.rowId`** (`umbrellas.service.ts:184-186`):
  se l'ombrellone è già attivo, ritorna l'entità e **non sposta niente**, con 200. È il precedente
  in casa di «richiesta di spostamento accolta e ignorata». **Non replicarlo.**
- ⚠️⚠️ **NESSUNA query di mappa o struttura filtra `retiredAt`.** L'esclusione di un ritirato
  dipende **solo** da `rowId = null` (`umbrellas.service.ts:170`). Un endpoint di move che scriva
  `rowId` senza guardia **resuscita un ombrellone ritirato**, prenotabile.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** (`umbrellas.controller.ts:17`) e
  `authorization-coverage.spec.ts:56-57` legge `metodo ?? classe`. Un endpoint nuovo su quel
  controller **eredita il permesso in silenzio**: nessun rosso, nessun 403, nessuna decisione
  forzata. Il presidio che *sembra* la rete non scatta.
- ⚠️⚠️ **Sotto `lg` la scena è pointer-morta.** Il `Drawer` è un `DialogContent` di reka-ui con
  `disableOutsidePointerEvents` a **true** di default: `DismissableLayer` scrive
  `body.style.pointerEvents = "none"` e applica `aria-hidden`, **appena qualcosa è selezionato**
  (il getter di `drawerOpen`, `EstablishmentStructureView.vue:129-131`; era `:35` contro `main`).
- ⚠️⚠️ **`useMediaQuery` ritorna `false` senza `matchMedia`** (`useMediaQuery.ts:6`).
  ⚠️ **Corretto il 2026-07-30:** questa riga proseguiva con «quindi **ogni** spec dell'editor gira
  oggi nel ramo Drawer», ed era **falsa già a questa data**: `EstablishmentStructureView.spec.ts`
  aveva già, **su `main`**, uno `stubDesktopMatchMedia()` in un `beforeEach` globale del file. Vale
  solo per un file **senza** stub: là un test del drag **passa senza eseguire nulla**.
- ⚠️⚠️ **Oltre 20 asserzioni indicizzano `[data-testid="scene-cell"] button` per POSIZIONE**
  (`EstablishmentStructureView.spec.ts:83,315,355,377,395,417,434-435,459-460,483-484,512-513,525-526,544-545,560-561`;
  `StructureScene.spec.ts:44,46`). Un secondo `<button>` dentro la cella le arrossa tutte **senza
  che una sola logica sia rotta**.
- ⚠️ **`selectMode` si aggancia**: un solo Maiusc+clic lo accende e da lì **ogni** clic è additivo
  (`onSelectUmbrella` in `EstablishmentStructureView.vue`). ⚠️ **Corretto il 2026-07-30:** questa
  riga proseguiva con «un drag degenerato in clic **toglie** l'ombrellone dalla selezione», ed è
  **falso** — la maniglia sta fuori dalla cella e non ha alcun percorso verso la selezione. La
  correzione alla radice è nella spec §5.2. Il drag resta disabilitato in «Seleziona», per un'altra
  ragione: là si costruisce una selezione multipla, e il drag multiplo è fuori scope.
- ⚠️ **La geometria non è provabile in questo repo.** `environment: 'jsdom'`
  (`apps/web-staff/vitest.config.ts:22`); nessun Playwright/Cypress in alcun `package.json`.
  Qualsiasi calcolo geometrico va estratto in una **funzione pura su rect iniettati**, oppure
  esercitato stubbando `getBoundingClientRect` **per elemento**, o nasce non verificato.
  ⚠️ **Corretto il 2026-07-30:** la coordinata era `:23` (è `:22`), e la prova esibita — un `grep -rn
  "getBoundingClientRect"` «→ zero righe» — era vera a questa data e non lo è più: l'implementazione
  lo chiama in `StructureRow.vue`.
- ⚠️ **`structureKeys` non contiene `dayMap`** (`useEstablishmentStructure.ts:9-15`: struttura,
  overview, `setupStatus`). Ma `map.service.ts:22,25,26` ordina con gli stessi campi: senza
  invalidarla, chi ha la Mappa aperta al banco resta con l'ordine vecchio.
- ✅ **`mutationResource` restituisce l'oggetto `useMutation` intero**
  (`packages/data-layer/src/useQueryResource.ts:31`): `isPending` e `variables` sono già leggibili.
  Un'anteprima ottimistica si fa nel componente **senza toccare TanStack né il package condiviso**.
- ⚠️ **Le due scene NON sono meccanicamente gemelle**, pur condividendo il CSS. La Mappa ha
  `.map-scroll` (`position:absolute; inset:0`) con mare/toolbar sticky *dentro* lo scroller; il
  Cantiere non ha `.map-scroll`: scorre in `.st-sand`, **fratello** delle bande.
- ⚠️ **`Row` non ha alcuna unicità di label**, né in DB né in `RowsService.create`. Due file
  «Fila 1» nello stesso settore sono già legali, e diventano indistinguibili in `rowName()` e nello
  snapshot `retiredFrom`.
- ⚠️ **`rates.service.create` non valida NIENTE della posizione** (`:33-55`): scrive `sectorId` e
  `rowId` senza controllare esistenza né coerenza. Una Rate incoerente è creabile **oggi**, con 201.
- ⚠️ **Il ramo edit di `PricingView.submitRate` omette `rowId`, `periodStart`, `periodEnd`**
  (`:346-352`), e `rates.service.update` scrive solo i campi `!== undefined`: modificare da UI una
  Rate che porta un `rowId` **ne conserva il rowId in silenzio**. Il fix del commento a `:344-345` è
  applicato a 4 dimensioni su 7.
- ⚠️ **`packages/contracts/dist` su `main` è STANTIO rispetto al suo `src`**: `src/index.ts:69` dice
  «ADR-0063, Decision 7», il `dist` committato dice «§5.1», ed entrambi vengono da `b8b4550`. È solo
  un commento, nessun impatto funzionale, ed è terreno di **D-068**. **Non risolverlo dentro D-038.**

### 4b. Documenti che mentono (verificato)

- **`ADR-0052:40`** dichiara che gli endpoint bulk sono `@Roles(Role.Admin)`. **In
  `apps/api/src/establishment/` non esiste alcun `@Roles`**: è `@RequiresPermission`. Un endpoint
  nuovo scritto seguendo l'ADR **fallirebbe** sul guard fail-closed.
- **`ADR-0020`** è derivato su tre punti: «anello **teal**» dove il codice è corallo
  (`UmbrellaCell.vue:53`), **quattro** stati dove ne esistono cinque (`:19-23`, incluso `covered`),
  e chiama il componente `OmbrelloneCell`, nome morto dal rename inglese (ADR-0030).
- **`D-040`** risulta 🔓 aperta descrivendo «~406 righe / 5 modali» di
  `EstablishmentStructureView.vue`, che oggi è **165 righe senza modali**.
- **`design-system.md:855`** promette «un test in CI che calcola il rapporto di contrasto» e
  **`:864`** «solo token, verificato da lint». **Nessuno dei due esiste**: `eslint.config.mjs` (91
  righe, letto per intero) ha solo `no-unused-vars`, il divieto di `IsUUID` su `apps/api`,
  `no-explicit-any` a warn nei test e due regole spente.

*(Tutte e quattro sono già nel Task 10 del piano, che l'utente ha scelto di tenere nello scope.)*

### 4c. Ereditati e ancora validi

- ⚠️ **Su Windows OGNI primitiva di sleep è quantizzata a ~15,6 ms.** Per latenze sotto i 15 ms
  serve uno **spin su `process.hrtime.bigint()`**.
- ⚠️ **Non passare testo con backtick a `node -e` dentro Bash**: la shell li interpreta come command
  substitution e li **cancella in silenzio**. Per Markdown, accenti e non-ASCII usa Edit/Write.
  ⚠️ **Vale anche dentro uno script di Workflow**: un backtick in un template literal rompe il
  parse. In questa sessione è successo.
- ⚠️ **Molti file del repo sono CRLF**: un `replace` che cerca `\n` non matcha nulla. Usa Edit.
- ⚠️ **`packages/contracts/dist` è tracciato in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE e
  va committato.** Distinguili con `git diff --numstat`.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build dei contracts un dev server già avviato
  serve la copia vecchia e i simboli nuovi sono `undefined`. Serve `--force`.
- ⚠️ **`@coralyn/contracts` è CommonJS**: niente tree-shaking, chi importa qualcosa si porta il
  modulo intero.
- ⚠️ **Su `Button.vue` il `disabled` passato come fallthrough VINCE** sul `:disabled` interno: ogni
  `:disabled` su un `Button` deve **ripetere** la condizione di loading.
- ⚠️ **In TanStack Query v5 `isLoading = isPending && isFetching`**: con `enabled:false` il primo è
  **falso** e il secondo **vero**. Guarda quale usa il widget prima di concludere.
- ⚠️ **Esistono DUE presìdi che pretendono RLS**: `rls-isolation.e2e-spec.ts` e
  `apps/api/prisma/reset-dev.core.ts`. Il secondo emerge solo con la suite e2e **completa**.
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
- ⚠️ **Il parser di `deferred-registry.ts`** pretende indice ordinato per numero, anchor = ID,
  indice e voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al totale.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi**: per la prova
  visiva chiedi all'utente di entrare nella Browser pane.
- ⚠️ **Il merge su `main` può essere negato dal classificatore dei permessi.** Non aggirarlo con
  `reset --hard` o con un push che riscrive `main`: riprova, e se resta bloccato chiedilo all'utente.
- **`forTenant` vuole un `TenantId`, non una `string`.** **`@IsUUID` vietato** → `@IsUuidShape()`.
  **`ApiError` SEMPRE da `@coralyn/data-layer`.** **P2003 → 409.**
- **e2e `maxWorkers: 1`**, suite di pacchetti diversi **una alla volta** (in parallelo su questo host
  danno falsi rossi di massa), **calendario e2e congelato al 2026-07-15**.
- **Su template Vue usa `Edit`, non regex.**

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `brainstorming` +
  `design-docs` prima di toccare dominio, dati, flussi o decisioni. `systematic-debugging` **prima**
  di proporre un fix. `compliance-docs` per legale/GDPR.
- ⚠️ **Questo utente delega la scelta strutturale.** Vuole leggere l'analisi, non farla: **arriva con
  una raccomandazione argomentata e poi esegui.** «Meno pigra» **non** vuol dire più invasiva.
  «La soluzione meno pigra, più professionale, senza debiti» è una **DELEGA**: decidi e argomenta.
- ⚠️⚠️ **«Sii sempre scettico» è un'istruzione permanente data in questa sessione.** Vale verso i
  documenti, verso i subagenti, e verso te stesso.
- **Nessun merge su `main` senza ok esplicito.** Una slice = un branch = **un commit denso**, poi
  fast-forward e push. ⚠️ Ma **non lasciare nulla solo in locale a fine sessione**: si lavora su più
  macchine. Spingere il **branch** non è un merge.
- **Ogni fix alla radice.** Se la radice è fuori portata, dillo e lascia il finding aperto.
- **Un finding è un'ipotesi, non un verbale. Misura il PROBLEMA prima di risolverlo.**
- **Riproduci prima di correggere, e prova la mutazione nei due versi**, contando *quanti* e *quali*
  test diventano rossi, **e dichiarando in quale runner**. ⚠️ Vale anche per i presìdi che scrivi tu.
- **Correggi il testo falso, non annotarlo sotto.**
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (workflow ~8-20 min, e2e ~10-15, review avversariale ~20).
- ⚠️ **Un gate verde NON è una review, e vale anche per le correzioni.** Fai la review avversariale
  prima di chiedere il merge, anche quando «stai solo correggendo».

### 5b. La distinzione che ha deciso questa intera sessione

⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.**

- **Capacità** = il codice lo permette (schema, engine, DTO).
- **Percorso reale** = esiste un flusso che ci arriva partendo da un gesto in una UI esistente.

L'errore che ho commesso **tre volte**, e che **un subagente confutatore ha rifatto**, è sempre lo
stesso: leggere `pricing.engine.ts` che filtra per `rowId`, e concluderne che il prezzo dipende
dalla fila. **`PricingView.vue` non ha alcun controllo per la fila e `submitRate()` non emette mai
`rowId`.** L'engine sa farlo; il prodotto non ci arriva.

**Quando scrivi una claim, dichiara sempre di quale delle due si tratta.**

### 5c. Cosa ha pagato

- **Workflow piccoli e in sequenza**, non uno enorme. L'utente lo ha chiesto esplicitamente
  (costo di token) e si è rivelato meglio anche per la qualità: si legge un esito alla volta.
- **Agenti a cui è VIETATO citare i `.md`** — e anche **i commenti dentro il codice**, che sono
  documentazione infiltrata in un `.ts`. Fonte ammessa: solo codice eseguibile.
- **Ogni affermazione con `file:riga`; ogni asserzione di assenza con il COMANDO ESATTO** e il suo
  esito. Un'assenza senza comando è un'opinione.
- ⚠️ **Un agente CONFUTATORE per workflow**, con l'istruzione di demolire e non di riassumere. In
  due workflow su due ha smontato **due tesi su quattro**, comprese le mie.
- ⚠️ **Un «vaccino» nel prompt degli agenti** contro l'errore specifico già commesso. Ha funzionato:
  l'agente vaccinato ha verificato e confermato invece di ripetere lo sbaglio.
- **Misurare sul DATABASE, non solo sul codice.** Tre decisioni di progetto sono cambiate dopo
  quattro `SELECT`: che nessuna tariffa sia posizionale, e che gli ordini siano **densi**.
- **Rigreppare i propri edit.** Dopo aver applicato le correzioni dell'audit, un `grep` ha trovato
  **due residui** che gli edit avevano mancato.

### 5d. Errori miei, da non ripetere

1. **Ho detto che il prezzo dipende da Settore/Fila citando un ADR**, senza eseguire. La fila è
   capacità morta.
2. **Ho proposto un «layer di presentazione» che era una feature sopra l'esistente**: coordinate
   accanto a `sortOrder` = due risposte alla domanda «dov'è l'ombrellone 47».
3. **Ho detto che `presentationPosition` non richiede migration.** Falso se l'ordine deve *derivare*
   dalla posizione: Prisma 5.22 non ha `path` nell'`orderBy` su Json.
4. **Ho detto che l'effetto sul prezzo è confinato al confine di settore.** L'API accetta tariffe per
   fila e non le valida: era un'ipotesi sui dati, non una proprietà del sistema.
5. **Ho suonato l'allarme sul prezzo senza verificare se esistesse una tariffa per settore.** Non ne
   esiste nessuna.
6. **Spec e piano si contraddicevano** (`ConfirmDialog` contro un componente nuovo) e il mio
   autoreview di coerenza interna **non l'ha visto**: l'ha trovato solo l'audit che è andato a
   leggere il codice del primitivo.

Il filo, ormai su sette sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.** Il
corollario di questa: **la fonte più pericolosa non è il documento sbagliato, è il codice che
sembra vivo e non è raggiungibile.**

---

## 6. Da dove ripartire

### 6.1 Il lavoro, in ordine

**Il piano è [2026-07-28-drag-reorder-ombrelloni-d038](../superpowers/plans/2026-07-28-drag-reorder-ombrelloni-d038.md),
la spec è [2026-07-28-drag-reorder-ombrelloni-d038-design](../superpowers/specs/2026-07-28-drag-reorder-ombrelloni-d038-design.md).**
Dieci task. Si parte dal **Task 1**.

⚠️ **L'utente ha chiesto di vedere insieme i primi tre task** (contratto, endpoint, fixture) prima
che l'agente prosegua da solo.

⚠️ **Il Task 3 è bloccante e va prima dei test, non dopo.** Il database di sviluppo ha **1 solo
settore e nessuno `special`** (misurato: 2 lidi, 1 settore, 2 file, 199 ombrelloni attivi, 1
ritirato, 2 prenotazioni). Lo spostamento fra settori — **il caso per cui la slice esiste** — e il
rifiuto `grid → special` **non hanno oggi dati su cui girare**. Senza le fixture, la feature si
dichiara verde senza aver mai provato ciò per cui è stata scritta.

### 6.2 I fatti misurati che reggono il disegno

Non rimisurarli, ma sono tutti ancorati e riverificabili.

| Fatto | Dove |
|---|---|
| **Nessuna migration serve.** `logicalOrder` esiste dal primo init, è assegnato e già usato per ordinare. Mancava solo poterlo cambiare | `schema.prisma:250` |
| **La scrittura sono DUE istruzioni**, non N: `updateMany` con `increment` su un intervallo + un `update`. Verificato esprimibile: `UmbrellaUpdateManyMutationInput.logicalOrder` accetta `IntFieldUpdateOperationsInput`, che ha `increment` | client generato `:38505` e `:43296-43302` |
| **Gli ordini sono DENSI**: `Fila 2` va da 2 a 101 **senza buchi**. Per questo «assegna un valore in mezzo» non funziona | misurato su `coralyn_dev` |
| **Nessun indice unico** su `sortOrder`/`logicalOrder`: buchi e duplicati sono già legali | grep su tutte le migration |
| **`Booking.totalPrice` è uno snapshot** scritto solo alla create; nessuno dei 7 `booking.update` lo riscrive; nessun ricalcolo esiste. **Spostare non riscrive la storia** | `bookings.service.ts:379` |
| **Né `Booking` né `BookingCoverage` hanno `rowId`/`sectorId`**: puntano solo a `umbrellaId`. La prenotazione segue l'ombrellone | `schema.prisma:271`, `:343` |
| **5 tariffe in tutto il DB, ZERO posizionali.** Né il seed né l'onboarding ne creano | `SELECT` con `-U coralyn`; `seed.ts:222-267`; `StepRates.vue:31` |
| **L'unico canale in cui la posizione conta è il RINNOVO**: `renew()` copia `umbrellaId` e ripassa dal pricing, che risolve la posizione **corrente** | `bookings.service.ts:483 → :350`; `catalog.service.ts:173-175` |
| **`POST :id/move` è il fratello di `POST :id/retire` e `:id/restore`**, già presenti | `umbrellas.controller.ts:49,54` |
| **Zero drag in tutto il repo**, nessuna libreria (`konva`/`fabric`/`interactjs`/`dnd-kit`/`sortablejs`/`vuedraggable`: nessun `package.json`), **nessun `<svg>` scritto a mano in alcun `.vue`** | grep repo-wide |

### 6.3 Numeri liberi

**Prossimo ADR libero: 0065** (da scrivere nel Task 10: supera la clausola «niente drag&drop» di
ADR-0052 per il solo ombrellone).
**Prossime deferred libere: D-070 e D-071**, entrambe da aprire nel Task 10:

- **D-070** — la dimensione «fila» del listino: esporla in `PricingView`, chiudere la trappola
  dell'edit, o toglierla dal modello; più la coerenza `sectorId`/`rowId` non validata in
  `rates.service.ts:33-55`.
- **D-071** — il riordino sotto `lg`: il `Drawer` reka-ui azzera i pointer-events, quindi tablet e
  telefono restano scoperti.

**Prossima libera dopo quelle: D-072.**

### 6.4 Azioni dell'utente ancora pendenti

1. **Bloccanti legali**: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali.
3. **Igiene branch** — `feat/permessi-configurabili-d063` è mergiato e si può cancellare.
4. **AUD-015** (immagine Docker API single-stage come root) resta urgente **il giorno del primo
   deploy e non un giorno prima**: non esiste alcun VPS.

---

## 7. Ancore

- **La slice**: [spec](../superpowers/specs/2026-07-28-drag-reorder-ombrelloni-d038-design.md) ·
  [piano](../superpowers/plans/2026-07-28-drag-reorder-ombrelloni-d038.md) ·
  [D-038](../architecture/deferred.md#d-038) · [D-005](../architecture/deferred.md#d-005)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts)
- **Il prezzo**: [`pricing.engine.ts`](../../apps/api/src/catalog/pricing.engine.ts) ·
  [`catalog.service.ts`](../../apps/api/src/catalog/catalog.service.ts) ·
  [`PricingView.vue`](../../apps/web-staff/src/features/pricing/PricingView.vue)
- **La Mappa**: [`map.service.ts`](../../apps/api/src/map/map.service.ts) ·
  [`MapView.vue`](../../apps/web-staff/src/features/map/MapView.vue)
- **Decisioni**: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0005](../architecture/decisions/0005-modello-mappa.md) ·
  [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) ·
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) ·
  [ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)
- **Deferred**: [deferred.md](../architecture/deferred.md)
- **Handoff precedente**: [2026-07-28 D-063 chiusa e mergiata](2026-07-28-d063-chiusa-e-mergiata.md)
