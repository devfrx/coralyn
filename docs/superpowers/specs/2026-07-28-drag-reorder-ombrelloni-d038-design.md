# D-038 — Riordino e spostamento dell'ombrellone per trascinamento: spec di design

- **Deferred chiusa:** [D-038](../../architecture/deferred.md#d-038)
- **ADR:** ADR-0065 (da scrivere col piano) — supera la clausola «niente drag&drop» di
  [ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md)
- **Resta deferita:** [D-005](../../architecture/deferred.md#d-005) (planimetria a coordinate libere)

---

## 1. Obiettivo

Nell'editor struttura («il Cantiere») si trascina **un ombrellone per volta** per cambiarne la
posizione: dentro la propria fila, in un'altra fila del proprio settore, o in una fila di un altro
settore **della stessa tipologia**.

Oggi non esiste alcun modo di riordinare senza eliminare e ricreare: `logicalOrder` è scritto
**solo** alla creazione (`umbrellas.service.ts:43`), al `generate` (`:114`) e al `restore` (`:190`),
e nessun DTO di update lo accetta (`UpdateUmbrellaInput { label?, umbrellaTypeId? }`,
`packages/contracts/src/index.ts:795`).

Questa slice **non** introduce una posizione nuova: completa una capacità già modellata, già
assegnata, già usata per ordinare e già esposta nel contratto. L'unica cosa che mancava era poterla
cambiare.

---

## 2. Le decisioni

### 2.1 Un ombrellone per volta, non una lista riordinabile

Il gesto muove **una** entità. La conseguenza non è ergonomica ma tecnica, ed è la ragione per cui
questa slice è realizzabile mentre un riordino in blocco non lo sarebbe:

- I due endpoint in blocco esistenti scrivono **un solo valore per tutte le righe**
  (`deleteMany` in `umbrellas.service.ts:134`, `updateMany` in `:145-147`). Un riordino di lista
  scriverebbe **N valori diversi**, forma che nel repo **non ha precedenti**: `grep -rn
  "executeRaw\|queryRaw" apps/api/src` fuori da `prisma.service.ts` → **zero righe**.
- `forTenant` non passa `transactionOptions` (`prisma.service.ts:26`), quindi N round-trip
  ricadrebbero nel timeout di default: è il P2028 che costrinse a riscrivere `generate` in una sola
  `createManyAndReturn` ([ADR-0062](../../architecture/decisions/0062-generate-ombrelloni-scrittura-batch.md)).
- I cap dei bulk sono `@ArrayMaxSize(200)`, mentre una fila può contenere ≥500 ombrelloni
  (`generate-umbrellas.dto.ts:19` è `@Max(500)` **per chiamata**, ed è ripetibile).

### 2.2 La scrittura sono due istruzioni, non N

**Misurato sul database di sviluppo**: gli ordini sono **densi**. La `Fila 2` ha 100 ombrelloni con
`logicalOrder` da 2 a 101 e **zero buchi**. Fra due vicini non c'è un intero libero, quindi
«assegna un valore in mezzo» non è praticabile.

La forma adottata è uno **spostamento di intervallo**:

```ts
// 1. libera la posizione: una sola istruzione, N righe toccate
await tx.umbrella.updateMany({
  where: { rowId: destRowId, logicalOrder: { gte: position } },
  data: { logicalOrder: { increment: 1 } },
});
// 2. colloca l'ombrellone spostato
await tx.umbrella.update({
  where: { id },
  data: { rowId: destRowId, logicalOrder: position },
});
```

**Due round-trip a costo costante**, dentro una sola `forTenant`. Verificato che Prisma 5.22 lo
esprima senza SQL grezzo: `UmbrellaUpdateManyMutationInput.logicalOrder` accetta
`IntFieldUpdateOperationsInput` (client generato, riga 38505), che dichiara `increment`
(righe 43296-43302). Ed è lo **stesso `updateMany`** già usato da `bulkAssignType`: nessuna
convenzione nuova.

Lo spostamento *dentro la stessa fila* verso una posizione più alta richiede il decremento
simmetrico sull'intervallo `(vecchia, nuova]`; il piano lo tratta come caso della stessa funzione.

**Gli ordini restano sparsi e non si rinumerano.** Non esiste alcun indice unico su
`logicalOrder`/`sortOrder` — verificato: `grep -rn -iE "CREATE (UNIQUE )?INDEX"
apps/api/prisma/migrations --include=*.sql | grep -iE '"(Sector|Row|Umbrella)"'` non restituisce
alcun indice su quei campi — quindi buchi e duplicati sono già oggi legali e innocui.

### 2.3 Nessuna migration, nessun breaking change

La colonna esiste dal primo init. Il campo resta `Int NOT NULL`. `StructureRowDTO.sortOrder` e
`StructureSectorDTO.sortOrder` restano nel contratto con la stessa forma: cambiano i **valori**,
non lo schema né i tipi.

### 2.4 Destinazione ammessa: stessa tipologia di settore

Una fila qualsiasi il cui settore abbia lo **stesso `kind`** del settore di partenza. Mai
`grid → special`, mai `special → grid`.

Il vincolo è di dominio, non tecnico: un ombrellone «fuori griglia» (palme, gazebo) e uno di fila
regolare non sono intercambiabili nella scena, e la Mappa li rende in due blocchi distinti
discriminando su `kind` (`MapView.vue:65-66`, con due test che lo vincolano — `MapView.spec.ts:112`
e `:137`).

### 2.5 Sul prezzo: disclosure, non blocco

`Booking.totalPrice` è una colonna **persistita, scritta solo alla create**
(`bookings.service.ts:379`). Nessuno dei 7 `booking.update` la riscrive e non esiste alcun ricalcolo
in tutto il backend. **Spostare non riscrive mai la storia.**

L'unico canale in cui la posizione conta è il **rinnovo**: `renew()` copia `umbrellaId`
(`bookings.service.ts:483`) e ripassa da `priceWithin`, che risolve la posizione **corrente** via
`umbrella.row.sectorId` (`catalog.service.ts:173-175`). E conta **solo se esiste una tariffa
agganciata a un settore**: `isApplicable` scarta una rate solo quando `r.sectorId !== null`
(`pricing.engine.ts:41`).

**Stato misurato del database di sviluppo**: 5 tariffe in tutto (RLS bypassata, tutti i tenant),
**zero con `sectorId`, zero con `rowId`**. Né il seed (`seed.ts:222-267`) né l'onboarding
(`StepRates.vue:31` invia `{ seasonId, price }`) ne creano di posizionali: serve una scelta
deliberata nel selettore `rate-sector` (`PricingView.vue:689`).

Quindi: **quando la mossa attraversa un confine di settore ed esiste almeno una tariffa agganciata
al settore di partenza o a quello d'arrivo, l'editor lo dichiara prima di confermare.** Nessun
blocco.

Il blocco sarebbe la risposta sbagliata nel merito: se esiste una tariffa «Settore A» e si sposta
un ombrellone fuori da A, *deve* smettere di essere prezzato come A — altrimenti la tariffa mente
su cosa copre. L'unica cosa scorretta è farlo in silenzio.

> ⚠️ **`restore` fa già oggi la stessa cosa, muta.** `umbrellas.service.ts:187-195` riaggancia un
> ombrellone ritirato a **qualsiasi** fila, quindi a qualsiasi settore, senza alcuna guardia né
> avviso. Questa slice **estende la stessa disclosure a `restore`**: la feature chiude un
> comportamento silenzioso esistente invece di aggiungerne uno nuovo.

### 2.6 Sulle prenotazioni: nessuna guardia nuova, e il perché

Non serve ereditare il 409 di `retire`. Le ragioni sono due e vanno distinte:

- La prenotazione punta a `umbrellaId`, **non** a `rowId`: nessuna riga di `Booking` o
  `BookingCoverage` cambia quando l'ombrellone si sposta. La prenotazione segue l'ombrellone.
- Il prezzo già scritto è immutabile (§2.5).

Un ombrellone prenotato è quindi spostabile senza conseguenze. Questo **diverge** deliberatamente da
`retire`, che pretende zero prenotazioni vive (`umbrellas.service.ts:167-168`): lì il vincolo
esiste perché il ritiro **sgancia** l'ombrellone dalla struttura (`rowId: null`) e lo rende non
prezzabile (`catalog.service.ts:154`), mentre uno spostamento lo lascia sempre in una fila valida.

---

## 3. Modello dati

**Invariato.** Nessuna migration, nessuna colonna, nessun indice.

| Campo | Prima | Dopo |
|---|---|---|
| `Umbrella.logicalOrder` | `Int NOT NULL`, scritto solo a create/generate/restore | identico, **più** l'endpoint di move |
| `Umbrella.rowId` | `String? @db.Uuid`, `null` = ritirato | identico |
| `Row.sortOrder`, `Sector.sortOrder` | `Int NOT NULL` | **non toccati da questa slice** |

`Umbrella.presentationPosition` resta **inutilizzato**: è la sede di [D-005](../../architecture/deferred.md#d-005)
(layout a coordinate libere), non di questa slice, che agisce sull'**ordine logico**. Confondere i
due significherebbe aprire due nozioni di posizione concorrenti.

---

## 4. API

### 4.1 L'endpoint

```
POST /api/establishment/umbrellas/:id/move
body: { rowId: string; position: number }
→ 200 StructureUmbrellaDTO
```

La forma non è scelta: è **il fratello esatto** dei due endpoint d'azione già presenti sullo stesso
controller, `POST :id/retire` e `POST :id/restore` (`umbrellas.controller.ts:49,54`). Il repo
riserva la `PATCH :id` ai campi propri dell'entità (`label`, `umbrellaTypeId`) e dà a ogni
transizione di stato un endpoint dedicato. Una `PATCH` con `rowId` sarebbe anche pericolosa: la
`ValidationPipe` è senza `forbidNonWhitelisted` (`configure-app.ts:18`), quindi un campo non
dichiarato viene scartato **in silenzio** con 200.

`position` è l'indice **0-based** nella fila di destinazione, cioè lo stesso indice d'array che il
frontend già possiede: la struttura arriva ordinata dal server (`establishment-structure.select.ts:8`
per gli ombrelloni, `:18` per le file) e la proiezione preserva l'ordine. Il client non conosce —
e non deve conoscere — il valore assoluto di `logicalOrder`, che nessun DTO espone
(`StructureUmbrellaDTO = { id, label, umbrellaTypeId }`, `contracts:773`).

Il server traduce l'indice in un `logicalOrder` assoluto leggendo la fila di destinazione dentro la
stessa transazione.

### 4.2 Il permesso si dichiara, anche se sarebbe ereditato

`@RequiresPermission(Permission.StructureManage)` **sul metodo**, benché
`UmbrellasController` lo porti già sulla classe (`umbrellas.controller.ts:17`) e il presidio lo
accetterebbe: `authorization-coverage.spec.ts:56-57` legge `metodo ?? classe`.

⚠️ **È una scelta, non ridondanza.** Un endpoint nuovo su quel controller eredita il permesso **in
silenzio**: nessun test lo chiederebbe, nessun 403 lo rivelerebbe. Un permesso implicito è un
permesso non deciso, e questa è una scrittura che cambia ciò che vede l'operatore al banco.

### 4.3 Guardie, in ordine di valutazione

| # | Condizione | Esito | Perché |
|---|---|---|---|
| 1 | Ombrellone inesistente | **404** | |
| 2 | `retiredAt != null` | **409** | ⚠️ **Nessuna query di mappa o struttura filtra `retiredAt`**: l'esclusione di un ritirato dipende **solo** da `rowId = null` (`umbrellas.service.ts:170`). Un move che scrivesse `rowId` **resusciterebbe** un ritirato, prenotabile. Senza questa guardia la feature introduce un difetto di dominio |
| 3 | Fila di destinazione inesistente **o di un altro tenant** | **404** | Segue `assertRow` (`umbrellas.service.ts:19-22`), **ma asserendo `establishmentId` esplicitamente**: `assertRow` oggi è un `findUnique` senza scope di tenant e delega tutto alla policy RLS. Su una scrittura che cambia genitore la tenancy si asserisce, non si eredita |
| 4 | `kind` del settore di destinazione ≠ `kind` del settore di partenza | **422** | §2.4. 422 e non 409 perché è un input non processabile, non un conflitto di stato — coerente con `assertType` (`:24-28`) |
| 5 | `position` fuori dall'intervallo `[0, n]` della fila di destinazione | **422** | `n` = numero di ombrelloni attivi nella fila; `n` significa «in coda» |

**Nessun ramo idempotente silenzioso.** Se la posizione richiesta coincide con quella corrente, la
risposta è 200 e la transazione non scrive: ma è un no-op *calcolato*, non una richiesta ignorata.

> ⚠️ Il precedente da **non** replicare è dentro questa stessa feature: `restore` dichiara `rowId`
> obbligatorio nel DTO e lo **ignora** nel ramo idempotente (`umbrellas.service.ts:184-186`),
> rispondendo 200. Combinato con la `ValidationPipe` globale — `{ whitelist: true, transform: true }`
> **senza `forbidNonWhitelisted`** (`configure-app.ts:18`) — il repo ha già due modi di accogliere
> una richiesta di spostamento e non fare nulla.

---

## 5. Frontend

### 5.1 La maniglia sta fuori dalla cella

Il trascinamento parte da una **maniglia dedicata**, adiacente alla cella, non dalla cella stessa.

⚠️ **Vincolo misurato, non estetico.** `UmbrellaCell` è un `<button>` (`UmbrellaCell.vue:48`), e
oltre **20 asserzioni** indicizzano `[data-testid="scene-cell"] button` **per posizione**
(`EstablishmentStructureView.spec.ts:83,315,355,377,395,417,434-435,459-460,483-484,512-513,525-526,544-545,560-561`;
`StructureScene.spec.ts:44,46`). Un secondo `<button>` dentro la cella sposta ogni indice e arrossa
la suite **senza che una sola logica sia rotta**: rumore che costa e non protegge.

### 5.2 Il drag è disabilitato in modalità «Seleziona»

⚠️ `selectMode` **si aggancia**: un solo Maiusc+clic lo accende
(`EstablishmentStructureView.vue:99`), e da lì **ogni** clic diventa additivo (`:95`). Un
trascinamento che degeneri in clic con la modalità accesa **toglie** l'ombrellone dalla selezione —
una mutazione di stato, non un artefatto visivo. Le due modalità si escludono.

### 5.3 ⚠️ Limite dichiarato: la feature è solo `lg+` (≥1024px)

Il `Drawer` è un `DialogContent` di reka-ui con `disableOutsidePointerEvents` a **true** per
default: `DismissableLayer` scrive `body.style.pointerEvents = "none"` e applica `aria-hidden`.
Sotto 1024px `drawerOpen` è vero **appena qualcosa è selezionato**
(`EstablishmentStructureView.vue:35`), quindi la scena è pointer-morta proprio nel momento in cui
si vorrebbe trascinare.

**Sotto `lg` non esiste alcun modo di riordinare.** Non è un effetto collaterale scoperto a lavoro
fatto: è una **rinuncia decisa**, presa sapendo che l'unico modo di coprire quel caso sarebbe un
comando da tastiera, valutato e **escluso dallo scope**. Su tablet e telefono la struttura resta
modificabile solo con i percorsi esistenti (crea, genera, elimina).

Conseguenze che il piano deve onorare:

- L'affordance di trascinamento **non si rende** sotto `lg`: mostrare una maniglia inerte è peggio
  della sua assenza.
- ⚠️ **I test del drag devono dichiarare in quale ramo girano.** `useMediaQuery` ritorna `false`
  quando `matchMedia` manca (`useMediaQuery.ts:6`), quindi un test del drag scritto in un file senza
  stub passerebbe *senza esercitare nulla*.
  ⚠️ **Corretto il 2026-07-29 in fase di esecuzione:** questa riga diceva «**ogni** spec dell'editor
  gira oggi nel ramo Drawer», ed è **falsa**. `EstablishmentStructureView.spec.ts:51-63` definisce
  già `stubDesktopMatchMedia()` e lo applica in un `beforeEach` **globale del file**, con
  `vi.unstubAllGlobals()` in coda: quella spec gira **interamente** nel ramo desktop, e contiene
  persino un test che sovrascrive lo stub per esercitare il Drawer (`:277-290`). Non serviva quindi
  aggiungere alcuno stub a `src/test/setup.ts` — che avrebbe ribaltato il ramo di ogni spec che
  monta la shell: bastava riusare l'helper e il pattern di override già presenti.
- Riaprire il caso `< lg` è materiale da deferred, non da questa slice.

### 5.4 Nessun equivalente da tastiera

Escluso dallo scope su decisione esplicita. Va registrato che il repo non ha comunque alcun
precedente di manipolazione da tastiera — l'unico handler esistente nell'editor è il roving
tabindex dei tab settore (`StructureScene.vue:55-66`), che naviga e non muta — e che
[ADR-0020](../../architecture/decisions/0020-resa-mappa.md) aveva scelto HTML/CSS contro SVG e
canvas proprio per non dover ricostruire a mano fuoco e ARIA. Questa slice **non spende** quel
credito: le celle restano `<button>` nativi, focalizzabili e annunciati come oggi.

### 5.5 Anteprima ottimistica, e l'invalidazione che manca

`mutationResource` **restituisce l'oggetto `useMutation` intero**
(`packages/data-layer/src/useQueryResource.ts:31`): `isPending` e `variables` sono leggibili dal
chiamante. L'anteprima locale del riordino si fa nel componente, **senza** toccare TanStack né il
package condiviso. Senza anteprima la cella non si muove affatto fino al ritorno del server, poi
salta.

⚠️ **`structureKeys` va esteso con `queryKeys.dayMap`.** Oggi contiene
`establishmentStructure`, `establishmentOverview`, `setupStatus`
(`useEstablishmentStructure.ts:9-15`) e **non** la mappa. Ma l'ordine dell'editor **è** l'ordine
della Mappa operativa: `map.service.ts:22,25,26` ordina con gli stessi tre campi. Senza
l'invalidazione, chi ha la Mappa aperta al banco continua a vedere la disposizione vecchia.

### 5.6 La disclosure

Quando la destinazione è in un settore diverso **e** esiste almeno una tariffa con `sectorId` uguale
al settore di partenza o a quello d'arrivo, prima di confermare si mostra un `ConfirmDialog` che
**nomina i due settori** e dichiara che il prezzo dei rinnovi futuri cambierà base.

> ⚠️ **Corretto il 2026-07-29 in fase di esecuzione:** questa riga chiedeva un dialogo «che nomina
> le tariffe coinvolte e il loro prezzo». **Non ha una risposta unica corretta**: le tariffe sono
> per stagione (`GET /rates?seasonId=…`) e la conseguenza è sui **rinnovi**, cioè su una stagione
> futura le cui tariffe possono non esistere ancora — qualunque stagione si scegliesse renderebbe il
> testo parzialmente falso. Il trigger arriva invece da `StructureSectorDTO.hasDedicatedRates`,
> calcolato dal server: sempre corretto, senza permesso in più e senza stagione da indovinare
> ([ADR-0065](../../architecture/decisions/0065-riordino-ombrellone-per-trascinamento.md) §7).

Fuori da questo caso il gesto è diretto, senza
interruzioni — coerente con [ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md),
che riserva `ConfirmDialog` al distruttivo e a ciò che l'utente non può disfare a colpo d'occhio.

Lo stesso dialogo si aggiunge al ripristino di un ombrellone ritirato in un settore diverso da
quello di provenienza (`retiredFrom` conserva lo snapshot «Settore · Fila»,
`umbrellas.service.ts:169`).

---

## 6. Contratto FE/BE

```ts
/** Sposta un ombrellone attivo. `position` = indice 0-based nella fila di destinazione. */
export interface MoveUmbrellaInput { rowId: string; position: number }
```

`StructureUmbrellaDTO`, `StructureRowDTO`, `StructureSectorDTO`, `MapUmbrellaDTO`: **invariati**.
`logicalOrder` continua a non attraversare il confine.

---

## 7. Verifica

### 7.1 Il presidio deve leggere Prisma, non l'API

⚠️ `logicalOrder` non è esposto da **nessun** DTO: le tre proiezioni lo scartano
(`establishment-structure.projection.ts:8-10`, `:14-16`, `map.projection.ts:89`). Attraverso HTTP si
può asserire solo la **sequenza**, che è indistinguibile fra `1,2,3` e `5,9,40`.

Il presidio sui valori assoluti legge quindi il database direttamente, come già fanno gli e2e per le
invarianti strutturali.

### 7.2 Cosa provare, e con quale mutazione

| Presidio | Runner | Diventa rosso se |
|---|---|---|
| Move dentro la fila, avanti e indietro | e2e | l'intervallo è spostato nella direzione sbagliata, o l'estremo è escluso |
| Move fra file dello stesso settore | e2e | `rowId` non è aggiornato, o l'ordine nella fila d'origine si corrompe |
| Move fra settori **dello stesso `kind`** | e2e | ⚠️ **oggi non esercitabile**: vedi §7.3 |
| Move `grid → special` | e2e | manca il 422 |
| Move di un ritirato | e2e | manca il 409 → **l'ombrellone riappare in mappa** |
| Move verso fila di **altro tenant** | e2e | la guardia si affida alla sola RLS. ⚠️ Nessun test esercita oggi un UPDATE di `rowId` cross-tenant |
| `position` fuori intervallo | unit | manca il 422 |
| Permesso sul metodo | unit | ⚠️ **non lo vedrebbe nessuno**: `authorization-coverage` accetta l'eredità di classe. Il presidio va scritto apposta |
| `dayMap` invalidata dal move | unit FE | la Mappa resta stantia |
| Drag disabilitato in `selectMode` | unit FE | il drag rimuove dalla selezione |
| Maniglia **assente** sotto `lg` | unit FE | ⚠️ appare un'affordance inerte dove il puntatore è morto (§5.3). È l'unico test che gira **senza** stub di `matchMedia`: tutti gli altri del drag lo richiedono |
| **«prima linea» e «file più in alto vicine al mare»** | unit FE | 🆕 vedi §7.4 |

### 7.3 ⚠️ Il caso principale non è esercitabile sull'ambiente attuale

Misurato: il database di sviluppo ha **1 solo settore** e **nessun settore `special`** (2 lidi, 1
settore, 2 file, 199 ombrelloni attivi, 1 ritirato).

Lo spostamento fra settori — cioè **il caso che questa slice esiste per abilitare** — e il rifiuto
`grid → special` non hanno oggi dati su cui girare. Le fixture vanno **create dentro il piano**, sia
per gli unit sia per gli e2e, prima di poter dichiarare verde alcunché.

### 7.4 Due stringhe che dichiarano semantica e non hanno alcun presidio

- `StructureScene.vue:104` — «*le file più in alto sono più vicine al mare*»
- `MapView.vue:400` — `v-if="i === 0"` → «**prima linea**»

Comando: `grep -rn "prima linea\|più in alto" apps/web-staff/src --include=*.spec.ts` → **0 righe**.

Sono l'**unica** dichiarazione nel prodotto che l'ordine porti un significato fisico, e nessun test
le tiene. Il presidio entra in questa slice perché è la slice che rende quell'ordine **modificabile
da un gesto**: da qui in avanti la promessa è verificabile a runtime, quindi va verificata.

### 7.5 Rossi attesi, da non confondere con regressioni

Se le fixture vengono riordinate, questi diventano rossi **senza aver trovato un difetto** —
asseriscono un ordine, non lo proteggono: `map.e2e-spec.ts:51,55,56-59`;
`establishment-umbrellas.e2e-spec.ts:117-126`; `report.projection.spec.ts:40-61`;
`StructureScene.spec.ts:42-48`; `EstablishmentStructureView.spec.ts:434-442`.

---

## 8. Fuori scope

- **Riordino di file e settori.** `Row.sortOrder` e `Sector.sortOrder` non si toccano. ⚠️ Il caso
  delle file è più costoso di quanto sembri: l'ordine delle file **è** ciò che il prodotto chiama
  «prima linea» (§7.4), e i settori sono resi come **tab** (`MapView.vue:69-73`), per i quali un
  ordine spaziale non ha referente. Restano in [D-038](../../architecture/deferred.md#d-038), che
  questa slice chiude **solo per l'ombrellone**.
- **Selezione multipla trascinabile.** §2.1.
- **Equivalente da tastiera, e con esso il riordino sotto `lg`.** Escluso su decisione esplicita
  (§5.3, §5.4). ⚠️ Va tracciato in **D-071**: non è un rifinimento di accessibilità ma **l'intero
  caso tablet/telefono**, che resta scoperto.
- **Coordinate libere / planimetria** → [D-005](../../architecture/deferred.md#d-005).
- **Esporre `rowId` nel listino.** La dimensione «fila» è viva nell'engine
  (`pricing.engine.ts:42,57`) e nei DTO (`create-rate.dto.ts:20-22`) ma **nessuna UI la scrive**
  (`PricingView.vue`: nessun controllo, `submitRate()` non la emette). Decidere se esporla, chiudere
  la trappola dell'edit, o toglierla dal modello è una slice a sé → **D-070**.
- **Coerenza `sectorId`/`rowId` sulla Rate**, oggi non validata affatto
  (`rates.service.ts:33-55` scrive entrambi senza alcun controllo di esistenza o coerenza) → D-070.

---

## 9. Correzioni ai documenti

1. **[ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md) §Decision** dichiara
   «Niente drag&drop/planimetria: restano deferiti (D-005, D-038)». Va corretto: D-038 è chiusa per
   l'ombrellone da ADR-0065. La riga §Neutre va allineata.
2. **[ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md):40** afferma che gli
   endpoint bulk sono `@Roles(Role.Admin)`. **Falso nel codice**: in `apps/api/src/establishment/`
   non esiste alcun `@Roles`, è `@RequiresPermission` (`umbrellas.controller.ts:17`,
   `rows.controller.ts:10`, `sectors.controller.ts:10`). Un endpoint nuovo scritto seguendo l'ADR
   fallirebbe sul guard fail-closed.
3. **[ADR-0020](../../architecture/decisions/0020-resa-mappa.md)** è derivato su tre punti: dice
   «selezione = anello **teal**» dove il codice usa corallo (`UmbrellaCell.vue:53`,
   `--color-brand` = `--color-coral-500`); conosce **quattro** stati dove il codice ne ha cinque
   (`UmbrellaCell.vue:19-23`, incluso `covered`); e chiama il componente `OmbrelloneCell`, nome
   morto dal rename inglese ([ADR-0030](../../architecture/decisions/0030-codice-e-db-in-inglese.md)).
4. **[D-040](../../architecture/deferred.md#d-040)** risulta 🔓 aperta descrivendo
   «~406 righe / 4 entità CRUD / 5 modali» di `EstablishmentStructureView.vue`, che oggi è **165
   righe senza modali**. ADR-0052 §Negative dichiara l'estrazione «di fatto realizzata».
5. **`design-system.md`:855** promette «un test in CI che calcola il rapporto di contrasto e
   fallisce sotto 4.5» e **:864** «solo token, verificato da lint». **Nessuno dei due esiste**:
   `eslint.config.mjs` (91 righe, letto per intero) ha solo `no-unused-vars`, il divieto di
   `IsUUID` su `apps/api`, `no-explicit-any` a warn nei test e due regole spente.

---

## 10. Ancore

- **Editor**: [`EstablishmentStructureView.vue`](../../../apps/web-staff/src/features/establishment/EstablishmentStructureView.vue) ·
  [`StructureScene.vue`](../../../apps/web-staff/src/features/establishment/StructureScene.vue) ·
  [`StructureRow.vue`](../../../apps/web-staff/src/features/establishment/StructureRow.vue)
- **API**: [`umbrellas.service.ts`](../../../apps/api/src/establishment/umbrellas.service.ts) ·
  [`umbrellas.controller.ts`](../../../apps/api/src/establishment/umbrellas.controller.ts)
- **Prezzo**: [`pricing.engine.ts`](../../../apps/api/src/catalog/pricing.engine.ts) ·
  [`catalog.service.ts`](../../../apps/api/src/catalog/catalog.service.ts)
- **Mappa**: [`map.service.ts`](../../../apps/api/src/map/map.service.ts) ·
  [`MapView.vue`](../../../apps/web-staff/src/features/map/MapView.vue)
- **Decisioni collegate**: [ADR-0052](../../architecture/decisions/0052-editor-struttura-cantiere.md) ·
  [ADR-0016](../../architecture/decisions/0016-tipologia-ombrellone.md) ·
  [ADR-0053](../../architecture/decisions/0053-ritiro-ombrellone-soft-delete.md) ·
  [ADR-0057](../../architecture/decisions/0057-autorizzazione-fail-closed-permessi.md)
