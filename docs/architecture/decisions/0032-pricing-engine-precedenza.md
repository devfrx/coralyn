# ADR-0032: Pricing engine — dimensioni e precedenza esplicita

- **Status:** Accepted
- **Data:** 2026-06-30
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (listino a regole),
  [ADR-0013](0013-granularita-disponibilita-a-slot.md) (fascia come dimensione),
  [ADR-0005](0005-modello-mappa.md) (Settore/Fila),
  [ADR-0016](0016-tipologia-ombrellone.md) + [D-018](../deferred.md) (tipologia esclusa dal prezzo),
  [ADR-0031](0031-fuso-orario-e-date-operative.md) (date di calendario),
  [ADR-0035](0035-pricing-tipo-partiziona-la-formula.md) (**raffina** questo ADR: §1 semantica wildcard di `type`),

## Context

Il listino è un insieme di `Rate` (tariffe) tenant-scoped, ognuna delle quali specifica un
sottoinsieme di dimensioni: tipo di prenotazione, posizione (settore/fila), pacchetto, fascia
oraria e sotto-periodo temporale. Più regole possono essere applicabili alla stessa prenotazione
(quella di fila, quella di pacchetto, la catch-all generica). Il sistema deve produrre un
**esito unico e deterministico**: un solo prezzo, calcolato ogni volta nello stesso modo, senza
ambiguità e senza intervento manuale dell'operatore.

[ADR-0006](0006-dominio-prenotazioni-e-pricing.md) prescrive *"precedenze esplicite, dalla più
specifica alla più generica"* ma non fissa l'ordine tra le dimensioni. Questo ADR risolve quella
lacuna: stabilisce l'elenco delle dimensioni della `Rate`, la semantica del "wildcard", l'ordine
totale di precedenza, il meccanismo anti-ambiguità in fase di scrittura e i comportamenti di
no-match e no-season.

## Decision

### 1. Dimensioni della `Rate` e wildcard

Le dimensioni di una `Rate` sono cinque: **periodo** (`periodStart`/`periodEnd`), **fila**
(`rowId`), **settore** (`sectorId`), **pacchetto** (`packageId`), **fascia** (`timeSlotId`),
**tipo** (`type`). Ogni dimensione è **nullable**: `null` significa "wildcard" (vale per qualsiasi
valore). Una `Rate` con tutte le dimensioni null è la **catch-all** e funge da regola di default
obbligatoria in un listino ben formato.

La **`UmbrellaType` (tipologia ombrellone) NON è una dimensione di prezzo** ([ADR-0016](0016-tipologia-ombrellone.md),
[D-018](../deferred.md)): il prezzo è per **posizione** (settore/fila), non per tipologia.

> **Raffinato da [ADR-0035](0035-pricing-tipo-partiziona-la-formula.md) (2026-07-02):** dopo lo slice "Chiarezza tipi",
> `type=null` non è più "qualsiasi tipo, abbonamento incluso" ma "famiglia a prezzo/giorno (daily/periodic)". Un
> abbonamento è prezzato **solo** da una tariffa `type='subscription'`; il wildcard non lo prezza. La precedenza qui
> definita resta invariata.

### 2. Ordine totale di precedenza (lessicografico)

Tra le `Rate` applicabili (quelle il cui insieme di dimensioni non-null coincide con il contesto),
la **più specifica vince** secondo un **ordine totale esplicito e lessicografico** tra le dimensioni:

| Priorità | Dimensione | "Più specifico" = |
|---|---|---|
| 1 | **periodo** | sotto-periodo (`periodStart` non-null) batte tutta-la-stagione (null) |
| 2 | **posizione — fila** | `rowId` non-null batte null |
| 3 | **posizione — settore** | `sectorId` non-null batte null |
| 4 | **pacchetto** | `packageId` non-null batte null |
| 5 | **fascia** | `timeSlotId` non-null batte null |
| 6 | **tipo** | `type` non-null batte null |

