# Handoff 2026-07-31 (sessione 17): D-071 è mergiata e provata a schermo. Il prossimo lavoro è D-072, D-073, D-074.

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-31 (16) D-038 mergiata, il prossimo è D-071](2026-07-31-d038-mergiata-il-prossimo-e-d071.md),
> che resta **superato** solo perché il suo lavoro è finito: il suo contenuto è ancora vero, e da lì
> viene la maggior parte dei gotcha qui sotto.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**D-071 è chiusa, mergiata in `main` (`6d1ac98`) e provata a schermo dall'utente.** Non c'è lavoro in
sospeso. Il prossimo passo è la **coda corta**: **D-072**, **D-073**, **D-074**.

⚠️ **Nota di lettura sulla consegna.** L'utente ha chiesto «adr 71-74». D-071 è chiusa in questa
sessione e i numeri **ADR** liberi partono da **0067**, quindi la coda è stata letta come le voci
**deferred D-072 / D-073 / D-074**. Se intendeva altro, chiediglielo prima di partire: costa una
domanda e ne risparmia una sessione.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -8
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
**prima** di dichiarare che qualcosa non esiste.

`main` = **`6d1ac98`**. Nessun branch di lavoro aperto: `feat/sposta-in-pannello-d071` è stato
mergiato in fast-forward (la storia di questo repo è **lineare**: nessun merge commit per le slice).

Poi, in ordine: **§1 (ambiente)**, **§2 (cosa non si rilitiga)**, **§3 (baseline)**,
**§4 (gotcha)**, **§5 (metodo)**, **§6 (il lavoro)**.

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

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** **Otto** handoff di fila li hanno dati per
assenti ed erano tutti al loro posto — anche nella sessione 16, che aveva l'avviso in grassetto. Il
comando che chiude la questione in due secondi:

```bash
for f in .env apps/api/.env .env.test apps/web-staff/.env RUNBOOK.local.md; do [ -f "$f" ] && echo "OK $f" || echo "MANCA $f"; done
```

Se mancano davvero i **valori** (JWT dev, password di `admin@coralyn.dev` e `super@coralyn.dev`),
quelli sì vanno chiesti all'utente: **il repo è PUBBLICO.**

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

⚠️⚠️ **La trappola più costosa del repo.** `SEED_ON_START=false docker compose …` è sintassi
**bash**: in PowerShell il prefisso `VAR=x` **non fa assolutamente nulla, in silenzio**, il seed
parte lo stesso e `coralyn-api` muore con exit 1. La forma che funziona:

```bash
$env:SEED_ON_START = "false"; docker compose --profile full up -d --build
```

⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: esistono
ombrelloni creati dall'app con label attive sotto uuid casuali, che collidono con l'indice parziale;
l'`upsert` del seed non li intercetta perché cerca su un'altra chiave. **Non "correggere" il seed** —
`docker-entrypoint.sh` dichiara il fallimento fatale di proposito. Il sintomo, per riconoscerlo al
volo nel log di `coralyn-api`: `Invalid tx.umbrella.upsert() invocation … Unique constraint failed …
code: 'P2002'`, **preceduto** da `No pending migrations to apply` — cioè le migration sono passate e
a morire è **solo** il seed.

- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.
- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- ⚠️⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Usa
  `prisma migrate diff … --script`, scrivi a mano la migration, poi `migrate deploy`.
  ⚠️ **D-072 ha una migration**: questa riga ti servirà, ed è la prima della coda.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**
- ⚠️ **Per ispezionare i dati serve l'utente `coralyn`** (superuser, BYPASSRLS): con `coralyn_app`
  l'RLS ti dà zero righe e la verifica *sembra* pulita.
  Esempio: `docker exec coralyn-db psql -U coralyn -d coralyn_dev -c '…'`.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- ⚠️ **Python NON è installato.** Un `grep -rn` ricorsivo su tutto il repo va in **timeout**: usa lo
  strumento Grep.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi**: per una prova
  visiva chiedi all'utente di entrare lui nel browser. In alternativa
  `pnpm --filter @coralyn/web-staff dev` contro l'API in container.
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Diciannove decisioni prese **con l'utente**, implementate, riviste avversarialmente e mergiate.
Riaprirle significa rifare conversazioni già fatte.

