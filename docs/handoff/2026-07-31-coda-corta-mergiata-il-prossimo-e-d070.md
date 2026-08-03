# Handoff 2026-07-31 (sessione 18): la coda corta è chiusa e mergiata. Il prossimo lavoro è D-070, e comincia con una scelta a tre.

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-31 (17) D-071 mergiata, il prossimo è D-072/073/074](2026-07-31-d071-mergiata-il-prossimo-e-d072-073-074.md),
> che resta **superato** solo perché il suo lavoro è finito: quasi tutti i gotcha qui sotto vengono
> da lì. Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono
> dentro, non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**D-072, D-073, D-074 e D-077 sono chiuse, mergiate e riviste con quattro passaggi di review
avversariale.** Non c'è lavoro in sospeso, nessun branch aperto, CI verde.

⚠️⚠️ **Il prossimo lavoro lo dice l'utente all'apertura della sessione: NON darlo per scontato.**
Questo handoff descrive lo **stato** e il **metodo**, non un ordine di marcia. Se l'utente non indica
altro, il default tracciato è **[D-070](../architecture/deferred.md#d-070)** (§6.1), l'unica voce
lunga rimasta — e **non si inizia senza una decisione a tre presa con lui**. Ma è un default, non una
consegna: leggi §6.2 e §6.5 prima di proporre, perché quattro voci nuove sono state aperte proprio da
questa sessione e potrebbero essere ciò che l'utente ha in mente.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -8
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
**prima** di dichiarare che qualcosa non esiste.

⚠️ **`main` è il commit di QUESTO handoff**, quindi il numero qui sotto è già vecchio di uno: il
codice della slice finisce a **`23b1df4`**, ed è su quello che la CI è verde (run #34). Fidati di
`git log`, non di questa riga. Nessun lavoro in sospeso:
`fix/coda-corta-d072-d073-d074` è stato mergiato in **fast-forward** (la storia di questo repo è
**lineare**: nessun merge commit per le slice). Il branch **esiste ancora**, locale e remoto, ed è
interamente contenuto in `main`: si può cancellare quando vuoi, non c'è niente sopra.

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

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** **Nove** handoff di fila li hanno dati per
assenti ed erano tutti al loro posto, anche nella 18. Il comando che chiude la questione:

```bash
for f in .env apps/api/.env .env.test apps/web-staff/.env RUNBOOK.local.md; do [ -f "$f" ] && echo "OK $f" || echo "MANCA $f"; done
```

Se mancano davvero i **valori** (JWT dev, password di `admin@coralyn.dev` e `super@coralyn.dev`),
quelli sì vanno chiesti all'utente: **il repo è PUBBLICO.**

⚠️ `JWT_SECRET` contiene la stringa `change-me` ma **non** è il segnaposto di `.env.example`.

### 1b. La sequenza che porta a un verde

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @coralyn/contracts build
pnpm --filter @coralyn/api exec prisma generate
```

⚠️ **`prisma generate` PRIMA del typecheck**, sempre.

### 1c. Docker, il seed, e la trappola della shell

⚠️⚠️ `SEED_ON_START=false docker compose …` è sintassi **bash**: in PowerShell il prefisso `VAR=x`
**non fa assolutamente nulla, in silenzio**, il seed parte lo stesso e `coralyn-api` muore con exit 1.
La forma che funziona:

```bash
$env:SEED_ON_START = "false"; docker compose --profile full up -d --build
```

⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: esistono
ombrelloni creati dall'app con label attive sotto uuid casuali, che collidono con l'indice parziale.
**Non "correggere" il seed.** Il sintomo: `Invalid tx.umbrella.upsert() … code: 'P2002'`,
**preceduto** da `No pending migrations to apply`.

- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.
- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- ⚠️⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Usa
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`,
  scrivi a mano la migration, poi `migrate deploy`.
- ⚠️⚠️ **Il database di TEST non viene migrato da solo.** `jest-setup-env.ts` carica `.env.test` ma
  non applica nulla: dopo una migration nuova, `coralyn_test` va migrato a mano o **ogni e2e fallisce**
  con «The column X does not exist in the current database»:
  ```bash
  TESTURL=$(grep '^DATABASE_URL=' .env.test | cut -d= -f2- | tr -d '"'); cd apps/api && DATABASE_URL="$TESTURL" npx prisma migrate deploy
  ```
- ⚠️⚠️ **Modificare una migration GIÀ APPLICATA — anche solo nei commenti — ne cambia il checksum**, e
  `migrate deploy` si rifiuta di proseguire. Nella 18 è successo **due volte**. La via d'uscita, su
  **entrambi** i database: droppare a mano ciò che la migration aveva creato, cancellare la sua riga
  da `_prisma_migrations`, poi `migrate deploy`.
- ⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**
- ⚠️ **Per ispezionare i dati serve l'utente `coralyn`** (superuser, BYPASSRLS): con `coralyn_app`
  l'RLS ti dà zero righe e la verifica *sembra* pulita.
  Esempio: `docker exec coralyn-db psql -U coralyn -d coralyn_dev -c '…'`.
- ⚠️ **`prisma format` NON è la convenzione di questo repo**: eseguito sullo schema **pristino**
  cambia da solo **71 righe**. Allinea a mano e non lanciarlo.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- ⚠️ **Python NON è installato.** Un `grep -rn` ricorsivo su tutto il repo va in **timeout**: usa lo
  strumento Grep.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi.** Ma per misurare
  **CSS e comportamento del browser** non serve l'app: una pagina autonoma servita da un server
  statico locale funziona, ed è così che sono state misurate D-074 e D-077 (§5d).
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Ventidue decisioni prese **con l'utente**, implementate, riviste avversarialmente e mergiate.

⚠️⚠️ **CITA SEMPRE NELLA FORMA `ADR-00NN §N`, MAI «la decisione N».** I numeri di questa tabella
sono **di questa tabella**, non delle sezioni degli ADR, e le due numerazioni **non coincidono**.

| # | Decisione | Dove vive |
|---|---|---|
| 1 | **Il riordino è LOGICO.** `Umbrella.presentationPosition` non si tocca | ADR-0065 §Neutre |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile | ADR-0065 §1 |
| 3 | **`position` è l'indice FINALE**, non l'indice d'inserimento | ADR-0065 §3 |
| 4 | **Destinazione: una fila del proprio settore o di un altro dello stesso `kind`** | ADR-0065 §4 |
| 5 | **Un ritirato non è spostabile: 409**, con la guardia ripetuta nella scrittura finale | ADR-0065 §5 |
| 6 | **Sul prezzo: disclosure, non blocco** — vale per spostamento e ripristino | ADR-0065 §6 |
| 7 | **`hasDedicatedRates` è calcolato dal server**, non dedotto nel frontend | ADR-0065 §7 |
| 8 | **Maniglia fuori dalla cella**, `<span>` non `<button>`, `aria-hidden` | ADR-0065 §8 |
| 9 | **Tab a molla** (sosta ~700 ms) per raggiungere un altro settore | ADR-0065 §9 |
| 10 | **Il TRASCINAMENTO è solo `lg+`**, e sotto quella soglia la maniglia non si rende | ADR-0065 §10 |
| 11 | **HTML5 drag-and-drop nativo, nessuna libreria** | ADR-0065 §11 |
| 12 | **`POST :id/move` risponde 200** (`@HttpCode(200)`) | ADR-0065 §Neutre |
| 13 | **File e settori NON si riordinano.** D-038 è chiusa **solo per l'ombrellone** | deferred, D-038 |
| 14 | **L'invalidazione NON viene attesa** dentro `mutationResource` | §4.2 qui sotto |
| 15 | **Il controllo «Sposta» si rende a OGNI larghezza**, non solo sotto `lg` | ADR-0066 §2 |
| 16 | **La destinazione è fila E posizione**, non la sola fila | ADR-0066 §3 |
| 17 | **Il pannello NON possiede la mutation**: emette, la shell riusa l'ingresso del trascinamento | ADR-0066 §5 |
| 18 | **Il toast è solo sul percorso del pannello**, non sul trascinamento | ADR-0066 §6 |
| 19 | **Il controllo DERIVA, non memorizza**: l'intenzione cade come un blocco | ADR-0066 §9 |
| 20 | **La provenienza di un ritirato è un RIFERIMENTO**, non il nome nello snapshot | ADR-0067 §1 |
| 21 | **Nessun fallback per nome nel frontend**, mai. Origine irrisolvibile ⇒ fuori dal confronto | ADR-0067 §4-5 |
| 22 | **Si memorizza il SETTORE d'origine, non la fila** (la fila è terreno di D-070) | ADR-0067 §7 |

⚠️ **La 10 e la 15 non si contraddicono.** Il trascinamento è ancora solo `lg+`; il controllo
«Sposta» è un **secondo canale**, non un'estensione del primo.

⚠️ **La 21 è la meno ovvia.** Dopo il backfill, una riga rimasta a `null` è per costruzione una che
il nome **non** risolve: un fallback lì non recupererebbe nulla e avrebbe due modi di sbagliare.

---

## 3. Baseline (`main` = `23b1df4`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) |
| api unit (**jest**) | `pnpm --filter @coralyn/api test` | **449 (61)** |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 214 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 34 (5) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **600 (66)** |
| tutto insieme | **`pnpm -r --workspace-concurrency=1 test`** | **1434 / 191** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **544 / 45** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

⏱️ La suite completa ~10 min, `test:e2e` ~2,5. **Se i numeri non tornano è l'ambiente, non il codice.**

⚠️ **`pnpm run test` non stampa un totale**: è la somma di otto conteggi, l'output è **prefissato dal
nome del pacchetto**, e **`apps/api` gira su jest** con una forma diversa (`Tests: 449 passed`). Un
`grep` ancorato a inizio riga non trova nulla e ti fa credere di aver misurato. **Cattura su file e
leggi dopo** — e leggilo con `grep -a`, perché l'output può contenere byte che lo fanno passare per
binario.

⚠️ Usa **`--workspace-concurrency=1`**: in parallelo su questo host le suite danno falsi rossi di
massa (timeout di collection).

---

## 4. Gotcha

### 4.1 I letali

- ⚠️⚠️ **La scena dell'editor rende UN SOLO settore per volta.** `StructureScene.vue` sceglie
  `current` e rende le sue file sotto un `v-if`; **le file di un altro settore non sono nel DOM**.
  Ma l'albero completo è in `data`: è la **resa** a essere parziale, non la sorgente.
- ⚠️⚠️ **`ValidationPipe` è senza `forbidNonWhitelisted`**: un campo non dichiarato nel DTO viene
  **scartato in silenzio, con 200**.
- ⚠️⚠️ **NESSUNA query filtra `retiredAt`**: l'esclusione di un ritirato dipende **solo** dal
  `rowId = null` che `retire` azzera.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** e `authorization-coverage` legge «metodo ??
  classe»: un endpoint nuovo eredita il permesso **in silenzio**.
- ⚠️⚠️ **`Umbrella` e `Sector` hanno `FORCE ROW LEVEL SECURITY`, e `coralyn_app` — che è owner **e**
  l'utente delle migration — NON ne è esente.** Misurato: senza contesto tenant vede **0 ombrelloni e
  0 settori**; con il contesto, 204. Un `UPDATE` di backfill scritto senza tenant aggiorna **zero
  righe dichiarando successo**. Il modo giusto è ciclare sui tenant con `set_config('app.current_tenant', …)`,
  come fa la migration `20260731140000_umbrella_retired_from_sector`: **rispetta** la policy invece di
  spegnerla. `Establishment` è fuori da RLS (verificato dal catalogo, non dal commento).
- ⚠️ **Il Drawer di reka-ui azzera i `pointer-events` del body** e copre la scena con un overlay
  `fixed inset-0`. Sotto `lg` non c'è scena da indicare.

### 4.2 Trappole di TanStack Query (v5.101.1), misurate

- ⚠️⚠️ **Attendere l'invalidazione uccide le callback per-chiamata.** Se la rilettura attesa smonta
  il componente che le ha registrate, quelle callback **non partono**. Misurato: sparivano quattro
  toast. **Per questo la decisione 14 dice di non attendere.**
- ⚠️ **`invalidateQueries` passa `cancelRefetch: true` di default.**
- ⚠️ **`isLoading = isPending && isFetching`**: per una query con dati in cache è **false** durante
  un refetch di background.
- ⚠️ **`isPending` di una mutation cade quando risponde il POST, non quando atterra la rilettura.**
- ⚠️ **L'invalidazione combacia per PREFISSO, elemento per elemento.** `['customer', tenantId]`
  coglie `customer`, `customerBookings` e `cededSubscriptions`, ma **non** `customers` (la lista):
  primo segmento diverso, nessun match. Contale sempre su `queryKeys.ts` prima di dichiararne il raggio.

### 4.3 Prisma

- ⚠️ **Prisma 5.22 compila un `update` con `where` esteso in UNA SOLA statement** — **misurato**: una
  guardia scritta così **chiude** la corsa. Su una versione diversa, **rimisuralo**.
- **`forTenant` vuole un `TenantId`, non una `string`.** **`@IsUUID` è vietato dal lint** →
  `@IsUuidShape()`. **`ApiError` SEMPRE da `@coralyn/data-layer`.** **P2003 → 409.**
- ⚠️ **`retire` e `restore` scrivono con un `where` NUDO da una lettura mai ricontrollata**, mentre
  `move` ha la guardia estesa: è [D-076](../architecture/deferred.md#d-076), preesistente.

### 4.4 ui-kit e reka-ui — le trappole dei primitivi

- ⚠️⚠️ **`SelectValue` di reka-ui NON rende lo slot dell'item selezionato**: rende il testo di un
  **registro valore→testo costruito dagli item montati**. Se l'elenco cambia sotto mentre il
  `modelValue` resta lo stesso, il controllo mostra **l'etichetta vecchia**. Rimedio: un `:key`
  derivato dal **contenuto** dell'elenco. In `UmbrellaPanel.vue` ne servono **due**.
- ⚠️ **`Select` è `defineModel<string>()` e `Option` è `value: string`**: un numero va stringato.
- ⚠️ **Nei test si pilota con `selectOption(trigger, label)`, mai con `setValue`.**
- ⚠️ **Su `Button.vue` il `disabled` passato come fallthrough VINCE** sul `:disabled` interno.
- ⚠️ **`Select` senza valore mostra un trigger VUOTO.**
- ⚠️⚠️ **Le utility `focus-visible:` di Tailwind sono classe + pseudo-classe (0-2-0) e battono
  sempre le classi sole (0-1-0) di un ramo di stato.** E `focus-visible:outline-none` azzera **anche**
  la variabile `--tw-outline-style` da cui dipende `outline-2`: doppia uccisione. È stata
  [D-077](../architecture/deferred.md#d-077). L'anello di fuoco è **box-shadow** (`--ring-focus`) in
  tutto il kit e il design system lo impone: se uno stato collide, sposta **lo stato**, non il fuoco.

### 4.5 CSS — la cascata, che jsdom non calcola

- ⚠️⚠️ **Una classe di stato (0-1-0) perde contro `.base:hover` (0-2-0) sulla stessa proprietà**,
  comunque le si ordini. Scrivi `.base.base-stato` (0-2-0) e mettila **dopo**.
- ⚠️⚠️ **Chrome CONGELA `:hover` all'inizio di un trascinamento HTML5.** Misurato: trascinando su
  un'**altra** fila `:hover` non è applicato; trascinando **dentro la stessa** fila resta applicato
  per tutta la durata — ed è il caso più comune, perché la maniglia compare **all'hover**.
- Il presidio è **statico** (`apps/web-staff/src/styles/structure-scene.spec.ts`): jsdom non calcola
  la cascata e il repo non ha test di browser. Verifica la **regola**, non la resa.

### 4.6 Test — come si scrivono qui

- ⚠️ **27 asserzioni indicizzano `[data-testid="scene-cell"] button` PER POSIZIONE.** Un secondo
  `<button>` là dentro le arrossa tutte senza difetti reali.
- ⚠️ **jsdom restituisce rettangoli a ZERO** e **non implementa `matchMedia`**: senza stub
  `useMediaQuery` è sempre `false`. Il pattern per stubbarlo è in `EstablishmentStructureView.spec.ts`.
- ⚠️ **Le spec e2e sulla STRUTTURA costruiscono le fixture inline**: cinque su cinque.
  **Non estendere `seedMapTenant`** né `STRUCTURE_FIXTURE`.
- ⚠️ **`clearToasts()` è già in un `beforeEach` globale**: non aggiungerne un secondo.
- **Per asserire un'invalidazione**: passa le chiavi al `QueryCache` **vero** e confronta l'**insieme
  esatto** delle voci scadute, mettendo in cache anche le **esche** che NON devono scadere.
- **e2e `maxWorkers: 1`**, calendario congelato al **2026-07-15**, suite di pacchetti **una alla volta**.
- ⚠️ **`watch(() => [a, b])` scatta a OGNI rilettura**: usa una **stringa**.
- ⚠️⚠️ **Una fixture invecchia insieme al tipo che istanzia.** Nella 18 un presidio ha smesso di
  arrossare non perché il comportamento non fosse cambiato, ma perché la sua fixture **non portava il
  campo nuovo** e aveva quindi cominciato a descrivere un altro scenario. Quando aggiungi un campo a
  un DTO, **cerca tutte le fixture che lo costruiscono**.

### 4.7 Documenti, gate e shell

- ⚠️⚠️ **Non passare testo con caratteri speciali a `node -e` attraverso la shell**: pipe, backtick e
  accenti vengono mangiati **in silenzio** e la sostituzione «non trova» ciò che è lì. Nella 18 è
  costato tre tentativi. **Scrivi uno script `.js` con Write e lancialo.**
- ⚠️ **Molti file sono CRLF**: un `replace` multi-riga che cerca `\n` non matcha. Usa ancore su
  **riga singola**; `sed -i '<n>d'` per cancellare righe è sicuro.
- ⚠️ **`packages/contracts/dist` è tracciato, gitignorato e in CRLF**: `git add` normale lo rifiuta
  (serve `-f`), e dopo `pnpm install` risulta modificato con `git diff` **vuoto** → `git checkout --`.
  **Ma se hai cambiato `contracts/src` il diff è REALE.** Distinguili con `git diff --numstat`: un
  file senza riga nel numstat è solo rumore di fine-riga. È terreno di **D-068**.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build serve `--force`.
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
  **E controlla anche gli ANCHOR**: un link a `#d-081` prima che l'anchor esista è rosso.
- ⚠️⚠️ **`docs-lint` NON giudica la RESA Markdown.** Nella 18 una riga di `deferred.md` è finita in
  **sette celle contro cinque colonne** perché conteneva `||` dentro un code span: **Markdown taglia
  le celle su OGNI pipe, code span compresi**. Escapa come `\|`. ⚠️ E se scrivi un contatore per
  verificarlo, **non contare i pipe escapati**: il primo che ho scritto lo faceva e mi ha fatto
  credere ancora rotta una riga già corretta.
  ⚠️ **Tre righe restano rotte al contrario** — D-013, D-037, D-039 hanno una colonna in **meno**.
  Preesistente; sistemarle vuol dire inventare contenuto.
- ⚠️ **`CLOSURE_MARKERS` di `docs-lint` è case-sensitive** (`/CHIUSA|CHIUSO|…/`).
- ⚠️ **Il parser di `deferred-registry.ts`** pretende: indice ordinato per numero, anchor = ID
  minuscolo, indice e voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al
  totale. **L'ordine delle VOCI non conta**, quello dell'**indice** sì.
- ⚠️ **L'indice degli ADR in `docs/architecture/README.md` non ha alcun presidio**
  ([D-069](../architecture/deferred.md#d-069)) ed è già andato indietro **quattro volte**.
  Al 2026-07-31 è completo: 67 file, 67 righe.
- ⚠️⚠️ **Non citare una riga di CSS o di codice per NUMERO.** Nella 18 sette righi di commento
  aggiunti a `structure-scene.css` hanno reso sbagliati **quattro** rimandi in tre file, e uno
  puntava proprio alla regola appena cambiata. **Cita il selettore o il simbolo.** E quando fai la
  sweep, cerca la **forma** del rimando (`(:[0-9]`), non il nome del file: il gemello che è sfuggito
  era l'unico che il nome del file non lo ripeteva.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.
- **Convenzione dei commit**: `tipo(scope): frase in italiano minuscolo (D-0NN)`, corpo che spiega
  il *perché*, e come ultima riga `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  ⚠️ I messaggi lunghi si passano con `git commit -F <file>`, mai inline: la shell li rovina.
- ⚠️ **Il merge su `main` può essere negato dal classificatore.** Non aggirarlo con `reset --hard` né
  con un push che riscrive `main`: riprova, e se resta bloccato chiedilo all'utente. Le slice si
  mergiano in **fast-forward**.

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
  **verso te stesso**. Nella 18 ho corretto due finding che il confutatore aveva **refutato**, dopo
  averli verificati a mano: un verdetto non è una prova.
- ⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.** Dichiara sempre di quale delle due stai parlando.
- ⚠️⚠️ **Una mutazione che non produce rossi prova l'assenza di COPERTURA, non l'assenza del
  difetto.** E vale anche al contrario: **una ricerca che non trova nulla non prova nulla** finché non
  hai dimostrato che avrebbe trovato il caso noto. Nella 18 la ricerca dei gemelli CSS è stata
  validata rimettendo il difetto e verificando che lo trovasse — e ciononostante **ha mancato** il
  gemello vero, che stava nello strato Tailwind e non in un `.css`.
- ⚠️⚠️ **Riproduci ogni finding come test ROSSO prima di correggerlo.** Per il CSS e per SQL, dove un
  test non arriva, **riproducilo sul database reale o in un browser reale** (§5d).
- ⚠️⚠️ **La prima correzione di un finding confermato può scambiare un difetto con un altro.** Dopo
  ogni correzione, rigira la suite **intera** del pacchetto.
- ⚠️ **Un gate verde NON è una review, e vale anche per le correzioni.**
- **Misura il PROBLEMA prima di risolverlo, e il RAGGIO D'AZIONE prima di toccare.**
- ⚠️ **Correggi il testo falso, non annotarlo sotto** — ma se era **vero quando fu scritto**, dillo:
  «superato», non «falso». E ⚠️ **prima di dichiarare falsa un'affermazione, CONTALA.**
- **Rigreppa i tuoi edit**: la stessa affermazione falsa spesso vive in più punti.
- **Nessun merge su `main` senza ok esplicito.** Ma **non lasciare nulla solo in locale a fine
  sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (suite completa ~10 min, e2e ~2,5, un passaggio di review avversariale ~20).

### 5b. La review avversariale, che ha pagato 9 volte su 9

Forma della sessione 18, la migliore finora — **quattro passaggi in sequenza**, 58 agenti, ~1h50:

| passaggio | grezzi | dedup | confermati | refutati |
|---|---|---|---|---|
| API | 8 | — (**dedup dimenticata**) | 8 → **5 distinti** | 0 ⚠️ |
| Frontend | 12 | 11 | 8 | 3 |
| Documenti | 20 | 13 | 7 | 6 |
| D'insieme | 17 | 10 | 6 | 4 |

- **Passaggi distinti, in sequenza** — non un workflow unico. ⚠️ **Salta i passaggi senza materia.**
- Ogni passaggio: **quattro lenti indipendenti**, poi **deduplicazione per `file:riga`**, poi **un
  confutatore ostile per finding**. ⚠️ **La deduplicazione è una BARRIERA e serve davvero**: nel
  passaggio API l'ho saltata e tre lenti hanno riportato lo stesso difetto tre volte.
- ⚠️ **Verdetto a TRE valori**: refutato / confermato / **incerto**.
- ⚠️⚠️ **Zero refutati è un segnale SOSPETTO.** Nel passaggio API è stato il sintomo della
  deduplicazione mancante, non della bravura delle lenti.
- ⚠️⚠️ **La review d'insieme, DOPO le altre, è l'unica che vede i gemelli.** Nella 18 ha trovato
  **due gemelli scritti da me poche ore prima**: una frase corretta nell'ADR e lasciata identica nel
  registro, e un rimando corretto in tre punti su quattro — l'unico rimasto era **nella stessa frase**
  di uno corretto.
- Ai subagenti **vieta**: citare un `.md` come prova, citare un commento nel codice come prova,
  asserire un'assenza senza il **comando esatto**, **eseguire qualsiasi suite di test**, modificare
  file. Pretendi `file:riga` e uno scenario con input e output sbagliato.
- ⚠️ **Dichiara ai revisori le decisioni già prese** (§2) **e le voci già tracciate**, o te le
  riportano come difetti.
- ⚠️ **Leggi le refutazioni per intero, non solo i verdetti**, e **verifica di persona ogni finding
  prima di agire**.
- ⏱️ ~20 minuti a passaggio. **Chiedi il via all'utente: costa token.**
- I risultati completi stanno nel **file di output** del task, non nella notifica, che è troncata.

### 5c. Errori delle sessioni precedenti, da non ripetere

1. **Accettare una mutazione senza rossi come prova di una proprietà.**
2. **Scegliere una correzione senza misurarne il raggio d'azione.**
3. **Correggere un testo vero verso il falso**: due volte, in due sessioni diverse.
4. **Aggiungere un rimedio per analogia senza misurare se il difetto c'è.**
5. **Scrivere un presidio che passa per la ragione sbagliata.** Nella 18 tre volte: una fixture più
   povera della riga vera, un test su uno stato che il database non può produrre, e un titolo che
   prometteva di distinguere id da nomi quando **nessun test può farlo** (i nomi sono unici, quindi
   le due forme danno sempre lo stesso esito).
6. **Correggere una frase in un documento e lasciarla identica in un altro.** Nella 18, nella stessa
   slice, sulla stessa migration.

Il filo, ormai su undici sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.**

### 5d. Misurare browser e database quando un test non arriva

Due cose che nella 18 hanno deciso l'esito e che valgono la pena di rifare:

- **Il browser.** `preview_start` con un `{url}` apre una scheda; i file **fuori dal progetto** sono
  resi come snapshot **statici, senza JS**, e `navigate` su `localhost` è **negato** — ma
  `preview_start({url: 'http://localhost:PORT'})` funziona. Quindi: scrivi la pagina nello
  scratchpad, servila con dieci righe di `node http`, aprila con `preview_start`. Ha misurato
  D-074 (il congelamento di `:hover`) e D-077 (`:focus-visible` da Tab).
  ⚠️ **Valida sempre lo strumento nella stessa sessione di pagina**, con un caso a risposta nota.
- **Il database.** Per una regola SQL, costruisci le fixture con `psql -U coralyn`, estrai il blocco
  **vero** dalla migration con `sed -n '/^DO \$\$/,/^END \$\$;/p'` ed eseguilo **come `coralyn_app`**,
  cioè l'utente vero: è l'unico modo di accorgersi che RLS lo sta svuotando.

---

## 6. Il lavoro

### 6.1 D-070 — la dimensione «fila» del listino *(l'unica lunga, e la prossima)*

⚠️ **Non iniziarla senza deciderla con l'utente: comincia con una scelta a tre.**

L'engine filtra per `rowId` (`pricing.engine.ts:42,57`) e il DTO lo accetta, ma **nessuna UI lo
scrive**: `PricingView.vue` non ha alcun controllo per la fila. È capacità viva nel motore e
irraggiungibile dal prodotto. Due difetti annessi, entrambi misurati: il ramo **edit** di `submitRate`
omette `rowId`, `periodStart` e `periodEnd`, e `rates.service.update` scrive solo i campi
`!== undefined` — quindi modificare da UI una tariffa che porta un `rowId` **ne conserva il rowId
senza dirlo**; e `rates.service.create` scrive `sectorId` e `rowId` **senza validare** né esistenza né
coerenza fra i due.

Le tre vie: **esporre la fila** nel listino, **chiudere solo la trappola dell'edit**, oppure
**togliere la dimensione dal modello**.

⚠️ **Chi sceglie la prima deve estendere anche `hasDedicatedRates`**, che oggi conta `Sector.rates` e
**solo** quelle, mentre nel motore la fila ha specificità **maggiore** del settore: la disclosure
nascerebbe falsa il giorno stesso. E deve tornare su [ADR-0067](../architecture/decisions/0067-provenienza-ritirato-per-riferimento.md)
§7, che memorizza il settore d'origine e non la fila proprio perché oggi la fila non ha lettori.

### 6.2 Le quattro voci aperte dalla review della 18

Tutte **preesistenti**, tutte verificate tali su `main` a `0fd3b0f`, nessuna causata dalla slice:

- **[D-076](../architecture/deferred.md#d-076)** — `retire` e `restore` scrivono con un `where` nudo
  da una lettura mai ricontrollata, mentre `move` ha la guardia estesa. Tre conseguenze nella finestra
  fra lettura e scrittura, fra cui una prenotazione confermata che non blocca il ritiro.
- **[D-078](../architecture/deferred.md#d-078)** — i controlli del ripristino non si riconciliano con
  l'albero, e la guardia sul doppio invio si apre alla risposta del POST.
- **[D-079](../architecture/deferred.md#d-079)** — la cessione scade la Scheda del cedente e lascia
  fresca quella del subentrante. Lo strumento per chiuderla è la stessa `customerScope` di D-073.
- **[D-080](../architecture/deferred.md#d-080)** — il **secondo** ingrediente della disclosure
  invecchia come invecchiava il primo: nessuna mutazione del listino scade la struttura, quindi
  `hasDedicatedRates` può essere già falsa quando il gate la legge. È il gemello di D-073 rovesciato,
  e si chiude con una riga.

### 6.3 Il limite dichiarato del backfill di ADR-0067

⚠️ Da rileggere **il giorno in cui esisterà un database di produzione**. Se un settore viene
rinominato e poi ne nasce uno **nuovo col vecchio nome**, entrambi **prima** della migration, il
backfill scrive un riferimento sbagliato **con sicurezza**, e nel verso pericoloso: ripristinare in
quel settore troverebbe `origin.id === target.id` e **tacerebbe** un avviso dovuto. Non è
distinguibile dai dati — `Sector` non ha un `createdAt`. **Accettato e dichiarato** in
[ADR-0067](../architecture/decisions/0067-provenienza-ritirato-per-riferimento.md) §3 perché oggi non
esiste alcuna produzione e al primo deploy quella tabella è **vuota**.

### 6.4 Numeri liberi

**Prossimo ADR libero: 0068.** **Prossima deferred libera: D-081.**

### 6.5 Altro lavoro tracciato

- **[D-075](../architecture/deferred.md#d-075)** — `move` vieta il salto di `kind` con 422, `restore`
  lo consente in silenzio. Preesistente; il frontend **non** è il difetto.
- **[D-040](../architecture/deferred.md#d-040)** — la lista chiavi icona è duplicata in **quattro**
  punti. ⚠️ La sua riga in `deferred.md` è stata riparata nella 18 (pipe non escapati).
- **[D-068](../architecture/deferred.md#d-068)** — `packages/contracts/dist` tracciato e in CRLF.
- **[D-069](../architecture/deferred.md#d-069)** — l'indice degli ADR non ha presidio.
- ⚠️ **`useRenewals` invalida `['map']` e `['subscriptions']` senza segmento tenant.** Non è scorretto
  e non è tracciato: è un'osservazione per il prossimo lavoro sulle chiavi.
- ⚠️ **Tre righe di `deferred.md` hanno una colonna in meno** (D-013, D-037, D-039): preesistente,
  non tracciata, sistemarla vuol dire inventare contenuto.

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
  [ADR-0067](../architecture/decisions/0067-provenienza-ritirato-per-riferimento.md) — leggi la §3
  (la regola del backfill e i suoi **due** modi di sbagliare) e la §5 (perché si mostra lo snapshot
  **intero**)
- **Le decisioni precedenti**:
  [ADR-0066](../architecture/decisions/0066-sposta-in-pannello-ombrellone.md) ·
  [ADR-0065](../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) — ⚠️ porta
  **tre** note di supersessione, due aggiunte dalla 18
- **Il ritiro**: [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) — ⚠️ due
  note di supersessione dalla 18, sui campi scritti da `retire` e azzerati da `restore`
- **Le voci**: [D-070](../architecture/deferred.md#d-070) · [D-075](../architecture/deferred.md#d-075) ·
  [D-076](../architecture/deferred.md#d-076) · [D-078](../architecture/deferred.md#d-078) ·
  [D-079](../architecture/deferred.md#d-079) · [D-080](../architecture/deferred.md#d-080) ·
  [D-040](../architecture/deferred.md#d-040) · [D-068](../architecture/deferred.md#d-068) ·
  [D-069](../architecture/deferred.md#d-069)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue) ·
  [`UmbrellaPanel.vue`](../../apps/web-staff/src/features/establishment/panels/UmbrellaPanel.vue) ·
  [`BeachPanel.vue`](../../apps/web-staff/src/features/establishment/panels/BeachPanel.vue) ·
  [`useEstablishmentStructure.ts`](../../apps/web-staff/src/features/establishment/useEstablishmentStructure.ts)
- **Le chiavi**: [`queryKeys.ts`](../../apps/web-staff/src/lib/queryKeys.ts) — `customerScope` porta
  la ragione accanto
- **Il CSS del Cantiere**: [`structure-scene.css`](../../apps/web-staff/src/styles/structure-scene.css) ·
  [`structure-scene.spec.ts`](../../apps/web-staff/src/styles/structure-scene.spec.ts)
- **La cella**: [`UmbrellaCell.vue`](../../packages/ui-kit/src/components/UmbrellaCell.vue)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts)
- **Design**: [design-system.md](../design/design-system.md) · [data-model.md](../design/data-model.md)
- **Handoff precedente**: [2026-07-31 (17) D-071 mergiata, il prossimo è D-072/073/074](2026-07-31-d071-mergiata-il-prossimo-e-d072-073-074.md)
