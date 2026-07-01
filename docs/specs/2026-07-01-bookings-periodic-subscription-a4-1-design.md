# Prenotazioni — Slice A4.1 (periodiche + abbonamenti) — Design Spec

- **Data:** 2026-07-01
- **Stato:** In revisione — primo sotto-slice dell'increment **A4 (Periodiche/abbonamenti)**, opzione
  A4 dell'handoff [2026-06-30-bookings-a3-2-done](../handoff/2026-06-30-bookings-a3-2-done.md) §5.
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento (nessun ADR nuovo):** questo slice **implementa decisioni già prese**, non ne
  introduce di nuove (come A2). Riafferma:
  [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (prenotazione unificata a
  intervallo: `daily`/`periodic`/`subscription`, un modello tre comportamenti),
  [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md) (abbonamento = `Booking`
  `type=subscription`; rinnovo/anzianità **rimandati ad A4.2**),
  [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (anti-overlap slot-aware
  su intervalli intersecanti),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (engine puro, già generale su
  multi-giorno e `unit=period` — **invariato**),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date di calendario,
  Europe/Rome, round-trip UTC),
  [ADR-0020](../architecture/decisions/0020-resa-mappa.md) (stati mappa derivati).
- **Prossimo ADR libero: 0033** (invariato — A4.1 non introduce un ADR).

---

## 1. Obiettivo e confini

**Aprire il gate dei tre tipi di prenotazione.** A1→A3.2 hanno costruito tutto il dominio nella sua
**forma generale** (anti-overlap su intervalli, engine multi-giorno + `unit=period`, mappa `type`-aware)
ma la creazione è rimasta **daily-only**: `BookingsService.create` scrive hard-coded `type:'daily'` e
`startDate=endDate=day`. A4.1 **abilita la creazione** di `type=periodic` (intervallo esplicito) e
`type=subscription` (intervallo = la Stagione), prezza sull'intervallo reale, applica l'anti-overlap sugli
intervalli e porta il tipo nel modale FE e in `BookingsView`.

**Principio anti-debito (confermato).** A4.1 non riscrive nulla del cuore: **niente migrazione** (enum
`BookingType`, `Booking.startDate/endDate/type`, `previousBookingId` esistono già dallo schema A1/A3.1);
**engine invariato** (ADR-0032, già unit-testato su multi-giorno e `unit=period`); **mappa invariata**
(`map.projection.ts` deriva già `SlotState` dal `type`). Il lavoro è: contratti espliciti, logica di
`create` per tipo, estensione del pricing all'intervallo, FE.

### In scope (A4.1)

- **Creazione `periodic`**: `POST /api/bookings` con `type=periodic`, `startDate`/`endDate` espliciti
  (intervallo di più giorni). Prezzo su tutto l'intervallo (engine: `unit=day × giorni` oppure
  `unit=period` forfait, secondo la `Rate` applicabile).
- **Creazione `subscription`**: `type=subscription` con `startDate` che identifica la Stagione; il
  **server** risolve la `Season` attiva e impone `startDate=season.startDate`, `endDate=season.endDate`
  (durata = stagione, **server-autoritativo**).
- **Pricing su intervallo**: `CatalogService.quote`/`priceWithin` estesi a `startDate`/`endDate`+`type`
  (oggi single `date`). Engine invariato. Risoluzione stagione **guidata da `startDate`**.
- **Anti-overlap su intervalli**: `dateRangesOverlap(b.startDate, b.endDate, startDate, endDate)` +
  `slotsOverlap` (helper già pronti). Due prenotazioni confermate sullo stesso ombrellone, intervalli
  intersecanti, fascia uguale/sovrapposta → **409**.
- **Contratti espliciti (breaking pre-release, in lockstep)**: `date` → `startDate`/`endDate?`; `type`
  **obbligatorio** su `CreateBookingInput` e `QuoteBookingInput`.
- **FE (modale "Nuova prenotazione")**: selettore **Tipo** (Giornaliera/Periodica/Abbonamento); per
  *Periodica* input "Fine periodo"; per *Abbonamento* durata = "Stagione intera" (nessuna fine). `type` e
  `endDate` entrano nel re-quote e nel payload.