⚠️⚠️ **CITA SEMPRE NELLA FORMA `ADR-00NN §N`, MAI «la decisione N».** I numeri di questa tabella
sono **di questa tabella**, non delle sezioni degli ADR, e le due numerazioni **non coincidono**.
Nella sessione 16 la confusione è finita in **sette** rimandi sbagliati dentro spec e piano: «la
decisione 5 di ADR-0065» mandava a leggere il 409 sui ritirati invece del vincolo `lg+`. L'ha
trovata la review dei documenti.

| # | Decisione | Dove vive |
|---|---|---|
| 1 | **Il riordino è LOGICO.** `Umbrella.presentationPosition` non si tocca: quello è D-005 | ADR-0065 §Neutre |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile né selezione multipla trascinabile | ADR-0065 §1 |
| 3 | **`position` è l'indice FINALE**, non l'indice d'inserimento | ADR-0065 §3 |
| 4 | **Destinazione: una fila del proprio settore o di un altro dello stesso `kind`.** Mai `grid → special` | ADR-0065 §4 |
| 5 | **Un ritirato non è spostabile: 409**, con la guardia ripetuta nella scrittura finale | ADR-0065 §5 |
| 6 | **Sul prezzo: disclosure, non blocco** — vale per lo spostamento e per il ripristino | ADR-0065 §6 |
| 7 | **`hasDedicatedRates` è calcolato dal server**, non dedotto nel frontend | ADR-0065 §7 |
| 8 | **Maniglia fuori dalla cella**, `<span>` non `<button>`, `aria-hidden`, non focalizzabile | ADR-0065 §8 |
| 9 | **Tab a molla** (sosta ~700 ms) per raggiungere un altro settore | ADR-0065 §9 |
| 10 | **Il TRASCINAMENTO è solo `lg+`**, e sotto quella soglia la maniglia **non si rende affatto** | ADR-0065 §10 |
| 11 | **HTML5 drag-and-drop nativo, nessuna libreria** | ADR-0065 §11 |
| 12 | **`POST :id/move` risponde 200** (`@HttpCode(200)`) | ADR-0065 §Neutre |
| 13 | **File e settori NON si riordinano.** D-038 è chiusa **solo per l'ombrellone** | deferred, D-038 |
| 14 | **L'invalidazione NON viene attesa** dentro `mutationResource` | §4.2 qui sotto |
| 15 | **Il controllo «Sposta» si rende a OGNI larghezza**, non solo sotto `lg` | ADR-0066 §2 |
| 16 | **La destinazione è fila E posizione**, non la sola fila con la coda implicita | ADR-0066 §3 |
| 17 | **Il pannello NON possiede la mutation**: emette, e la shell riusa lo **stesso** ingresso del trascinamento | ADR-0066 §5 |
| 18 | **Il toast è solo sul percorso del pannello**, non sul trascinamento | ADR-0066 §6 |
| 19 | **Il controllo DERIVA, non memorizza**: l'intenzione è facoltativa, e **cade come un blocco** | ADR-0066 §9 |

⚠️ **La 10 e la 15 non si contraddicono, e la sfumatura va tenuta ferma.** Il trascinamento è
ancora solo `lg+`. Il controllo «Sposta» è un **secondo canale**, non un'estensione del primo:
`:can-drag="isDesktop"` non si tocca e la maniglia continua a non rendersi sotto `lg`.

⚠️ **La 19 è la meno ovvia e la più facile da rompere.** Il controllo non ricorda dove volevi
mandare l'ombrellone: mostra **dove sta** finché non esprimi un'intenzione. Serve perché un
ombrellone può cambiare posto **senza cambiare identità** — lo trascini tu, o lo sposta un collega —
e uno stato memorizzato resta puntato dov'era, col bottone acceso su un ritorno indietro.

---

## 3. Baseline (`main` = `6d1ac98`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) |
| api unit (**jest**) | `pnpm --filter @coralyn/api test` | **448 (61)** |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 34 (5) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **586 (65)** |
| tutto insieme | **`pnpm run test`** | **1417 / 190** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **542 / 45** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

⏱️ `pnpm run test` ~8 min, `test:e2e` ~2,5. **Se i numeri non tornano è l'ambiente, non il codice.**

⚠️ **`pnpm run test` non stampa un totale**: è la somma di otto conteggi per pacchetto. E l'output è
**prefissato dal nome del pacchetto**, quindi un `grep` ancorato a inizio riga (`^ *Tests`) non
trova nulla e ti fa credere di aver misurato quando non hai misurato. ⚠️ **`apps/api` gira su jest**,
non vitest, e stampa `Tests: 448 passed, 448 total` — una forma diversa dalle altre sette. Cattura
tutto su file e leggi dopo.

