# Icona della tipologia ombrellone: dal registro chiuso al catalogo Lucide intero

**Data:** 2026-08-03 · **Stato:** design approvato, non ancora implementato · **ADR previsto:** 0068

> **Revisione avversariale del 2026-08-03**: quattro lenti, 39 grezzi, 30 distinti dopo la
> deduplicazione per ancoraggio, 15 confermati e 15 refutati. Le correzioni sono incorporate qui.
> Tutti i numeri di questa versione sono stati ricontati a mano dopo la revisione.

## 1. Il problema

Chi crea una tipologia di ombrellone può scegliere fra **tre** icone: `umbrella`, `leaf`,
`palmtree`. Il nome è già libero. L'obiettivo è rendere l'icona altrettanto libera — **tutte** le
icone della libreria già in uso, disponibili e ricercabili — e farlo come funzione integrante del
software, non come controllo appoggiato sopra al pannello.

Il vincolo a tre valori non sta nel database. Sta in questi punti applicativi:

| Dove | Cosa | Effetto |
|---|---|---|
| [`create-umbrella-type.dto.ts`](../../../apps/api/src/establishment/dto/create-umbrella-type.dto.ts) | `ICON_KEYS` + `@IsIn` | l'API rifiuta ogni altro nome con 400 |
| [`update-umbrella-type.dto.ts`](../../../apps/api/src/establishment/dto/update-umbrella-type.dto.ts) | `ICON_KEYS` + `@IsIn`, identici | idem, duplicati |
| [`BeachPanel.vue`](../../../apps/web-staff/src/features/establishment/panels/BeachPanel.vue) | tre `<Option>` e il tipo del `ref` | l'operatore ne vede tre |
| [`MapView.vue`](../../../apps/web-staff/src/features/map/MapView.vue) | la **legenda** della Mappa, scritta a mano | vedi §4.2: è il quinto punto, e la revisione l'ha trovato |

E sotto a tutti c'è il muro vero: [`icons/registry.ts`](../../../packages/ui-kit/src/icons/registry.ts)
importa **41** icone a mano, staticamente, e [`Icon.vue`](../../../packages/ui-kit/src/components/Icon.vue)
risolve con `icons[name] ?? icons[FALLBACK_ICON]`. Anche togliendo i **due** `@IsIn`, un `anchor`
salvato nel database verrebbe reso **come un ombrellone, in silenzio**. `unplugin-icons` risolve
`~icons/lucide/<nome>` a **build time**: non esiste un import con nome dinamico.

## 2. Cosa esiste già — misurato in sessione, non assunto

- **La libreria giusta è già installata.** `@iconify-json/lucide@1.2.114`, dichiarata in **quattro**
  `package.json` (`ui-kit`, `web-staff`, `web-platform`, `web-customer`), tutti a `^1.2.114`.
  **Nessuna nuova dipendenza al repo.**
- **Licenza ISC**, letta da `info.json` del pacchetto: `"license": { "title": "ISC", "spdx": "ISC" }`,
  autore «Lucide Contributors». Permissiva come MIT: uso commerciale e rivendita del gestionale
  liberi, nessuna royalty, nessuna attribuzione richiesta nell'interfaccia.
- **1803 icone, di cui 60 `hidden`** (deprecate): le **offerte sono 1743**, che è esattamente il
  totale dichiarato da `info.json`. Più **214** alias utili.
- **`palmtree` non è un nome Lucide: è un alias di `tree-palm`** — e lo è in Lucide stesso.
- **Il database è già libero.** `UmbrellaType.icon` è `String?` in
  [`schema.prisma`](../../../apps/api/prisma/schema.prisma). **Nessuna migration.**
- **Il nome è già libero.** `@IsNotEmpty @MaxLength(60)`, nessun elenco chiuso.
- **Nel database di sviluppo esistono due sole tipologie**, `palmtree` e `leaf`, entrambe
  risolvibili, e **zero** righe con `icon` NULL (contate con `psql` come utente `coralyn`, che è
  esente da RLS). Il fallback nuovo non cambia quindi la resa di nessuna riga esistente.

### 2.1 I pesi — due metriche, entrambe vere

