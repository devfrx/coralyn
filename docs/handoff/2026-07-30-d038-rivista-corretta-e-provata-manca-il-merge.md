# Handoff 2026-07-30 (sessione 15): D-038 è stata rivista, corretta e provata a schermo. Manca solo il merge.

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-30 implementata, mancano review e prova visiva](2026-07-30-drag-reorder-implementata-mancano-review-e-prova-visiva.md),
> che resta **superato** — e che su un punto **diceva il falso** (§4.1 qui sotto).
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**La feature D-038 è implementata, rivista avversarialmente, corretta in 17 commit e provata a
schermo. Tutti i gate sono verdi, il branch è spinto e NON mergiato.** Manca **un solo passo**:
il merge, che richiede il tuo ok esplicito.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -12
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

`main` = **`68a061c`** (intatto). Il lavoro vive su **`feat/drag-reorder-ombrelloni-d038`**,
spinto, **31 commit** sopra `main`: 14 di costruzione (sessioni 13-14) e **17 di correzione**
nati dalla review di questa sessione.

Poi, in ordine: **§1 (ambiente)**, **§2 (cosa non si rilitiga)**, **§3.5 (baseline)**,
**§4 (gotcha)**, **§5 (metodo)**, **§6 (da dove ripartire)**.

⚠️ **Non riaprire il disegno della feature.** Il §2 elenca le tredici decisioni chiuse.
⚠️ **Non rifare la review.** Il §3 dice cosa ha trovato e cosa è stato corretto.

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

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** **Sei** handoff di fila li hanno dati per
assenti ed erano tutti al loro posto — anche in questa sessione, dove li ho verificati in apertura:
`.env` e `apps/api/.env` erano byte-identici, 1344 byte. Se mancano davvero i **valori** (JWT dev,
password di `admin@coralyn.dev` e `super@coralyn.dev`), quelli sì vanno chiesti all'utente:
**il repo è PUBBLICO.**

⚠️ `JWT_SECRET` contiene la stringa `change-me` ma **non** è il segnaposto di `.env.example`.
Confronta col template, non col testo.