---

## 4. Gotcha

### 4.1 I letali

- ⚠️⚠️ **La scena dell'editor rende UN SOLO settore per volta.** `StructureScene.vue` sceglie
  `current` e rende le sue file sotto un `v-if`; **le file di un altro settore non sono nel DOM**.
  Ma l'albero completo è in `data`: è la **resa** a essere parziale, non la sorgente.
- ⚠️⚠️ **`ValidationPipe` è senza `forbidNonWhitelisted`**: un campo non dichiarato nel DTO viene
  **scartato in silenzio, con 200**.
- ⚠️⚠️ **NESSUNA query filtra `retiredAt`**: l'esclusione di un ritirato dipende **solo** dal
  `rowId = null` che `retire` azzera. Ogni scrittura nuova su `rowId` ha bisogno della guardia.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** e `authorization-coverage` legge «metodo ??
  classe»: un endpoint nuovo eredita il permesso **in silenzio**, senza rossi e senza 403.
- ⚠️ **Il Drawer di reka-ui azzera i `pointer-events` del body** (`disableOutsidePointerEvents` è
  `true` di default su `DialogContentModal`) **e copre la scena con un `DialogOverlay` `fixed
  inset-0`**, mentre il pannello è `max-w-[calc(100vw-24px)]`: su un telefono da 390 px ne copre 366.
  Sotto `lg` non c'è scena da indicare, nemmeno se i pointer-event fossero vivi.

### 4.2 Trappole di TanStack Query (v5.101.1), misurate

- ⚠️⚠️ **Attendere l'invalidazione uccide le callback per-chiamata.** `mutationObserver` esegue le
  callback passate a `mutate(vars, { onSuccess })` **solo se l'osservatore ha ancora ascoltatori**;
  se la rilettura attesa smonta il componente che le ha registrate, quelle callback **non partono**.
  Misurato: attendendo sparivano quattro toast di conferma. **Per questo la decisione 14 dice di non
  attendere.** Non è documentato da nessuna parte in TanStack.
- ⚠️ **`invalidateQueries` passa `cancelRefetch: true` di default.** È ciò che protegge l'anteprima
  ottimistica.
- ⚠️ **`isLoading = isPending && isFetching`**: per una query con dati in cache è **false** durante
  un refetch di background, quindi nessuno skeleton copre la finestra.
- ⚠️ **`isPending` di una mutation cade quando risponde il POST, non quando atterra la rilettura.**
  Nella finestra fra le due l'albero a schermo è ancora quello vecchio. Se ci appoggi una guardia
  contro il doppio invio, sappi che quella guardia si apre prima di quanto credi.

### 4.3 Prisma

- ⚠️ **Prisma 5.22 compila un `update` con `where` esteso in UNA SOLA statement**
  (`UPDATE … WHERE id = $2 AND "retiredAt" IS NULL RETURNING …`) — **misurato**: una guardia scritta
  così **chiude** la corsa, non la restringe. Su una versione diversa, **rimisuralo**.
- **`forTenant` vuole un `TenantId`, non una `string`.** **`@IsUUID` è vietato dal lint** →
  `@IsUuidShape()`. **`ApiError` SEMPRE da `@coralyn/data-layer`.** **P2003 → 409.**

### 4.4 ui-kit e reka-ui — le trappole dei primitivi

- ⚠️⚠️ **`SelectValue` di reka-ui NON rende lo slot dell'item selezionato**: rende il testo di un
  **registro valore→testo costruito dagli item montati**. Se l'elenco delle `Option` cambia sotto
  (dati nuovi, filtro diverso) mentre il `modelValue` resta lo stesso, il controllo mostra
  **l'etichetta vecchia** — valore giusto, etichetta che mente. Rimedio: un `:key` sul `Select`
  derivato dal **contenuto** dell'elenco, non dall'identità degli oggetti. In `UmbrellaPanel.vue`
  ne servono **due**, uno per `Select`. **Non è teorico: è costato tre giri di test rossi.**
- ⚠️ **`Select` è `defineModel<string>()` e `Option` è `value: string`**: un numero non è legabile,
  va stringato e riconvertito all'invio.
- ⚠️ **`Select` di ui-kit è reka-ui, non un `<select>` nativo**: nei test si pilota con
  `selectOption(trigger, label)` da `@/test/utils`, mai con `setValue`.