Il catalogo delle sole icone offerte pesa **78,0 KB gzip** (494,4 raw). Il costo va letto su **due**
metriche diverse, e la revisione ha mostrato che riportarne una sola è fuorviante:

| Metrica | Oggi | Col catalogo | Delta |
|---|---|---|---|
| **Byte totali alla prima visita** | 400,7 KB | 478,7 KB | **+19%** |
| **JS che blocca il primo render** | 113,3 KB | 191,3 KB | **+69%** |

La prima riga vale perché web-staff è una PWA il cui service worker **precacha tutti e 58 i chunk**
(`globPatterns: ['**/*.{js,css,html,svg,png,woff2}']` in `vite.config.ts`): i 287 KB di chunk per
rotta non sono byte risparmiati, sono byte scaricati comunque. La seconda vale perché `index.html`
carica **solo** `index` più un `modulepreload` di `vue.runtime`: il catalogo, essendo eager, entra lì.

**Il tempo al primo render peggiora del 69%, i byte totali del 19%.** La decisione 1 è stata presa
conoscendo il solo +19%: va riconfermata sapendo anche l'altro numero.

Contro le altre due app:

| App | JS gzip oggi | rende icone di dominio? |
|---|---|---|
| `web-staff` | 400,7 KB | **sì** |
| `web-platform` | 98,1 KB | **no** |
| `web-customer` | 89,2 KB | **no** |

L'ultima colonna è stata verificata con una ricerca **validata**: `umbrellaTypes\|typeIcon\|\.icon`
sui `.vue`/`.ts` di `apps/*/src`, esclusi spec e mocks, trova 8 righe in `web-staff` (caso noto
presente) e **zero** nelle altre due. ⚠️ **Perimetro:** fuori da quei file, o per un nome costruito
per concatenazione, la ricerca resta cieca.

## 3. Decisioni prese con l'utente

| # | Decisione | Perché |
|---|---|---|
| 1 | **Il catalogo sta nel bundle, non in un chunk lazy** | scelta dell'utente. ⚠️ Presa conoscendo il +19% sui byte totali, **non** il +69% sul render-blocking: vedi §2.1 |
| 2 | **Ma solo nel bundle di `web-staff`** | le altre due app non rendono icone di dominio |
| 3 | **Perimetro: sottosistema del ui-kit con un solo consumatore oggi** | dare un'icona a Settore e Fila richiederebbe due colonne e due migration per un bisogno non espresso |
| 4 | **Il picker suggerisce in cima, cerca su tutte** | Lucide contiene `bitcoin` e `syringe`: nessuna icona è preclusa, cambia solo cosa si vede per primo |
| 5 | **Nessuna migration dei dati esistenti** | gli alias fanno risolvere `palmtree` da soli |
| 6 | **L'API valida contro l'elenco Lucide vero** | senza, un client scrive spazzatura nel database e la Mappa mostra il fallback per sempre |
| 7 | **Il nome non si tocca** | è già libero |

## 4. Architettura

### 4.1 Nel ui-kit

**`icons/registry.ts` cambia in tre punti soli**, e non per allargamento:

Il primo è un conflitto di spazio dei nomi che la revisione ha misurato e che il disegno originale
non vedeva. Confrontando il glifo che ogni chiave **disegna** con quello che Lucide chiama **con quel
nome**, due chiavi fanno ombra a icone vere:

| Chiave | Il registry disegna | Lucide con quel nome |
|---|---|---|
| `edit` | `pencil` | alias di `square-pen` — **glifo diverso** |
| `building` | `building-2` | icona propria — **glifo diverso** |

Senza rimedio, un operatore che sceglie `edit` dal picker vedrebbe la matita sulla Mappa: nessun
errore, nessun fallback, solo l'icona sbagliata. Le due chiavi vanno quindi **rinominate al nome
Lucide che già rendono** — `edit` → `pencil`, `building` → `building-2` — e il costo è misurato:
**10** occorrenze per `edit` e **zero** per `building`. ⚠️ Le dieci si trovano solo cercando **due
forme**: `name="edit"` ne dà 3, e `icon="edit"` — la prop di `IconButton` — le altre 7. Cercare la
sola prima forma ne manca sette. Le altre tre chiavi non canoniche (`chart`,
`renew`, `logout`) **non esistono in Lucide**, quindi non fanno ombra e restano: rinominarle sarebbe
invasività senza guadagno.