Il confronto è lessicografico: si parte dalla priorità 1 e si scende solo in caso di parità. Una
regola che specifica il sotto-periodo (priorità 1) vince sempre su una regola di fila che non lo
specifica, anche se quest'ultima è più specifica sulle dimensioni 2–6.

### 3. Vincolo di non-ambiguità per costruzione (`@@unique` + `NULLS NOT DISTINCT`)

Due `Rate` con la **stessa identica firma di dimensioni** sono impossibili per costruzione: un indice
unico sulle otto colonne della firma, con **`NULLS NOT DISTINCT`** (Postgres 16), fa sì che due righe
con le stesse dimensioni null violino il vincolo esattamente come due righe con gli stessi valori
non-null. Conseguenza: nessun pareggio finale possibile tra candidati nell'engine — il vincolo lo
esclude a livello DB, prima ancora che l'engine debba arbitrare.

**Implementazione (risoluzione [D-039], 2026-07-04).** Prisma **non sa emettere** `NULLS NOT DISTINCT`,
quindi l'indice è creato in **raw SQL** dalla migrazione `20260630203447_pricing` — quella migrazione è
**autoritativa** per il modificatore:

```sql
CREATE UNIQUE INDEX "Rate_signature_key" ON "Rate"
  ("pricingId", "type", "sectorId", "rowId", "packageId", "timeSlotId", "periodStart", "periodEnd")
  NULLS NOT DISTINCT;
```

Lo `schema.prisma` dichiara lo **stesso** indice come annotazione, agganciato per nome:

```prisma
@@unique([pricingId, type, sectorId, rowId, packageId, timeSlotId, periodStart, periodEnd], map: "Rate_signature_key")
```

Questo `@@unique` serve **solo** a rendere Prisma **consapevole** dell'indice: Prisma è "cieco" al
modificatore `NULLS NOT DISTINCT` (non lo modella né prova a ricrearlo), quindi `migrate diff` /
`migrate dev` vedono lo schema e il DB **allineati** e **non** generano più un `DROP INDEX` spurio a
ogni migrazione (il difetto che aveva colpito la migrazione `add_user_disabled_at` di Fase 2).
Verificato: `migrate diff` (DB→schema e migrazioni→schema via shadow DB) = *empty migration*. ⚠️ **Non
usare `prisma db push`**: ricrea l'indice **senza** `NULLS NOT DISTINCT`. Il modificatore vive nella
migrazione raw, che resta l'unica fonte per la creazione dell'indice.

### 4. Engine puro (`resolvePrice`)

L'engine è una **funzione pura** (`resolvePrice(ctx, rates)`) nel modulo `catalog`, senza
dipendenze Nest, unit-testata in isolamento. Riceve il contesto della prenotazione e l'elenco
delle `Rate` già filtrate per la stagione attiva; restituisce un esito discriminato:
`{ ok: true; totalPrice; rate }` oppure `{ ok: false; reason: 'NO_RATE' }`.

La **risoluzione della stagione** (data → `Season` → `Pricing`) è responsabilità del
`CatalogService`, non dell'engine. L'engine lavora solo sulle `Rate` della stagione giusta.

### 5. Calcolo del prezzo (`unit`)

- `unit === 'day'` → `totalPrice = rate.price × giorni`, con `giorni = endDate − startDate + 1`
  (estremi inclusi, date di calendario, aritmetica in centesimi interi). Daily: 1 giorno.
