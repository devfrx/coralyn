# Handoff 2026-07-31 (sessione 16): D-038 è mergiata e in CI verde. Il prossimo lavoro è D-071, con D-072/073/074 come coda corta.

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-30 (15) rivista, corretta e provata](2026-07-30-d038-rivista-corretta-e-provata-manca-il-merge.md),
> che resta **superato** solo perché il merge è avvenuto: il suo contenuto è ancora vero.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**D-038 è chiusa per l'ombrellone, mergiata in `main` (`6e51094`) con CI verde.** Non c'è lavoro in
sospeso. Il prossimo passo è **D-071** — sotto `lg` non esiste alcun modo di riordinare — che è
**solo frontend**, perché l'API dello spostamento è già scritta, provata e mergiata. Poi tre voci
corte: **D-072**, **D-073**, **D-074**.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -8
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

`main` = **`6e51094`**. Non ci sono branch di lavoro aperti: quelli di D-038 e D-063 sono stati
cancellati dopo il merge.

Poi, in ordine: **§1 (ambiente)**, **§2 (cosa non si rilitiga)**, **§3 (baseline)**,
**§4 (gotcha)**, **§5 (metodo)**, **§6 (il lavoro)**.

⚠️ **Prima di scrivere codice per D-071, leggi ADR-0065 §Alternatives**: il controllo «Sposta in…»
è già stato analizzato e **scartato per D-038**, non perché fosse sbagliato ma perché avrebbe
consumato lo scope di D-071. Quell'analisi è il tuo punto di partenza, non un ostacolo.

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

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** **Sette** handoff di fila li hanno dati per
assenti ed erano tutti al loro posto. Il comando che chiude la questione in due secondi:

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

⚠️⚠️ **La trappola più costosa del repo, ricascataci nella sessione 15.**
`SEED_ON_START=false docker compose …` è sintassi **bash**: in PowerShell il prefisso `VAR=x`
**non fa assolutamente nulla, in silenzio**, il seed parte lo stesso e `coralyn-api` muore con
exit 1. La forma che funziona:

```bash
$env:SEED_ON_START = "false"; docker compose --profile full up -d --build
```

⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: esistono
ombrelloni creati dall'app con label attive sotto uuid casuali, che collidono con l'indice parziale;
l'`upsert` del seed non li intercetta perché cerca su un'altra chiave. **Non "correggere" il seed** —
`docker-entrypoint.sh` dichiara il fallimento fatale di proposito.

Il sintomo, per riconoscerlo al volo nel log di `coralyn-api`:
`Invalid tx.umbrella.upsert() invocation … Unique constraint failed … code: 'P2002'`, **preceduto**
da `No pending migrations to apply` — cioè le migration sono passate e a morire è **solo** il seed.

- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.
- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- ⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Usa
  `prisma migrate diff … --script`, scrivi a mano la migration, poi `migrate deploy`.
  ⚠️ **D-072 ha una migration**: questa riga ti servirà.
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
  visiva chiedi all'utente di entrare lui nel browser. Le immagini Docker vanno ricostruite per
  contenere il codice nuovo; in alternativa `pnpm --filter @coralyn/web-staff dev` contro l'API in
  container.
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Tredici decisioni prese **con l'utente**, implementate, riviste avversarialmente e mergiate.
Riaprirle significa rifare conversazioni già fatte.

| # | Decisione | Dove vive |
|---|---|---|
| 1 | **Il riordino è LOGICO.** `Umbrella.presentationPosition` non si tocca: quello è D-005 | ADR-0065 §Neutre |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile né selezione multipla trascinabile | ADR-0065 §1 |
| 3 | **Destinazione: una fila del proprio settore o di un altro dello stesso `kind`.** Mai `grid → special` | ADR-0065 §4 |
| 4 | **Sul prezzo: disclosure, non blocco** — vale sia per lo spostamento sia per il ripristino | ADR-0065 §6 |
| 5 | **Il trascinamento è solo `lg+`**, e sotto quella soglia la maniglia **non si rende affatto** | ADR-0065 §10 |
| 6 | **File e settori NON si riordinano.** D-038 è chiusa **solo per l'ombrellone** | deferred.md, D-038 |
| 7 | **Tab a molla** (sosta ~700 ms) per raggiungere un altro settore | ADR-0065 §9 |
| 8 | **`hasDedicatedRates` è calcolato dal server**, non dedotto nel frontend | ADR-0065 §7 |
| 9 | **`position` è l'indice FINALE**, non l'indice d'inserimento | ADR-0065 §3 |
| 10 | **Maniglia fuori dalla cella**, `<span>` non `<button>`, `aria-hidden`, non focalizzabile | ADR-0065 §8 |
| 11 | **HTML5 drag-and-drop nativo, nessuna libreria** | ADR-0065 §11 |
| 12 | **`POST :id/move` risponde 200** (`@HttpCode(200)`) | ADR-0065 §Neutre |
| 13 | **L'invalidazione NON viene attesa** dentro `mutationResource` | §4.2 qui sotto |

