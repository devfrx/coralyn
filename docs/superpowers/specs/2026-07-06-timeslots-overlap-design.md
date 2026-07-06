# Spec — Fasce sovrapposte: full-day come prodotto reale + stato "coperta" onesto (D-048)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-06). Segue e **dipende da**
> [2026-07-06-timeslots-map-design.md](2026-07-06-timeslots-map-design.md) (slice N-fasce: `UmbrellaCell` a spicchi,
> `MapView` a N box). Registra il deferito **D-048** (spec §7 della slice N-fasce). **NON FE-only**: projection + contracts +
> FE + reports. Prossima azione dopo l'ok utente sulla spec: `writing-plans` (TDD).

---

## 1. Problema (una radice, sintomo concreto)

Il modello `TimeSlot` è un **intervallo orario**, non un bucket indipendente. Un admin può configurare fasce **sovrapposte**
— es. `Mattina` 08:00–13:00, `Pomeriggio` 13:00–19:00, e `Giornata int.` 08:00–19:00 (che copre entrambe). È un caso
**voluto**: la "Giornata intera" è un **prodotto a sé** (forfait pieno-giorno distinto dalla somma delle due metà).

Il map projection ([map.projection.ts](../../../apps/api/src/map/map.projection.ts)) calcola lo stato per-fascia con
`slotsOverlap`: **la prima prenotazione (per `createdAt`) la cui fascia si sovrappone vince**. Conseguenza osservata
(screenshot utente): con Mattina prenotata `daily` e Pomeriggio `periodic`, la fascia `Giornata int.` — pur **senza alcuna
prenotazione propria** — appare **"Giornaliero"**, ereditando lo stato della prima booking sovrapposta. Cliccandola: **nessun
cliente, nessun importo** (non c'è un booking dietro) e messaggio "Nessuna fascia libera". **Etichetta fantasma**: sembra
venduta ma non lo è.

Il sistema è però **già coerente sulla prenotabilità**: il vincolo DB `booking_no_overlap` (ADR-0037) esclude per **overlap
temporale**, non per id-fascia esatto, e un pre-check applicativo lo anticipa → non si può davvero doppio-vendere Mattina e
Giornata int. sullo stesso ombrellone/periodo. **Il difetto è solo di rappresentazione**: il projection confonde "occupata da
una **sua** prenotazione" con "**coperta** da una fascia sovrapposta".

## 2. Modello di dominio (confermato)

Per una coppia (ombrellone, fascia) in una data, tre situazioni **mutuamente esclusive**:

1. **Libera** (`free`) → prenotabile.
2. **Occupata diretta** (`daily` | `season` | `booked`) → esiste una prenotazione con `timeSlotId === fascia.id`. Ha un
   **dettaglio** (cliente, importo, pagamento).
3. **Coperta** (`covered`) → **nessuna** prenotazione propria, ma **almeno una** prenotazione su un'**altra** fascia si
   sovrappone temporalmente. **Non vendibile.** Il "proprietario" reale è la/le prenotazione/i copritrice/i.

**Precedenza:** diretta > coperta > libera. La copertura è **simmetrica**: prenoti `Giornata int.` → `Mattina` e `Pomeriggio`
diventano `covered`; prenoti entrambe le metà → `Giornata int.` diventa `covered`.

## 3. Decisioni (CONFERMATE)

### 3.1 Nuovo `SlotState` `'covered'`
`SlotState = 'free' | 'season' | 'daily' | 'booked' | 'covered'`. Additivo. Ogni mappa esaustiva `Record<SlotState, …>` (nel FE
e nel projection) richiederà la voce `covered` → **il typecheck elenca ogni punto da aggiornare** (rete di sicurezza).

### 3.2 Projection a due fasi + `coveredBySlot`
`stateFor(umbrella, slot)`:
- **(a) diretta:** se esiste una booking con `timeSlotId === slot.id` (già garantita unica dal vincolo) → `STATE_BY_TYPE[type]`.
- **(b) coperta:** altrimenti, se esiste ≥1 booking su fascia **diversa** che `slotsOverlap(slotOf(booking), slot)` → `'covered'`.
- **(c) libera:** altrimenti `'free'`.

Nuovo campo additivo su `UmbrellaDTO`:
```ts
coveredBySlot: Record<string, string[]>; // key = slotId COPERTO → ids delle fasce (con booking diretta) che la coprono
```
Popolato **solo** per le fasce in stato `covered`. Per una fascia coperta `S`:
`coveredBySlot[S.id] = uniq(bookings di questo ombrellone con timeSlotId ≠ S.id il cui slot overlappa S → timeSlotId)`.
Così **il calcolo dell'overlap resta esclusivamente lato backend** (single source of truth): il FE **non** duplica la
matematica di sovrapposizione, legge solo gli id e li risolve a nomi/booking.

*(Nota: `coveredBySlot` elenca fasce con booking **diretta** — sono le uniche che possono "coprire". Una fascia coperta non
copre a sua volta.)*

### 3.3 Contracts (additivo, non breaking)
`SlotState` += `'covered'`; `UmbrellaDTO` += `coveredBySlot: Record<string, string[]>` (sempre presente; `{}` se nessuna
copertura). `@coralyn/contracts` va ricompilato (`dist/` gitignored) prima di typecheck/e2e.

### 3.4 ui-kit `UmbrellaCell` — colore per `covered`
Nuovo token tema `--color-state-covered` (+ `--color-state-covered-ink`): tinta **neutra/grigia** "non disponibile", visivamente
distinta da `booked`/`daily`/`season` (venduto) e da `free`. La resa a spicchi N-agnostica (già implementata) **assorbe** il
nuovo stato senza logica nuova: basta la voce nei dizionari `fill`/`ink`. Aggiornare la legenda dove serve.

### 3.5 web-staff `MapView` — resa onesta della fascia coperta
- `STATE_LABEL.covered = 'Non disponibile'`; `STATE_COLOR.covered = 'var(--color-state-covered)'`.
- **Box fascia coperta nel drawer:** etichetta grande "Non disponibile"; **sottotesto** che nomina la/le fascia/e copritrice/i
  **con il dettaglio della prenotazione copritrice**: `coperta da {nomeFascia} ({cliente}, {€importo})`, una riga per fascia
  copritrice. Risoluzione FE: per la fascia coperta `S`, `coveredBySlot[S.id]` → per ogni `coveringSlotId` trova la booking del
  giorno `(umbrellaId === sel.u.id && timeSlotId === coveringSlotId)` → nome fascia (da `slotsById`) + `currentCustomerName`
  della copritrice + `totalPrice`. Se una copritrice non è risolvibile (edge), mostra solo il nome fascia.
- **Non prenotabile:** la fascia coperta è non-`free` → già esclusa da `freeSlotOptions`/`slotIsBusy`/`firstFreeSlot`, quindi il
  modale "Nuova prenotazione" **non la offre**. Selezionandola nel drawer non compaiono azioni di booking (nessun "Registra
  incasso"/"Annulla" — quelle vivono sulla fascia **diretta** copritrice).
- **Messaggio disponibilità:** invariato (le coperte non sono `free`; concorrono a "Libera nelle fasce: …" per esclusione, e a
  "Nessuna fascia libera" quando tutte occupate/coperte).
- **Cella:** lo spicchio della fascia coperta usa il colore neutro `covered` → l'operatore distingue a colpo d'occhio "venduto
  qui" (colore stato) da "coperto da altra fascia" (grigio).

### 3.6 Reports — la copertura non è inventario indipendente
[reports.service.ts:60-66](../../../apps/api/src/reports/reports.service.ts) costruisce l'array `states` iterando
`stateBySlot` e calcola `occupied`/`umbrellaStateMix`. Le fasce **coperte** sono l'**ombra** di una booking reale (contata sulla
sua fascia diretta): **vanno escluse** dall'aggregazione (né `occupied` né `mix`), così ogni prenotazione conta **una sola
volta** e l'occupazione per-ombrellone resta sensata a prescindere da come è stata venduta (full-day o due metà).
Modifica: `if (state !== 'covered') states.push(state)` (o filtro equivalente) prima di `occupied`/`stateMix`.

### 3.7 Pricing full-day — nessun cambio
Il listino tariffa già per `timeSlotId` (tra le dimensioni di `priceWithin`), quindi una fascia "Giornata intera" può avere il
suo **forfait** dedicato senza modifiche. **Il piano lo verifica** (quote/create su una fascia full-day producono il suo
prezzo).

### 3.8 Editor Struttura — sovrapposizioni consentite
Nessun blocco: creare fasce sovrapposte resta **permesso** (è la feature). Nessuna modifica all'editor in questa slice.

## 4. Impatto per file (indicativo — dettaglio nel piano)

- **`packages/contracts/src/index.ts`**: `SlotState` +`'covered'`; `UmbrellaDTO.coveredBySlot`. Rebuild `dist/`.
- **`apps/api/src/map/map.projection.ts`**: `stateFor` a due fasi (diretta vs coperta); popolamento `coveredBySlot`.
- **`apps/api/src/map/map.projection.spec.ts`**: casi 3-fasce **entrambe le direzioni** (full-day prenotata → metà coperte;
  metà prenotate → full-day coperta), `coveredBySlot` corretto, fascia libera non toccata.
- **`apps/api/src/reports/reports.service.ts`**: escludere `covered` da `occupied`/`stateMix`. Test relativo aggiornato/aggiunto.
- **tema ui-kit** (file dei token `--color-state-*`): `--color-state-covered` (+ `-ink`).
- **`packages/ui-kit/src/components/UmbrellaCell.vue`**: voce `covered` in `fill`/`ink`. Spec: uno spicchio `covered` reso col
  colore neutro (via `defineExpose` `bg`).
- **`apps/web-staff/src/features/map/MapView.vue`**: `STATE_LABEL`/`STATE_COLOR` +`covered`; box drawer per fascia coperta con
  sottotesto "coperta da {fascia} ({cliente}, €)"; legenda +"Non disponibile".
- **`apps/web-staff/src/features/map/MapView.spec.ts`**: fascia coperta → label "Non disponibile", nome fascia copritrice +
  cliente/importo, **non** prenotabile (assente da `freeSlotOptions`), nessuna azione booking.
- **`apps/web-staff/src/mocks/data/seed.ts`**: fixture a 3 fasce **sovrapposte** (Mattina/Pomeriggio/Giornata int.) con una
  booking che genera copertura, per i test MapView.
- **e2e** (opz., `apps/api/test/map.e2e-spec.ts`): un caso end-to-end con fascia sovrapposta prenotata che marca `covered` +
  `coveredBySlot`.

## 5. Verifiche pre/post-implementazione
- **Pricing:** quote+create su fascia "Giornata intera" producono il suo forfait (listino keyed by `timeSlotId`). Verifica nel piano.
- **Vincolo DB:** confermare (test e2e già esistente o nuovo) che prenotare una fascia mentre una sovrapposta è occupata → **409
  gentile** (`booking_no_overlap`), così il FE che non la offre è coerente con la rete di sicurezza.
- **Nessuna regressione** sulla slice N-fasce disgiunte (seed di default 2 fasce: nessuna copertura → `coveredBySlot` vuoto,
  comportamento identico).

## 6. Test / baseline
- Baseline da non regredire (branch `feat/timeslots-map`, LIVE): ui-kit **77** · web-staff **264** · api unit **201** · api e2e
  **235** · web-platform **16** · typecheck pulito.
- Additivo: projection (+direzioni copertura +`coveredBySlot`), reports (+esclusione covered), UmbrellaCell (+covered color),
  MapView (+fascia coperta con dettaglio copritore). Verificare **ui-kit E web-staff** (spec ui-kit globati da web-staff).

## 7. Fuori scope / deferito
- **Occupancy % del report sotto slot sovrapposte:** il denominatore (totale slot-istanze) resta influenzato dalla presenza di
  fasce sovrapposte non-coperte; l'esclusione di `covered` (§3.6) rimuove il doppio conteggio principale, ma una ridefinizione
  formale dell'occupazione per slot sovrapposte è **fuori scope** (candidata a un follow-up di dominio).
- **Validazioni/hint nell'editor Struttura** (badge "si sovrappone a X", raggruppamento visivo delle fasce sovrapposte):
  fuori scope.
- **Dettaglio copritore multiplo avanzato** (es. UI dedicata quando 2+ fasce coprono con clienti diversi): la spec mostra una
  riga per copritrice; eventuali affinamenti UX sono follow-up.

## 8. Prossimi passi
Registrare **D-048 = in corso** in [`deferred.md`](../../architecture/deferred.md). `writing-plans` (TDD, ordine per layer:
contracts+projection+reports → ui-kit color → MapView drawer/mock) → `subagent-driven-development` → review a due stadi +
whole-branch (opus) → verifica LIVE (ui-kit + web-staff + api) → presentare e attendere conferma per il merge FF.
