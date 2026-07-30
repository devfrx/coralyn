# Handoff 2026-07-30 (sessione 14): D-038 è implementata e verde, mancano la review avversariale e la prova visiva

> **Punto d'ingresso unico.** Sostituisce
> [2026-07-29 spec e piano per D-038](2026-07-29-drag-reorder-spec-e-piano.md), che resta **superato**.
> Questo documento è **autosufficiente**: ambiente, gotcha, metodo e regole di ingaggio sono dentro,
> non per rimando. Il **§0.1 va letto prima di toccare qualsiasi cosa.**

---

## 0. In una riga

**I dieci task del piano D-038 sono fatti, tutti i gate sono verdi, il branch è spinto e NON
mergiato.** Mancano esattamente due passi, entrambi *dopo* i gate: la **review avversariale** e la
**prova visiva** (che richiede l'utente, perché le pagine sono dietro login). Poi si chiede il merge.

### 0.1 I primi cinque minuti

```bash
git fetch --all --prune && git status -sb && git log --oneline -12
```

Il repo ha **più di un clone attivo**: `git log --all` copre solo i ref locali, quindi `fetch`
prima di dichiarare che qualcosa non esiste.

`main` = **`68a061c`** (intatto). Il lavoro vive su **`feat/drag-reorder-ombrelloni-d038`** =
**`3b4ecda`**, spinto, **dieci commit** sopra i tre di soli documenti che c'erano già.

Poi, in ordine: **§1 (ambiente)**, **§2 (cosa non si rilitiga)**, **§4 (gotcha)**, **§5 (metodo)**,
**§6 (da dove ripartire)**.

⚠️ **Non riaprire il disegno della feature.** È stato deciso con l'utente, implementato, provato e
documentato in [ADR-0065](../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md).
Il §2 elenca cosa è chiuso.

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

⚠️ **CONTROLLA SE CI SONO GIÀ prima di chiederli.** **Cinque** handoff di fila li hanno dati per
assenti ed erano tutti al loro posto — anche in questa sessione. Se mancano davvero i valori
(JWT dev, password di `admin@coralyn.dev` e `super@coralyn.dev`), quelli sì vanno chiesti
all'utente: **il repo è PUBBLICO.**

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

```bash
docker compose up -d && docker compose ps   # db su 5432, mailpit su 1025/8025
```

- ⚠️ **Il daemon Docker può essere giù.** Su Windows:
  `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`.
  **Prima di diagnosticare un rosso e2e, `docker ps`.**
- **La porta è la 5432.** Il container la espone anche sulla 5433: sono lo stesso database.

⚠️⚠️ **Il seed fallisce con `P2002` su `Umbrella` in `coralyn_dev`, e NON è un difetto**: le label
esistono attive sotto uuid casuali (ombrelloni creati via app) e collidono con l'indice parziale.
**Non "correggere" il seed** — `docker-entrypoint.sh:18` dichiara che il fallimento è fatale di
proposito («`SEED_ON_START=true` è una richiesta esplicita, se non riesce va detto»), e
`docker-compose.yml:62` porta già il comando giusto in un commento.

⚠️⚠️ **La forma bash non funziona in PowerShell.** `SEED_ON_START=false docker compose …` è sintassi
bash: in PowerShell il prefisso `VAR=x` **non fa nulla** e il seed parte lo stesso, facendo morire
`coralyn-api` con exit 1. È successo in questa sessione. La forma giusta:

```bash
$env:SEED_ON_START = "false"; docker compose --profile full up -d --build
```

⚠️ **`prisma migrate dev` NON funziona in questa shell**: è interattivo. Per generare l'SQL usa
`prisma migrate diff … --script`, poi scrivi a mano la migration e fai `migrate deploy`.
*(D-038 non ha migration, e non ne servono per i due passi che restano.)*

⚠️ **`prisma db seed` rifiuta ogni DB il cui nome non matcha `/^coralyn_(dev|test)/i`.**

⚠️ **Per ispezionare i dati serve l'utente `coralyn`** (superuser, BYPASSRLS): con `coralyn_app`
l'RLS ti dà zero righe e la verifica *sembra* pulita.
Esempio: `docker exec coralyn-db psql -U coralyn -d coralyn_dev -c '…'`.

### 1d. Il resto

- **`gh` NON è installato.** Per la CI: `https://api.github.com/repos/devfrx/coralyn/actions/runs`.
- **La CI gira solo su `main` e sulle PR** — spingere un branch non la lancia.
- ⚠️ **`cancel-in-progress: true`**: **guarda sempre l'ultimo run, non il penultimo.**
- ⚠️ **Python NON è installato** (`python3` apre lo Store). Per manipolare testo usa Edit/Write.
- ⚠️ **Un `grep -rn` ricorsivo su tutto il repo va in timeout (>120 s).** Usa lo strumento Grep, che
  rispetta il gitignore, o restringi il path.
- **Il repo è PUBBLICO.**

---

## 2. Cosa NON si rilitiga

Tutte prese **con l'utente**, e implementate. Riaprirle significa rifare conversazioni già fatte.

| # | Decisione | Dove vive |
|---|---|---|
| 1 | **Lo scope è D-038, non D-005.** Riordino **logico**; `Umbrella.presentationPosition` non si tocca | ADR-0065 §Neutre |
| 2 | **Un ombrellone per volta.** Niente lista riordinabile né selezione multipla trascinabile | ADR-0065 §1 |
| 3 | **Destinazione: una fila del proprio settore o di un altro dello stesso `kind`.** Mai `grid → special` | ADR-0065 §4 |
| 4 | **Sul prezzo: disclosure, non blocco**, estesa anche a `restore` | ADR-0065 §6 |
| 5 | **Nessun equivalente da tastiera → la feature è solo `lg+`.** Il caso scoperto è D-071 | ADR-0065 §10 |
| 6 | **File e settori NON si riordinano.** D-038 è chiusa **solo per l'ombrellone** | deferred.md, voce D-038 |
| 7 | 🆕 **Tab a molla** per raggiungere un altro settore. Scelta **delegata dall'utente** con la formula «la soluzione più professionale, senza debiti»; le tre alternative sono in ADR-0065 §Alternatives | ADR-0065 §9 |
| 8 | 🆕 **`hasDedicatedRates` calcolato dal server**, non `useRates` nel frontend. Stessa delega, tre ragioni misurate | ADR-0065 §7 |
| 9 | 🆕 **`position` è l'indice FINALE**, non l'indice d'inserimento | ADR-0065 §3 |
| 10 | 🆕 **Maniglia fuori dalla cella**, `<span>` non `<button>`, `aria-hidden`, non focalizzabile | ADR-0065 §8 |
| 11 | 🆕 **HTML5 drag-and-drop nativo, nessuna libreria** | ADR-0065 §11 |
| 12 | 🆕 **`POST :id/move` risponde 200** (`@HttpCode(200)`), come i sei POST d'azione di `bookings.controller.ts` | ADR-0065 §Neutre |

⚠️ Sul punto 5: l'utente ha scelto **conoscendo il trade-off**, che gli era stato esposto. Non
riproporlo.

---

## 3. Baseline **nuova** (branch `3b4ecda`)

| Suite | Comando | valore |
|---|---|---|
| `@coralyn/docs-lint` | `pnpm --filter @coralyn/docs-lint test` | 68 (5) |
| `@coralyn/legal` | `pnpm --filter @coralyn/legal test` | 11 (1) |
| api unit | `pnpm --filter @coralyn/api test` | **442 (61)** |
| `ui-kit` | `pnpm --filter @coralyn/ui-kit test` | 212 (39) |
| `@coralyn/data-layer` | `pnpm --filter @coralyn/data-layer test` | 32 (5) |
| `web-customer` | `pnpm --filter @coralyn/web-customer test` | 35 (7) |
| `web-platform` | `pnpm --filter @coralyn/web-platform test` | 23 (7) |
| `web-staff` | `pnpm --filter @coralyn/web-staff test` | **537 (64)** |
| tutto insieme | **`pnpm run test`** | **1360 / 189** |
| api e2e | `pnpm --filter @coralyn/api test:e2e` | **542 / 45** |
| lint | `pnpm run lint` | 0 err / 87 warn |
| typecheck | `pnpm run typecheck` | 9 progetti |

**Su `main` la baseline è ancora 1268/185 e 529/44.** Se i numeri non tornano è l'ambiente, non il
codice. ⏱️ `pnpm run test` ~8 min, `test:e2e` ~3 min (non 10-15: la stima del vecchio piano era
larga di quattro volte su questo host).

---

## 4. Gotcha

### 4a. I letali, misurati in questa sessione

- ⚠️⚠️ **La scena dell'editor rende UN SOLO settore per volta.** `StructureScene.vue` sceglie
  `current` e rende `v-for="r in current.rows"` sotto `v-if="current"`; i settori sono `role="tab"`.
  **Le file di un altro settore non sono nel DOM.** È la misura che ha cambiato il disegno a
  endpoint già scritto: senza i tab a molla, lo spostamento fra settori sarebbe stato capacità
  dell'API senza percorso nel prodotto. **È il caso-scuola di «capacità ≠ percorso reale».**
- ⚠️⚠️ **`ValidationPipe` è senza `forbidNonWhitelisted`** (`configure-app.ts:18`): un campo non
  dichiarato nel DTO viene **scartato in silenzio, con 200**.
- ⚠️⚠️ **Il ramo idempotente di `restore` IGNORA `input.rowId`** e risponde 200. Non replicarlo.
- ⚠️⚠️ **NESSUNA query filtra `retiredAt`**: l'esclusione di un ritirato dipende solo da
  `rowId = null`. Il `move` ha una guardia 409 apposta; qualunque scrittura nuova su `rowId` ne ha
  bisogno.
- ⚠️⚠️ **`@RequiresPermission` sta sulla CLASSE** e `authorization-coverage.spec.ts:56-57` legge
  «metodo ?? classe»: un endpoint nuovo eredita il permesso **in silenzio**. **Misurato**: togliendo
  il decoratore da `move`, il 403 e2e resta verde e `authorization-coverage` resta verde — l'unico
  presidio che lo vede è quello in `umbrellas.service.spec.ts`.
- ⚠️⚠️ **La guardia `establishmentId` su `move` NON è distinguibile a runtime**: `forTenant` imposta
  già l'RLS, quindi togliendola **zero e2e diventano rossi** (misurato). A tenerla è un'asserzione di
  **forma** nell'unit. Non toglierla credendola ridondante: è difesa in profondità dichiarata in
  ADR-0065 §Negative.
- ⚠️ **`CLOSURE_MARKERS` di `docs-lint` è case-sensitive** (`/CHIUSA|CHIUSO|…/`): una voce chiusa
  scritta «chiusa» minuscolo fa fallire il gate con un messaggio poco esplicito.
- ⚠️ **`git add packages/contracts/dist/*` stampa un avviso «paths are ignored»** ma **stage lo
  stesso**, perché quei file sono tracciati. L'avviso fa fallire una catena `&&`: non è un errore.

### 4b. Documenti che mentivano — ORA CORRETTI (non riaprirli)

Otto correzioni sono nel commit `3b4ecda`. Le più utili da conoscere:

- **ADR-0052** non esclude più il drag&drop, e non dice più `@Roles(Role.Admin)` (era **vero quando
  fu scritto**, 2026-07-22, e **superato** da ADR-0057 del 2026-07-25 — non era una bugia).
- **ADR-0020 e ADR-0018**: anello **corallo**, non teal; **cinque** stati, non quattro;
  `UmbrellaCell`, non `OmbrelloneCell`. Corretti entrambi, perché la claim nasceva in ADR-0018.
- **D-040** descriveva un file da «~406 righe / 5 modali» che oggi è **224 righe senza modali**.
  ⚠️ **Ricalibrata il 2026-07-30:** la parte «è quasi vuota, la union icone è in un punto» era
  sbagliata. Vuoto è `SectorKind` (già esportato dai contracts); la **lista delle chiavi** icona è
  ancora nei **quattro** punti di sempre — gli `ICON_KEYS` dei due DTO tipologia (create e update) e
  i due di `BeachPanel.vue` (tipo del `ref` + gli `<Option>` della Select). **Non** è candidata alla
  chiusura per questa via.
- **`design-system.md`**: il test di contrasto in CI **non esiste**; «solo token verificato da lint»
  **non esiste**. ⚠️ **Ricorretto il 2026-07-30:** e **nemmeno** il gate sul confine `ui-kit` esiste.
  `eslint.config.mjs` ha un solo `no-restricted-imports`, ed è il divieto di `IsUUID` su `apps/api`;
  «ui-kit» compare in quel file solo dentro un commento su un'altra regola. La spec diceva «due gate
  inesistenti» e aveva ragione: a esagerare fu la correzione, non la diagnosi.
- **spec §5.3** diceva «ogni spec dell'editor gira nel ramo Drawer»: **falso**.
  `EstablishmentStructureView.spec.ts:50-67` ha già `stubDesktopMatchMedia()` in un `beforeEach`
  globale del file (era `:51-63` contro `main`; il branch ha spostato quelle righe). Non aggiungere
  stub a `src/test/setup.ts`: ribalterebbe il ramo di ogni spec. ⚠️ La stessa frase falsa era
  rimasta nel **piano** §Task 7 insieme all'istruzione che ne discendeva: corretta il 2026-07-30.
- **spec §5.6** chiedeva un dialogo «che nomina le tariffe e il loro prezzo»: **non ha una risposta
  unica corretta**, perché le tariffe sono per stagione e la conseguenza è sui rinnovi.

### 4c. Test — come si scrivono qui

- ⚠️ **Le spec e2e focalizzate sulla STRUTTURA costruiscono le fixture inline** (`createEstablishment`
  + `tx.sector.create`): sono **cinque su cinque**. `seedMapTenant` serve alle suite in cui la
  struttura è incidentale (prenotazioni, tariffe, report), ed è usato da 16 file — due dei quali
  asseriscono la **cardinalità** del mondo seedato (`map.e2e-spec.ts:53`,
  `establishment.e2e-spec.ts:66`). Non estenderlo.
- ⚠️ **Oltre 20 asserzioni indicizzano `[data-testid="scene-cell"] button` PER POSIZIONE.** Un
  secondo `<button>` dentro la cella le arrossa tutte senza difetti reali. La maniglia è fuori
  apposta, e c'è un presidio in `StructureRow.spec.ts` che è l'**unico** a vederlo.
- ⚠️ **`Select` di ui-kit è reka-ui, non un `<select>` nativo**: usa `selectOption(trigger, label)`
  da `@/test/utils`. C'è già un uso su quella stessa Select in
  `EstablishmentStructureView.spec.ts`, sul trigger `[data-testid="retired-restore-row"]` (era
  `:601` contro `main`, oggi `:639`: la coordinata invecchia, il `data-testid` no).
- ⚠️ **jsdom restituisce rettangoli a ZERO.** La geometria si prova **solo** iniettando i rect in
  funzioni pure (`umbrellaMove.ts`), oppure stubbando `getBoundingClientRect` per elemento.
- **Per asserire un'invalidazione**: `vi.spyOn(QueryClient.prototype, 'invalidateQueries')` e leggi
  le **chiavi vere**. È comportamento, non forma.
- **Per distinguere un'anteprima ottimistica da un refetch**: handler MSW che risolve solo quando lo
  rilasci tu (`await new Promise(r => { release = r })`).
- **e2e `maxWorkers: 1`**, **calendario congelato al 2026-07-15**, suite di pacchetti diversi **una
  alla volta** (in parallelo su questo host danno falsi rossi di massa).

### 4d. Ereditati e ancora validi

- ⚠️ **Non passare testo con backtick a `node -e` dentro Bash** né dentro uno script di Workflow: la
  shell li cancella in silenzio. Per Markdown e non-ASCII usa **Edit/Write**.
- ⚠️ **Molti file sono CRLF**: un `replace` che cerca `\n` non matcha nulla.
- ⚠️ **`packages/contracts/dist` è tracciato e in CRLF**: dopo `pnpm install` risulta modificato con
  `git diff` **vuoto** → `git checkout --`. **Ma se hai cambiato `contracts/src` il diff è REALE.**
  Distinguili con `git diff --numstat`. È terreno di **D-068**.
- ⚠️ **Vite pre-bundla `@coralyn/contracts`**: dopo un build, un dev server già avviato serve la
  copia vecchia. Serve `--force`.
- ⚠️ **Su `Button.vue` il `disabled` passato come fallthrough VINCE** sul `:disabled` interno.
- ⚠️ **In TanStack Query v5 `isLoading = isPending && isFetching`.**
- ⚠️ **Il gate dei link giudica su `git ls-files`**: `git add` di un file nuovo **prima** di linkarlo.
- ⚠️ **Il parser di `deferred-registry.ts`** pretende indice ordinato per numero, anchor = ID, indice
  e voci coincidenti ID-per-ID e stato-per-stato, riga dei conteggi agganciata al totale.
- ⚠️ **`git add -A` sweepa i file di lavoro.** Guarda la lista dei file prima di committare.
- ⚠️ **Le pagine di web-staff sono dietro login e l'agente non può autenticarsi**: per la prova
  visiva chiedi all'utente di entrare nella Browser pane.
- ⚠️ **Il merge su `main` può essere negato dal classificatore dei permessi.** Non aggirarlo con
  `reset --hard` o con un push che riscrive `main`: riprova, e se resta bloccato chiedilo all'utente.
- **`forTenant` vuole un `TenantId`, non una `string`.** **`@IsUUID` vietato** → `@IsUuidShape()`.
  **`ApiError` SEMPRE da `@coralyn/data-layer`.** **P2003 → 409.**
- **Su template Vue usa `Edit`, non regex.**

---

## 5. Metodo

### 5a. Regole di ingaggio *(valgono sempre)*

- **Skill `dev-discipline` + `dev-communication` sempre**, in apertura. `brainstorming` +
  `design-docs` prima di toccare dominio, dati, flussi o decisioni. `systematic-debugging` **prima**
  di proporre un fix. `compliance-docs` per legale/GDPR.
- ⚠️ **Questo utente delega la scelta strutturale.** «La soluzione più professionale, più coerente,
  senza debiti e meno pigra» è una **DELEGA**: decidi tu e **argomenta**. In questa sessione l'ha
  usata **due volte**, e in entrambi i casi voleva leggere l'analisi, non farla.
  ⚠️ **«Meno pigra» NON vuol dire «più invasiva»**: è il criterio con cui è stata scartata l'ipotesi
  di rendere tutti i settori insieme.
- ⚠️⚠️ **«Sii sempre scettico» è un'istruzione permanente.** Vale verso i documenti, verso i
  subagenti, e **verso te stesso**.
- ⚠️⚠️ **CAPACITÀ ≠ PERCORSO REALE.** Che il codice sappia fare una cosa non vuol dire che esista una
  UI che ci arriva. **Dichiara sempre di quale delle due stai parlando.**
- **Nessun merge su `main` senza ok esplicito.** Ma **non lasciare nulla solo in locale a fine
  sessione**: si lavora su più macchine. Spingere il **branch** non è un merge.
- **Misura il PROBLEMA, non solo la soluzione.** Prova le claim invece di citarle.
- **La mutazione come prova, nei due versi**, contando *quanti* e *quali* test diventano rossi, **e
  dichiarando in quale runner** (`jest` per l'API, `vitest` per il frontend). Vale anche per i
  presìdi che scrivi tu.
- ⚠️ **Un gate verde NON è una review, e vale anche per le correzioni.**
- **Correggi il testo falso, non annotarlo sotto** — ma se era **vero quando fu scritto**, dillo:
  «superato», non «falso».
- **Rigreppa i tuoi edit.** In questa sessione ha trovato che l'«anello teal» nasceva in ADR-0018 e
  non solo in ADR-0020.
- **Dai lo stato a intervalli** senza aspettare «quanto ancora?», e **dichiara prima le attese
  lunghe** (`pnpm run test` ~8 min, e2e ~3, review avversariale ~20).
- **Workflow PICCOLI e in sequenza**, non uno enorme: costano troppi token. Ai subagenti **vieta di
  citare i `.md` e i commenti nel codice**, pretendi `file:riga` e il **comando esatto** per ogni
  asserzione di assenza, e mettici sempre un **confutatore**.

### 5b. Cosa ha pagato in questa sessione

- **Misurare il raggio d'azione prima di toccare.** Due volte la misura ha ribaltato la scelta: 16
  spec usano `seedMapTenant` (→ helper additivo, poi rimosso del tutto quando ho visto che le spec
  sorelle vanno inline), e il contratto rompeva **5 file, non i 19** che il grep suggeriva.
- **Leggere le spec SORELLE, non solo i chiamanti.** È così che è emersa la convenzione delle
  fixture inline, contro cui avevo già committato.
- **Il controllo accanto alla sonda.** Un 401 su `POST :id/move` non prova nulla da solo: è il 404 su
  una rotta inventata a renderlo significativo.
- **La mutazione che NON produce rossi è un risultato**, non un fallimento: è così che si è scoperto
  che l'RLS copre già la guardia `establishmentId`.

### 5c. Errori miei, da non ripetere

1. **Ho presentato un helper di fixture condiviso come la scelta migliore** senza aver letto come
   scrivono le spec sorelle. L'ho rimosso al task dopo.
2. **Un `replace_all` troppo largo** ha sporcato tre asserzioni in `sectors.service.spec.ts` insieme
   ai mock che volevo cambiare. Il test l'ha trovato; il grep no.
3. **Una mutazione sporca**: ho *aggiunto* la maniglia dentro la cella invece di spostarla, e ho
   letto un secondo rosso che era un artefatto dei doppioni. Rifatta pulita prima di riportare.
4. **Due attese di test sbagliate**, entrambe corrette dal codice e non viceversa: la posizione
   attesa in uno spostamento fra file, e il caso «uscire da un settore tariffato».
5. **Ho accusato ADR-0052 di aver mentito** su `@Roles`, quando era vero alla data di scrittura e
   solo superato dopo.

Il filo, ormai su otto sessioni: **lo strumento si rompe, l'oggetto misurato quasi mai.**

---

## 6. Da dove ripartire

### 6.1 I due passi che restano, in ordine

**1. Review avversariale** — ⏱️ ~20 min. L'utente l'ha chiesta esplicitamente («un gate verde non è
una review, e vale anche per le correzioni») e **ha pagato 4 volte su 4**. ⚠️ Chiedi il via prima di
lanciarla: costa token, e l'utente ha detto che i workflow enormi non riesce a gestirli. Forma
suggerita: **tre passaggi distinti** — API, frontend, documenti — ognuno con un **confutatore**, non
un workflow unico. ⚠️ **Leggi le refutazioni, non solo i verdetti.**

**2. Prova visiva** — richiede l'utente: le pagine sono dietro login e l'agente non può
autenticarsi. Servono **due schermi**: `lg+` dove il gesto deve funzionare, e **sotto `lg`** dove la
maniglia dev'essere **assente**. Da guardare in particolare: la **molla sui tab** (sosta ~0,7 s su un
altro settore `grid`), il fatto che sul tab `special` la molla **non** scatti, e la **barra corallo**
d'inserimento, che non deve far ballare le celle.
⚠️ Aggiunti alla lista il 2026-07-30, perché jsdom non li può vedere: (a) la **maniglia** non sbiadisce
più insieme alla cella trascinata — effetto collaterale di una correzione, va guardato se è
accettabile o se stona; (b) l'**evidenza della fila bersaglio** (`.st-row-drop`), che sulla carta è
battuta da `.st-row:hover` e potrebbe non vedersi affatto — è [D-074](../architecture/deferred.md#d-074).

⚠️ Le immagini Docker sono ferme a prima degli ultimi commit: per vedere il codice attuale usa
`pnpm --filter @coralyn/web-staff dev` contro l'API in container.

**3. Poi**, e non prima: chiedere il merge. Fast-forward su `main`, push. **Mai senza ok esplicito.**

### 6.2 Cosa è stato costruito (per orientarsi nel diff)

| Dove | Cosa |
|---|---|
| `packages/contracts/src/index.ts` | `MoveUmbrellaInput`; `StructureSectorDTO.hasDedicatedRates` |
| `apps/api/src/establishment/umbrella-order.ts` | logica pura dell'intervallo, unione discriminata come `PriceResult` |
| `apps/api/src/establishment/umbrellas.service.ts` | `move()` con cinque guardie |
| `apps/api/src/establishment/umbrellas.controller.ts` | `POST :id/move`, `@HttpCode(200)`, permesso sul metodo |
| `apps/api/src/establishment/establishment-structure.select.ts` | `_count: { rates: true }` |
| `apps/api/test/establishment-umbrellas-move.e2e-spec.ts` | 13 presìdi, fixture inline |
| `apps/web-staff/.../umbrellaMove.ts` | `targetIndex`, `isCompatible`, `applyMove`, `UmbrellaDrag` |
| `apps/web-staff/.../StructureRow.vue` | maniglia, drop target, barra d'inserimento |
| `apps/web-staff/.../StructureScene.vue` | stato del drag, tab a molla |
| `apps/web-staff/.../EstablishmentStructureView.vue` | mutazione, anteprima ottimistica, disclosure |
| `apps/web-staff/.../panels/BeachPanel.vue` | disclosure sul ripristino |
| `docs/architecture/decisions/0065-*.md` | l'ADR |

### 6.3 Numeri liberi

**Prossimo ADR libero: 0066.** **Prossima deferred libera: D-075.**
D-070 e D-071 sono state aperte in questa sessione, D-038 chiusa. **Aggiornato il 2026-07-30:** la
review avversariale ha aggiunto **D-072** (rename del settore che zittisce la disclosure sul
ripristino), **D-073** (Scheda cliente non invalidata — **preesistente**) e **D-074**
(`.st-row-drop` battuta da `.st-row:hover`); il caso delle tariffe di **fila** cieche a
`hasDedicatedRates` è finito **dentro D-070**, che già lo copriva, invece che in una voce nuova.

### 6.4 Lavoro successivo, quando D-038 sarà mergiata

- **D-071** (sotto `lg` il riordino non esiste) — l'ipotesi più probabile è il controllo
  «Sposta in…» nel pannello ombrellone, che è anche l'alternativa scartata in ADR-0065 §Alternatives
  proprio perché avrebbe intaccato questa voce.
- **D-070** (la dimensione «fila» del listino).
- **D-040** — ~~candidata alla chiusura~~ **no**: vedi §4b, la duplicazione che traccia è intatta.
- **D-068** — `packages/contracts/dist` tracciato e in CRLF.

### 6.5 Azioni dell'utente ancora pendenti

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
  [D-071](../architecture/deferred.md#d-071)
- **L'editor**: [`EstablishmentStructureView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../apps/web-staff/src/features/establishment/StructureRow.vue) ·
  [`umbrellaMove.ts`](../../apps/web-staff/src/features/establishment/umbrellaMove.ts)
- **L'API**: [`umbrellas.service.ts`](../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../apps/api/src/establishment/umbrellas.controller.ts) ·
  [`umbrella-order.ts`](../../apps/api/src/establishment/umbrella-order.ts)
- **Decisioni collegate**: [ADR-0052](../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0020](../architecture/decisions/0020-resa-mappa.md) ·
  [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md) ·
  [ADR-0053](../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0057](../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md) ·
  [ADR-0062](../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md) ·
  [ADR-0063](../architecture/decisions/0063-permessi-staff-configurabili-per-operatore.md) ·
  [ADR-0064](../architecture/decisions/0064-permessi-vicini-gate-per-query.md)
- **Design**: [design-system.md §15.7](../design/design-system.md)
- **Handoff precedente**: [2026-07-29 spec e piano per D-038](2026-07-29-drag-reorder-spec-e-piano.md)
