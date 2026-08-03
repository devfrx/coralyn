# ADR-0068: L'icona della tipologia diventa il catalogo Lucide intero, non tre valori chiusi nel registry

- **Status:** Accepted
- **Data:** 2026-08-03
- **Decisori:** Team di progetto
- **Emenda:** [ADR-0016](0016-tipologia-ombrellone.md) — il suo Addendum (2026-06-28) vincolava
  `Tipologia.icon` a «una chiave del registry icone del `ui-kit`»: non è più la descrizione esatta.
  La nota di emendamento è in coda a quell'Addendum, con il rimando qui. Stessa correzione, stessa
  ragione, nella voce Tipologia di [`docs/design/data-model.md`](../../design/data-model.md), che
  porta anch'essa il rimando qui.
- **ADR correlati:** [ADR-0017](0017-design-system-frontend.md) (il `ui-kit` headless di cui
  `IconPicker` è un nuovo primitivo, composto sugli esistenti), [ADR-0020](0020-resa-mappa.md)
  (HTML/CSS e non SVG per la mappa: la stessa ragione rende sicuro il `v-html` di `Icon.vue`, §5)
- **Aggiorna, senza chiuderla:** [D-040](../deferred.md#d-040) — traccia due duplicazioni distinte;
  questo lavoro elimina la prima (la lista delle chiavi icona, ripetuta in quattro punti), non la
  seconda (`SECTOR_KINDS`, intatto). La voce resta aperta.
- **Ripara di passaggio, senza che nulla lo tracciasse:** `NoAccessView.vue` passava `icon="lock"`,
  mai fra le 41 chiavi del registry chiuso: quella schermata rendeva **un ombrellone** (il fallback
  silenzioso), non un lucchetto. Nessuna voce di `deferred.md` lo dichiarava — non era un debito
  accettato, era un difetto che nessuno aveva notato. Ora risolve dal catalogo come qualunque altro
  nome Lucide vero.

## Context

Chi crea una tipologia di ombrellone poteva scegliere fra **tre** icone soltanto — `umbrella`,
`leaf`, `palmtree` — mentre il nome era già libero. Il vincolo non stava nel database
(`UmbrellaType.icon` era già `String?`, nessuna migration necessaria): stava in quattro punti
applicativi che lo imponevano da soli, in modo incoerente fra loro — `ICON_KEYS` + `@IsIn` in
entrambi i DTO della tipologia, il tipo del `ref` e i tre `<Option>` in `BeachPanel.vue` — più un
**quinto** punto che il disegno originale non elencava: la legenda «Tipologia» di `MapView.vue`,
scritta a mano (`<Icon name="leaf"/>Mini-palma`), che avrebbe continuato a mentire su qualunque
tipologia nuova.

Sotto tutti loro c'era il muro vero: `packages/ui-kit/src/icons/registry.ts` importava **41** icone
Lucide staticamente (42 righe di `import`, una delle quali è `import type { Component } from 'vue'`
e non un'icona), e `Icon.vue` risolveva con `icons[name] ?? icons[FALLBACK_ICON]`. Anche togliendo i
due `@IsIn`, un nome salvato che il registry non conosce sarebbe diventato **un ombrellone, in
silenzio** — perché `FALLBACK_ICON` valeva `'umbrella'`. E `unplugin-icons` risolve
`~icons/lucide/<nome>` a **build time**: un import con nome dinamico non esiste, quindi allargare il
registry a mano fino a coprire tutta Lucide non era percorribile.

L'obiettivo era rendere l'icona altrettanto libera del nome — tutte le icone della libreria già
installata, ricercabili — come funzione integrante del prodotto, non come controllo appoggiato sopra
il registry chiuso.

## Decision

### 1. La libreria è già nel repo, e la licenza è libera

`@iconify-json/lucide@1.2.114` era già dichiarata in **quattro** `package.json` (`ui-kit`,
`web-staff`, `web-platform`, `web-customer`), tutti a `^1.2.114`: nessuna libreria nuova entra nel
repo. La licenza, letta da `info.json` (`"license": { "title": "ISC", "spdx": "ISC" }`, autore
«Lucide Contributors»), è permissiva come MIT: uso commerciale e rivendita del gestionale liberi,
nessuna royalty, nessuna attribuzione richiesta nell'interfaccia. `apps/api` non l'aveva: ne diventa
il quinto consumatore, con lo **stesso range** degli altri quattro — un range divergente
offrirebbe dal picker un nome che il decoratore rifiuta con 400.

### 2. Il catalogo esclude le `hidden`, ed è quella l'offerta misurata

Lucide 1.2.114 dichiara **1803** icone, di cui **60** `hidden` (deprecate a monte): le offerte sono
**1743**, ed è il numero che coincide con quanto `info.json` dichiara. Le `hidden` restano
irraggiungibili di proposito — includerle vorrebbe dire offrire nomi che la libreria può togliere —
ed è anche ciò che rende corretto il `viewBox="0 0 24 24"` costante di `Icon.vue`: l'unica icona con
dimensioni proprie, `search-large` (32×32), è `hidden`.

Gli alias sono **216**, di cui **214** sopravvivono (il padre non è escluso); i restanti 2 puntano a
un'icona `hidden` e sono scartati — un alias verso un vicolo cieco non è un'icona offerta.

### 3. Quattro file nuovi nel `ui-kit`; **uno solo** dietro l'entry point separato

- `icons/catalog.ts` — tipo `IconCatalog` e funzioni pure (`resolveFromCatalog`, `searchCatalog`):
  non importa Lucide, riceve i dati. Nel barrel principale, perché non porta il peso del §6.
- `icons/lucide-catalog.ts` — l'**unico** file che importa `@iconify-json/lucide` e applica
  l'esclusione delle `hidden`. È l'**unico dei quattro** dietro un entry point separato,
  `@coralyn/ui-kit/icons/lucide`, sul modello già in uso per `./toasts`: chi non lo importa non lo
  trascina, cosa che il solo tree-shaking non garantisce (il barrel resterebbe raggiungibile).
- `icons/registered-catalog.ts` — lo stato di registrazione (`registerIconCatalog` /
  `getIconCatalog`), che parte vuoto. Nel barrel principale: non importa Lucide, riceve il catalogo
  da chi lo registra. `apps/web-staff/src/main.ts` lo popola una volta, in modo sincrono, prima del
  mount; `src/test/setup.ts` fa lo stesso perché Vitest non esegue mai `main.ts`.
- `icons/suggested.ts` — l'elenco delle icone proposte all'apertura del picker (§Negative). Nel
  barrel principale: è solo una lista di nomi, non importa Lucide.

`icons/registry.ts` — il registry del **chrome** applicativo — non si allarga: resta a import
statici e tree-shakeable, e cambia in tre punti soli (§4-5).

### 4. Le due chiavi in ombra si rinominano al nome che disegnano davvero

Confrontando ogni chiave del registry con il nome Lucide omonimo, due chiavi disegnavano un glifo
**diverso** da quello che il loro nome avrebbe suggerito:

| Chiave | Il registry disegnava | Lucide con quel nome |
|---|---|---|
| `edit` | `pencil` | alias di `square-pen` — glifo diverso |
| `building` | `building-2` | icona propria — glifo diverso |

`edit` **è** un nome vero in Lucide — un alias verso `square-pen` — e prima della rinomina era
**anche** una chiave del registry del chrome, puntata su `pencil`: due glifi diversi sotto la stessa
stringa. Nella catena di risoluzione di `Icon.vue` il registry del chrome vince **sempre** sul
catalogo (§5): un operatore che avesse scelto `edit` dal picker, intendendo `square-pen`, avrebbe
visto **la matita** sulla Mappa — nessun errore, nessun fallback, solo l'icona sbagliata, perché la
chiave del chrome intercettava la risoluzione prima che il catalogo la raggiungesse. Stesso
meccanismo per `building` (icona propria in Lucide, ma chiave del chrome puntata su `building-2`).
Le due chiavi sono state rinominate al nome che già rendono — `edit` → `pencil` (**10** occorrenze,
trovate solo cercando due forme: `name="edit"` e la prop `icon="edit"` di `IconButton`),
`building` → `building-2` (**zero** occorrenze) — così la stringa `edit`/`building` non è più una
chiave del chrome, e il catalogo la risolve senza essere intercettato. Le altre tre chiavi non
canoniche del chrome — `chart`, `renew`, `logout` — non esistono affatto in Lucide (né come nome né
come alias), quindi non intercettano nulla e restano.

### 5. Il fallback smette di essere una chiave

`FALLBACK_ICON` (valeva `'umbrella'`) è **rimossa**, non ripuntata altrove. La ragione: con
l'intero catalogo sceglibile dal picker, **qualunque** chiave è anche una scelta legittima per una
tipologia vera — puntare il fallback su `alert-triangle` renderebbe una tipologia a cui si è
assegnato quel glifo indistinguibile da una risoluzione fallita, cioè lo stesso difetto spostato di
simbolo. Il fallback è ora un glifo **scritto in `Icon.vue`** (un quadrato tratteggiato con un punto
interrogativo), assente da registry e da catalogo: nessuna tipologia può averlo addosso, quindi
vederlo significa sempre e solo «questo nome non risolve». La catena dichiarata in `Icon.vue` è:
registry del chrome → catalogo registrato → alias → questo fallback visibile.

### 6. Il catalogo entra nel bundle di `web-staff`, non in un chunk lazy — costo dichiarato su due metriche

Il catalogo delle sole icone offerte pesa **78,0 KB gzip**. La scelta di tenerlo **nel bundle**
anziché dietro un `import()` lazy è dell'utente, presa conoscendo **entrambe** le metriche seguenti
— non una sola:

| Metrica | Oggi | Col catalogo | Delta |
|---|---|---|---|
| Byte totali alla prima visita | 400,7 KB | 478,7 KB | **+19%** |
| JS che blocca il primo render | 113,3 KB | 191,3 KB | **+69%** |

Le due metriche contano cose diverse e sono **entrambe vere**: la prima conta perché `web-staff` è
una PWA il cui service worker **precacha tutti e 58 i chunk** (Workbox `globPatterns:
['**/*.{js,css,html,svg,png,woff2}']`), quindi i chunk per-rotta non sono byte risparmiati, sono byte
scaricati comunque — e su questa metrica il catalogo eager costa solo +19%. La seconda conta perché
`index.html` carica **solo** l'entry `index` più un `modulepreload` di `vue.runtime`: il catalogo,
essendo eager, entra in quel percorso e costa **+69%** sul tempo al primo render. Se un domani questo
pesasse troppo, la via d'uscita non richiede riscrivere nulla: lo stesso entry separato si importa
con `import()` invece che staticamente.

### 7. Solo `web-staff` lo paga

| App | JS gzip oggi | rende icone di dominio? |
|---|---|---|
| `web-staff` | 400,7 KB | **sì** |
| `web-platform` | 98,1 KB | **no** |
| `web-customer` | 89,2 KB | **no** |

Verificato con una ricerca **validata** (`umbrellaTypes\|typeIcon\|\.icon` su `.vue`/`.ts` di
`apps/*/src`, esclusi spec e mock): 8 righe in `web-staff`, zero nelle altre due. Perimetro
dichiarato: fuori da quei file, o per un nome costruito per concatenazione, la ricerca resta cieca.
`registerIconCatalog`/`lucideCatalog` sono importati solo da `web-staff` (`main.ts` e
`test/setup.ts`): le altre due app non pagano il peso del §6 perché non lo caricano.

### 8. L'API valida contro l'elenco Lucide vero, non più tre valori

`ICON_KEYS` e `@IsIn` sono spariti da entrambi i DTO (`create-umbrella-type.dto.ts`,
`update-umbrella-type.dto.ts`), sostituiti da `@IsIconKey()` — un decoratore custom
(`apps/api/src/common/is-icon-key.ts`) sul modello di `IsUuidShape`: valida che il valore sia un nome
Lucide non `hidden`, o un suo alias verso un padre non escluso. Senza questo controllo un client
potrebbe scrivere spazzatura nel campo (una `String?` senza vincoli applicativi propri), e la Mappa
renderebbe il fallback per sempre senza che alcun errore venga mai sollevato.

⚠️ Il predicato sugli alias è **identico per costruzione** a quello del catalogo del `ui-kit` (§2): il
padre dev'essere presente **e** non `hidden`. `icon` resta `string` nei contracts — una union
TypeScript di 1743 valori sarebbe ingestibile e non aggiungerebbe sicurezza, perché il valore arriva
comunque da HTTP e va validato a runtime.

### 9. Nessuna migration, né di schema né di dati

`UmbrellaType.icon` era già `String?`. `palmtree` — il terzo valore del vecchio elenco chiuso — è un
**alias Lucide** di `tree-palm`: le righe già salvate con quel valore continuano a risolvere, tramite
la catena di alias del catalogo, senza toccare un dato.

### 10. Il `v-html` sul body dell'icona non è una superficie d'iniezione

Va dichiarato qui perché una review lo solleverebbe altrimenti: `Icon.vue` inserisce il `body` SVG
con `v-html`. Tre fatti lo rendono sicuro:

- il `body` proviene da un **file statico versionato** dentro il bundle (`@iconify-json/lucide`) —
  mai dalla rete, mai dall'utente, mai dal database;
- il **nome** viene dal database, ma è solo una **chiave di lookup**: non finisce mai nell'HTML, e un
  nome che non risolve produce il fallback del §5, non un'iniezione;
- l'API valida il nome contro l'elenco vero prima di persisterlo (§8), quindi un nome che arriva dal
  database è già passato da quel controllo.

### 11. Un difetto preesistente si ripara di passaggio

`NoAccessView.vue` passa `icon="lock"` da prima di questo lavoro. `lock` non era fra le 41 chiavi del
registry chiuso, quindi quella schermata rendeva il fallback di allora — **un ombrellone** — al posto
del lucchetto che il sorgente ha sempre chiesto. Con la catena del §5, `lock` risolve dal catalogo
Lucide come qualunque altro nome vero, e la schermata rende ciò che il codice dichiara. Non è un
effetto di questo lavoro sul comportamento voluto: è un difetto che esisteva già e che nessuna voce
di `deferred.md` tracciava, corretto senza un intervento dedicato.

## Consequences

### Positive

- Chi crea una tipologia sceglie fra **1743** icone invece di **3**, cercabili per sottostringa, con
  un primitivo (`IconPicker`) che compone `SearchInput` e `Popover` già esistenti nel `ui-kit` invece
  di duplicarli.
- Un nome sconosciuto rende un fallback **visibile e distinguibile** da qualunque scelta reale, dove
  prima rendeva silenziosamente un ombrellone — la classe di difetto che questo lavoro esiste per
  chiudere, e che aveva già colpito `NoAccessView.vue` (§11).
- La legenda della Mappa deriva ora le tipologie dai dati (`MapView.vue`), quindi non può più mentire
  su un tipo rinominato o ri-iconato — il quinto punto che il disegno originale non enumerava.
- Nessuna migration, nessuna nuova libreria, nessuna union TypeScript da mantenere a 1743 voci.
- Copertura nuova misurata: 28 test in `ui-kit` (catalog, lucide-catalog, registry, `IconPicker`,
  `Icon`), 8 in `api` (il decoratore + i due DTO), 3 in `web-staff` (`BeachPanel`, `MapView`).

### Negative / Trade-off

- **+78,0 KB gzip su `web-staff`**: +19% sui byte totali alla prima visita, **+69%** sul JS che
  blocca il primo render (§6). Decisione dell'utente, presa conoscendo entrambi i numeri.
- **La ricerca è per sottostringa sul nome Lucide, in inglese**: cercare «palma» non trova
  `tree-palm`. Un dizionario italiano sarebbe un secondo elenco da tenere allineato a 1743 voci — la
  duplicazione da cui questo lavoro esce. Limite accettato e dichiarato, non risolto.
- **Il gruppo di icone suggerite all'apertura del picker è una scelta di gusto**, non una regola di
  dominio (`icons/suggested.ts`): vive in un solo posto apposta, per non riaprire D-040.
- Le `hidden` restano irraggiungibili per costruzione: è coerente con l'esclusione, ma è comunque una
  porzione della libreria che il picker non offre mai.

### Neutre / Note

- Il peso lo paga **solo** `web-staff` (§7): `web-platform` e `web-customer` non importano
  `registerIconCatalog`/`lucideCatalog` e non rendono icone di dominio.
- Il registry del chrome (`icons/registry.ts`) resta a import statici: le sole modifiche sono le due
  rinomine del §4 e la rimozione di `FALLBACK_ICON` del §5. Non si è allargato.
- `apps/api` guadagna una dipendenza allo stesso range degli altri quattro consumatori (§1): un
  range divergente sarebbe un guasto silenzioso — il picker offrirebbe un nome che l'API rifiuta.

## Alternatives considered

- **Chunk lazy per il catalogo** (`import()` invece che import statico) — scartata per ora: avrebbe
  tenuto il peso fuori dal render-blocking, ma l'utente ha scelto il bundle eager conoscendo il costo
  (§6); resta la via d'uscita se il peso diventasse un problema reale.
- **Dizionario italiano dei nomi Lucide** — scartata: sarebbe un secondo elenco di 1743 voci da
  tenere allineato al primo a ogni versione di Lucide, cioè la duplicazione che questo lavoro
  rimuove altrove (D-040). Il limite sulla ricerca in inglese resta dichiarato, non chiuso.
- **Ripuntare `FALLBACK_ICON` su una chiave del catalogo invece di rimuoverla** — scartata (§5):
  qualunque chiave è sceglibile dal picker, quindi il fallback tornerebbe indistinguibile da una
  scelta reale sulla stessa tipologia a cui quel glifo fosse stato assegnato di proposito.
- **Allargare l'unione TypeScript del registry invece di un catalogo runtime** — scartata: 1743
  valori letterali sarebbero ingestibili a ogni aggiornamento di Lucide, e non aggiungerebbero
  sicurezza rispetto alla validazione runtime che l'API deve comunque fare (il valore arriva da
  HTTP).
- **Libreria di virtualizzazione per la griglia del picker** — scartata: il tetto ai risultati
  mostrati (con il conteggio del totale trovato, per non confondere un elenco troncato con uno
  esaurito) risolve lo stesso problema senza una dipendenza nuova.

## Rubric check

1. **Professionalità** — l'icona di dominio si sceglie da una libreria intera e cercabile, come nei
   gestionali seri, invece che da un elenco di tre valori appoggiato sopra un registry pensato per il
   chrome dell'interfaccia.
2. **Convenzioni** — l'entry point separato (`./icons/lucide`) segue il pattern già in uso per
   `./toasts`; il decoratore `@IsIconKey` segue la forma di `IsUuidShape`; `IconPicker` compone
   primitivi esistenti (`SearchInput`, `Popover`) invece di duplicarli.
3. **Modularità** — `icons/catalog.ts` è puro e non importa Lucide; `icons/lucide-catalog.ts` è
   l'unico file che lo fa, dietro un entry point che chi non lo importa non trascina; il registry del
   chrome resta un modulo separato, tree-shakeable, invariato salvo le due rinomine.
4. **Zero debito** — nessuna migration, nessuna dipendenza nuova al repo (§1), nessuna scelta
   silenziosa: il peso (§6) e il limite della ricerca in inglese sono **dichiarati**, non nascosti;
   D-040 resta aperta per la metà che questo lavoro non tocca ([D-040](../deferred.md#d-040)); il
   difetto preesistente di `NoAccessView.vue` è dichiarato (§11) invece di passare inosservato in un
   diff.
