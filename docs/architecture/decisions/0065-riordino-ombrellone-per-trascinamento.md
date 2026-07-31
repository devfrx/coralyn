# ADR-0065: L'ombrellone si riordina trascinandolo, il confine di settore si dichiara invece di bloccarlo, e i tab si aprono a molla perché la scena ne mostra uno solo

- **Status:** Accepted
- **Data:** 2026-07-29
- **Decisori:** Team di progetto
- **Supera, per il solo ombrellone:** [ADR-0052](0052-editor-struttura-cantiere.md) §Decision, clausola
  «niente drag&drop/planimetria»
- **ADR correlati:** [ADR-0016](0016-tipologia-ombrellone.md) (tipologia e `kind` del settore),
  [ADR-0053](0053-ritiro-ombrellone-soft-delete.md) (ritiro come soft-delete),
  [ADR-0062](0062-generate-ombrelloni-scrittura-batch.md) (perché una transazione non fa N
  round-trip), [ADR-0057](0057-autorizzazione-fail-closed-permessi.md) (un permesso per endpoint),
  [ADR-0032](0032-pricing-engine-precedenza.md) (specificità delle tariffe),
  [ADR-0020](0020-resa-mappa.md) (HTML/CSS invece di SVG, per non ricostruire fuoco e ARIA)