⚠️ **Sul punto 5 e D-071 c'è una sfumatura che devi tenere ferma.** «Il trascinamento è solo `lg+`»
resta vero. D-071 **non** consiste nel far funzionare il trascinamento sotto `lg`: consiste nel dare
un **secondo canale** che non dipenda dal puntatore. Sono due cose diverse, e confonderle riapre una
decisione chiusa.

### 2b. Due rifiniture viste a schermo e **accettate dall'utente**

Non sono difetti aperti: sono state osservate nella prova visiva del 2026-07-30 e lasciate così.

- **Il «drag image» è il pallino da 15 px della maniglia**, non l'ombrellone. Un `setDragImage`
  sono due righe, se un giorno dà fastidio.
- **La maniglia non sbiadisce insieme alla sua cella** e conserva l'anello corallo, perché `:hover`
  si congela sulla sorgente al `dragstart`.

---

## 3. Baseline (`main` = `6e51094`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) |
| api unit | `pnpm --filter @coralyn/api test` | **448 (61)** |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 34 (5) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **556 (64)** |
| tutto insieme | **`pnpm run test`** | **1387 / 189** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **542 / 45** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

⏱️ `pnpm run test` ~8 min, `test:e2e` ~2,5 min. **Se i numeri non tornano è l'ambiente, non il
codice.** Il totale è la somma di otto conteggi per pacchetto: `pnpm run test` non stampa un totale.

---

## 4. Gotcha

### 4.1 I letali

- ⚠️⚠️ **La scena dell'editor rende UN SOLO settore per volta.** `StructureScene.vue` sceglie
  `current` e rende le sue file sotto un `v-if`; **le file di un altro settore non sono nel DOM**.
  È il caso-scuola di «capacità ≠ percorso reale»: senza i tab a molla, lo spostamento fra settori
  sarebbe stato capacità dell'API senza percorso nel prodotto. **D-071 ci ricasca**: un controllo
  «Sposta in…» deve poter offrire file che **non sono rese**.
- ⚠️⚠️ **`ValidationPipe` è senza `forbidNonWhitelisted`**: un campo non dichiarato nel DTO viene
  **scartato in silenzio, con 200**.
- ⚠️⚠️ **NESSUNA query filtra `retiredAt`**: l'esclusione di un ritirato dipende **solo** dal
  `rowId = null` che `retire` azzera. Ogni scrittura nuova su `rowId` ha bisogno della guardia.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** e `authorization-coverage` legge «metodo ??
  classe»: un endpoint nuovo eredita il permesso **in silenzio**, senza rossi e senza 403.
- ⚠️ **Il Drawer di reka-ui azzera i `pointer-events` del body** (`disableOutsidePointerEvents` è
  `true` per default) e applica `aria-hidden`. Sotto 1024 px il Drawer è aperto **appena qualcosa è
  selezionato**, quindi la scena è pointer-morta proprio quando si vorrebbe trascinare. **È la causa
  radice di D-071**: verificala tu prima di progettare, non fidarti di questa riga.

### 4.2 Trappole di TanStack Query (v5.101.1), misurate

- ⚠️⚠️ **Attendere l'invalidazione uccide le callback per-chiamata.** `mutationObserver` esegue le
  callback passate a `mutate(vars, { onSuccess })` **solo se l'osservatore ha ancora ascoltatori**;
  se la rilettura attesa smonta il componente che le ha registrate, quelle callback **non partono**.
  Misurato: attendendo sparivano quattro toast di conferma di azioni distruttive. **Per questo la
  decisione 13 dice di non attendere.** Non è documentato da nessuna parte in TanStack.