### 1b. La sequenza che porta a un verde

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @coralyn/contracts build
pnpm --filter @coralyn/api exec prisma generate
```

⚠️ **`prisma generate` PRIMA del typecheck**, sempre.

### 1c. Docker, il seed, e la trappola della shell

⚠️⚠️ **È successo di nuovo in questa sessione, ed è la trappola più costosa del repo.**
`SEED_ON_START=false docker compose …` è sintassi **bash**: in PowerShell il prefisso `VAR=x`
**non fa assolutamente nulla, in silenzio**, il seed parte lo stesso e `coralyn-api` muore con
exit 1. La forma che funziona:

```bash
$env:SEED_ON_START = "false"; docker compose --profile full up -d --build
```

⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: esistono
ombrelloni creati dall'app con label attive sotto uuid casuali, che collidono con l'indice parziale;
l'`upsert` del seed non li intercetta perché cerca su un'altra chiave. **Non "correggere" il seed** —
`docker-entrypoint.sh` dichiara il fallimento fatale di proposito, perché `SEED_ON_START=true` è una
richiesta esplicita e se non riesce va detto invece di partire con un database a metà.

Il sintomo, per riconoscerlo al volo nel log di `coralyn-api`:
`Invalid tx.umbrella.upsert() invocation … Unique constraint failed … code: 'P2002'`, preceduto da
`No pending migrations to apply` — cioè le migration sono passate e a morire è **solo** il seed.

- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.
- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- ⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Usa
  `prisma migrate diff … --script`, scrivi a mano la migration, poi `migrate deploy`.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**
- ⚠️ **Per ispezionare i dati serve l'utente `coralyn`** (superuser, BYPASSRLS): con `coralyn_app`
  l'RLS ti dà zero righe e la verifica *sembra* pulita.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- ⚠️ **Python NON è installato.** Un `grep -rn` ricorsivo su tutto il repo va in **timeout**: usa lo
  strumento Grep.
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Tutte prese **con l'utente**, implementate, riviste e provate.

| # | Decisione | Dove vive |
|---|---|---|
| 1 | **Lo scope è D-038, non D-005.** Riordino **logico**; `Umbrella.presentationPosition` non si tocca | ADR-0065 §Neutre |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile né selezione multipla trascinabile | ADR-0065 §1 |
| 3 | **Destinazione: una fila del proprio settore o di un altro dello stesso `kind`.** Mai `grid → special` | ADR-0065 §4 |
| 4 | **Sul prezzo: disclosure, non blocco**, estesa anche a `restore` | ADR-0065 §6 |
| 5 | **Nessun equivalente da tastiera → la feature è solo `lg+`.** Il caso scoperto è D-071 | ADR-0065 §10 |
| 6 | **File e settori NON si riordinano.** D-038 è chiusa **solo per l'ombrellone** | deferred.md, voce D-038 |
| 7 | **Tab a molla** per raggiungere un altro settore | ADR-0065 §9 |
| 8 | **`hasDedicatedRates` calcolato dal server** | ADR-0065 §7 |
| 9 | **`position` è l'indice FINALE**, non l'indice d'inserimento | ADR-0065 §3 |
| 10 | **Maniglia fuori dalla cella**, `<span>` non `<button>`, `aria-hidden`, non focalizzabile | ADR-0065 §8 |
| 11 | **HTML5 drag-and-drop nativo, nessuna libreria** | ADR-0065 §11 |
| 12 | **`POST :id/move` risponde 200** (`@HttpCode(200)`) | ADR-0065 §Neutre |
| 13 | 🆕 **L'invalidazione NON viene attesa** dentro `mutationResource` | §3.3 qui sotto |

⚠️ Sul punto 5: l'utente ha scelto **conoscendo il trade-off**. Non riproporlo.

---

## 3. La review avversariale: cosa ha trovato, e cosa è stato fatto

### 3.1 La forma

**Tre passaggi distinti** — API, frontend, documenti — **non** un workflow unico. Ogni passaggio:
quattro lenti indipendenti, poi **un confutatore ostile per ogni finding**, con verdetto a tre
valori (refutato / confermato / **incerto**), perché un verdetto binario nasconde i casi in cui la
refutazione non ha deciso.

**46 agenti. 46 finding grezzi → 40 unici → 34 confutati: 25 CONFERMATI, 9 REFUTATI.**

Ai subagenti era **vietato**: citare un `.md` come prova, citare un commento nel codice come prova,
asserire un'assenza senza il comando esatto, **eseguire qualsiasi suite di test**, e modificare file.

⚠️ **Ha pagato 5 volte su 5.** E ha trovato difetti **dentro le correzioni** tre volte su sei: nel
Task 3 un commento di test che dichiarava una copertura inesistente; nel Task 5 una scelta del
controllore che riapriva il difetto su un innesco diverso; nel Task 6 una correzione che
**introduceva** una nuova falsità. **Un gate verde non è una review, e vale anche per le correzioni.**

### 3.2 I difetti che contavano

| Difetto | Chi l'ha trovato |
|---|---|
| **Rilasciare nella banda dove il ghost «+» è andato a capo scriveva una posizione in TESTA** invece che in coda | lente «gesto»; il confutatore ha provato sei vie di fuga senza riuscirci. **Confermato a schermo** su una fila da 104 ombrelloni |
| `move` concorrente con `retire` **resuscitava un ritirato**: la scrittura finale non ripeteva `retiredAt` | lente «guardie» |
| **Il `preventDefault` del `dragover` non era coperto da nulla**: cancellarlo uccide l'intero gesto e la suite resta verde | lente «copertura» |
| Il confronto fra `kind` **non era mai provato COME confronto**: in tutti i presìdi l'origine era `grid` | lente «copertura» |
| Il tab **accettava il rilascio senza gestore di drop**; la molla **ripartiva da zero** attraversando l'etichetta «N posti» | lente «gesto» |
| **La day-map era invalidata per una sola data**, ma lo spostamento cambia l'ordine di tutte | lente «mutazione» |
| **Su fallimento nulla ri-sincronizzava**, e proprio 404/422 significano «il tuo albero è vecchio» | lente «mutazione» |
| **L'anteprima ottimistica rimbalzava**: la cella tornava indietro e poi risaltava | lente «aritmetica» |
| Due dialoghi gemelli, **uno corretto e uno lasciato col testo falso** | **review finale d'insieme** — nessuna review di singolo task poteva vederlo |

### 3.3 La decisione strutturale, e perché

Il rimbalzo dell'anteprima si toglieva **attendendo** l'invalidazione dentro `mutationResource`.
Misurato: attendendo **spariscono quattro toast di conferma** di azioni distruttive, perché
`mutationObserver` esegue le callback passate a `mutate(vars, {onSuccess})` **solo se l'osservatore
ha ancora ascoltatori**, e la rilettura attesa smonta il pannello che le ha registrate.

⚠️ **Decisione: non attendere.** La ragione non sono i quattro toast: attendendo, **ogni** callback
per-chiamata di **tutte e tre le app** diventerebbe condizionale alla sopravvivenza del componente
chiamante — una trappola per il codice futuro. Spostare i toast risolve i casi noti e **lascia in
piedi la trappola**.

Il rimbalzo è invece un difetto **locale** di una feature locale — l'anteprima ottimistica esiste in
un solo punto del monorepo — e si corregge lì. L'invariante finale:

> **La finestra dell'anteprima vale se e solo se a schermo c'è la stessa lettura su cui l'anteprima
> è stata calcolata** (fotografia di `dataUpdatedAt` presa alla scrittura accettata).

Il revisore ha provato a riaprirla con tre sequenze costruite a mano e non ci è riuscito.

### 3.4 Cosa NON è stato corretto, e dove vive

- **`hasDedicatedRates` è cieco alle tariffe di FILA**, che nel motore battono il settore
  (`pricing.engine.ts`: fila = criterio 2, settore = 3). ⚠️ Ma **nessuna UI scrive `rowId`**: è
  **capacità senza percorso reale** → integrato in **D-070**, che è esattamente quella voce.
- **Il rename del settore d'origine può sopprimere la disclosure del ripristino** (risoluzione per
  nome, non per id) → **D-072**.
- **La Scheda cliente non è invalidata dalle mutazioni di struttura** → **D-073**, e la voce dichiara
  che è **preesistente** a D-038.
- **`.st-row-drop` ha specificità inferiore a `.st-row:hover`** e potrebbe essere codice morto →
  **D-074**. ⚠️ La voce è scritta come **possibilità misurata sulla cascata, non come fatto
  osservato**: alla prova visiva non è stata risolta. Non trasformarla in un fatto senza guardarla.
- **Il drag image è il pallino da 15 px della maniglia**, non l'ombrellone: **confermato a schermo**,
  lasciato così per scelta dell'utente. Un `setDragImage` sono due righe, se un giorno dà fastidio.
- **La maniglia non sbiadisce insieme alla sua cella** e conserva l'anello corallo, perché `:hover`
  si congela sulla sorgente al `dragstart`: **confermato a schermo**, effetto collaterale accettato.
- ⚠️ **`useRenewals` invalida `['map']` e `['subscriptions']` senza segmento tenant.** Ora che
  l'invalidazione parte **anche sui fallimenti**, un rinnovo respinto scatena una raffica di
  riletture che prima non partiva. Non è scorretto e non è di questa slice — ma è il primo effetto
  collaterale reale del cambiamento, e conviene saperlo.

### 3.5 La baseline nuova

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) |
| api unit | `pnpm --filter @coralyn/api test` | **448 (61)** |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | **34 (5)** |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **556 (64)** |
| tutto insieme | **`pnpm run test`** | **1387 / 189** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **542 / 45** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

**Su `main` la baseline è ancora 1268/185 e 529/44.** La review ha aggiunto **+27 presìdi senza un
solo file nuovo**: sono tutti casi che i file esistenti non coprivano.

⏱️ `pnpm run test` ~8 min, `test:e2e` ~2,5 min. Se i numeri non tornano è l'ambiente, non il codice.

---

## 4. Gotcha

### 4.1 ⚠️ Il testo che l'handoff precedente sbagliava

L'handoff superato affermava, al §4b: «Ma il confine `ui-kit` **sì**: `no-restricted-imports` è
reale». **È falso, misurato.** Il repo ha **un solo** file di config eslint; il suo unico blocco
`no-restricted-imports` contiene **una sola voce**, il divieto di `IsUUID` da `class-validator` su
`apps/api/**/*.ts`; e l'unica occorrenza della stringa «ui-kit» in quel file è dentro un commento su
una regola **diversa**. **Del confine `ui-kit` non esiste alcun presidio di lint.**

La spec accusata di «esagerare di mezzo» dicendo «due gate inesistenti» **aveva ragione su entrambi**.
È il caso-scuola di una *correzione* che sostituisce un'affermazione vera con una falsa — e che poi
migra nel documento d'ingresso.

### 4.2 I letali

- ⚠️⚠️ **La scena dell'editor rende UN SOLO settore per volta.** Le file di un altro settore **non
  sono nel DOM**. È il caso-scuola di «capacità ≠ percorso reale»: senza i tab a molla, lo spostamento
  fra settori sarebbe stato capacità dell'API senza percorso nel prodotto.
- ⚠️⚠️ **`ValidationPipe` è senza `forbidNonWhitelisted`**: un campo non dichiarato nel DTO viene
  **scartato in silenzio, con 200**.
- ⚠️⚠️ **NESSUNA query filtra `retiredAt`**: l'esclusione di un ritirato dipende **solo** dal
  `rowId = null` che `retire` azzera. Ogni scrittura nuova su `rowId` ha bisogno della guardia.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** e `authorization-coverage` legge «metodo ?? classe»:
  un endpoint nuovo eredita il permesso **in silenzio**, senza rossi e senza 403.
- ⚠️⚠️ **Attendere l'invalidazione uccide le callback per-chiamata.** Vedi §3.3: è la scoperta più
  costosa della sessione, e non è documentata da nessuna parte in TanStack.
- ⚠️ **`invalidateQueries` passa `cancelRefetch: true` di default.** È ciò che salva la finestra
  dell'anteprima nel doppio spostamento: una rilettura già in volo col payload vecchio viene
  cancellata. Se un domani si passasse `cancelRefetch: false`, la cella tornerebbe indietro.
- ⚠️ **Prisma 5.22 compila un `update` con `where` esteso in UNA SOLA statement**
  (`UPDATE … WHERE id = $2 AND "retiredAt" IS NULL RETURNING …`) — **misurato**, con il controllo
  accanto alla sonda: il `where` semplice produce `AND 1=1`. Quindi la guardia **chiude** la corsa,
  non la restringe. Non darlo per scontato su una versione diversa: rimisuralo.
- ⚠️ **`CLOSURE_MARKERS` di `docs-lint` è case-sensitive** (`/CHIUSA|CHIUSO|…/`).
- ⚠️ **`git add packages/contracts/dist/*` stampa un avviso «paths are ignored»** ma **stage lo
  stesso**: l'avviso fa fallire una catena `&&`, non è un errore.

### 4.3 Test — come si scrivono qui

- ⚠️ **Oltre 20 asserzioni indicizzano `[data-testid="scene-cell"] button` PER POSIZIONE.** Un
  secondo `<button>` là dentro le arrossa tutte senza difetti reali.
- ⚠️ **jsdom restituisce rettangoli a ZERO.** La geometria si prova solo iniettando i rect in
  funzioni pure, o stubbando `getBoundingClientRect` per elemento.
- ⚠️ **Le spec e2e sulla STRUTTURA costruiscono le fixture inline**: sono cinque su cinque.
  `seedMapTenant` è per le suite in cui la struttura è incidentale, ed è usato da 16 file di cui due
  asseriscono la **cardinalità** del mondo seedato. **Non estenderlo.**
- ⚠️ **`Select` di ui-kit è reka-ui**: usa `selectOption(trigger, label)` da `@/test/utils`.
- **Per asserire un'invalidazione**: passa le chiavi al `QueryCache` **vero** e confronta l'**insieme
  esatto** delle voci scadute. Asserire la forma della chiave non distingue un prefisso troppo
  stretto da uno troppo largo.
- **Per distinguere un'anteprima ottimistica da un refetch**: handler MSW che risolve solo quando lo
  rilasci tu, **e** la GET che restituisce l'albero **post**-spostamento. Senza la seconda metà il
  test non distingue il rimbalzo dalla verità del server.
- **e2e `maxWorkers: 1`**, calendario congelato al **2026-07-15**, suite di pacchetti diversi **una
  alla volta** (in parallelo su questo host danno falsi rossi di massa).

### 4.4 Ereditati e ancora validi

- ⚠️ **Non passare testo con backtick a `node -e`** né dentro uno script di Workflow: la shell li
  cancella in silenzio. Per Markdown e non-ASCII usa **Edit/Write**.
- ⚠️ **Molti file sono CRLF**: un `replace` che cerca `\n` non matcha nulla.
- ⚠️ **`packages/contracts/dist` è tracciato e in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE.**
  Distinguili con `git diff --numstat`. È terreno di **D-068**.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build serve `--force`.
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi.**
- ⚠️ **Il merge su `main` può essere negato dal classificatore.** Non aggirarlo con `reset --hard`
  né con un push che riscrive `main`: riprova, e se resta bloccato chiedilo all'utente.
- **`forTenant` vuole un `TenantId`.** **`@IsUUID` vietato** → `@IsUuidShape()`. **`ApiError` SEMPRE
  da `@coralyn/data-layer`.** **P2003 → 409.** **Su template Vue usa `Edit`, non regex.**

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `brainstorming` +
  `design-docs` prima di toccare dominio, dati, flussi o decisioni. `systematic-debugging` **prima**
  di proporre un fix. `compliance-docs` per legale/GDPR.
- ⚠️ **Questo utente delega la scelta strutturale.** «La soluzione più professionale, senza debiti e
  meno pigra» è una **DELEGA**: decidi tu e **argomenta**. ⚠️ **«Meno pigra» NON vuol dire «più
  invasiva»**: è il criterio con cui, in questa sessione, è stata scartata l'attesa dell'invalidazione.
- ⚠️⚠️ **«Sii sempre scettico» è un'istruzione permanente.** Verso i documenti, verso i subagenti, e
  **verso te stesso**. In questa sessione due revisori si sono contraddetti su un dialogo: aveva
  ragione il secondo, e per saperlo è servito **aprire il file**.
- ⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.** **Dichiara sempre di quale delle due stai parlando.**
- ⚠️⚠️ **Una mutazione che non produce rossi prova l'assenza di COPERTURA, non l'assenza del
  difetto.** In questa sessione l'ho letta al contrario, accettandola come prova di idempotenza: la
  review ha poi **costruito a mano** la sequenza mancante e ha mostrato che la funzione non era
  idempotente. Se una mutazione non arrossa, il passo successivo è costruire il caso che dovrebbe.
- **Nessun merge su `main` senza ok esplicito.** Ma **non lasciare nulla solo in locale a fine
  sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Misura il PROBLEMA prima di risolverlo, e il RAGGIO D'AZIONE prima di toccare.**
- **La mutazione come prova, nei due versi**, contando *quanti* e *quali* test diventano rossi, **e
  dichiarando in quale runner** (`jest` per l'API, `vitest` per il frontend).
- **Correggi il testo falso, non annotarlo sotto** — ma se era **vero quando fu scritto**, dillo:
  «superato», non «falso».
- **Rigreppa i tuoi edit**: la stessa affermazione falsa spesso vive in più punti. In questa sessione
  una viveva in **sei**.
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (`pnpm run test` ~8 min, e2e ~3, un passaggio di review ~20).
- **Workflow PICCOLI e in sequenza.** Ai subagenti **vieta di citare i `.md` e i commenti**, pretendi
  `file:riga` e il **comando esatto** per ogni asserzione di assenza, e mettici sempre un
  **confutatore**.

### 5b. Cosa ha pagato in questa sessione

- **Il confutatore ostile.** Su 34 finding ne ha refutati 9, e le refutazioni migliori hanno
  demolito la *catena di conseguenze* concedendo il fatto — è la forma che distingue un difetto da
  una divergenza cosmetica.
- **La review finale d'insieme.** Ha trovato l'unico Critical rimasto: un difetto corretto in un
  dialogo e **lasciato nel suo gemello**. Nessuna review di singolo task poteva vederlo.
- **Risolvere i ⚠️ invece di accettarli.** Il revisore del Task 1 aveva lasciato aperto se Prisma
  compilasse il `where` esteso in una o due statement: la differenza era fra «corsa chiusa» e «fix
  cosmetico». Misurarlo è costato dieci minuti.
- **Il controllo accanto alla sonda.** Un `UPDATE … AND "retiredAt" IS NULL` non prova nulla da solo:
  è il `where` semplice che produce `AND 1=1` a renderlo significativo.

### 5c. Errori miei, da non ripetere

1. **Ho accettato una mutazione senza rossi come prova di una proprietà.** Vedi §5a.
2. **Ho scelto la correzione del rimbalzo senza misurare che riapriva il difetto** su un innesco
   diverso: `isSuccess` non torna mai falso. L'ha trovato la review, non io.
3. **Ho approvato una review che aveva razionalizzato un testo falso** («le tariffe di to, generico o
   dedicato che sia»), quando il gemello corretto nello stesso branch asseriva l'opposto.

Il filo, ormai su nove sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.**

---

## 6. Da dove ripartire

### 6.1 L'unico passo che resta

**Il merge.** Fast-forward su `main`, push. **Mai senza ok esplicito dell'utente.**

⚠️ Se il classificatore dei permessi lo nega, **non aggirarlo**: riprova, e se resta bloccato
chiedilo all'utente.

### 6.2 Lavoro successivo, quando D-038 sarà mergiata

- **D-071** (sotto `lg` il riordino non esiste) — l'ipotesi più probabile è il controllo
  «Sposta in…» nel pannello ombrellone.
- **D-070** (la dimensione «fila» del listino), ora integrata col caso della disclosure cieca.
- **D-072** (il rename che sopprime la disclosure), **D-073** (Scheda cliente non invalidata,
  preesistente), **D-074** (`.st-row-drop` forse codice morto — **da guardare a schermo**).
- **D-040** — ricalibrata: la lista chiavi icona è duplicata in **quattro** punti, non in uno.
  **Non è «quasi vuota»** come sostenevano i documenti precedenti.
- **D-068** — `packages/contracts/dist` tracciato e in CRLF.

### 6.3 Numeri liberi

**Prossimo ADR libero: 0066.** **Prossima deferred libera: D-075.**

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

- **La decisione**: [ADR-0065](../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md)
- **La slice**: [spec](../superpowers/specs/2026-07-28-drag-reorder-ombrelloni-d038-design.md) ·
  [piano](../superpowers/plans/2026-07-28-drag-reorder-ombrelloni-d038.md) ·
  [D-038](../architecture/deferred.md#d-038) · [D-070](../architecture/deferred.md#d-070) ·
  [D-071](../architecture/deferred.md#d-071) · [D-072](../architecture/deferred.md#d-072) ·
  [D-073](../architecture/deferred.md#d-073) · [D-074](../architecture/deferred.md#d-074)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue) ·
  [`umbrellaMove.ts`](../../apps/web-staff/src/features/establishment/umbrellaMove.ts)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts) ·
  [`umbrella-order.ts`](../../apps/api/src/establishment/umbrella-order.ts)
- **Il data-layer condiviso**: [`useQueryResource.ts`](../../packages/data-layer/src/useQueryResource.ts)
- **Decisioni collegate**: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) ·
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) ·
  [ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)
- **Design**: [design-system.md](../design/design-system.md)
- **Handoff precedente**: [2026-07-30 implementata, mancano review e prova visiva](2026-07-30-drag-reorder-implementata-mancano-review-e-prova-visiva.md)
