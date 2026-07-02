# Consolidamento Catalogo — Slice B2 "Provenienza prezzo" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02.
- **Origine:** roadmap Catalogo. Sequenza: B1 fasce configurabili (DONE, mergiato su `main` @ `a799665`) →
  **B2 provenienza-prezzo** (questo doc) → Slice C equipment. Traccia di partenza: **§8 della spec B1**
  (`docs/specs/2026-07-02-catalog-fasce-configurabili-b1-design.md`).
- **ADR di riferimento:** [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (dimensioni della
  Rate + ordine totale di precedenza lessicografico — B2 ne realizza la *trasparenza*),
  [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (listino a regole, prezzo
  server-autoritativo), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date/orari),
  [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) (componenti FE), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (post-B1, verificata live su
  `main`): **api unit 88 · api e2e 125 · web-staff 132 · ui-kit 55.**
- **Nessun nuovo ADR** (incremento su ADR-0032). **Nessuna migrazione.** Prossimo ADR libero resta **0035**.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **L'engine restituisce GIÀ la Rate vincente.** `resolvePrice(ctx, rates)` (`pricing.engine.ts:80-93`) ritorna
  `{ ok: true; totalPrice; rate: RateRow }`: la `RateRow` vincente porta le dimensioni (`type/sectorId/rowId/packageId/
  timeSlotId/periodStart/periodEnd`) + `price`/`unit`, **ma NON l'`id`** della Rate (`RateRow` è la forma "piatta"
  usata dall'engine puro; `toRateRow` non copia `id`).
- **`priceWithin` scarta la provenienza** (`catalog.service.ts:124-125`): mappa `result` a `{ ok, totalPrice }` e
  butta `result.rate`. Sia il quote pubblico (`GET /bookings/quote`) sia la create passano da qui.
- **`BookingQuoteDTO`** (`contracts/index.ts:139-141`) espone **solo** `{ totalPrice: number }`.
- **UI modale prenotazione** (`MapView.vue:334-337`): "Prezzo" = `formatEuro(quote?.totalPrice)`; errore →
  "Prezzo non disponibile: listino non configurato." (NO_RATE → 422). Nessuna indicazione di *quale* tariffa.
- **Editor Listino** (`PricingView.vue`): tabella tariffe con `positionLabel/pkgName/slotName/typeLabel/unitLabel`
  già presenti; **nessun ordine di precedenza** esplicito né spiegazione (le righe seguono l'ordine di arrivo).
- **Conseguenza:** la provenienza è a portata di mano lato engine; B2 è essenzialmente **plumbing** (far viaggiare la
  Rate vincente fino al FE) + **UI di trasparenza**. Nessun cambiamento al *modello* di prezzo.

## 2. Obiettivo e scope

Rendere il prezzo **spiegabile**: (a) al momento della prenotazione mostrare *quale* tariffa lo ha prodotto; (b) in
configurazione, rendere leggibile l'**ordine di precedenza** (ADR-0032) fra le tariffe. Tre layer coesi:

1. **Contratti + backend** — `RateRow` acquista `id`; `BookingQuoteDTO` acquista `matchedRate: RateDTO`;
   `priceWithin`/`quote` la valorizzano (proiezione `toRateDTO` esistente).
2. **FE modale** — riga "Tariffa applicata: «…»" sotto il prezzo, composta dal FE dai nomi che già possiede.
3. **FE editor** — tabella tariffe **ordinata per specificità** + **legenda** dell'ordine di precedenza.

- **Fuori scope (deliberato):**
  - **Analisi dinamica di "shadowing"** (quale tariffa oscura quale, quali regole non verranno mai applicate) — è
    ingegneria a sé, confina con l'editor listino avanzato ([D-032](../architecture/deferred.md)); **deferred**.
  - **Provenienza sulle prenotazioni storiche** — il `Booking` snapshotta solo `totalPrice`; esporre *quale* Rate
    l'ha prodotta richiederebbe uno `rateId` persistito sul `Booking` + migrazione; **deferred**. B2 vive sul
    **quote (preview)**, non sulle prenotazioni confermate.
  - Editing/ottimizzazione del listino: fuori tema (trasparenza, non configurazione avanzata).

## 3. Layer 1 — Contratti + backend

### 3.1 Contratti (`packages/contracts/src/index.ts`)
- `BookingQuoteDTO` acquista `matchedRate: RateDTO`:
  ```ts
  export interface BookingQuoteDTO {
    totalPrice: number;      // EUR, 2 decimali
    matchedRate: RateDTO;    // la Rate vincente che ha prodotto il prezzo (provenienza, ADR-0032)
  }
  ```
  **Richiesto (non opzionale):** il quote risponde `200` **solo** in caso di successo (`{ok:true}`); su `NO_RATE`/
  `NO_SEASON` il `CatalogService` mappa a **422** e il body NON è un `BookingQuoteDTO`. Quindi quando il DTO esiste,
  `matchedRate` esiste sempre. Riuso di `RateDTO` (DRY): id + tutte le dimensioni (nullable = wildcard) + `price`/`unit`
  + `seasonId`. Il FE decide cosa renderizzare (salta le dimensioni null).

### 3.2 Engine (`pricing.engine.ts`)
- `RateRow` acquista **`id: string`** (la Rate "piatta" porta il suo id). L'engine **ignora** `id` in `isApplicable`/
  `specificity` (nessun impatto su logica/precedenza): serve solo a ricondurre la Rate vincente alla riga DB per la
  proiezione. Aggiornare `toRateRow` (in `catalog.service.ts`) perché copi `id`. Gli unit-spec dell'engine che
  costruiscono `RateRow` literal vanno aggiornati col nuovo campo `id` (valori sintetici; l'engine non lo usa).

### 3.3 Service (`catalog.service.ts`)
- `priceWithin` non scarta più `result.rate`. Il tipo `QuoteOutcome` (successo) acquista `matchedRate: RateDTO`:
  ```ts
  | { ok: true; totalPrice: number; matchedRate: RateDTO }
  ```
  **Costruzione — attenzione al tipo:** `result.rate` è una **`RateRow`** (forma piatta dell'engine: `price:number`,
  date/`id` come stringhe, dimensioni `… | null`), **non** un `Rate` Prisma. Quindi NON si usa `toRateDTO(r: Rate, …)`
  (che consuma un `Rate` con `Decimal`/`Date`). Si aggiunge un piccolo mapper puro
  `rateRowToDTO(row: RateRow, seasonId: string): RateDTO` (in `catalog.service.ts` o accanto alla proiezione) che copia
  `id` + `price` + `unit` + `seasonId` e converte le dimensioni **`null` → `undefined`** (il `RateDTO` usa opzionali,
  non `null`). Il `quote` pubblico mappa `QuoteOutcome` → `BookingQuoteDTO { totalPrice, matchedRate }`. La **create**
  (che riusa `priceWithin`) ignora `matchedRate`: nessun cambiamento al prezzo server-autoritativo (ADR-0032 §7).
- **e2e (`bookings.e2e-spec.ts` o dove vive il quote):** il quote di una prenotazione con una catch-all a 25/giorno
  ritorna `matchedRate` con `price: 25`, `unit: 'day'` e le dimensioni null coerenti; con una tariffa più specifica
  (es. `timeSlotId` valorizzato) `matchedRate.timeSlotId` combacia e vince sulla catch-all.

## 4. Layer 2 — FE modale prenotazione (il cuore)

- In `MapView.vue`, sotto "Prezzo" (`:334-337`), una riga **"Tariffa applicata: «…»"** quando il quote è `ok`.
- **Label composta dal FE** (mai dal server) dai nomi che la vista **già possiede** (`map.sectors`, `map.timeSlots`,
  `packages`) leggendo le dimensioni **non-null** di `matchedRate`:
  - dimensioni valorizzate → segmenti leggibili: fascia (`slotName`), pacchetto (`pkgName`), posizione
    (settore/fila), tipo (`typeLabel`), sotto-periodo (date brevi) → es. *"Pomeriggio · Standard — 40 €/g"*.
  - **Tutte** le dimensioni null (catch-all) → *"Tariffa base del listino"*.
  - `price`/`unit` mostrati come coda (`formatEuro(price)` + `unitLabel(unit)`).
- **Sempre visibile** (non tooltip): è trasparenza, non decorazione. Nessun cambiamento al messaggio d'errore
  "listino non configurato" (NO_RATE, 422).
- Riuso helper di label già esistenti in `PricingView` (spostare i più utili in un modulo condiviso `pricing/labels.ts`
  se serve, per non duplicarli tra editor e modale — DRY, ADR-0033).
- **Test (`MapView.spec.ts`):** con MSW quote che ritorna `matchedRate` catch-all → la riga mostra "Tariffa base del
  listino"; con `matchedRate` che specifica una fascia → mostra il nome della fascia. MSW handler `/bookings/quote`
  aggiornato per includere `matchedRate`.

## 5. Layer 3 — FE editor Listino (precedenza)

- **Ordine per specificità:** la tabella tariffe (`PricingView.vue`) viene ordinata dalla più specifica alla più
  generica, con una **funzione pura FE** (`rateSpecificity(r: RateDTO): number[]`) che replica il vettore ADR-0032
  sui 6 campi che `RateDTO` **già espone** (periodo › fila › settore › pacchetto › fascia › tipo). Non duplica logica
  complessa: è un vettore di booleani ordinato, riflesso diretto dell'ADR (che resta la fonte di verità). La catch-all
  finisce in fondo.
- **Legenda precedenza:** un pannello/explainer statico (riuso `Card`/`EmptyState`-like) che spiega l'ordine:
  *"Quando più tariffe si applicano, vince la più specifica: periodo › fila › settore › pacchetto › fascia › tipo."*
- **Fuori scope:** evidenziare "questa oscura quella" (shadowing dinamico) → D-032.
- **Test (`PricingView.spec.ts`):** date due tariffe (una catch-all + una con fascia), la tabella le ordina con la più
  specifica in cima; la legenda è presente.

## 6. Rischi e mitigazioni
- **`RateRow` acquista `id`:** additivo, l'engine lo ignora; unico impatto = aggiornare i literal negli unit-spec
  dell'engine (meccanico). La precedenza resta invariata (coperta dagli unit-spec esistenti).
- **`matchedRate` richiesto in `BookingQuoteDTO`:** i consumatori/mocks che costruiscono un `BookingQuoteDTO`
  (MSW `/bookings/quote`, eventuali test) vanno aggiornati per includerlo — è un contratto onesto (il quote riesce
  solo con una Rate vincente). Dopo il tocco a `@coralyn/contracts`: `pnpm --filter @coralyn/contracts build` +
  `rm -rf apps/web-staff/node_modules/.vite`.
- **Label FE vs nomi mancanti:** se un id dimensione non ha nome in cache (es. pacchetto cancellato), fallback al
  segmento omesso o a un'etichetta neutra; mai crash. La catch-all ha una label dedicata.
- **Prezzo server-autoritativo invariato:** `matchedRate` è informativo; la create continua a ricalcolare e a NON
  fidarsi del client (ADR-0032 §7). Nessun cambiamento alla logica di prezzo.

## 7. Decisioni (risolte in brainstorming 2026-07-02)
1. **Scope = entrambe le superfici** (modale + editor), con l'editor limitato a **ordinamento + legenda statica**
   (NON analisi dinamica di shadowing → D-032).
2. **Provenienza strutturata, non stringa server:** `matchedRate: RateDTO` completo; il **FE compone la label**
   (convenzione codice inglese / UI italiano; disaccoppiamento server/presentazione; riuso in modale + editor).
3. **`RateRow` acquista `id`** per ricondurre la Rate vincente alla riga DB (proiezione `toRateDTO`); l'engine lo ignora.
4. **Solo quote (preview):** niente provenienza su prenotazioni storiche (richiederebbe `rateId` persistito +
   migrazione → deferred). Nessun nuovo ADR, nessuna migrazione.
5. **Ordine editor via funzione pura FE** sui campi di `RateDTO` (riflette ADR-0032, non duplica logica di dominio).

## 8. Impatto test (atteso, da non regredire)
Baseline: api unit 88 · api e2e 125 · web-staff 132 · ui-kit 55. Attesi in crescita: +api (engine `RateRow.id` negli
spec + e2e quote con `matchedRate`), +web-staff (label provenienza nel modale, ordinamento+legenda nell'editor, MSW
quote). Nessun test rimosso. Prossimo ADR libero: **0035**.

## 9. Slice successivo (dopo B2)
**Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment`. Decisione da prendere
con l'utente (free-form JSONB vs entità `EquipmentType` → nuovo ADR, confina con D-012). Brainstorming+spec dedicati.