- `unit === 'period'` → `totalPrice = rate.price` (forfait per l'intervallo).

### 6. No-match e no-season → errore di dominio 422

- **Nessuna `Rate` applicabile** (`NO_RATE`) → il `CatalogService` mappa a **422** "Nessuna
  tariffa applicabile: configurare il listino". Un listino ben formato ha sempre la catch-all
  come rete → il no-match indica una mis-configurazione. **Mai €0 silenzioso**.
- **Nessuna stagione attiva** per la data richiesta (`NO_SEASON`) → **422** "Nessuna stagione
  attiva per questa data". La prenotazione non si crea senza un prezzo valido.

### 7. Prezzo server-autoritativo

`POST /api/bookings` non accetta `totalPrice` dal client: il server **ricalcola** sempre il
prezzo via `CatalogService.quote(...)` nella stessa transazione. Il quote
(`GET /api/bookings/quote`) è una preview; il prezzo vincolante è quello ricalcolato in create.

## Consequences

### Positive

- **Prevedibile e spiegabile al gestore**: dato un insieme di `Rate` e una prenotazione, il
  risultato è sempre lo stesso e il ragionamento è riproducibile a mano seguendo l'ordine di
  priorità.
- **Esaustivamente testabile**: l'engine è puro e deterministico; ogni caso (precedenza,
  wildcard, unit, no-match) è isolato da un unit test.
- **Nessun numero nel codice**: il prezzo è un dato del listino, non un valore hardcoded.
- **Riusabile per A4**: l'engine è già generale (multi-giorno, `unit=period`, tutte le
  dimensioni); le prenotazioni periodiche/abbonamenti lo reusano senza riscrittura.

### Negative / Trade-off

- **L'ordine di precedenza è una convenzione** che il gestore deve conoscere (periodo batte fila
  batte settore…). Va documentata e mostrata nell'editor del listino (A3.2+).
- **L'editor CRUD del listino è rinviato** ([D-032](../deferred.md)): per A3.1 il listino è
  seeded. Il gestore non può modificarlo dall'app fino all'editor.

### Neutre / Note

- La `create` resta `daily-only` in A3.1; l'engine è però già generale e unit-testato sui casi
  multi-giorno (coerente con l'anti-debito strutturale di A1/A3.1).
- L'invariante non-overlap delle `Season` (niente stagioni sovrapposte) non è enforced da CRUD
  in A3.1 (listino seeded); il `CatalogService` gestisce il caso >1 stagioni attive in modo
  deterministico + log, e l'enforcement applicativo arriverà con l'editor listino ([D-032](../deferred.md)).

## Alternatives considered

- **Punteggio di specificità** (vince chi specifica il maggior numero di dimensioni non-null) —
  scartata: meno prevedibile per il gestore, richiede un tie-break per i pareggi (stessa
  cardinalità, dimensioni diverse), reintroduce l'implicito che ADR-0006 vuole evitare. Con
  l'ordine totale esplicito non esistono pareggi: il confronto lessicografico produce sempre un
  vincitore unico.
- **Prezzo hard-coded** — già scartato in [ADR-0006](0006-dominio-prenotazioni-e-pricing.md):
  "pricing flessibile senza numeri incollati nel codice".

## Rubric check

1. **Professionalità** — un ordine totale esplicito e documentato è la prassi corretta per engine
   di pricing; il no-match a 422 (mai €0 silenzioso) è la scelta sicura; il vincolo DB di
   non-ambiguità anticipa i casi limite in scrittura.
2. **Convenzioni** — dimensioni FK nullable (coerente con `@db.Uuid`), `NULLS NOT DISTINCT`
   (Postgres 16), engine puro unit-testato (coerente con `resolvePayment` di A2).
3. **Modularità** — l'engine è un modulo `catalog` a dipendenza unidirezionale
   (`bookings → catalog`, mai il contrario); il `CatalogService` media tra DB e engine; la logica
   di prezzo non è sparsa nel controller.
4. **Zero debito** — l'ordine di priorità è una decisione esplicita tracciata qui (non implicita
   nel codice); il no-match e il no-season sono errori di dominio espliciti; il debito residuo
   (editor listino, prezzo per tipologia) è tracciato in [D-032](../deferred.md) e
   [D-018](../deferred.md).