- ⚠️ **`invalidateQueries` passa `cancelRefetch: true` di default.** È ciò che protegge l'anteprima
  ottimistica: una rilettura già in volo col payload vecchio viene cancellata.
- ⚠️ **`isLoading = isPending && isFetching`**: per una query con dati già in cache è **false**
  durante un refetch di background, quindi nessuno skeleton copre la finestra.
- **L'anteprima ottimistica del Cantiere** vale «se e solo se a schermo c'è la stessa lettura su cui
  è stata calcolata» (fotografia di `dataUpdatedAt` presa alla scrittura accettata). Se tocchi
  quella condizione, il presidio che la tiene ferma è in `EstablishmentStructureView.spec.ts`.

### 4.3 Prisma

- ⚠️ **Prisma 5.22 compila un `update` con `where` esteso in UNA SOLA statement**
  (`UPDATE … WHERE id = $2 AND "retiredAt" IS NULL RETURNING …`) — **misurato**, col controllo
  accanto alla sonda: il `where` semplice produce `AND 1=1`. Quindi una guardia scritta così
  **chiude** la corsa, non la restringe. Su una versione diversa, **rimisuralo**.
- **`forTenant` vuole un `TenantId`, non una `string`.** **`@IsUUID` è vietato dal lint** →
  `@IsUuidShape()`. **`ApiError` SEMPRE da `@coralyn/data-layer`.** **P2003 → 409.**

### 4.4 Test — come si scrivono qui

- ⚠️ **Oltre 20 asserzioni indicizzano `[data-testid="scene-cell"] button` PER POSIZIONE.** Un
  secondo `<button>` là dentro le arrossa tutte senza difetti reali.
- ⚠️ **jsdom restituisce rettangoli a ZERO.** La geometria si prova solo iniettando i rect in
  funzioni pure, o stubbando `getBoundingClientRect` per elemento.
- ⚠️ **Le spec e2e sulla STRUTTURA costruiscono le fixture inline**: cinque su cinque.
  **Non estendere `seedMapTenant`**, usato da 16 file di cui due asseriscono la **cardinalità** del
  mondo seedato.
- ⚠️ **`Select` di ui-kit è reka-ui, non un `<select>` nativo**: usa `selectOption(trigger, label)`
  da `@/test/utils`. **Ti servirà per D-071.**
- ⚠️ **Su `Button.vue` il `disabled` passato come fallthrough VINCE** sul `:disabled` interno.
- **Per asserire un'invalidazione**: passa le chiavi al `QueryCache` **vero** e confronta l'**insieme
  esatto** delle voci scadute. Asserire la forma della chiave non distingue un prefisso troppo
  stretto da uno troppo largo.
- **e2e `maxWorkers: 1`**, calendario congelato al **2026-07-15**, suite di pacchetti diversi **una
  alla volta**: in parallelo su questo host danno falsi rossi di massa (timeout di collection).

### 4.5 Documenti e shell

- ⚠️ **Non passare testo con backtick o accentato a `node -e`** né dentro uno script di Workflow: la
  shell lo mangia in silenzio. Per Markdown usa **Edit/Write**.
- ⚠️ **Molti file sono CRLF**: un `replace` che cerca `\n` non matcha nulla.
- ⚠️ **`packages/contracts/dist` è tracciato e in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE.**
  Distinguili con `git diff --numstat`. È terreno di **D-068**.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build serve `--force`.
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
  ⚠️ E **verifica ogni path prima di scriverlo**: nella sessione 15 il gate ha preso un link a un ADR
  **inventato**, dentro il documento che raccontava come si estirpano i testi falsi.
- ⚠️ **`CLOSURE_MARKERS` di `docs-lint` è case-sensitive** (`/CHIUSA|CHIUSO|…/`).
- ⚠️ **Il parser di `deferred-registry.ts`** pretende indice ordinato per numero, anchor = ID, indice
  e voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al totale. Se cambi il
  **titolo** di una voce, cambialo **anche nella tabella indice**.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `brainstorming` +
  `design-docs` **prima** di toccare dominio, dati, flussi o decisioni — e D-071 è una decisione di
  prodotto, quindi comincia da lì. `systematic-debugging` **prima** di proporre un fix.