- ⚠️ **Su `Button.vue` il `disabled` passato come fallthrough VINCE** sul `:disabled="loading ||
  undefined"` interno: ogni `:disabled` scritto insieme a `:loading` deve includere la condizione di
  pending nella **propria** espressione.
- ⚠️ **`Select` senza valore mostra un trigger VUOTO**: `SelectValue` non riceve `placeholder`.

### 4.5 Test — come si scrivono qui

- ⚠️ **27 asserzioni indicizzano `[data-testid="scene-cell"] button` PER POSIZIONE**
  (`grep -rnE 'scene-cell"\] button.\)\[' apps/web-staff/src --include=*.spec.ts`). Un secondo
  `<button>` là dentro le arrossa tutte senza difetti reali.
- ⚠️ **jsdom restituisce rettangoli a ZERO.** La geometria si prova solo iniettando i rect in
  funzioni pure, o stubbando `getBoundingClientRect` per elemento.
- ⚠️ **jsdom non implementa `matchMedia`**: senza stub `useMediaQuery` è sempre `false` e la shell
  rende **solo** il ramo Drawer. Il pattern per stubbarlo è in `EstablishmentStructureView.spec.ts`.
- ⚠️ **Le spec e2e sulla STRUTTURA costruiscono le fixture inline**: cinque su cinque.
  **Non estendere `seedMapTenant`**, usato da 16 file di cui due asseriscono la **cardinalità** del
  mondo seedato. Lo stesso vale per `STRUCTURE_FIXTURE` negli unit: due spec ne asseriscono i
  contatori.
- ⚠️ **La coda dei toast è module-scope e condivisa**, ma `apps/web-staff/src/test/setup.ts:6` chiama
  già `clearToasts()` in un `beforeEach` **globale**: non aggiungerne una seconda.
- **Per asserire un'invalidazione**: passa le chiavi al `QueryCache` **vero** e confronta l'**insieme
  esatto** delle voci scadute.
- **e2e `maxWorkers: 1`**, calendario congelato al **2026-07-15**, suite di pacchetti diversi **una
  alla volta**: in parallelo su questo host danno falsi rossi di massa (timeout di collection).
- ⚠️ **`watch(() => [a, b])` scatta a OGNI rilettura**: il getter restituisce un array nuovo e
  `Object.is` lo vede sempre diverso. Se ti serve una coppia come sorgente, usa una **stringa**.

### 4.6 Documenti, gate e shell

- ⚠️ **Non passare testo con backtick a `node -e`** né **dentro un template literal di uno script
  Workflow**: nel secondo caso il backtick **chiude la stringa** e lo script non compila. Costruisci
  i prompt con un array di stringhe e `.join('\n')`. Per Markdown usa **Edit/Write**.
- ⚠️ **Molti file sono CRLF**: un `replace` che cerca `\n` non matcha nulla. `sed -i '<n>d'` per
  cancellare una riga è però sicuro — non passa contenuto per la shell e non riscrive i fine-riga
  (verificato: `git diff --numstat` dà `0 1`).
- ⚠️ **`packages/contracts/dist` è tracciato e in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE.**
  Distinguili con `git diff --numstat`. È terreno di **D-068**.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build serve `--force`.
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
  ⚠️⚠️ **E controlla anche gli ANCHOR, non solo i path**: un link a `#d-076` prima che l'anchor
  esista è rosso. Un documento non può linkare il proprio esito.
- ⚠️⚠️ **`docs-lint` NON giudica la RESA Markdown.** Il parser di `deferred.md` legge riga per riga:
  un a-capo di troppo **spezza la tabella in due** e il gate resta **verde**. Dopo aver inserito una
  riga in una tabella, guardala.
- ⚠️ **`CLOSURE_MARKERS` di `docs-lint` è case-sensitive** (`/CHIUSA|CHIUSO|…/`).
- ⚠️ **Il parser di `deferred-registry.ts`** pretende: indice ordinato per numero, anchor = ID
  minuscolo, indice e voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al
  totale. **L'ordine delle VOCI non conta** (il confronto è per mappa), quello dell'**indice** sì.
  Se cambi il **titolo** di una voce, cambialo **anche nella tabella indice**.
