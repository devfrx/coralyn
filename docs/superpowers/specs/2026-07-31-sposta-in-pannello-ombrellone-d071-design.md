# D-071 — «Sposta in…» nel pannello ombrellone: un secondo canale che non dipende dal puntatore

- **Deferred chiusa:** [D-071](../../architecture/deferred.md#d-071)
- **ADR:** ADR-0066 (da scrivere col piano)
- **Non supera nulla:** [ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md)
  resta valido parola per parola. Questa slice **aggiunge** un canale, non ne estende uno.
- **Resta deferita:** [D-070](../../architecture/deferred.md#d-070) (la dimensione «fila» del listino)

> ⚠️ **Le coordinate `file:riga` di questo documento sono contro `main` al 2026-07-31**, cioè al
> codice *prima* della slice. Sono giuste quando scritte e invecchieranno con l'implementazione:
> cerca il simbolo, non il numero.

---

## 1. Obiettivo

Nel pannello dell'ombrellone dell'editor struttura compare un controllo **«Sposta»**: si sceglie una
**fila di destinazione** e una **posizione**, si conferma, e l'ombrellone si sposta. Il controllo si
rende a **ogni larghezza di schermo**.

È il secondo canale verso `POST /api/establishment/umbrellas/:id/move`, che esiste già, è provato e
mergiato. **Nessuna riga di API cambia. Nessuna migration. Nessuna dipendenza nuova.**

---

## 2. Cosa esiste già e non si rifà

| Già in `main` | Dove |
|---|---|
| L'endpoint, `@HttpCode(200)`, permesso ripetuto sul metodo | `umbrellas.controller.ts` |
| Cinque guardie: 404 ombrellone · 409 ritirato (anche concorrente) · 404 fila · 422 `kind` diverso · 422 posizione fuori intervallo | `umbrellas.service.ts` |
| 13 presìdi e2e sull'endpoint | `apps/api/test/establishment-umbrellas-move.e2e-spec.ts` |
| `useMoveUmbrella`, con le quattro invalidazioni già giuste | `useEstablishmentStructure.ts:171-178` |
| Il gate della disclosure sul prezzo e il suo `ConfirmDialog` | `EstablishmentStructureView.vue:112-124`, `:268-286` |
| L'anteprima ottimistica e la sua contabilità `treeAtWrite` | `EstablishmentStructureView.vue:77-95` |
| `isCompatible(from, to)`, gemello frontend della guardia 422 | `umbrellaMove.ts:37-39` |

**La metà cara è fatta. Manca il percorso.**

---

## 3. Il problema, misurato e non citato

`EstablishmentStructureView.vue:134-137` apre il `Drawer` appena `selection.kind !== 'beach'` sotto
1024 px. Da lì:

1. `Drawer.vue` monta `DialogRoot` **senza** `:modal`, quindi `modal` resta `true` e
   `DialogContent` sceglie `DialogContentModal` (`reka-ui@2.10.1`, `dist/Dialog/DialogContent.js:50`).
2. `DialogContentModal` dichiara `disableOutsidePointerEvents` con **`default: true`**
   (`dist/Dialog/DialogContentModal.js:20-23`).
3. `DismissableLayer` scrive allora `body.style.pointerEvents = "none"`
   (`dist/DismissableLayer/DismissableLayer.js:92-93`).

Quindi sotto `lg` la scena è **pointer-morta appena qualcosa è selezionato**, ed è per questo che
`EstablishmentStructureView.vue:242` passa `:can-drag="isDesktop"`: una maniglia inerte sarebbe
peggio della sua assenza ([ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §10).

⚠️ **Un fatto in più, che i documenti precedenti non registrano.** Il `Drawer` non rende solo il body
insensibile: rende anche un `DialogOverlay` `fixed inset-0` con lo scrim, e il pannello è
`w-[380px] max-w-[calc(100vw-24px)]`. Su un telefono da 390 px il pannello ne copre 366 e il resto è
sotto scrim. **Anche con i pointer-event vivi non ci sarebbe scena da indicare.** La conseguenza per
il disegno è vincolante: il controllo dev'essere **autosufficiente dentro il pannello** e non può
chiedere all'operatore di indicare nulla nella scena.

---

## 4. Le decisioni

### 4.1 Il controllo si rende a ogni larghezza

**Deciso con l'utente il 2026-07-31.** Non è agganciato alla soglia dei 1024 px.

Due ragioni, la seconda misurata:

1. A `lg+` dà un equivalente **da tastiera** allo spostamento, che oggi non esiste: la maniglia è
   uno `<span aria-hidden>` non focalizzabile e
   [ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §8 dichiara
   testualmente che «non esiste equivalente da tastiera». Questa slice chiude quel buco senza
   toccare la maniglia.
2. Renderlo solo sotto `lg` sarebbe la **terza** cosa agganciata alla stessa soglia — dopo il getter
   di `drawerOpen` e `:can-drag` — cioè tre punti da tenere allineati invece di uno.

⚠️ **Questo NON riapre la decisione 5 di ADR-0065.** «Il trascinamento è solo `lg+`» resta vero:
`:can-drag="isDesktop"` non si tocca e la maniglia continua a non rendersi sotto `lg`. Ciò che
esiste a ogni larghezza è **l'altro** canale.

### 4.2 Un solo canale di scrittura: il pannello non possiede la mutation

Il pannello **emette verso l'alto**. `InspectorPanels` riemette con la **stessa firma che la scena
già usa** — `move-umbrella: [umbrellaId, rowId, position]` (`StructureScene.vue:28`) — e la shell
aggancia i due canali allo stesso handler.

Ne viene, senza scrivere una riga: la disclosure sul prezzo, l'anteprima ottimistica con la sua
contabilità, le quattro invalidazioni, e **un solo posto da cambiare**.

**È la ragione principale di questa forma.** Il gemello — pannello con mutation, gate e dialogo
propri — sarebbe il **terzo** esemplare di una logica che oggi vive già in due
(`EstablishmentStructureView.vue:112-124` e `BeachPanel.vue:72-84`), e la review avversariale della
sessione 15 ha mostrato che i gemelli divergono in silenzio: un difetto corretto in un dialogo era
rimasto nel suo gemello, e a vederlo è stata solo la review d'insieme.

### 4.3 La destinazione: fila **e** posizione

**Deciso con l'utente il 2026-07-31**, contro l'alternativa «solo la fila, coda implicita».

La ragione è il titolo stesso della voce: D-071 dice «il **riordino** non esiste», e con la sola fila
lo spostamento *fra* file sarebbe possibile ma il riordino *dentro* una fila no — la voce si
chiuderebbe a metà.

**Il costo è dichiarato:** su una fila da 100 ombrelloni il secondo `Select` ha 101 voci, e il
database di sviluppo ha davvero una `Fila 2` con 100 ombrelloni. Il `Select` di ui-kit non ha
ricerca. Mitigazione: le voci sono etichettate col vicino (`Prima di «A34»`), quindi si scorrono per
numero. Se un giorno dà fastidio è una voce nuova, non un debito nascosto.

### 4.4 Le file offerte sono solo quelle compatibili, e la propria è inclusa

Filtro su `isCompatible(sector.kind, target.kind)`, cioè la decisione 3 di
[ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md). Le file
incompatibili **non si offrono**, non si offrono-e-si-spiegano: è la stessa politica del
trascinamento, dove `umbrellaMove.ts:34-35` dichiara che il gemello frontend della guardia «serve
solo a non offrire un bersaglio che verrebbe rifiutato».

⚠️ **La fila di partenza è nell'elenco.** Senza, il riordino dentro la fila non esisterebbe.

⚠️ **Le file di un altro settore non sono nel DOM** — `StructureScene.vue:170-182` rende `current` e
basta — ma l'albero completo è in `data`. La sorgente c'è; è la **resa** a essere parziale. Il
controllo legge la sorgente.

### 4.5 Perché `moveTargets` non riusa `allRows` di BeachPanel

`BeachPanel.vue:46-47` costruisce un elenco quasi identico per il ripristino, **senza filtro sul
`kind`**. Sembra duplicazione da estrarre. Non lo è, ed è stato misurato invece che dedotto:

- `move` rifiuta il salto di `kind` con **422**
  ([ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §4);
- `restore` **non ha alcuna guardia sul `kind`**: `umbrellas.service.ts:263-283` chiama solo
  `assertRow`, che a `:20-23` verifica l'esistenza della fila e nient'altro.

Quindi `allRows` è **fedele al proprio server**. Le due liste rispondono a due contratti diversi, e
unificarle introdurrebbe un filtro che il ripristino non vuole. Restano separate.

> ⚠️ **Osservazione fuori scope, da non risolvere qui:** che `move` vieti il salto di `kind` e
> `restore` lo consenta in silenzio è un'asimmetria di dominio reale. Non è causata da questa slice
> e non viene toccata: va portata all'utente come voce propria, non decisa di straforo.

### 4.6 Il riscontro: un toast sul percorso del pannello, non sul trascinamento

Sotto `lg` la scena è dietro lo scrim, quindi **l'anteprima ottimistica non si vede**: senza toast
l'unico riscontro sarebbe la riga `Settore {nome} · {fila}` dell'intestazione, che cambia quando
atterra la rilettura. I tre fratelli nello stesso file — salva, elimina, ritira — fanno tutti
`pushToast` (`UmbrellaPanel.vue:21,26,32`).

Il trascinamento **non** guadagna un toast: la cella si è già mossa sotto gli occhi, e un toast per
gesto sarebbe rumore su dieci spostamenti di fila. Il costo è un parametro, non un ramo.

### 4.7 Se la scelta coincide con la posizione attuale, il bottone è spento

Il server tratterebbe il caso come no-op **calcolato** e risponderebbe 200 senza scrivere
([ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §5), ma
allora il toast affermerebbe uno spostamento che non è avvenuto.

La condizione è esatta e non approssimata: con `senza` = la fila di destinazione **privata**
dell'ombrellone che si sposta, inserire a `position` dentro la propria fila lascia l'albero
invariato **se e solo se** `position` è l'indice corrente dell'ombrellone in quella fila.

⚠️ **Il `disabled` va scritto includendo `isPending` nella propria espressione**, come fa
`BeachPanel.vue:153`: `Button.vue` lega `:disabled="loading || undefined"` e un `disabled` passato in
fallthrough **lo vince**.

---

## 5. La forma, e i due vincoli che l'hanno decisa

### 5.1 `Select` di ui-kit accetta **solo stringhe**

`Select.vue` dichiara `defineModel<string>()` e `Option.vue` dichiara `value: string`. `position` è
un **numero** (`MoveUmbrellaInput { rowId: string; position: number }`,
`packages/contracts/src/index.ts:817`) e **non è legabile direttamente**.

La posizione viaggia quindi come `String(position)` nel modello del `Select` e torna numero al
momento dell'invio. Non è un espediente: è il tipo che il primitivo condiviso espone, e cambiarlo
sarebbe un breaking change su un componente usato in tutte e tre le app.

### 5.2 Il pannello riceve props nuove a **ogni** rilettura

`form-sync.spec.ts:15-18` documenta che i pannelli non sono key-ati: la stessa istanza riceve sia i
refetch (oggetti nuovi, stesso id) sia i cambi di selezione (id diverso). Ogni mutazione di struttura
invalida la query, quindi accade spesso.

Conseguenza sul controllo: **la posizione scelta può diventare fuori intervallo sotto i piedi**, se
la fila di destinazione si accorcia fra la scelta e la conferma. Se venisse inviata così, il server
risponderebbe 422.

Rimedio: il valore *mostrato* è calcolato, non memorizzato — se il valore scelto non è più fra le
opzioni correnti, il controllo ricade su **«In coda»**, che esiste sempre. Ciò che si invia è ciò che
si vede.

### 5.3 Il disegno che ne esce

**Due funzioni pure in `umbrellaMove.ts`**, che è già il modulo delle funzioni pure dello spostamento
— provabile senza DOM né Nest, come `pricing.engine.ts` accanto al suo service. Nessuna delle due
restituisce testo da rendere: come `BeachPanel.vue:46-47`, restituiscono dati e la formattazione
resta nel template.

- `moveTargets(sectors, fromKind)` → `{ id, label, sectorName }[]` — le file compatibili, in ordine
  d'albero, la propria inclusa.
- `positionOptions(row, umbrellaId)` → `{ position, beforeLabel }[]` — le `n+1` scelte calcolate
  sulla fila **privata** dell'ombrellone che si sposta. `beforeLabel === null` è la coda, ed è
  l'ultima voce perché l'elenco legge la fila da testa a coda. Escludere l'ombrellone è ciò che
  rende il numero prodotto **già** il `position` che l'API vuole — l'indice FINALE, decisione 9 di
  [ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md).

**`UmbrellaPanel.vue`**: un blocco fra il form e la Zona rischiosa, dietro `canManage`. Due `Select`
e un `Button`, forma copiata dal ripristino (`BeachPanel.vue:148-155`). Emette `move: [rowId, position]`.

Stato iniziale: **la fila e la posizione attuali** dell'ombrellone. È lo stato più onesto — dice dove
l'ombrellone è — e ha come effetto che il bottone nasce spento (§4.7). Cambiare la fila porta la
posizione a «In coda», perché nella fila nuova l'ombrellone non ha una posizione attuale. Il `watch`
su `umbrella.id` riporta entrambi allo stato iniziale del **nuovo** ombrellone — non a vuoto — come
già fa `UmbrellaPanel.vue:15` per etichetta e tipologia.

**Props**: `rowLabel: string` e `sectorName: string` diventano `row: StructureRowDTO` e
`sector: StructureSectorDTO` — l'intestazione legge gli stessi due campi, ma servono anche `row.id`,
`row.umbrellas` e `sector.kind` — e si aggiunge `sectors: StructureSectorDTO[]`. Sei props, nessuna
ridondante. La risoluzione resta **nella shell**, che già calcola `selectedUmbrella` via
`findUmbrella` (`structureSelection.ts:21-32`): risolvere una seconda volta dentro il pannello
creerebbe una seconda verità su «in che fila sta questo ombrellone».

**`InspectorPanels.vue:36`**: passa le props nuove e inoltra l'evento.

**`EstablishmentStructureView.vue`**: `onMoveUmbrella` diventa `requestMove(id, rowId, position, notify)`,
con due chiamanti sottili — la scena passa `notify=false`, il pannello `notify=true`. `pendingMove`
porta `notify` con sé, perché la conferma della disclosure arriva dopo.

---

## 6. Presidi

Tutti in **`vitest`** (frontend). **Nessun e2e**: l'endpoint ne ha già 13 e questa slice non lo tocca.

| Presidio | Dove | Cosa arrossa se si rompe |
|---|---|---|
| `moveTargets` esclude i `kind` diversi e include la fila propria | `umbrellaMove.spec.ts` | il filtro di destinazione |
| `positionOptions` esclude l'ombrellone spostato e produce `n+1` voci con la coda in fondo | `umbrellaMove.spec.ts` | l'aritmetica dell'indice FINALE |
| Il controllo non offre le file di un `kind` diverso | `UmbrellaPanel.move.spec.ts` *(nuovo)* | la decisione 3 nel percorso nuovo |
| L'emit porta `rowId` e `position` giusti, coda compresa | `UmbrellaPanel.move.spec.ts` | il contratto col chiamante |
| Il bottone è spento sulla posizione attuale e acceso appena cambia | `UmbrellaPanel.move.spec.ts` | §4.7 |
| Una posizione fuori intervallo dopo una rilettura ricade su «In coda» | `UmbrellaPanel.move.spec.ts` | §5.2 |
| Il percorso del pannello **apre la disclosure** attraversando un confine con tariffe dedicate | `EstablishmentStructureView.spec.ts` | il riuso del gate, cioè §4.2 |
| Il percorso del pannello notifica, il trascinamento no | `EstablishmentStructureView.spec.ts` | §4.6 |
| Le props nuove | `form-sync.spec.ts` (aggiornato) | il contratto del pannello |

⚠️ Il `Select` è **reka-ui, non un `<select>` nativo**: i test usano `selectOption(trigger, label)` da
`@/test/utils` (`test/utils.ts:73-83`), che apre il menu portalato e seleziona su `pointerup`.

⚠️ **Le oltre 20 asserzioni che indicizzano `[data-testid="scene-cell"] button` per posizione non
sono toccate**: il controllo vive nel pannello, non dentro la cella. È il vincolo che ha deciso la
forma della maniglia in
[ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §8 e qui non
si ripresenta.

---

## 7. Cosa questa slice NON fa

- **Non tocca l'API.** Nessun endpoint, nessun DTO, nessuna migration.
- **Non tocca il trascinamento** né `:can-drag`: la decisione 5 resta intatta.
- **Non riordina file né settori**: D-038 è chiusa solo per l'ombrellone, e resta così.
- **Non sposta più ombrelloni per volta**: la decisione 1 resta.
- **Non risolve l'asimmetria `move`/`restore` sul `kind`** (§4.5): va portata all'utente.
- **Non tocca `hasDedicatedRates`** né la sua cecità alle tariffe di fila, che è il corpo di
  [D-070](../../architecture/deferred.md#d-070).

---

## 8. Rubric check

1. **Professionalità** — il canale nuovo passa dallo stesso gate del vecchio, quindi non può
   divergere; ciò che resta scoperto (l'asimmetria `restore`, la lunghezza del secondo `Select`) è
   dichiarato invece che sottinteso.
2. **Convenzioni** — la forma del controllo è quella del ripristino in `BeachPanel`; le funzioni pure
   stanno nel modulo puro già esistente; il toast è la convenzione dei tre fratelli nello stesso
   file; la risoluzione per id resta nella shell come per settore e fila.
3. **Modularità** — la selezione delle destinazioni e l'aritmetica della posizione sono funzioni pure
   senza DOM; il pannello non conosce né HTTP né cache; la shell resta l'unica proprietaria della
   scrittura.
4. **Zero debito** — nessuna voce nuova aperta da questa slice; nessuna dipendenza; nessun campo
   speculativo; nessun ramo condizionato al viewport.