- ⚠️ **Questo utente delega la scelta strutturale.** «La soluzione più professionale, senza debiti e
  meno pigra» è una **DELEGA**: decidi tu e **argomenta**. Vuole leggere l'analisi, non farla.
  ⚠️ **«Meno pigra» NON vuol dire «più invasiva».**
- ⚠️⚠️ **«Sii sempre scettico» è un'istruzione permanente.** Verso i documenti, verso i subagenti, e
  **verso te stesso**. Nella sessione 15 due revisori si sono contraddetti su un dialogo: aveva
  ragione il secondo, e per saperlo è servito **aprire il file**.
- ⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.** Che il codice sappia fare una cosa non vuol dire che esista
  una UI che ci arriva. **Dichiara sempre di quale delle due stai parlando.** D-071 è esattamente
  una capacità (l'endpoint) senza percorso (sotto `lg`).
- ⚠️⚠️ **Una mutazione che non produce rossi prova l'assenza di COPERTURA, non l'assenza del
  difetto.** Se non arrossa, il passo successivo è **costruire a mano** il caso che dovrebbe.
- ⚠️ **Un gate verde NON è una review, e vale anche per le correzioni.**
- **Misura il PROBLEMA prima di risolverlo, e il RAGGIO D'AZIONE prima di toccare.**
- **La mutazione come prova, nei due versi**, contando *quanti* e *quali* test diventano rossi, **e
  dichiarando in quale runner** (`jest` per l'API, `vitest` per il frontend).
- **Correggi il testo falso, non annotarlo sotto** — ma se era **vero quando fu scritto**, dillo:
  «superato», non «falso».
- **Rigreppa i tuoi edit**: la stessa affermazione falsa spesso vive in più punti. Nella sessione 15
  una viveva in **sei**.
- **Nessun merge su `main` senza ok esplicito.** Ma **non lasciare nulla solo in locale a fine
  sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (`pnpm run test` ~8 min, e2e ~2,5, un passaggio di review avversariale ~20).

### 5b. La review avversariale, che ha pagato 5 volte su 5

Prima di proporre il merge di una slice non banale, l'utente la vuole. Forma che ha funzionato nella
sessione 15, ed è la migliore finora:

- **Tre passaggi distinti** — API, frontend, documenti — **non** un workflow unico: i workflow enormi
  non si riescono a governare.
- Ogni passaggio: **quattro lenti indipendenti**, poi **un confutatore ostile per ogni finding**.
- ⚠️ **Verdetto a TRE valori**: refutato / confermato / **incerto**. Un binario nasconde i casi in
  cui la refutazione non ha deciso, e sono proprio quelli che tocca misurare a te.
- ⚠️ **Una review finale d'insieme, DOPO le review dei singoli task.** Nella sessione 15 è l'unica
  che ha visto un difetto **corretto in un dialogo e lasciato nel suo gemello**: le review dei
  singoli task guardavano diff diversi e non potevano vederlo. **Se i task sono disgiunti, il
  passaggio d'insieme non è ridondante: è l'unico che vede i gemelli.**
- Ai subagenti **vieta**: citare un `.md` come prova, citare un commento nel codice come prova,
  asserire un'assenza senza il **comando esatto**, **eseguire qualsiasi suite di test** (falsi rossi
  di massa su questo host), modificare file.
- Pretendi finding **concreti**: `file:riga`, scenario con input e output sbagliato.
- ⚠️ **Leggi le refutazioni per intero, non solo i verdetti.**
- ⚠️ **Verifica di persona ogni finding grave prima di agire.** Nella sessione 15 tre affermazioni
  «alta» su tre hanno retto al controllo, ma una review **approvata** aveva torto.
- ⏱️ ~20 minuti a passaggio. **Chiedi il via all'utente prima di lanciarla: costa token.**

### 5c. Errori delle sessioni precedenti, da non ripetere

1. **Accettare una mutazione senza rossi come prova di una proprietà.** Prova solo che manca la
   copertura.
2. **Scegliere una correzione senza misurarne il raggio d'azione**: una scelta di controllore ha
   riaperto un difetto su un innesco diverso, e l'ha trovato la review, non l'autore.
3. **Approvare una review che aveva razionalizzato un testo falso**, quando un gemello corretto
   nello stesso branch asseriva l'opposto.
4. **Correggere un testo vero verso il falso**: è successo due volte, in due sessioni diverse.
   Quando correggi un documento, la prova è **sempre** il sorgente.

Il filo, ormai su nove sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.**

---

## 6. Il lavoro

### 6.1 D-071 — sotto `lg` non esiste alcun modo di riordinare *(la voce principale)*

**Perché conta:** non è un rifinimento di accessibilità, è **l'intero caso tablet e telefono**.
L'editor struttura è la schermata di configurazione iniziale, spesso fatta in spiaggia con un tablet,
e lì la struttura si modifica **solo** con crea/genera/elimina.

**La buona notizia, e va detta subito: la metà cara è già fatta e mergiata.**

| Già esistente | Dove |
|---|---|
| `POST /api/establishment/umbrellas/:id/move`, `@HttpCode(200)`, permesso ripetuto sul metodo | [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts) |
| Cinque guardie: 404 ombrellone · 409 ritirato (anche concorrente) · 404 fila · 422 `kind` diverso · 422 posizione fuori intervallo | [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) |
| L'aritmetica dell'ordine come funzione pura | [`umbrella-order.ts`](../../apps/api/src/establishment/umbrella-order.ts) |
| 13 presìdi e2e sull'endpoint | `apps/api/test/establishment-umbrellas-move.e2e-spec.ts` |
| Il composable `useMoveUmbrella`, con le invalidazioni già giuste | [`useEstablishmentStructure.ts`](../../apps/web-staff/src/features/establishment/useEstablishmentStructure.ts) |
| La disclosure sul prezzo, vera in tutti e tre i rami del suo gate | [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) |

**Manca solo un percorso che non dipenda dal puntatore.** L'ipotesi più probabile, già nominata in
ADR-0065 §Alternatives, è un controllo **«Sposta in…»** nel pannello ombrellone.

⚠️ **Le domande di disegno da portare all'utente, non da decidere da soli:**

1. **Il controllo si rende solo sotto `lg`, o sempre?** Se sempre, dà anche un equivalente da
   tastiera a `lg+` e chiude parte del buco di accessibilità che la decisione 5 aveva accettato —
   ma cambia il Cantiere anche dove il trascinamento funziona già.
2. **Come si esprime la posizione?** `position` è l'indice **FINALE** (decisione 9). Un menù «Sposta
   in…» deve esprimere **fila** *e* **posizione**, e «in coda» è quasi sempre ciò che serve: vale la
   pena chiedersi se la prima versione debba offrire solo la fila, con la coda implicita.
3. **Quali file offrire?** Solo quelle dello stesso `kind` (decisione 3). ⚠️ E qui morde il gotcha
   §4.1: **le file di un altro settore non sono nel DOM**, ma l'albero completo della struttura è in
   `data`, quindi il dato c'è — è la resa che è parziale, non la sorgente.
4. **La disclosure sul prezzo vale anche per questo percorso**, perché è una seconda via di scrittura
   verso lo stesso endpoint. Non duplicare il dialogo: riusare quello.

⚠️ **Non riaprire la decisione 5.** «Il trascinamento è solo `lg+`» resta vero. D-071 aggiunge un
**secondo canale**, non estende il primo.

### 6.2 D-072 — il rename sopprime la disclosure sul ripristino

Il settore d'origine di un ritirato si risolve per **nome**, dallo snapshot testuale `retiredFrom`
(«Settore · Fila») scritto al ritiro. Se il settore è stato rinominato dopo, l'origine non si
risolve e l'avviso tace.

**Costo:** codice piccolo, ma tira dentro **una migration** (una colonna su `Umbrella` per l'id
d'origine) e una **decisione su cosa farne dei ritirati già in archivio**, che quel dato non ce
l'hanno. ⚠️ Vedi §1c per la migration: `migrate dev` non funziona in questa shell.

Il comportamento attuale è **fermato da un presidio** in `BeachPanel.restore.spec.ts`: se lo cambi,
quel test deve arrossare. Se non arrossa, non hai cambiato ciò che credi.

### 6.3 D-073 — la Scheda cliente non è invalidata dalle mutazioni di struttura

**Preesistente a D-038**, e la voce lo dichiara: la stessa lacuna vale per il rename di un settore e
per il cambio di label di un ombrellone, entrambi su `main` da prima.

**Costo:** una riga (`['customer', tenantId]` in `structureKeys`), ma il **trade-off è più lungo del
codice**: quel prefisso scade anche liste e anagrafiche che la struttura non tocca. È una decisione,
non una digitazione.

### 6.4 D-074 — `.st-row-drop` può essere regola morta

Specificità 0-1-0 contro la 0-2-0 di `.st-row:hover`, sulla stessa proprietà `background`.

⚠️ **Va guardata a schermo PRIMA di toccarla.** La voce è scritta come **possibilità misurata sulla
cascata, non come fatto osservato**, e nella prova visiva del 2026-07-30 è rimasta **irrisolta**:
l'utente non ha confermato se la fila bersaglio si tinga o no. **Non trasformarla in un fatto senza
averla vista.** Rimedio: una riga. Lo stesso difetto è **preesistente** su `.st-row-sel`.

### 6.5 Numeri liberi

**Prossimo ADR libero: 0066.** **Prossima deferred libera: D-075.**

### 6.6 Altro lavoro tracciato, non in questa coda

- **D-070** — la dimensione «fila» del listino: capacità viva nell'engine che **nessuna UI scrive**,
  più due difetti annessi (l'edit conserva un `rowId` invisibile; `create` non valida la coerenza fra
  settore e fila). ⚠️ **È l'unica lunga**, e comincia con una scelta a tre: esporre la fila, chiudere
  solo la trappola dell'edit, o togliere la dimensione dal modello. **Non iniziarla senza deciderla.**
- **D-040** — ricalibrata: la lista chiavi icona è duplicata in **quattro** punti, non in uno.
  **Non è «quasi vuota»** come sostenevano i documenti precedenti.
- **D-068** — `packages/contracts/dist` tracciato e in CRLF.
- ⚠️ **`useRenewals` invalida `['map']` e `['subscriptions']` senza segmento tenant.** Ora che
  l'invalidazione parte **anche sui fallimenti**, un rinnovo respinto scatena una raffica di
  riletture che prima non partiva. Non è scorretto e non è tracciato come voce: è un'osservazione da
  tenere presente al prossimo lavoro sulle chiavi.

### 6.7 Azioni dell'utente ancora pendenti

1. **Bloccanti legali**: dati societari di Coralyn, scelta infrastruttura (hosting + email →
   sub-responsabili e trasferimenti extra-SEE), revisione dei punti ⚖️. Bloccano
   [D-061](../architecture/deferred.md#d-061) e [D-062](../architecture/deferred.md#d-062).
2. **P2-010** — `Booking.extras` è una colonna JSONB **morta** dichiarata come categoria di dati in
   4 documenti legali.
3. **AUD-015** (immagine Docker API single-stage come root) resta urgente **il giorno del primo
   deploy e non un giorno prima**: non esiste alcun VPS.

---

## 7. Ancore

- **La decisione di D-038**: [ADR-0065](../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md)
  — leggi §Alternatives prima di progettare D-071
- **Le voci**: [D-070](../architecture/deferred.md#d-070) · [D-071](../architecture/deferred.md#d-071) ·
  [D-072](../architecture/deferred.md#d-072) · [D-073](../architecture/deferred.md#d-073) ·
  [D-074](../architecture/deferred.md#d-074) · [D-040](../architecture/deferred.md#d-040) ·
  [D-068](../architecture/deferred.md#d-068)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue) ·
  [`umbrellaMove.ts`](../../apps/web-staff/src/features/establishment/umbrellaMove.ts) ·
  [`useEstablishmentStructure.ts`](../../apps/web-staff/src/features/establishment/useEstablishmentStructure.ts)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts) ·
  [`umbrella-order.ts`](../../apps/api/src/establishment/umbrella-order.ts)
- **Il data-layer condiviso**: [`useQueryResource.ts`](../../packages/data-layer/src/useQueryResource.ts)
- **Decisioni collegate**: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) ·
  [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md)
- **Design**: [design-system.md](../design/design-system.md)
- **Handoff precedente**: [2026-07-30 (15) rivista, corretta e provata](2026-07-30-d038-rivista-corretta-e-provata-manca-il-merge.md)