- **`BookingsView`**: colonna **"Tipo"** reale (`type` → etichetta IT) al posto dell'hard-coded
  "Giornaliero".
- **Seed** (dev + e2e): +1 `Rate` `type=subscription`, `unit=period` (forfait di stagione) per esercitare
  il path `unit=period` end-to-end. La periodica usa la catch-all `unit=day` (× giorni).
- **Test** (TDD, commit-per-layer): unit (DTO + regole di dominio), e2e a 2 tenant (periodic/subscription
  create + prezzo + mappa + anti-overlap su intervalli + isolamento), web-staff (modale + colonna Tipo).

### Fuori scope (slice successivi, tutti additivi)

- **A4.2 — Rinnovo + anzianità** ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)):
  azione "rinnova" dalla lista abbonati della stagione precedente → nuova `Booking` che copia
  cliente+ombrellone+pacchetto, riprezza sul nuovo listino e linka `previousBookingId`; anzianità =
  lunghezza catena. **In A4.1 `previousBookingId` resta `null`** (il campo esiste, non lo si valorizza).
- **Prelazione** (finestre/scadenze/rilascio automatico) → [D-011](../architecture/deferred.md);
  **cabine/servizi** → [D-012](../architecture/deferred.md); **sospensione/cessione/disdetta** →
  [D-013](../architecture/deferred.md).
- **Editor CRUD del listino** → [D-032](../architecture/deferred.md): il listino resta **seeded**. In
  particolare l'invariante **non-overlap delle `Season`** non è enforced da CRUD (seeded → stagioni non
  sovrapposte per costruzione); la gestione difensiva `>1 stagione → deterministico + log` di A3.1 resta.
- **Extra a prezzo** (`Booking.extras`) → rimandato; **prezzo per tipologia ombrellone** →
  [D-018](../architecture/deferred.md) (mai nell'engine).
- **Exclusion constraint DB anti-overlap** → [D-030](../architecture/deferred.md) (l'anti-overlap resta
  applicativo dentro la transazione, come A1).

---

## 2. Modello dati (Prisma) — NESSUNA migrazione

A4.1 **non tocca lo schema**. Tutti i campi necessari esistono già:

| Campo | Stato | Uso in A4.1 |
|---|---|---|
| `enum BookingType { daily periodic subscription }` | esistente (A1) | tutti e tre attivi |
| `Booking.type BookingType` (non-null) | esistente | scritto dal tipo scelto |
| `Booking.startDate` / `endDate` `@db.Date` | esistenti (A1) | intervallo reale (non più `=day`) |
| `Booking.previousBookingId String? @db.Uuid` | esistente (A1, inutilizzato) | **resta `null`** (A4.2) |
| `Rate.type BookingType?` | esistente (A3.1) | dimensione tipo (wildcard se null) |
| `Rate.periodStart/periodEnd`, `unit RateUnit` | esistenti (A3.1) | sotto-periodo + forfait |

> Le prenotazioni esistenti hanno tutte `type='daily'` (creato esplicitamente da A1); nessun backfill.

---

## 3. Contratti (`@coralyn/contracts`) — breaking additivo (pre-release, lockstep)

Scelta **zero-debito**: il contratto adotta il **vocabolario del dominio** (`startDate`/`endDate` come su
`Booking` e `PricingContext`) e rende il **tipo esplicito**. Si abbandona l'overloading di `date` (un
campo con tre significati-per-tipo è ambiguità = debito).

```ts
/** Input per creare una prenotazione. Prezzo e (per subscription) durata sono server-autoritativi. */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito: 'daily' | 'periodic' | 'subscription' (niente default implicito)
  startDate: string;   // ISO yyyy-mm-dd. daily: il giorno · periodic: inizio · subscription: data che identifica la Stagione
  endDate?: string;    // ISO. periodic: OBBLIGATORIO (fine, ≥ startDate) · daily: omesso (server = startDate) · subscription: VIETATO (server = stagione)
  packageId?: string;  // opzionale (null = tariffa base)
}

/** Input del preventivo. Stessa forma della create (un solo vocabolario). */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito (era `type?` con default 'daily')
  startDate: string;
  endDate?: string;
  packageId?: string;
}
```