- **Chiude:** [D-038](../deferred.md#d-038) **per l'ombrellone** (file e settori restano).
  **Apre** [D-070](../deferred.md#d-070) e [D-071](../deferred.md#d-071); dopo la review
  avversariale del 2026-07-30 anche [D-072](../deferred.md#d-072) e [D-074](../deferred.md#d-074),
  più [D-073](../deferred.md#d-073) — quest'ultima **preesistente**, trovata di passaggio e non
  causata da questa slice. Il caso di [D-070](../deferred.md#d-070) è stato esteso, non duplicato.
- ⚠️ **Superato in parte da [ADR-0066](0066-sposta-in-pannello-ombrellone.md) (2026-07-31)**, che
  **chiude [D-071](../deferred.md#d-071)**. Le decisioni di questo ADR restano tutte valide — il
  trascinamento è ancora solo `lg+` e la maniglia non si rende sotto quella soglia — ma **quattro
  righe che davano il caso tablet/telefono per scoperto non lo sono più**, e portano la nota accanto:
  §8, §10, §Negative e §Alternatives.

## Context

Fino a questa slice l'unico modo di riordinare era **eliminare e ricreare**: `logicalOrder` veniva
scritto solo alla create, al generate e al restore, e nessun DTO di update lo accettava
(`UpdateUmbrellaInput { label?, umbrellaTypeId? }`).

Non è una capacità nuova: la colonna esiste dal primo init, è assegnata a ogni ombrellone ed è già
ciò con cui **la Mappa operativa ordina** (`map.service.ts:22,25,26`). Mancava solo poterla
cambiare. Quindi **nessuna migration**, nessun campo nuovo, nessun breaking change sui DTO
esistenti.

Tre misure hanno deciso la forma, e nessuna delle tre era deducibile dai documenti:

1. **Gli ordini sono densi.** Sul database di sviluppo la `Fila 2` va da 2 a 101 senza buchi. Fra due
   vicini non c'è un intero libero, quindi «assegna un valore in mezzo» — la soluzione ovvia — non è
   praticabile.
2. **Nel database non esiste alcuna tariffa posizionale.** 5 tariffe in tutto, zero con `sectorId`,
   zero con `rowId`. L'allarme sul prezzo, suonato in sede di brainstorming, era infondato **sui
   dati**; resta fondato come proprietà del sistema, ed è la ragione per cui la disclosure esiste
   ma non blocca.
3. ⚠️ **La scena dell'editor rende UN SOLO settore per volta.** `StructureScene.vue` sceglie
   `current` e rende `v-for="r in current.rows"` sotto `v-if="current"`; i settori sono
   `role="tab"` e la sabbia è un solo `role="tabpanel"`. **Le file di un altro settore non sono nel
   DOM.** Questa misura è arrivata a endpoint già scritto e già provato, e ha cambiato il disegno:
   senza un meccanismo apposito, lo spostamento fra settori — cioè *il caso per cui la slice
   esiste* — sarebbe stato capacità dell'API senza alcun percorso nel prodotto.

Il punto 3 è la ragione per cui questo ADR esiste invece di essere un commit silenzioso: è una
decisione di interazione, non un'implementazione.

## Decision

### 1. Un ombrellone per volta, non una lista riordinabile

La conseguenza non è ergonomica ma tecnica, ed è ciò che rende questa slice fattibile mentre un
riordino in blocco non lo sarebbe:

- I due endpoint bulk esistenti scrivono **un solo valore per tutte le righe**. Un riordino di lista
  ne scriverebbe **N diversi**, forma che nel repo non ha precedenti (`grep -rn
  "executeRaw\|queryRaw" apps/api/src` fuori da `prisma.service.ts` → zero righe).
- `forTenant` non passa `transactionOptions`, quindi N round-trip ricadrebbero nel timeout di
  default: è il P2028 che costrinse a riscrivere `generate` in una sola insert
  ([ADR-0062](0062-generate-ombrelloni-scrittura-batch.md)).
- I cap dei bulk sono `@ArrayMaxSize(200)`, mentre una fila può contenere ≥500 ombrelloni.

### 2. La scrittura sono due istruzioni a costo costante

Uno **spostamento di intervallo**: un `updateMany` con `increment`/`decrement` su un intervallo di
`logicalOrder`, più un `update` sul solo ombrellone spostato. Due round-trip **indipendenti dal
numero di ombrelloni**, dentro una sola `forTenant`, con lo stesso `updateMany` che `bulkAssignType`
già usa.

Gli ordini **restano sparsi e non si rinumerano**: nessun indice unico esiste su
`logicalOrder`/`sortOrder`, quindi buchi e duplicati sono già legali oggi, e **la fila d'origine non
viene compattata**. Compattarla sarebbe una terza scrittura per riallineare un valore che nessun
consumatore legge: le tre proiezioni scartano `logicalOrder` e ordinano soltanto.

Il calcolo dell'intervallo vive in `umbrella-order.ts`, modulo proprio accanto al service — come
`pricing.engine.ts` accanto a `catalog.service.ts` — così è provabile senza DB né Nest.

### 3. `position` è l'indice FINALE, non l'indice d'inserimento

La spec di design diceva «fuori dall'intervallo `[0, n]`, `n` = ombrelloni nella fila». Per uno
spostamento **dentro la stessa fila** quella regola ammette un indice oltre la fine, perché
l'ombrellone è già contato fra gli `n`.

`position` è quindi definito come l'**indice finale 0-based dell'ombrellone nella fila di
destinazione**, e l'intervallo valido si calcola sulla fila **senza** l'ombrellone che si sta
spostando. Con questa lettura il limite è `[0, n]` in entrambi i casi, e coincide con l'indice che
il frontend produce naturalmente. `logicalOrder` continua a non attraversare il confice: nessun DTO
lo espone, e attraverso HTTP si vedrebbe solo la sequenza — indistinguibile fra `1,2,3` e `5,9,40`.

### 4. Destinazione ammessa: una fila il cui settore ha lo stesso `kind`

Mai `grid → special`, mai il contrario. Il vincolo è di dominio: un ombrellone «fuori griglia»
(palme, gazebo) e uno di fila regolare non sono intercambiabili nella scena, e la Mappa li rende in
due blocchi distinti discriminando proprio su `kind`. Esito **422** e non 409: è un input non
processabile, non un conflitto di stato.

### 5. Un ritirato non è spostabile: 409

⚠️ **Nessuna query di mappa o di struttura filtra `retiredAt`**: l'esclusione di un ritirato dipende
**solo** dal `rowId` che `retire` azzera. Un endpoint di move che scrivesse `rowId` senza guardia
**resusciterebbe** un ombrellone ritirato, rimettendolo in scena e rendendolo prenotabile. Senza
questa guardia la feature introdurrebbe un difetto di dominio, non un fastidio.

⚠️ **La guardia è ripetuta nella scrittura finale, e non per abbondanza** (aggiunto il 2026-07-30,
dalla review): la lettura sopra vede lo stato al *tempo della lettura*, in READ COMMITTED e senza
lock, quindi un `retire` che committi nel frattempo passerebbe sotto. L'`update` finale porta perciò
`retiredAt: null` nel proprio `where`: se la riga non c'è più, Prisma alza `P2025` e il servizio
risponde **409** con lo stesso messaggio della guardia in lettura. La corsa è chiusa, non ristretta.

Simmetricamente, **nessun ramo idempotente silenzioso**: se la posizione richiesta coincide con
quella corrente la risposta è 200 e la transazione non scrive, ma è un no-op **calcolato**. Il
precedente da non replicare è dentro la stessa feature: `restore` dichiara `rowId` obbligatorio nel
DTO e **lo ignora** nel ramo idempotente.

### 6. Sul prezzo: disclosure, non blocco

`Booking.totalPrice` è una colonna **persistita, scritta solo alla create**: nessuno dei 7
`booking.update` la riscrive e non esiste alcun ricalcolo in tutto il backend. **Spostare non
riscrive mai la storia.** L'unico canale in cui la posizione conta è il **rinnovo**, che copia
`umbrellaId` e ripassa dal pricing risolvendo la posizione **corrente**.

Quando la mossa attraversa un confine di settore e almeno uno dei due settori ha tariffe dedicate,
l'editor lo **dichiara** prima di confermare. Fuori da questo caso il gesto è diretto.

**Bloccare sarebbe sbagliato nel merito**, non solo scomodo: se esiste una tariffa «Settore A» e si
sposta un ombrellone fuori da A, quella tariffa *deve* smettere di coprirlo — altrimenti mente su
cosa copre. L'unica cosa scorretta è farlo in silenzio.

La stessa disclosure si estende al **ripristino** di un ritirato in un settore diverso da
`retiredFrom`, che finora riagganciava a qualsiasi fila senza dire nulla: la slice **chiude** un
comportamento silenzioso esistente invece di aggiungerne uno.

### 7. La bandiera arriva col server, non dal listino

`StructureSectorDTO` guadagna **`hasDedicatedRates: boolean`**, calcolato con un `_count` sulla
relazione `Sector.rates` già esistente. La via alternativa — interrogare `GET /rates` dal frontend —
è stata scartata per **tre ragioni misurate**:

1. `useRates` e `useSeasons` sono entrambi `enabled` su `Permission.PricingManage`. Da
   [ADR-0063](0063-permessi-staff-configurabili-per-operatore.md) un operatore può avere
   `structure.manage` **senza** `pricing.manage`: l'avviso sparirebbe **in silenzio** proprio per
   chi ne ha più bisogno. Un avviso che dipende dai permessi di chi guarda è peggio di nessun
   avviso, perché crea falsa sicurezza.
2. Le tariffe sono **per stagione**, e l'editor non ha un contesto di stagione. Ma la conseguenza è
   sui **rinnovi**, cioè su una stagione futura le cui tariffe possono non esistere ancora:
   qualunque stagione scelta renderebbe l'avviso parzialmente falso.
3. Sarebbero due query in più su **ogni** caricamento della pagina, per un dialogo che oggi non può
   scattare.

⚠️ Il punto 2 è anche il motivo per cui il dialogo **nomina i settori e non le singole tariffe col
loro prezzo**, come la spec di design chiedeva: per nominarle bisognerebbe comunque scegliere una
stagione, quindi quella richiesta non ha una risposta unica corretta. La spec è stata corretta.

Il campo **non** dice che il settore sia prezzato — senza tariffe dedicate lo è comunque, dai
wildcard di [ADR-0032](0032-pricing-engine-precedenza.md) — e il nome lo dichiara.

⚠️ **E non vede le tariffe di FILA** (registrato il 2026-07-30, dalla review): il `_count` è sulla
relazione `Sector.rates`, mentre nel motore la fila ha specificità **maggiore** del settore
(`pricing.engine.ts:57`, criterio 2 contro 3). Uno spostamento fra due file dello stesso settore non
apre nemmeno il dialogo. Oggi non è un difetto vivo — **nessuna UI scrive `rowId`** su una tariffa,
che è esattamente il corpo di [D-070](../deferred.md#d-070) — ma chi esporrà la fila nel listino
deve estendere anche questa bandiera, o la disclosure nascerà falsa lo stesso giorno. Il caso è
registrato dentro D-070 e non in una voce propria.

### 8. La maniglia sta fuori dalla cella, non è focalizzabile e non è annunciata

⚠️ **Vincolo misurato, non estetico.** `UmbrellaCell` è un `<button>` e **oltre 20 asserzioni**
indicizzano `[data-testid="scene-cell"] button` **per posizione**. Un secondo bottone dentro la
cella sposterebbe ogni indice e arrosserebbe la suite **senza che una sola logica sia rotta**:
rumore che costa e non protegge. La maniglia è quindi un elemento **sorella** dello span della
cella, dentro uno slot comune.

⚠️ **Precisato il 2026-07-31**: la frase qui sotto resta vera **della maniglia**, che è tuttora
inerte alla tastiera. Non è più vera dello **spostamento**: dal controllo «Sposta» del pannello
([ADR-0066](0066-sposta-in-pannello-ombrellone.md)) un equivalente da tastiera esiste, a ogni
larghezza.

È uno `<span draggable>` `aria-hidden`, non un `<button>`: **non esiste equivalente da tastiera**
(vedi §10), e annunciare una maniglia inerte prometterebbe un'interazione che non c'è. Le celle
restano `<button>` nativi, focalizzabili e annunciati come prima — questa slice **non spende** il
credito che [ADR-0020](0020-resa-mappa.md) si era guadagnato scegliendo HTML/CSS contro SVG.

Il trascinamento **sparisce in modalità «Seleziona»**: lì `selectMode` si aggancia al primo
Maiusc+clic e si sta costruendo una **selezione multipla**, mentre trascinare più celle è escluso
(§1). Offrire la maniglia là prometterebbe un gesto che non esiste.

⚠️ **Corretto il 2026-07-30 (review avversariale).** Questa riga motivava la sparizione dicendo che
«un drag degenerato in clic **toglierebbe** l'ombrellone dalla selezione — una mutazione di stato».
La motivazione è **falsa**: la maniglia non ha alcun percorso verso la selezione. È uno `<span>`
senza `@click` e **fuori** dal `<button>` della cella — sorella dello span che lo contiene — e
nessun antenato fino a `.st-cells` ascolta il clic; la selezione passa solo per l'evento `select`
di `UmbrellaCell`. La
decisione resta valida, la ragione registrata era sbagliata — e veniva dalla spec di design, dove è
stata corretta alla radice.

### 9. I tab settore si aprono a molla durante il trascinamento

Poiché la scena rende un settore per volta (Context, punto 3), **sostare ~700 ms su un tab
compatibile lo apre**, e il rilascio avviene poi sulla fila e sulla posizione esatte. È il pattern
delle cartelle a molla, non un'invenzione.

La molla **non scatta** verso un settore di `kind` diverso: portarci l'operatore vorrebbe dire
aprirgli un settore in cui nessun rilascio è legale. È l'unico punto in cui il vincolo di
compatibilità governa la **navigazione** e non solo il bersaglio.

### 10. La feature è dichiaratamente solo `lg+`, e la conseguenza è implementata

Sotto 1024px il `Drawer` di reka-ui scrive `body.style.pointerEvents = "none"` e applica
`aria-hidden` appena qualcosa è selezionato: la scena è pointer-morta proprio nel momento in cui si
vorrebbe trascinare. **Sotto `lg` la maniglia non si rende affatto** — un'affordance inerte dove il
puntatore è morto è peggio della sua assenza.

Non è un effetto collaterale scoperto a lavoro fatto: è una **rinuncia decisa**, presa sapendo che
l'unico modo di coprire quel caso sarebbe un comando da tastiera, valutato ed **escluso dallo
scope**. ⚠️ **Superato il 2026-07-31**: era vero quando fu scritto, ma
[D-071](../deferred.md#d-071) è stata **chiusa** da
[ADR-0066](0066-sposta-in-pannello-ombrellone.md) con un controllo «Sposta» nel pannello, che è un
secondo canale reso a ogni larghezza. **Questa decisione non è però riaperta**: il trascinamento
resta `lg+` e la maniglia continua a non rendersi sotto quella soglia.
Il caso scoperto era [D-071](../deferred.md#d-071), e non era un rifinimento di accessibilità:
è l'intero caso tablet/telefono.

### 11. Drag-and-drop nativo, nessuna dipendenza nuova

Il repo non ha alcuna libreria di drag (`konva`/`fabric`/`interactjs`/`dnd-kit`/`sortablejs`/
`vuedraggable`: zero occorrenze in ogni `package.json`) e non ne aggiunge. Fra HTML5 DnD e pointer
event vince il nativo: immagine di trascinamento, cursore, annullamento con Esc e autoscroll della
sabbia arrivano gratis, mentre coi pointer event sarebbero quattro comportamenti da riscrivere e
quattro posti in cui sbagliare. La feature è desktop-only per decisione (§10), che è esattamente
dove il DnD nativo è solido.

Il payload viaggia nello **stato del componente**, non nel `dataTransfer`, che nessun browser rende
leggibile durante il `dragover`: là si sa solo che *qualcosa* sta arrivando. `setData` viene
chiamato lo stesso, perché senza Firefox non avvia il trascinamento.

### 12. Il permesso si dichiara sul metodo, anche se sarebbe ereditato

`@RequiresPermission(Permission.StructureManage)` **sul metodo**, benché il controller lo porti già
sulla classe. ⚠️ **È una scelta, non ridondanza:** `authorization-coverage.spec.ts` legge
«metodo ?? classe», quindi un endpoint nuovo eredita il permesso **in silenzio** — nessun test lo
chiederebbe, nessun 403 lo rivelerebbe. Misurato: togliendo il decoratore, il 403 e2e per lo staff
resta **verde** e `authorization-coverage` resta **verde**; l'unico presidio che lo vede è quello
scritto apposta. Un permesso implicito è un permesso non deciso, e questa è una scrittura che cambia
ciò che l'operatore vede al banco.

## Consequences

### Positive

- **Il riordino smette di passare da elimina+ricrea**, che perdeva lo storico o costringeva a
  ritirare e ripristinare.
- **La Mappa operativa resta allineata all'editor.** `structureKeys` guadagna il **prefisso** delle
  mappe del giorno, non la chiave della sola data a schermo: ciò che queste scritture cambiano è
  l'ordine logico, e la Mappa ordina per quello senza che la data entri nell'ordinamento — dopo la
  scrittura è sbagliata **ogni giornata già in cache**, non solo quella davanti agli occhi, e la data
  si cambia dalla topbar. ⚠️ Prima **nessuna** delle **diciassette** mutazioni di struttura la
  invalidava, quindi anche creare o eliminare un ombrellone lasciava la Mappa stantia al banco. La
  correzione è alla radice e vale per tutte, non solo per lo spostamento.
  ⚠️ **Ricontato e corretto il 2026-07-30:** questa riga diceva «la chiave della mappa» e
  «quindici». Quindici erano le mutazioni che chiamano `structureKeys` **direttamente**; `retire` e
  `restore` ci arrivano via `retireKeys`, e vanno contate. **Ricontato di nuovo lo stesso giorno,
  in una review successiva:** sono oggi **sedici** le dirette, non più quindici —
  `useMoveUmbrella` è la sedicesima, aggiunta da questa stessa slice; «quindici» era il conto
  prima del suo arrivo.

- **L'invalidazione scatta anche quando il server rifiuta.** `mutationResource` invalida in
  `onSettled` e non più in `onSuccess`: gli errori più probabili di una scrittura su un albero
  condiviso — «quella fila non esiste più», «quella posizione è fuori dalla fila» — dicono proprio
  che la cache è vecchia, e prima nessuno la rinfrescava dopo un fallimento. È un cambio nel
  **data-layer**, quindi vale per ogni mutation delle tre app, non solo per lo spostamento.
- **Un comportamento silenzioso in meno**: `restore` cambiava settore senza dire nulla sul prezzo.
- **Due frasi del prodotto smettono di essere promesse non tenute.** «prima linea» e «le file più in
  alto sono più vicine al mare» sono l'unica dichiarazione che l'ordine porti un significato fisico,
  e avevano **zero** copertura. Entrano in presidio qui perché è questa slice a rendere quell'ordine
  modificabile da un gesto.

### Negative / Trade-off

- ~~**Tablet e telefono restano scoperti** ([D-071](../deferred.md#d-071)). È il costo dichiarato di
  aver escluso l'equivalente da tastiera.~~ ⚠️ **Superato il 2026-07-31**:
  [ADR-0066](0066-sposta-in-pannello-ombrellone.md) ha chiuso D-071 con un controllo «Sposta» nel
  pannello ombrellone, che copre tablet e telefono e dà anche l'equivalente da tastiera a `lg+`. Il
  costo fu reale finché durò, ed è la ragione per cui la voce esisteva.
- **La molla è un'affordance da scoprire.** Un operatore che non sosta sul tab non trova il modo di
  cambiare settore. L'alternativa — rendere tutti i settori insieme — costava l'architettura
  informativa dell'editor (vedi Alternatives).
- **`hasDedicatedRates` porta un'informazione di listino dentro un DTO di struttura.** È un
  accoppiamento fra due domini, accettato perché l'alternativa era peggiore su tre assi misurati e
  perché il campo è una proprietà del settore, non della tariffa.
- **La guardia `establishmentId` sulla fila di destinazione non è distinguibile a runtime**: la
  policy RLS copre già il caso, quindi togliendola **nessun e2e diventa rosso** (misurato). Resta
  come difesa in profondità — su una scrittura che cambia il genitore di una riga la tenancy si
  asserisce, non si eredita — ma va saputo che a tenerla è un'asserzione di **forma** in un unit,
  non di comportamento.
- **Il gesto non ha un presidio end-to-end in browser.** L'ambiente di test è `jsdom` e in tutto il
  repo non esiste un test di browser: jsdom restituisce rettangoli a **zero**, quindi i rect vanno
  forniti a mano — iniettati nelle funzioni pure, oppure stubbati **per elemento** nel test del
  componente, come fa `StructureRow.spec.ts` per la banda sotto le celle. Ciò che resta scoperto è il
  collante fra puntatore reale e quelle funzioni.

### Neutre / Note

- **`Umbrella.presentationPosition` resta inutilizzato.** È la sede di [D-005](../deferred.md#d-005)
  (planimetria a coordinate libere), non di questa slice, che agisce sull'**ordine logico**.
  Confondere i due aprirebbe due nozioni concorrenti di «dov'è l'ombrellone 47».
- **`POST :id/move` risponde 200 e non 201**, come i sei POST d'azione di `bookings.controller.ts`
  che mutano una risorsa esistente e la restituiscono. I vicini `retire`/`restore` rispondono 201
  perché nessuno ha scelto: **non sono stati toccati**, sarebbe un breaking change fuori scope.
- **Nessuna guardia sulle prenotazioni**, a differenza di `retire`. `Booking` e `BookingCoverage`
  puntano a `umbrellaId` e non a `rowId`: la prenotazione **segue** l'ombrellone, e il prezzo già
  scritto è immutabile. La divergenza da `retire` è deliberata — lì il vincolo esiste perché il
  ritiro **sgancia** l'ombrellone dalla struttura e lo rende non prezzabile.

## Alternatives considered

- **Rendere tutti i settori insieme nella sabbia**, così che il trascinamento raggiunga qualunque
  fila senza meccanismi nuovi — scartata: è **più invasiva, non meno pigra**. Riscrive
  l'architettura informativa dell'editor e contraddice [ADR-0052](0052-editor-struttura-cantiere.md),
  che i tab li aveva scelti; un lido con molti settori avrebbe una sabbia lunga quanto la spiaggia.

- **Un controllo «Sposta in…» nel pannello dell'ombrellone** (due select, settore e fila) — scartata
  perché introduce un **secondo meccanismo** per la stessa operazione, da tenere coerente col primo,
  e perché intaccherebbe [D-071](../deferred.md#d-071), che è stato deciso di lasciare aperto.
  Resta però l'ipotesi più probabile per chiudere D-071, dove il puntatore non c'è. ⚠️ **Ed è
  esattamente ciò che è successo**: [ADR-0066](0066-sposta-in-pannello-ombrellone.md) l'ha adottata
  il 2026-07-31 e ha chiuso [D-071](../deferred.md#d-071). L'analisi qui sopra è stata il punto di
  partenza di quella slice, non un ostacolo.

- **Deferire lo spostamento fra settori** e chiudere D-038 solo per il riordino intra-settore —
  scartata perché **crea debito per definizione**: lascerebbe endpoint, fixture e tre presidi e2e
  come capacità che nessun percorso del prodotto raggiunge. È esattamente la classe di errore che
  questa slice esiste anche per non ripetere.

- **Bandiera dal server + tariffe scaricate pigramente** per nominarle col prezzo — scartata perché
  **non risolve il problema che dichiarava di risolvere**: per nominarle bisogna comunque scegliere
  una stagione (§7, punto 2). Aggiunge un secondo meccanismo per ottenere un testo che resta
  indovinato.

- **Pointer event invece del DnD nativo** — scartata: richiederebbe di reimplementare immagine di
  trascinamento, cursore, annullamento e autoscroll, cioè quattro comportamenti che il browser dà
  già, in cambio di una testabilità che comunque `jsdom` non offre.

- **Equivalente da tastiera nello scope** — scartata **dall'utente**, conoscendo il trade-off, che
  gli era stato esposto. Va registrato che il repo non ha comunque alcun precedente di manipolazione
  da tastiera: l'unico handler dell'editor è il roving tabindex dei tab, che naviga e non muta.

## Rubric check

1. **Professionalità** — le guardie coprono i tre modi in cui lo spostamento poteva sbagliare
   (resuscitare un ritirato, attraversare un `kind`, uscire dal tenant); ciò che i presidi **non**
   coprono è dichiarato invece che sottinteso.
2. **Convenzioni** — `POST :id/<azione>` è il fratello di `retire`/`restore`; la logica pura sta in
   un modulo proprio come `pricing.engine.ts`; `@HttpCode(200)` è la forma dei POST d'azione di
   `bookings.controller.ts`; le fixture e2e sono inline come nelle cinque spec sorelle della
   struttura; `ConfirmDialog` con contenuto nello slot è il primitivo già in uso, non un componente
   nuovo.
3. **Modularità** — la geometria e il calcolo dell'intervallo sono funzioni pure senza DOM né DB; lo
   stato del trascinamento vive nella scena, che è l'unico componente che deve conoscerlo sia per le
   file sia per i tab.
4. **Zero debito** — **quattro** voci aperte **causate da questa slice**, tutte **deliberate e nominate**:
   [D-070](../deferred.md#d-070) e [D-071](../deferred.md#d-071) alla scrittura,
   [D-072](../deferred.md#d-072) e [D-074](../deferred.md#d-074) aggiunte dalla review avversariale
   del 2026-07-30 (erano due, ricontate lì); nessuna migration; nessuna dipendenza nuova; nessun
   campo speculativo.