- ⚠️ **L'indice degli ADR in `docs/architecture/README.md` non ha alcun presidio** (è
  [D-069](../architecture/deferred.md#d-069)) ed è già andato indietro **quattro volte**: aggiornalo
  a mano e verificalo a occhio.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.
- **Convenzione dei commit**: `tipo(scope): frase in italiano minuscolo (D-0NN)`, corpo che spiega
  il *perché*, e come ultima riga `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- ⚠️ **Il merge su `main` può essere negato dal classificatore.** Non aggirarlo con `reset --hard`
  né con un push che riscrive `main`: riprova, e se resta bloccato chiedilo all'utente. Le slice si
  mergiano in **fast-forward**: la storia è lineare.

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `brainstorming` +
  `design-docs` **prima** di toccare dominio, dati, flussi o decisioni. `systematic-debugging`
  **prima** di proporre un fix.
- ⚠️ **Questo utente delega la scelta strutturale.** «La soluzione più professionale, senza debiti e
  meno pigra» è una **DELEGA**: decidi tu e **argomenta**. Vuole leggere l'analisi, non farla.
  ⚠️ **«Meno pigra» NON vuol dire «più invasiva».**
- ⚠️⚠️ **«Sii sempre scettico» è un'istruzione permanente.** Verso i documenti, verso i subagenti, e
  **verso te stesso**.
- ⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.** Che il codice sappia fare una cosa non vuol dire che esista
  una UI che ci arriva. **Dichiara sempre di quale delle due stai parlando.**
- ⚠️⚠️ **Una mutazione che non produce rossi prova l'assenza di COPERTURA, non l'assenza del
  difetto.** Se non arrossa, **costruisci a mano** il caso che dovrebbe. Nella sessione 16 è successo
  su un ramo intero: staccando un evento dalla sola `InspectorPanels` del Drawer, **187 test su 187
  restavano verdi**.
- ⚠️⚠️ **Riproduci ogni finding come test ROSSO prima di correggerlo.** È l'unico modo di
  distinguere il difetto vero da quello plausibile, e il rosso diventa il presidio.
- ⚠️⚠️ **La prima correzione di un finding confermato può scambiare un difetto con un altro.** Nella
  16 il primo rimedio trattava la cancellazione di un vicino come uno spostamento, e buttava via la
  scelta in corso dell'operatore. **A vederlo è stato un presidio scritto per un altro caso.** Dopo
  ogni correzione, rigira la suite intera del pacchetto, non il solo file.
- ⚠️ **Un gate verde NON è una review, e vale anche per le correzioni.**
- **Misura il PROBLEMA prima di risolverlo, e il RAGGIO D'AZIONE prima di toccare.**
- ⚠️ **Correggi il testo falso, non annotarlo sotto** — ma se era **vero quando fu scritto**, dillo:
  «superato», non «falso». E ⚠️ **prima di dichiarare falsa un'affermazione, CONTALA**: nella 16
  «oltre 20 asserzioni» sembrava da correggere, e contate erano 27 — cioè vero. **Correggere un
  testo vero verso il falso è già successo due volte in questo repo.**
- **Rigreppa i tuoi edit**: la stessa affermazione falsa spesso vive in più punti. Nella 16 una
  viveva in **tre** file, e due erano il gemello non corretto del primo.
- **Nessun merge su `main` senza ok esplicito.** Ma **non lasciare nulla solo in locale a fine
  sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (`pnpm run test` ~8 min, e2e ~2,5, un passaggio di review avversariale ~20).

### 5b. La review avversariale, che ha pagato 8 volte su 8

Prima di proporre il merge di una slice non banale, l'utente la vuole. Forma della sessione 16, la
migliore finora:

- **Passaggi distinti, in sequenza** — non un workflow unico: quelli enormi non si governano.
  ⚠️ **Salta i passaggi senza materia**: nella 16 il passaggio API è stato omesso perché la slice non
  toccava una riga di `apps/api`, e un revisore senza materia produce rumore, non finding.
- Ogni passaggio: **quattro lenti indipendenti**, poi **deduplicazione per `file:riga`**, poi **un
  confutatore ostile per finding**.
- ⚠️ **Verdetto a TRE valori**: refutato / confermato / **incerto**. Un binario nasconde i casi in
  cui la refutazione non ha deciso, e sono proprio quelli che tocca misurare a te.
- ⚠️⚠️ **Una review finale d'insieme, DOPO le altre.** È l'unica che vede i **gemelli** — pezzi
  quasi identici dove una correzione fatta in uno e non nell'altro passa inosservata. Nella 16 ha
  trovato **più di entrambe le altre** (7 confermati su 8), compreso il caso da manuale: una formula
  emendata in un ADR e **lasciata identica in altri due file, nello stesso commit**.
- ⚠️ **Zero refutati è un segnale SOSPETTO, non un buon risultato**: vuol dire confutatori
  accondiscendenti o lenti troppo caute. Nella 16 il passaggio frontend ne ebbe zero, quello dei
  documenti due — e lì i verdetti valevano di più.
- Ai subagenti **vieta**: citare un `.md` come prova, citare un commento nel codice come prova,
  asserire un'assenza senza il **comando esatto**, **eseguire qualsiasi suite di test**, modificare
  file. Pretendi `file:riga` e uno scenario con input e output sbagliato.
- ⚠️ **Dichiara ai revisori le decisioni già prese** (§2), o te le riportano come difetti.
- ⚠️ **Dì loro di verificare lo STATO ATTUALE**, non un diff intermedio: dopo due tornate di
  correzioni, un revisore che legge un commit vecchio segnala cose già risolte.
- ⚠️ **Leggi le refutazioni per intero, non solo i verdetti**, e **verifica di persona ogni finding
  prima di agire**.
- ⏱️ ~20 minuti a passaggio. **Chiedi il via all'utente: costa token.**
- I risultati completi stanno nel **file di output** del task, non nella notifica, che è troncata.

### 5c. Errori delle sessioni precedenti, da non ripetere

1. **Accettare una mutazione senza rossi come prova di una proprietà.** Prova solo che manca la
   copertura.
2. **Scegliere una correzione senza misurarne il raggio d'azione.**
3. **Correggere un testo vero verso il falso**: due volte, in due sessioni diverse. La prova è
   **sempre** il sorgente.
4. **Aggiungere un rimedio per analogia senza misurare se il difetto c'è.** Nella 16 il secondo
   `:key` è stato aggiunto **solo dopo** che un test scritto apposta è arrossato.
5. **Scrivere un presidio che passa per la ragione sbagliata.** Nella 16 un test asseriva il testo
   di un `Select` dove due stati diversi producono lo **stesso** testo: verde, e cieco.

Il filo, ormai su dieci sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.**

---

## 6. Il lavoro

### 6.1 D-072 — il rename sopprime la disclosure sul ripristino *(la prima della coda)*

Il settore d'origine di un ritirato si risolve per **nome**, dallo snapshot testuale `retiredFrom`
(«Settore · Fila») scritto al ritiro. Se il settore è stato rinominato dopo, l'origine non si
risolve e l'avviso tace: un ripristino che fa **perdere** una tariffa dedicata passa in silenzio.

**Costo:** codice piccolo, ma tira dentro **una migration** (una colonna su `Umbrella` per l'id
d'origine) e una **decisione su cosa farne dei ritirati già in archivio**, che quel dato non ce
l'hanno. ⚠️ Vedi §1c: `migrate dev` non funziona in questa shell.

⚠️ **È una decisione, non una digitazione: portala all'utente prima di scrivere.** Le vie sono
almeno tre — colonna nuova con backfill best-effort dal nome, colonna nuova che resta `null` per lo
storico (e allora l'avviso tace *dichiaratamente* invece che per caso), oppure risolvere per id solo
da qui in avanti e accettare la coda.

Il comportamento attuale è **fermato da un presidio** in `BeachPanel.restore.spec.ts` («settore
d'origine rinominato dopo il ritiro»): se lo cambi, quel test **deve arrossare**. Se non arrossa,
non hai cambiato ciò che credi.

### 6.2 D-073 — la Scheda cliente non è invalidata dalle mutazioni di struttura

**Preesistente a D-038**: la stessa lacuna vale per il rename di un settore e per il cambio di label
di un ombrellone, entrambi su `main` da prima.

**Costo:** una riga (`['customer', tenantId]` in `structureKeys`), ma il **trade-off è più lungo del
codice**: quel prefisso scade anche liste e anagrafiche che la struttura non tocca. È una decisione,
non una digitazione.

### 6.3 D-074 — `.st-row-drop` può essere regola morta

Specificità 0-1-0 contro la 0-2-0 di `.st-row:hover`, sulla stessa proprietà `background`.

⚠️ **Va guardata a schermo PRIMA di toccarla.** La voce è scritta come **possibilità misurata sulla
cascata, non come fatto osservato**. ⚠️ **L'utente ha fatto una prova visiva il 2026-07-31, ma su
D-071**: non risulta che abbia guardato anche questo. **Chiediglielo prima di partire** — è una
riga di rimedio, e non vale una sessione di analisi al buio. Lo stesso difetto è **preesistente** su
`.st-row-sel`.

### 6.4 Numeri liberi

**Prossimo ADR libero: 0067.** **Prossima deferred libera: D-076.**

### 6.5 Altro lavoro tracciato, non in questa coda

- **D-070** — la dimensione «fila» del listino: capacità viva nell'engine che **nessuna UI scrive**,
  più due difetti annessi (l'edit conserva un `rowId` invisibile; `create` non valida la coerenza fra
  settore e fila). ⚠️ **È l'unica lunga**, e comincia con una scelta a tre: esporre la fila, chiudere
  solo la trappola dell'edit, o togliere la dimensione dal modello. **Non iniziarla senza deciderla
  con l'utente.**
- **D-075** — *aperta nella sessione 16*: `move` vieta il salto di `kind` con **422**, `restore` lo
  consente in silenzio (`assertRow` verifica la sola esistenza della fila). Preesistente, non
  causata da quella slice. Il frontend **non** è il difetto: `allRows` in `BeachPanel.vue` non filtra
  ed è fedele al proprio server — ed è la ragione misurata per cui `moveTargets` **non** è stato
  unificato con esso.
- **D-040** — la lista chiavi icona è duplicata in **quattro** punti, non in uno. Non è «quasi vuota».
- **D-068** — `packages/contracts/dist` tracciato e in CRLF.
- ⚠️ **`useRenewals` invalida `['map']` e `['subscriptions']` senza segmento tenant.** Ora che
  l'invalidazione parte **anche sui fallimenti**, un rinnovo respinto scatena una raffica di
  riletture. Non è scorretto e non è tracciato: è un'osservazione per il prossimo lavoro sulle chiavi.

### 6.6 Azioni dell'utente ancora pendenti

1. **Bloccanti legali**: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali.
3. **AUD-015** (immagine Docker API single-stage come root) resta urgente **il giorno del primo
   deploy e non un giorno prima**: non esiste alcun VPS.

---

## 7. Ancore

- **Le decisioni della slice appena chiusa**:
  [ADR-0066](../architecture/decisions/0066-sposta-in-pannello-ombrellone.md) — leggi la §9, che è
  la meno ovvia
- **La decisione del trascinamento**:
  [ADR-0065](../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) — ⚠️ porta
  quattro note di supersessione aggiunte dalla sessione 16
- **Le voci**: [D-070](../architecture/deferred.md#d-070) · [D-072](../architecture/deferred.md#d-072) ·
  [D-073](../architecture/deferred.md#d-073) · [D-074](../architecture/deferred.md#d-074) ·
  [D-075](../architecture/deferred.md#d-075) · [D-040](../architecture/deferred.md#d-040) ·
  [D-068](../architecture/deferred.md#d-068) · [D-069](../architecture/deferred.md#d-069)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue) ·
  [`UmbrellaPanel.vue`](../../apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue) ·
  [`BeachPanel.vue`](../../apps/web-staff/src/features/establishment/panels/BeachPanel.vue) ·
  [`umbrellaMove.ts`](../../apps/web-staff/src/features/establishment/umbrellaMove.ts) ·
  [`useEstablishmentStructure.ts`](../../apps/web-staff/src/features/establishment/useEstablishmentStructure.ts)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts)
- **Il data-layer condiviso**: [`useQueryResource.ts`](../../packages/data-layer/src/useQueryResource.ts)
- **Design**: [design-system.md](../design/design-system.md) — ⚠️ la §15.8 è nuova, la §15.7 porta
  due note di supersessione
- **Decisioni collegate**: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) ·
  [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md)
- **Spec e piano della slice chiusa**:
  [spec](../superpowers/specs/2026-07-31-sposta-in-pannello-ombrellone-d071-design.md) ·
  [piano](../superpowers/plans/2026-07-31-sposta-in-pannello-ombrellone-d071.md) — ⚠️ entrambi
  portano note di supersessione: l'ADR è la fonte autorevole, non loro
- **Handoff precedente**: [2026-07-31 (16) D-038 mergiata, il prossimo è D-071](2026-07-31-d038-mergiata-il-prossimo-e-d071.md)