Il secondo è `FALLBACK_ICON`, che è esportato dal barrel e vale `'umbrella'`. Col fallback visibile
quella costante direbbe il falso restando pubblica: va **ripuntata** a una chiave che si legge come
«icona ignota». Così resta l'unica fonte del fallback, non muore e non mente.

Per il resto il registry non si tocca: le sue icone del chrome restano import statici e
tree-shakeable.

`icons/catalog.ts` — **nuovo**. Espone il tipo del catalogo e le funzioni pure che lo interrogano:
risoluzione di un nome (icone **e** alias) e ricerca per sottostringa. Non importa nulla di Lucide:
riceve i dati.

`icons/lucide-catalog.ts` — **nuovo**. È l'unico file che importa `@iconify-json/lucide`, e **esclude
le 60 icone `hidden`**. Sta dietro un **entry point separato** del package,
`@coralyn/ui-kit/icons/lucide`, esattamente come il repo fa già per `./toasts`: un entry separato è
più forte del solo tree-shaking, perché chi non lo importa non può trascinarlo dal barrel.

⚠️ **Il range semver va tenuto identico** a quello dei quattro `package.json` che già lo dichiarano.
Se `apps/api` e `packages/ui-kit` divergessero, il picker offrirebbe un nome che il decoratore
rifiuta con 400, e l'operatore vedrebbe «salvataggio fallito» su un'icona che l'interfaccia gli ha
proposto. Nel repo non esiste oggi nulla che lo impedisca.

`icons/registered-catalog.ts` — **nuovo**. Lo stato di registrazione: parte vuoto,
`registerIconCatalog(c)` lo riempie. È l'inversione che permette alla decisione 1 e alla 2 di
convivere.

`Icon.vue` — la riga `icons[name] ?? icons[FALLBACK_ICON]` diventa una catena dichiarata:
**registry del chrome → catalogo registrato → alias → fallback visibile**. Il punto finale è un
cambiamento di comportamento: oggi un nome sconosciuto **diventa un ombrellone**, indistinguibile da
un ombrellone voluto.

`IconPicker.vue` — **nuovo**, nel ui-kit perché è un primitivo. **Compone i primitivi che il kit ha
già** invece di rifarli: [`SearchInput.vue`](../../../packages/ui-kit/src/components/SearchInput.vue)
per il campo — ha già icona, pulizia e anello di fuoco del design system — e
[`Popover.vue`](../../../packages/ui-kit/src/components/Popover.vue) come contenitore ancorato al
trigger. Scrivere un secondo campo di ricerca dentro un lavoro che nasce **per togliere
duplicazione** sarebbe una contraddizione.

Due requisiti che la revisione ha reso espliciti:

- **Nome accessibile.** Il trigger è un `<button>`, che non è un elemento etichettabile: il `<label>`
  del `Field` non gli darebbe alcun nome e lo screen reader annuncerebbe il valore (`tree-palm`)
  invece di «Icona sulla mappa». Il kit ha già la soluzione — `FIELD_LABEL_ID` in
  [`field-context.ts`](../../../packages/ui-kit/src/components/field-context.ts), iniettato da
  [`Select.vue`](../../../packages/ui-kit/src/components/Select.vue) e fornito da
  [`Field.vue`](../../../packages/ui-kit/src/components/Field.vue) — e va usata con la stessa
  precedenza: un `aria-label` del chiamante vince. ⚠️ `SearchInput` impone un `aria-label` proprio,
  che altrimenti sovrascriverebbe l'etichetta.
- **Il troncamento non è silenzioso.** La griglia rende un tetto di risultati per volta — 1743 nodi
  DOM insieme non si fanno — e quando le corrispondenze lo superano mostra **il conteggio del totale
  trovato**, così un elenco troncato non si confonde con un elenco esaurito. Il numero del tetto è
  una scelta del piano; il comportamento al bordo no, perché determina il markup da asserire.