- **`BookingDTO`** già espone `startDate`/`endDate`/`type`: **invariato**.
- **`DayMapDTO.date`** (la data *visualizzata* della mappa) resta `date`: è un concetto diverso (giorno di
  vista), non l'intervallo di una prenotazione. Nessun rename lì.
- **Perché è ammesso rompere il contratto** (stessa motivazione di A3.1 che rimosse `totalPrice`):
  pre-release senza dati di produzione; FE e BE nello stesso monorepo aggiornati in lockstep; storia
  migrazioni squashata. La rinomina esplicita è la scelta **zero-debito**; un `date` polisemico sarebbe
  debito silenzioso.

---

## 4. Pricing su intervallo — engine invariato

L'engine `resolvePrice(ctx, rates)` è **già** definito su `startDate`/`endDate` e su `unit=day|period`
(ADR-0032, unit-testato su multi-giorno). A4.1 **non lo tocca**. Cambia solo il *ponte* service→engine.

### `CatalogService` — estensione di `QuoteContext`

```ts
export interface QuoteContext {
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;      // era `date`
  endDate: string;        // NUOVO (daily: == startDate)
  packageId?: string | null;
  type: BookingType;      // era `type?`
}
```

`priceWithin(tx, ctx)`:
1. Risolve l'ombrellone → `rowId`/`sectorId` (invariato). FK fuori tenant → `UMBRELLA_NOT_FOUND` → 422.
2. **Risoluzione stagione guidata da `startDate`** (`Season.startDate ≤ startDate ≤ Season.endDate`).
   0 → `NO_SEASON` → 422; >1 → deterministico (prima per `startDate`) + log (difensivo, invariato).
3. Carica le `Rate` del `Pricing` della stagione, costruisce il `PricingContext`
   (`startDate`/`endDate`/`type`/`packageId`), chiama `resolvePrice`. `NO_RATE` → 422.

> **Contenimento nel sotto-periodo (comportamento esistente, documentato):** una `Rate` con
> `periodStart/periodEnd` è applicabile solo se `[startDate,endDate]` è **contenuto** nel sotto-periodo
> (`isApplicable`: `startDate ≥ periodStart && endDate ≤ periodEnd`). **Nessun pro-rata**: un intervallo
> che sfora il sotto-periodo semplicemente non matcha quella rate e ricade sulla catch-all.

> **Periodico a cavallo di due stagioni** (`endDate` oltre la stagione di `startDate`): la stagione è
> risolta da `startDate`; se l'intervallo eccede `season.endDate`, nessuna `Rate` `unit=day` copre i
> giorni fuori stagione a livello di *dominio*. **Decisione:** validazione esplicita in `create` →
> **422** "Il periodo supera la stagione" (vedi §5). Niente prezzo parziale silenzioso.

### `quote(ctx)` vs `priceWithin(tx, ctx)`

Invariato il pattern A3.1: `quote()` apre la propria `forTenant` (endpoint preview); `priceWithin(tx,…)`
riusa la transazione della `create` (mai transazione annidata).

---

## 5. `BookingsService.create` — logica per tipo

Dentro la stessa `forTenant` (ordine invariato: FK → intervallo → anti-overlap → prezzo → scrittura):

