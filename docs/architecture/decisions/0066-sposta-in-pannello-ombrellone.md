# ADR-0066: Lo spostamento dell'ombrellone ha un secondo canale che non dipende dal puntatore, e si rende a ogni larghezza

- **Status:** Accepted
- **Data:** 2026-07-31
- **Decisori:** Team di progetto
- **Non supera nulla.** [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) resta valido parola
  per parola: in particolare la sua §10, «il trascinamento è solo `lg+`». Questa slice **aggiunge**
  un canale, non estende il primo.
- **ADR correlati:** [ADR-0052](0052-editor-struttura-cantiere.md) (l'editor struttura e i suoi tab),
  [ADR-0053](0053-ritiro-ombrellone-soft-delete.md) (il ripristino, il cui controllo è il modello di
  forma), [ADR-0020](0020-resa-mappa.md) (HTML/CSS invece di SVG, per non ricostruire fuoco e ARIA)
- **Chiude:** [D-071](../deferred.md#d-071)
- **Registra, senza causarla:** [D-075](../deferred.md#d-075) — l'asimmetria fra `move` e `restore`
  sul `kind`, **preesistente**, trovata misurando se le due liste di destinazioni fossero la stessa.

## Context

[ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) ha reso l'ombrellone riordinabile
**trascinandolo**, dichiarando la feature `lg+` e accettando il buco come costo. Il buco è l'intero
caso tablet e telefono: l'editor struttura è la schermata di configurazione iniziale, spesso fatta in
spiaggia con un tablet, e lì la struttura si modificava **solo** con crea, genera ed elimina.

**La causa è stata riverificata nel sorgente installato, non ripresa dai documenti** (`reka-ui@2.10.1`):

1. `Drawer.vue` monta `DialogRoot` **senza** `:modal`, quindi `modal` resta `true` e `DialogContent`
   sceglie `DialogContentModal` (`dist/Dialog/DialogContent.js:50`).
2. `DialogContentModal` dichiara `disableOutsidePointerEvents` con **`default: true`**
   (`dist/Dialog/DialogContentModal.js:20-23`).
3. `DismissableLayer` scrive allora `body.style.pointerEvents = "none"`
   (`dist/DismissableLayer/DismissableLayer.js:92-93`).

Sotto 1024 px il Drawer è aperto **appena qualcosa è selezionato** (il getter di `drawerOpen` in
`EstablishmentStructureView.vue`), quindi la scena è pointer-morta esattamente quando si vorrebbe
trascinare — ed è per questo che la maniglia non si rende (`:can-drag="isDesktop"`).

⚠️ **Un fatto che i documenti precedenti non registravano, e che ha vincolato il disegno.** Il Drawer
non rende solo il body insensibile: rende anche un `DialogOverlay` `fixed inset-0` con lo scrim, e il
pannello è `w-[380px] max-w-[calc(100vw-24px)]`. Su un telefono da 390 px ne copre 366. **Anche con i
pointer-event vivi non ci sarebbe scena da indicare.** Il controllo dev'essere perciò
**autosufficiente dentro il pannello**, e non può chiedere all'operatore di puntare nulla nella scena.

**La metà cara era già fatta e mergiata**: l'endpoint `POST /api/establishment/umbrellas/:id/move`
con le sue cinque guardie, l'aritmetica pura in `umbrella-order.ts`, 13 presìdi e2e, il composable
`useMoveUmbrella` con le invalidazioni giuste, e il gate della disclosure sul prezzo col suo dialogo.
Mancava **solo un percorso**. È il caso-scuola di «capacità ≠ percorso reale».

## Decision

### 1. Un secondo canale, non un'estensione del primo

Il trascinamento resta `lg+` e la maniglia continua a non rendersi sotto quella soglia. Ciò che si
aggiunge è un **controllo distinto** — «Sposta» nel pannello dell'ombrellone — che raggiunge lo
stesso endpoint senza puntatore. Confondere le due cose riaprirebbe una decisione chiusa.

### 2. Si rende a ogni larghezza, non solo sotto `lg`

Due ragioni, la seconda misurata:

1. A `lg+` è anche l'**equivalente da tastiera** che non esisteva:
   [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §8 dichiara testualmente che la maniglia
   è uno `<span aria-hidden>` non focalizzabile e che «non esiste equivalente da tastiera». Questa
   slice chiude quel buco **senza toccare la maniglia**.
2. Renderlo solo sotto `lg` sarebbe stata la **terza** cosa agganciata alla soglia dei 1024 px, dopo
   il getter di `drawerOpen` e `:can-drag`: tre punti da tenere allineati invece di uno.

Il costo accettato è che a `lg+` i due canali coesistono — proprio ciò che
[ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §Alternatives temeva («un secondo
meccanismo per la stessa operazione, da tenere coerente col primo»). La decisione 5 qui sotto lo
rende un timore infondato per costruzione: **coerenti lo sono perché sono lo stesso codice.**

### 3. La destinazione è fila **e** posizione

Non la sola fila con la coda implicita, che sarebbe stata la prima versione più piccola e ha il
precedente del ripristino («torna in coda alla fila scelta»). La ragione è il titolo stesso della
voce: [D-071](../deferred.md#d-071) dice che «il **riordino** non esiste», e con la sola fila lo
spostamento *fra* file sarebbe stato possibile ma il riordino *dentro* una fila no — la voce si
sarebbe chiusa a metà.

**Il costo è dichiarato:** su una fila da 100 ombrelloni il secondo `Select` ha 101 voci, e il
database di sviluppo ha davvero una fila con 100 ombrelloni. Il `Select` di `ui-kit` non ha ricerca.
Mitigazione: le voci sono etichettate col vicino (`Prima di «A34»`), quindi si scorrono per numero.

### 4. Si offrono le file compatibili, e fra queste la propria

Filtro su `isCompatible`, cioè la §4 di
[ADR-0065](0065-riordino-ombrellone-per-trascinamento.md): mai `grid → special`. Le file incompatibili
**non si offrono**, non si offrono-e-si-spiegano — è la stessa politica del trascinamento, dove il
gemello frontend della guardia «serve solo a non offrire un bersaglio che verrebbe rifiutato».

La fila di partenza è **nell'elenco**: senza, il riordino dentro la fila non esisterebbe.

⚠️ Le file di un altro settore **non sono nel DOM** — la scena rende un settore per volta — ma
l'albero completo è in `data`. Il controllo legge la **sorgente**; è la resa a essere parziale.

⚠️ **Le due liste non si unificano.** `BeachPanel` costruisce per il ripristino un elenco quasi
identico **senza filtro sul `kind`**, e sembra duplicazione da estrarre. Non lo è, e la differenza è
stata **misurata invece che dedotta**: `restore` non ha alcuna guardia sul `kind` — chiama solo
`assertRow`, che verifica la sola esistenza della fila — quindi quella lista è **fedele al proprio
server**. Unificarle imporrebbe al ripristino un vincolo che non ha. L'asimmetria fra le due porte è
[D-075](../deferred.md#d-075), e non è compito di questa slice sanarla.

### 5. Un solo ingresso di scrittura: il pannello emette, non scrive

Il pannello **non possiede la mutation**. Emette verso l'alto; `InspectorPanels` riemette con la
**stessa firma che la scena già usa**; la shell aggancia i due canali allo stesso `requestMove`.

**È la decisione portante di questa slice, non un dettaglio.** Un gate proprio nel pannello sarebbe
stato il **terzo** esemplare della stessa logica — dopo quello della shell e il suo gemello per il
ripristino in `BeachPanel` — e nella review avversariale di D-038 i gemelli sono già divergiti in
silenzio: un difetto corretto in un dialogo era rimasto nell'altro, e a vederlo è stata solo la
review d'insieme. Qui la disclosure sul prezzo, l'anteprima ottimistica con la sua contabilità e le
quattro invalidazioni valgono per il canale nuovo **senza una riga in più**.

### 6. Notifica solo il percorso del pannello

Sotto `lg` la scena è dietro lo scrim, quindi l'anteprima ottimistica **non si vede** e senza toast
non resterebbe alcun riscontro. I tre fratelli nello stesso pannello — salva, elimina, ritira — fanno
tutti `pushToast`.

Il trascinamento **non** guadagna un toast: la cella si è già mossa sotto gli occhi, e un toast per
gesto sarebbe rumore su dieci spostamenti di fila. È l'**unica** cosa che i due canali non
condividono, ed è un parametro, non un ramo. Viaggia dentro `pendingMove`, perché la conferma della
disclosure arriva dopo e a quel punto chi ha chiesto lo spostamento non sarebbe più deducibile.

### 7. Sulla posizione attuale il bottone è spento

Il server tratterebbe il caso come no-op **calcolato** e risponderebbe 200 senza scrivere
([ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §5), ma allora il toast affermerebbe uno
spostamento che non è avvenuto.

⚠️ Il `disabled` include la condizione di pending nella **propria** espressione, non solo nel
`:loading`: `Button.vue` lega `:disabled="loading || undefined"` e un `disabled` passato in
fallthrough **lo vince**. È lo stesso accorgimento del ripristino in `BeachPanel`.

### 8. La chiave del `Select` della posizione è funzionale, non decorativa

⚠️ **Misurato, e trovato da un test che è arrossato.** `SelectValue` di reka-ui non rende lo slot
dell'item selezionato: rende il testo di un **registro valore→testo costruito dagli item montati**.
L'elenco delle posizioni cambia sotto — con la fila di destinazione, con l'ombrellone selezionato, e
a ogni rilettura — e quel registro resta indietro: il controllo finisce per **nominare un ombrellone
che nella destinazione non esiste**. Valore giusto, etichetta che mente.

Due inneschi distinti, entrambi osservati e ora in presidio:

- la coda della fila nuova ha **per caso lo stesso numero** della scelta corrente: il `modelValue` non
  cambia, quindi non si rilegge nulla;
- cambia l'ombrellone a fila ferma: il `modelValue` cambia, ma il registro porta ancora il testo del
  vecchio elenco.

Il rimedio è legare il `:key` del `Select` al **contenuto** dell'elenco reso — una stringa derivata
dalle etichette, non dall'identità degli oggetti — così il controllo si rimonta esattamente quando
quell'elenco cambia, e **mai** per una rilettura che non cambia nulla. Misurato: togliendo la chiave,
**2 test diventano rossi** in `vitest`, esattamente i due che descrivono i due inneschi.

### 9. Il controllo DERIVA da dove sta l'ombrellone; la scelta dell'operatore è un'intenzione facoltativa

⚠️ **Questa forma viene dalla review avversariale del 2026-07-31, e la prima stesura era sbagliata.**
Il controllo memorizzava fila e posizione e le risincronizzava con un `watch`. Ma un ombrellone può
cambiare posto **senza cambiare identità** — lo trascina l'operatore stesso a `lg+`, o lo sposta un
collega da un'altra postazione — e il pannello resta montato con la stessa selezione, ricevendo solo
props nuove. Con la sorgente del `watch` legata al solo `umbrella.id`, il controllo restava puntato
sulla fila di partenza mentre l'intestazione mostrava già quella d'arrivo, `moveIsNoop` diventava
falso da solo, e **il bottone si accendeva su un gesto che riportava l'ombrellone indietro**.

⚠️ **La prima correzione ha scambiato un difetto con un altro.** Risincronizzare sulla coppia
fila-indice copriva anche lo spostamento *dentro* la stessa fila, ma trattava la **cancellazione di
un vicino** come uno spostamento — l'indice cambia per entrambi — e buttava via la scelta in corso
dell'operatore. Se ne è accorto un presidio scritto per un altro caso.

La forma adottata non memorizza e non risincronizza: `chosenRowId`/`chosenPosition` sono `null`
finché l'operatore non esprime un'intenzione, e tutto il resto è **derivato**. Senza intenzione il
controllo mostra dove l'ombrellone sta adesso, quindi segue qualunque spostamento venga da fuori
senza un solo `watch`; con un'intenzione, quella vince — ma **solo finché resta praticabile**, il che
chiude gratis anche il caso della fila di destinazione eliminata da un'altra postazione, che prima
sarebbe finita in un `rowId` morto e in un 404.

L'intenzione si **consuma con l'invio**. `movePending` cade quando risponde il POST, non quando
atterra la rilettura: nella finestra fra le due l'albero dice ancora che l'ombrellone è nella fila di
partenza, e un'intenzione ancora impostata avrebbe riacceso il bottone e permesso un secondo invio
identico, che riapre la disclosure appena confermata. Il costo, dichiarato: annullando la disclosure
l'operatore deve riscegliere la destinazione — ed è il verso giusto in cui sbagliare, perché dopo un
«no» un controllo a riposo è meglio di un bottone armato.

## Consequences

### Positive

- **Tablet e telefono smettono di essere scoperti.** Era l'intero caso d'uso della schermata di
  configurazione iniziale.
- **Lo spostamento acquista un equivalente da tastiera anche a `lg+`**, che
  [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §8 dichiarava mancante — senza toccare la
  maniglia e senza spendere il credito di accessibilità che
  [ADR-0020](0020-resa-mappa.md) si era guadagnato scegliendo HTML/CSS contro SVG.
- **Il canale nuovo non può divergere dal vecchio**, perché è lo stesso ingresso: disclosure,
  anteprima e invalidazioni sono in un esemplare solo.
- **Nessuna riga di API**, nessuna migration, nessuna dipendenza nuova, nessun campo speculativo.

### Negative / Trade-off

- **Su una fila lunga il `Select` della posizione ha molte voci** (101 su una fila da 100), e
  `ui-kit` non offre ricerca. Il default «In coda» copre il caso quasi sempre voluto, ma su una fila
  molto lunga scegliere una posizione precisa è scomodo. Se un giorno dà fastidio è una voce nuova,
  non un debito nascosto.
- **A `lg+` esistono due modi di fare la stessa cosa**, che è un costo di apprendimento anche quando
  non è un costo di coerenza.
- **Il pannello riceve una props in più (`movePending`) che è stato di una mutation altrui.** Scende
  solo per spegnere il bottone durante la scrittura, ed è il prezzo di non dare la mutation al
  pannello: l'alternativa sarebbe stata il terzo gemello (§5).
- **Il `:key` rimonta il `Select`**, quindi un elenco a tendina aperto si chiude se l'albero cambia
  sotto. È corretto — l'elenco *è* cambiato — ma è un comportamento da conoscere.

### Neutre / Note

- **La posizione viaggia come stringa.** `Select` di `ui-kit` dichiara `defineModel<string>()` e
  `Option` dichiara `value: string`, mentre `position` è un numero: la conversione avviene all'invio.
  Non è un espediente, è il tipo che il primitivo condiviso espone; cambiarlo sarebbe un breaking
  change su un componente usato da tutte e tre le app.
- **Il valore mostrato è calcolato, non memorizzato.** I pannelli non sono key-ati e ricevono props
  nuove a ogni rilettura: se la fila di destinazione si accorcia sotto i piedi, una posizione
  memorizzata uscirebbe dall'intervallo e il server risponderebbe 422. Il controllo ricade sulla
  coda, che esiste sempre. **Ciò che si invia è ciò che si vede.**
- **`InspectorPanels` è montato due volte** — l'`aside` desktop e il `Drawer` — e vanno collegati
  entrambi. Non è teorico: staccando l'evento dal **solo** ramo Drawer, tutti i 187 test di
  `features/establishment` restavano **verdi**. La mutazione provava l'assenza di *copertura*, non
  l'assenza del difetto, ed è stato scritto il presidio che mancava. Lo stesso errore era già
  capitato in questo file con i pannelli Fila.
- **Le oltre 20 asserzioni che indicizzano le celle della scena per posizione non sono toccate**: il
  controllo vive nel pannello, non dentro la cella. È il vincolo che aveva deciso la forma della
  maniglia in [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §8, e qui non si ripresenta.

## Alternatives considered

- **Il controllo solo sotto `lg`** — scartata. Renderebbe i due canali disgiunti per viewport, che è
  la lettura più fedele al timore di
  [ADR-0065](0065-riordino-ombrellone-per-trascinamento.md) §Alternatives, ma lascerebbe `lg+` senza
  alcun equivalente da tastiera e sarebbe la terza cosa agganciata alla soglia dei 1024 px. Il timore
  che motivava la disgiunzione è comunque tolto dalla §5: i due canali sono lo stesso codice.

- **Solo la fila, con la coda implicita** — scartata. È la prima versione più piccola e ha il
  precedente del ripristino, ma lascerebbe il riordino **dentro** una fila impossibile sotto `lg`, e
  chiuderebbe [D-071](../deferred.md#d-071) a metà dichiarando di chiuderla tutta.

- **Fila più posizione come campo numerico** — scartata: chiederebbe all'operatore di contare le
  celle, che è l'unica cosa che l'editor esiste per evitare — e sotto `lg` la scena è coperta dal
  Drawer, quindi non potrebbe nemmeno contarle guardando.

- **Il pannello con mutation, gate e dialogo propri** — scartata: sarebbe il terzo esemplare di una
  logica che vive già in due, e i gemelli in questa feature sono già divergiti una volta (§5).

- **Estrarre una lista di destinazioni condivisa con il ripristino** — scartata **su misura**, non
  per gusto: `restore` non ha guardia sul `kind`, quindi le due liste rispondono a due contratti
  diversi e unificarle imporrebbe al ripristino un filtro che non vuole ([D-075](../deferred.md#d-075)).

- **Il toast anche sul trascinamento**, per non avere due comportamenti — scartata: la cella si è già
  mossa sotto gli occhi, e dieci spostamenti di fila darebbero dieci toast che non informano.

## Rubric check

1. **Professionalità** — il canale nuovo passa dallo stesso gate del vecchio, quindi non può
   divergere; ciò che resta scoperto (la lunghezza del secondo `Select`, l'asimmetria del ripristino)
   è **dichiarato** invece che sottinteso, e il secondo ha una voce propria.
2. **Convenzioni** — la forma del controllo è quella del ripristino in `BeachPanel`; le funzioni pure
   stanno nel modulo puro già esistente; il toast è la convenzione dei tre fratelli nello stesso
   file; la risoluzione per id resta nella shell come per settore e fila; le fixture dei test nuovi
   sono inline come nelle cinque spec sorelle della struttura.
3. **Modularità** — la selezione delle destinazioni e l'aritmetica della posizione sono funzioni pure
   senza DOM né DB; il pannello non conosce né HTTP né cache; la shell resta l'unica proprietaria
   della scrittura.
4. **Zero debito** — **nessuna voce aperta causata da questa slice**; nessuna dipendenza; nessuna
   migration; nessun ramo condizionato al viewport. [D-075](../deferred.md#d-075) è **preesistente**
   ed è stata trovata di passaggio, non introdotta.