Nessuna libreria di virtualizzazione: sarebbe una dipendenza per un problema che un limite risolve.
L'elenco delle icone suggerite vive in **un solo posto**.

### 4.2 In web-staff

`main.ts` chiama `registerIconCatalog(lucideCatalog)` una volta. Sincrono, presente dal primo byte.

⚠️ **Anche [`src/test/setup.ts`](../../../apps/web-staff/src/test/setup.ts) deve registrarlo.**
Vitest carica i soli `setupFiles` ([`vitest.config.ts`](../../../apps/web-staff/vitest.config.ts)) e
**non esegue mai `main.ts`**: senza questa riga il test del picker girerebbe con catalogo vuoto — e
il modo peggiore in cui fallirebbe è **passare**, asserendo solo l'emissione mentre la griglia è
vuota.

`BeachPanel.vue` sostituisce la `Select` a tre `<Option>` con l'`IconPicker`; il `ref` tipizzato
`'umbrella' \| 'leaf' \| 'palmtree'` diventa una `string`.

**`MapView.vue` — il quinto punto, che il disegno originale non enumerava.** La sezione «Tipologia»
del pannello legenda è scritta a mano: `<Icon name="leaf"/>Mini-palma` e
`<Icon name="palmtree"/>Palma`. Il resto della Mappa è invece derivato dai dati. Aperto il catalogo,
un admin può chiamare una tipologia «Gazebo» con icona `anchor`: la cella disegna l'ancora e **la
legenda continua a dichiarare che `leaf` significa Mini-palma**, senza nominare la tipologia nuova. È
una didascalia falsa, cioè la classe di difetto che questo lavoro esiste per togliere. Va resa
derivata come le celle, con un ciclo sulle tipologie della mappa.

### 4.3 Nell'API

`ICON_KEYS` e `@IsIn` spariscono da **entrambi** i DTO, sostituiti da `@IsIconKey()` — un decoratore
custom sul modello di [`is-uuid-shape.ts`](../../../apps/api/src/common/is-uuid-shape.ts), la cui
forma (`registerDecorator` con un `validator`) è la convenzione locale.

⚠️ **Decisione strutturale:** `@iconify-json/lucide` va aggiunto alle dipendenze di `apps/api`, che
oggi non ce l'ha, con lo **stesso range** degli altri quattro.

### 4.4 Contratti e documenti che diventerebbero falsi

`icon` resta `string`: una union TypeScript di 1743 valori sarebbe ingestibile e non aggiungerebbe
sicurezza, visto che il valore arriva da HTTP e va validato a runtime.

Vanno aggiornati i punti che dichiarano il dominio dei valori — è l'unica lista che qualcuno seguirà:

- i commenti «icon-registry key» in [`contracts/src/index.ts`](../../../packages/contracts/src/index.ts)
  (due punti) e in [`schema.prisma`](../../../apps/api/prisma/schema.prisma), che è il più vicino al dato;
- l'**Addendum di [ADR-0016](../../architecture/decisions/0016-tipologia-ombrellone.md)**, che vincola
  il campo a «una chiave del registry icone del `ui-kit`»: dopo questo lavoro sarebbe falso restando
  in stato accettato;
- la voce Tipologia in [data-model.md](../../design/data-model.md).

ADR-0068 li cita come emendati e i due portano il rimando inverso.

## 5. Sicurezza e correttezza del rendering

Il `body` di un'icona è markup SVG e va inserito come tale. Va dichiarato nell'ADR, non lasciato a un
commento, perché una review avversariale lo solleverebbe:

- il `body` proviene da un **file statico versionato** dentro il bundle — mai dalla rete, mai
  dall'utente, mai dal database;
- il **nome** viene dal database, ma è solo una **chiave di lookup**: non finisce mai nell'HTML, e un
  nome che non risolve produce il fallback, non un'iniezione;
- l'API valida il nome contro l'elenco vero (decisione 6).