1. **Deriva e valida l'intervallo dal tipo** (server-autoritativo). Per `periodic` e `subscription` la
   `create` risolve la stagione una volta (`CatalogService.resolveSeasonWithin(tx, startDate)`;
   `NO_SEASON` → **422** "Nessuna stagione attiva per questa data") e la usa per validare/derivare
   l'intervallo. Per `daily` non serve: `endDate=startDate` è per costruzione in stagione se la stagione
   esiste (l'eventuale fuori-stagione lo intercetta `priceWithin` con `NO_SEASON`).
   - `daily` → `startDate = input.startDate`, `endDate = input.startDate`. `input.endDate` presente →
     **422** "Giornaliera: non specificare la data di fine".
   - `periodic` → `input.endDate` assente → **422** "Periodica: specificare la data di fine";
     `endDate < startDate` → **422** "La data di fine precede l'inizio";
     `endDate > season.endDate` (il periodo sfora la stagione risolta da `startDate`) → **422** "Il
     periodo supera la stagione" (messaggio dedicato, mai prezzo parziale silenzioso). Altrimenti
     `startDate`/`endDate` come da input.
   - `subscription` → `input.endDate` presente → **422** "Abbonamento: la durata è la stagione, non
     specificare la data di fine". Altrimenti `startDate=season.startDate`, `endDate=season.endDate`.
2. **FK nel tenant** (invariato): `timeSlot`/`umbrella`/`customer` + `package?` pre-validati → 422.
3. **Anti-overlap su intervallo**: carica le confermate dello stesso ombrellone e verifica
   `dateRangesOverlap(b.startDate, b.endDate, startDate, endDate) && slotsOverlap(b.timeSlot, slot)` →
   **409** "Fascia non disponibile per questo ombrellone".
4. **Prezzo**: `catalog.priceWithin(tx, { umbrellaId, timeSlotId, startDate, endDate, type, packageId })`
   → `totalPrice` (mai dal client). Errori pricing → 422.
5. **Scrittura**: `type`, `startDate`, `endDate`, `totalPrice`, `status:'confirmed'`,
   `packageId ?? null`, `previousBookingId: null`.

> **`resolveSeasonWithin(tx, date)`** (nuovo metodo pubblico di `CatalogService`): risolve la stagione
> attiva e ne ritorna l'intervallo — `{ ok:true, startDate, endDate }` | `{ ok:false, reason:'NO_SEASON' }`.
> Riusa la stessa query di `priceWithin` (single source della risoluzione stagione). La `create` lo
> chiama per `periodic` (validare `endDate ≤ season.endDate`) e `subscription` (derivare il range);
> `priceWithin` poi ri-risolve la stessa stagione da `startDate`: ridondanza di **una** query
> indicizzata, in cambio di due metodi auto-contenuti. Scelta deliberata (no over-engineering).

---

## 6. Endpoint

### `POST /api/bookings` — create (modifica)

`CreateBookingDto`: `+ type` (`@IsIn(BookingType)`, **obbligatorio**), `date` → `startDate`
(`@IsCalendarDate`), `+ endDate?` (`@IsOptional @IsCalendarDate`). Le regole di **dominio** (endDate
richiesto/ordine per tipo, vietato per daily/subscription, cavallo-stagione) stanno nel **service** →
**422** (pattern A1/A3.1: la forma nel DTO, il dominio nel service).

> **`ValidationPipe({ whitelist: true })`**: `type`/`endDate` **devono** stare nel DTO o il pipe li
> scarta silenziosamente (gotcha ricorrente A3.2 §4).

### `GET /api/bookings/quote` — preview (modifica)

`QuoteBookingDto`: `type` diventa **obbligatorio** (`@IsIn`); `date` → `startDate`; `+ endDate?`. Il
service `CatalogService.quote(...)` con l'intervallo. Per `subscription` il quote **espande alla
stagione** come la create (single source), così il prezzo mostrato coincide col vincolante.

### Invariati

`GET /api/bookings`, `DELETE /api/bookings/:id`, `PATCH /api/bookings/:id/payment` (A2), `GET /api/packages`
(A3.2), `GET /api/map` — **invariati**.

---

## 7. Mappa — nessuna modifica (verifica)

`map.projection.ts` deriva già lo stato da `type`:
`STATE_BY_TYPE = { daily:'daily', periodic:'booked', subscription:'season' }` e `map.service.ts` filtra
già le prenotazioni per intervallo (`startDate ≤ giorno ≤ endDate`). Quindi una `periodic`/`subscription`
si accende su **tutti** i giorni del suo intervallo, con lo stato corretto, **senza toccare la mappa**.
A4.1 lo **verifica** con un e2e sulla mappa (giorno interno all'intervallo → `booked`/`season`), non lo
modifica. *(Nota: `periodic → booked`, `subscription → season` — è il codice implementato, autoritativo
sui token del design-system.)*

---

## 8. FE (`apps/web-staff`) — modale + colonna Tipo

### Modale "Nuova prenotazione" (`MapView.vue`)

- **Selettore Tipo** (`<select>`): Giornaliera (`daily`, default) · Periodica (`periodic`) · Abbonamento
  (`subscription`). Un `ref` `bookingType`.
- **Date per tipo**:
  - `daily` → nessun campo extra (usa `activeDate` come `startDate`).
  - `periodic` → input **"Fine periodo"** (`endDate`), `startDate = activeDate`. Validazione FE minima
    (endDate ≥ startDate) coerente col 422 server.
  - `subscription` → nessuna data fine; etichetta statica **"Durata: stagione intera"**.
- **Re-quote**: `quoteParams` include `type` (+ `endDate` se periodic) → `useBookingQuote` si re-invalida
  al cambio tipo/date/pacchetto e ricalcola il prezzo (riusa la riga Prezzo di A3.1).
- **Payload create**: `{ …, type, startDate, endDate? }`.

### `BookingsView.vue`

- Colonna **"Tipo"**: mappa `type` → etichetta IT (`daily→Giornaliera`, `periodic→Periodica`,
  `subscription→Abbonamento`) al posto dell'hard-coded "Giornaliero". `BookingDTO.type` già disponibile.

### Contratti/composable

- `useBookingQuote`: `QuoteParams` allineato (`startDate`/`endDate`/`type`).
- `useCreateBooking`: payload allineato.
- **MSW** (test): handler `quote` riflette `type`/intervallo; `POST /bookings` riflette `type`/date.
- **Pulire `apps/web-staff/node_modules/.vite`** dopo il cambio contratti.

---

## 9. Seed (dev + e2e)

- **`prisma/seed.ts`** (dev) e **`test/helpers/seed-pricing.ts`** (e2e): aggiungere **una `Rate`
  `type=subscription`, `unit=period`** (forfait di stagione, es. `price: 800`) al listino demo, così il
  path `unit=period` è esercitato dal vivo e dagli e2e. La periodica riusa la catch-all `unit=day`
  (×giorni). Stagione demo invariata (`2026-05-01 .. 2026-09-30`).
- UUID sintetici coerenti col pattern esistente.

---

## 10. Test (TDD, commit-per-layer)

Target da **non** regredire: **ui-kit 14 · web-staff 44 · api unit 61 · api e2e 53**.

### api unit
- **`create-booking.dto.spec`** / **`quote-booking.dto.spec`**: `type` obbligatorio (assente → invalid);
  `startDate` calendario; `endDate?` opzionale; forma UUID.
- **engine**: `pricing.engine.spec` copre già multi-giorno (`unit=day × giorni`) e `unit=period`
  (**verifico**, non duplico). Eventuale caso aggiuntivo: contenimento sotto-periodo per un intervallo.
- **`CatalogService.resolveSeasonWithin`**: se testabile in isolamento (o coperto via e2e).

### api e2e (`coralyn_test`, 2 tenant, seed listino esteso)
- **periodic** create (es. 5 giorni) → 201, `totalPrice = catch-all × giorni`; `GET /bookings` riflette
  `type/startDate/endDate`; **mappa** di un giorno interno → cella `booked`.
- **subscription** create (`startDate` in stagione, senza `endDate`) → 201, `startDate/endDate = stagione`,
  `totalPrice = 800` (rate `unit=period`); mappa di un giorno in stagione → cella `season`.
- **regole di dominio → 422**: daily con `endDate`; periodic senza `endDate`; periodic `endDate<startDate`;
  subscription con `endDate`; subscription fuori stagione (`NO_SEASON`); periodic a cavallo stagione.
- **anti-overlap su intervalli → 409**: due prenotazioni con intervalli intersecanti, stessa fascia,
  stesso ombrellone. Fasce disgiunte (mattina/pomeriggio) su intervalli intersecanti → **201** (no
  conflitto).
- **quote** con `type=periodic`/`subscription` → prezzo coerente con la create.
- **isolamento** 2 tenant (RLS); superuser → 400; FK inesistente → 422.

### web-staff (Vitest + MSW)
- `MapView.spec`: selettore Tipo; per periodic compare "Fine periodo" ed entra nel re-quote/payload; per
  subscription niente fine; il prezzo si ricalcola al cambio tipo.
- `BookingsView.spec`: colonna "Tipo" rende l'etichetta IT dai tre `type`.

---

## 11. Verifica / DoD

- **Nessuna migrazione**; `prisma generate` non necessario (schema invariato) — ma se il client è stale
  dopo il cambio branch: `corepack pnpm --filter @coralyn/api exec prisma generate` prima di `nest build`
  (gotcha ricorrente).
- Test verdi, conteggi **≥** ai target (con i nuovi). `pnpm -r build` + `eslint .` verdi.
- **Verifica live** (Docker `--profile full up -d --build api` + dev FE): creare una **periodica** di più
  giorni → prezzo = base × giorni, celle `booked` sui giorni dell'intervallo; creare un **abbonamento** →
  durata stagione, celle `season`; `BookingsView` mostra il Tipo corretto. Login dev
  `admin@coralyn.dev` / `coralyn-admin-8473`.
- **Doc:** aggiornare `README.md` (stato: A4.1 periodiche+abbonamenti), `data-model.md`
  (`Booking.type`: tutti e tre attivi; `previousBookingId` ancora inutilizzato → A4.2), `glossary.md`
  (togliere "(A1: solo daily)" dove presente); **handoff A4.1**. Nessun ADR nuovo (0033 resta libero).

---

## 12. Casi limite e regole d'integrità (riepilogo)

- **Durata server-autoritativa:** subscription = stagione (client non la impone); daily = un giorno;
  periodic = intervallo esplicito validato.
- **Prezzo server-autoritativo:** `totalPrice` sempre ricalcolato; quote = preview, create = vincolo.
- **No pro-rata sotto-periodo:** la rate di sotto-periodo si applica solo se l'intervallo è contenuto;
  altrimenti catch-all. **Periodo oltre la stagione → 422** (mai prezzo parziale silenzioso).
- **Anti-overlap su intervalli:** intersezione date **e** fascia sovrapposta → 409; fasce disgiunte no.
- **Stati mappa da `type`:** `daily→daily`, `periodic→booked`, `subscription→season` (codice esistente).
- **`status` ortogonale al `type`:** resta `confirmed`/`cancelled`; nessun overload del lifecycle.
- **`previousBookingId` = null** in A4.1 (rinnovo = A4.2).
- **Isolamento:** ogni query in `forTenant`; RLS FORCE; FK fuori tenant → 422; e2e a 2 tenant.

## 13. Decisioni chiuse

1. **A4 spezzato:** A4.1 (abilita periodic/subscription + pricing/mappa/FE, qui) → A4.2 (rinnovo +
   anzianità via `previousBookingId`). (§1)
2. **Contratti espliciti:** `date` → `startDate`/`endDate?`, `type` **obbligatorio** su create e quote
   (breaking pre-release, lockstep — precedente A3.1/`totalPrice`). (§3)
3. **Subscription server-autoritativa:** durata = stagione risolta dal server; `endDate` dal client →
   422. (§4, §5)
4. **Stagione guidata da `startDate`; periodo oltre la stagione → 422** (niente pro-rata/parziale). (§4, §5)
5. **`status` invariato** (`confirmed`/`cancelled`); stati mappa derivati dal `type`. (§7, §12)
6. **Nessuna migrazione, engine e mappa invariati** (fondamenta A1/A3.1 già generali). (§2, §4, §7)
7. **Listino resta seeded** ([D-032]); +1 rate `subscription`/`period` per esercitare il forfait. (§9)
8. **`previousBookingId` inutilizzato** in A4.1 (→ A4.2). (§1, §5)