L'elemento `<svg>` scrive `viewBox="0 0 24 24"`, la dimensione dichiarata a livello di set. L'unica
icona con dimensioni proprie è `search-large` (32×32) — ed è `hidden`, quindi **già esclusa dal
catalogo**: il `viewBox` costante è corretto per ogni record trasportato. L'esclusione va asserita da
un test, o è solo una frase.

## 6. Cosa NON si fa

- Nessuna icona per Settore e Fila (decisione 3).
- Nessuna migration, né di schema né di dati (decisione 5).
- Nessun caricamento remoto: il confine offline resta.
- Nessuna libreria di virtualizzazione, nessun pacchetto di metadati per le categorie.
- Nessuna modifica al nome della tipologia (decisione 7).
- **`SECTOR_KINDS` non si tocca**: è l'altra metà di D-040, vedi §8.
- Le chiavi `chart`, `renew`, `logout` **restano** come sono: non fanno ombra ad alcun nome Lucide.

## 7. Test

**ui-kit** — il catalogo risolve un nome vero, un alias (`palmtree` → `tree-palm`) e restituisce
niente per un nome inventato; **non contiene `search-large`** né altre `hidden`; la ricerca trova per
sottostringa; `Icon` rende dal registry quando il catalogo non è registrato, dal catalogo quando lo
è, e il fallback visibile per un nome ignoto; l'`IconPicker` filtra, mostra il conteggio quando
tronca, emette il nome scelto, e **dentro un `Field` è etichettato dal `Field`** (specchio del
presidio già esistente su `Select`).

**api** — i due DTO accettano un nome Lucide vero, accettano `palmtree`, **rifiutano con 400** un
nome inventato. Il presidio va scritto su **entrambi**: erano duplicati, e correggerne uno solo è il
difetto che si ripresenta.

**web-staff** — `BeachPanel` apre il picker, la scelta arriva alla mutation, il valore torna nella
form in modifica. La legenda della Mappa rende le tipologie **dai dati**: il presidio esistente che
asserisce la stringa «Mini-palma» va aggiornato, non cancellato.

⚠️ **Fixture — l'elenco vero, che la prima stesura dava per fatto senza contarlo.** Ricerca di
`palmtree` su `apps/` e `packages/` (esclusi `node_modules`, validata su un caso noto): **19 file**,
di cui **14 di test, fixture, mock o seed** e 5 di codice di produzione. Restano tutti validi —
`palmtree` continua a risolvere — ma chi implementa deve avere l'elenco vero, non tre nomi
d'esempio. ⚠️ Una fixture invecchia insieme al tipo che istanzia.

⚠️ **Il presidio statico del CSS e le 27 asserzioni che indicizzano `[data-testid="scene-cell"] button`
per posizione non sono toccati:** il picker vive nel pannello, non nella scena.

## 8. Effetto su D-040

[D-040](../../architecture/deferred.md#d-040) traccia **due** duplicazioni: la lista chiavi icona in
quattro punti, e `SECTOR_KINDS` (`grid\|special`) nei due DTO settore più la Select.

Questo lavoro elimina la **prima**, e non per allargamento: i quattro punti spariscono. Non tocca la
seconda. La voce va aggiornata dicendo **esattamente questo**, e **non** va marcata conclusa:
dichiarare conclusa a metà una voce è la classe di bugia documentale che questo repo ha già pagato.

## 9. Rischi e limiti dichiarati

- **Peso.** +78,0 KB gzip su `web-staff`: +19% sui byte totali, **+69% sul JS che blocca il primo
  render** (§2.1). Se un domani pesasse troppo, la via d'uscita non richiede riscrivere nulla: lo
  stesso entry separato si importa con `import()` invece che staticamente.
- **Il gruppo suggerito è una scelta di gusto**, non una regola di dominio: un solo posto.
- **La ricerca è per sottostringa sul nome Lucide**, che è in inglese: cercare «palma» non troverà
  `tree-palm`. Un dizionario italiano sarebbe un secondo elenco da tenere allineato a 1743 voci,
  cioè la duplicazione da cui questo lavoro esce. Limite accettato e dichiarato.
- **Le icone `hidden` restano irraggiungibili**: sono deprecate a monte, e includerle significherebbe
  offrire nomi che Lucide può togliere.
