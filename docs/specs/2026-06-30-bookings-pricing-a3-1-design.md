# Prenotazioni — Slice A3.1 (catalogo + pricing engine + auto-pricing) — Design Spec

- **Data:** 2026-06-30
- **Stato:** In revisione — primo sotto-slice dell'increment **A3 (Pricing)**, opzione A3 dell'handoff
  [2026-06-30-bookings-a2-done](../handoff/2026-06-30-bookings-a2-done.md) §5.
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
  (listino a regole + pricing engine a precedenze — **questo slice ne realizza il comportamento**),
  [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (dimensione fascia),
  [ADR-0005](../architecture/decisions/0005-modello-mappa.md) (Settore/Fila = ambito posizione),
  [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md) + [D-018](../architecture/deferred.md)
  (la **tipologia NON è dimensione di prezzo**),
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS),
  [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (tenant dal JWT),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (fuso/date di calendario).
- **Nuovo ADR previsto: [ADR-0032] — Pricing engine: dimensioni e precedenza esplicita.** Questo slice
  introduce una decisione di dominio nuova (l'ordine totale di precedenza fra le dimensioni della
  `Rate`), quindi va promossa ad ADR insieme allo slice (a differenza di A2 che implementava un ADR
  già esistente). Vedi §3.

---

## 1. Obiettivo e confini

**Spegnere il prezzo digitato a mano.** A1 ha acceso la mappa con `totalPrice` digitato a mano; A2 ha
reso gestibile l'incasso su quel prezzo. Resta il debito esplicito di A1/A2: il prezzo è un numero che
l'operatore inventa a ogni prenotazione, senza coerenza né regole. A3.1 introduce il **catalogo**
(`Season`/`Pricing`/`Rate`/`Package`) e un **pricing engine puro a precedenze esplicite** che calcola
il prezzo **server-side** da `{tipo, posizione (settore/fila), pacchetto, fascia, periodo}`. Il prezzo
diventa **dato**, non più input (ADR-0006: *"pricing flessibile senza numeri incollati nel codice"*).

**Principio anti-debito.** Come A1 ha costruito l'anti-overlap nella sua **forma generale** pur usando
solo `daily`, A3.1 costruisce l'engine nella sua forma generale (tutte le dimensioni, `unit`
giorno/periodo) anche se la *creazione* resta `daily`. Così A4 (periodiche/abbonamenti + rinnovo con
prezzo ricalcolato) riusa l'engine senza riscrittura. Le entità nascono col set di campi del
[data-model](../design/data-model.md).

### In scope (A3.1)

- **Migrazione** Prisma: `Package`, `Season`, `Pricing`, `Rate` (tenant-scoped + RLS `tenant_isolation`
  FORCE, SQL grezzo) + colonna **`Booking.packageId`** (FK **nullable additiva**).
- **Vincolo `UNIQUE`** sulla firma delle dimensioni della `Rate` (§3): l'ambiguità "due regole identiche
  per specificità" è impossibile per costruzione.
- **Pricing engine puro** `resolvePrice(...)` (modulo `catalog`, niente dipendenze Nest, unit-testato in
  isolamento come `booking.availability`/`booking.payment`): matching + **precedenza lessicografica
  esplicita** + calcolo `unit` giorno/periodo + esiti di dominio discriminati (no-match, no-season).
- **`CatalogService`**: carica `Season`/`Pricing`/`Rate` nel tenant (`forTenant`) e invoca l'engine.
- **Auto-pricing su `POST /api/bookings`**: il `totalPrice` lo **calcola il server** (l'engine), non il
  client. `CreateBookingInput` **perde `totalPrice`** (zero override — la scelta "server autoritativo").
- **Endpoint quote** `GET /api/bookings/quote?…` → prezzo calcolato **prima** di confermare (alimenta il
  modale FE; A3.2 lo ri-chiamerà al cambio pacchetto).
- **Contratti additivi**: `PackageDTO`, `BookingQuoteDTO`, `QuoteBookingInput`; `BookingDTO += packageId?`;
  `CreateBookingInput -= totalPrice` (cambio non-additivo, ammesso pre-release — §6).
- **FE minimo (MapView, modale "Nuova prenotazione")**: il campo prezzo **a mano sparisce**; il modale
  mostra il **prezzo calcolato** (quote) per il pacchetto di default (`null`). Nessun selettore Pacchetto
  ancora (è A3.2).
- **Seed** di un listino demo (1 `Season`, 1 `Pricing`, alcune `Rate` incl. la **catch-all**, 1+
  `Package`) così engine, e2e e verifica live hanno dati.
- e2e a 2 tenant (correttezza precedenze, isolamento, FK, no-match/no-season, quote); unit dell'engine.

### Fuori scope (slice successivi, tutti additivi)

- **A3.2 — Selettore Pacchetto + ricalcolo nel modale**: scelta del `Package` reale nel modale,
  **re-quote** al cambio pacchetto/fascia, colonna Pacchetto reale in `BookingsView`. (Slice gemello,
  branch da questo.)
- **Editor CRUD del listino** (admin gestisce `Season`/`Pricing`/`Rate`/`Package` da form): **rimandato**,
  slice gemello dell'opzione B (setup mappa CRUD, [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
  In A3.1 il listino è **seeded** — stesso pattern della mappa (modello+proiezione prima, CRUD dopo).
  → nuova voce **[D-032]** in [deferred.md](../architecture/deferred.md).
- **Creazione di prenotazioni `periodic`/`subscription`**: la create resta **daily-only** (A4). L'engine
  però è già generale (`unit`, multi-giorno, periodo) e unit-testato sui casi multi-giorno.
- **Extra a prezzo** (`Booking.extras`): modellato, **non** prezzato in A3.1 (l'engine somma solo la
  `Rate`). Rimandato.
- **Prezzo per tipologia di ombrellone**: **escluso per decisione** ([D-018](../architecture/deferred.md));
  la `UmbrellaType` non entra mai nell'engine. Il prezzo è per **posizione** (Settore/Fila).
- **Fuso/valuta per-tenant, arrotondamenti fiscali**: importi in EUR, centesimi interi; nessun fiscale (D-004).

---

## 2. Modello dati (Prisma)

Quattro nuovi model tenant-scoped (`establishmentId @db.Uuid` + relazione a `Establishment` + indici +
RLS) e una colonna su `Booking`.

### `Package` — dotazione prenotabile (ADR-0006)

| Campo | Tipo | Note |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | |
| `establishmentId` | `String @db.Uuid` | tenant |
| `name` | `String` | es. *Standard*, *Famiglia*, *Premium* |
| `equipment` | `Json @db.JsonB` | dotazione: `{ sunbeds, deckchairs, ... }` (display; non prezzato in A3.1) |

### `Season` — arco temporale operativo (ADR-0031: date di calendario)

| Campo | Tipo | Note |
|---|---|---|
| `id` / `establishmentId` | uuid | tenant |
| `name` | `String` | es. *Estate 2026* |
| `startDate` / `endDate` | `DateTime @db.Date` | **non si sovrappongono** fra loro nello stesso tenant (invariante §4) |

### `Pricing` — listino di una stagione

| Campo | Tipo | Note |
|---|---|---|
| `id` / `establishmentId` | uuid | tenant |
| `seasonId` | `String @db.Uuid` | FK `Season`; **una `Pricing` per `Season`** nell'MVP (`@@unique([seasonId])`) |

### `Rate` — regola di prezzo multi-dimensione (il cuore)

Ogni dimensione è **nullable = wildcard** ("vale per qualsiasi valore").

| Campo | Tipo | Semantica / dimensione |
|---|---|---|
| `id` / `establishmentId` | uuid | tenant |
| `pricingId` | `String @db.Uuid` | FK `Pricing` |
| `type` | `BookingType?` | dimensione **tipo** (`daily`/`periodic`/`subscription`); null = qualsiasi |
| `sectorId` | `String? @db.Uuid` | dimensione **posizione** a livello Settore; null = qualsiasi |
| `rowId` | `String? @db.Uuid` | dimensione **posizione** a livello Fila (più specifica del Settore); null = qualsiasi |
| `packageId` | `String? @db.Uuid` | dimensione **pacchetto**; null = qualsiasi |
| `timeSlotId` | `String? @db.Uuid` | dimensione **fascia** ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)); null = qualsiasi |
| `periodStart` | `DateTime? @db.Date` | dimensione **periodo** (sotto-periodo intra-stagione, es. Ferragosto); null = tutta la stagione |
| `periodEnd` | `DateTime? @db.Date` | estremo del sotto-periodo; null insieme a `periodStart` |
| `price` | `Decimal @db.Decimal(10,2)` | importo (EUR) |
| `unit` | `RateUnit` | `day` (× giorni) \| `period` (forfait per l'intervallo) |

> **Refinement del data-model:** la `Rate.period` (oggi `json` nel [data-model](../design/data-model.md))
> diventa **due colonne tipizzate** `periodStart`/`periodEnd` (`@db.Date`), coerente con la preferenza
> "colonne tipizzate vs json" di [ADR-0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md).
> Il data-model va aggiornato (§7). La posizione (`scope "sector/row"`) diventa le due FK nullable
> `sectorId`/`rowId`.

**Nuovo enum DB:** `RateUnit { day period }` (nativo, come `Role`/`BookingType`).

**Vincolo di non-ambiguità (firma unica):**

```prisma
@@unique([pricingId, type, sectorId, rowId, packageId, timeSlotId, periodStart, periodEnd])
```

Due `Rate` con la **stessa identica firma** di dimensioni sono impossibili → niente pareggio di
specificità a runtime (§3). Indici: `@@index([establishmentId])`, `@@index([pricingId])`.

### `Booking.packageId` — l'unica colonna rinviata da A1 atterra ora

`packageId String? @db.Uuid` + relazione a `Package`. **Nullable additiva** (A1 §2 nota): null in A3.1
(nessun selettore), valorizzata in A3.2. Indice/relazione inversa `Package.bookings`.

### RLS (migrazione, SQL grezzo)

Identico al pattern di `Booking` (A1) / `init`, per **tutte e quattro** le nuove tabelle:

```sql
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Package"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
-- idem per "Season", "Pricing", "Rate"
```

Tutte le query passano da `PrismaService.forTenant(tenantId, …)`. `Rate` porta `establishmentId`
(ridondante con la catena `pricingId→Pricing→establishmentId`) **per poter applicare la RLS direttamente**
sulla tabella, coerente con "ogni entità tenant-scoped porta `establishmentId`".

---

## 3. Pricing engine (il cuore) — funzione pura

Modulo `catalog`, file `pricing.engine.ts`. **Puro**, nessuna dipendenza Nest, esito **discriminato**
(non lancia eccezioni: il `CatalogService` mappa l'esito → eccezione Nest), come `resolvePayment`.

### Input/Output

```ts
export interface PricingContext {
  type: BookingType;
  sectorId: string;          // settore dell'ombrellone (risolto via Umbrella→Row→Sector)
  rowId: string;             // fila dell'ombrellone
  packageId: string | null;  // null = nessun pacchetto specifico (A3.1)
  timeSlotId: string;        // fascia prenotata
  startDate: string;         // ISO yyyy-mm-dd
  endDate: string;           // ISO yyyy-mm-dd (daily: == startDate)
}

/** Una Rate "piatta", già caricata dal DB (Decimal→number). */
export interface RateRow {
  type: BookingType | null;
  sectorId: string | null;
  rowId: string | null;
  packageId: string | null;
  timeSlotId: string | null;
  periodStart: string | null; // ISO
  periodEnd: string | null;
  price: number;
  unit: 'day' | 'period';
}

export type PriceResult =
  | { ok: true; totalPrice: number; rate: RateRow }
  | { ok: false; reason: 'NO_RATE' };

/** Risolve la Rate applicabile e calcola il prezzo. `rates` = Rate del Pricing della stagione attiva. */
export function resolvePrice(ctx: PricingContext, rates: RateRow[]): PriceResult;
```

> La **risoluzione della stagione** (data → `Season` → `Pricing`) avviene **prima**, nel `CatalogService`
> (serve il DB). L'engine riceve solo le `Rate` candidate della stagione giusta. Il "nessuna stagione"
> è quindi un esito del service (§4), non dell'engine.

### Matching (quali `Rate` sono applicabili)

Una `Rate` è **applicabile** al contesto se, per **ogni** dimensione che specifica (non-null), il valore
coincide; le dimensioni null fanno match con qualsiasi cosa:

- `type`: `rate.type === null || rate.type === ctx.type`
- **posizione**: `rate.rowId === null || rate.rowId === ctx.rowId` **e** `rate.sectorId === null || rate.sectorId === ctx.sectorId`
- `packageId`: `rate.packageId === null || rate.packageId === ctx.packageId`
- `timeSlotId`: `rate.timeSlotId === null || rate.timeSlotId === ctx.timeSlotId`
- **periodo**: `rate.periodStart === null` (tutta la stagione) **oppure** l'intervallo del booking
  `[startDate, endDate]` è **contenuto** in `[periodStart, periodEnd]` (sotto-periodo). *(Daily: il giorno
  cade nel sotto-periodo.)*

### Precedenza esplicita (Regola B — lessicografica, posizione/periodo dominanti) → **[ADR-0032]**

Tra le `Rate` applicabili si sceglie la **più specifica** secondo un **ordine totale esplicito** delle
dimensioni (la più specifica vince; a parità su una dimensione si passa alla successiva). Coerente con
[core-operativo §7](2026-06-27-core-operativo-design.md) (*"fila > settore > generico; periodo specifico
> generico"*) e con ADR-0006 (*"precedenze esplicite, dalla più specifica alla più generica"*):

| Priorità | Dimensione | "Più specifico" =  |
|---|---|---|
| 1 | **periodo** | sotto-periodo (`periodStart` non-null) batte tutta-la-stagione (null) |
| 2 | **posizione — fila** | `rowId` non-null batte null |
| 3 | **posizione — settore** | `sectorId` non-null batte null |
| 4 | **pacchetto** | `packageId` non-null batte null |
| 5 | **fascia** | `timeSlotId` non-null batte null |
| 6 | **tipo** | `type` non-null batte null |

Confronto: per priorità crescente, se una candidata è "specifica" e l'altra "wildcard" su quella
dimensione, **vince la specifica**; se pari, si scende di priorità. Il vincolo `UNIQUE` (§2) garantisce
che due candidate non possano avere firma identica → **nessun pareggio finale possibile**.

> **Esempio (dal questionario di design).** Listino con R1 default (`€30`), R2 `{rowId: FilaA}` (`€45`),
> R3 `{packageId: Premium}` (`€50`). Prenotazione *daily, FilaA, Premium*: applicabili tutte e tre. R1
> perde su priorità 2 (R2/R3 vs default). R2 vs R3: priorità 2 (fila) — R2 specifica, R3 wildcard → **vince
> R2 = €45**. La regola di fila batte quella di pacchetto. *(Ordine rivedibile in ADR-0032: è qui che si
> decide, p.es., se il periodo Ferragosto debba battere la fila — sì, perché priorità 1.)*

### Calcolo del prezzo (`unit`)

- `unit === 'period'` → `totalPrice = rate.price` (forfait per l'intervallo; tipico di
  `periodic`/`subscription`).
- `unit === 'day'` → `totalPrice = rate.price × giorni`, con `giorni = endDate − startDate + 1` (estremi
  inclusi, date di calendario). **Daily: `giorni = 1`** → `totalPrice = rate.price`.

Aritmetica in **centesimi interi** (come `resolvePayment`) per evitare imprecisioni; risultato riportato a
2 decimali. *(A3.1 esercita solo daily nella create; il caso multi-giorno è unit-testato per A4.)*

### No-match

Nessuna `Rate` applicabile → `{ ok: false, reason: 'NO_RATE' }`. Un listino **ben formato** ha una
`Rate` **catch-all** (tutte le dimensioni null) come rete: il no-match indica una **mis-configurazione**
del listino, non un caso normale. Il `CatalogService` lo mappa a **422** "Nessuna tariffa applicabile:
configurare il listino" — **mai €0 silenzioso** (un booking senza prezzo è un errore di dominio).

---

## 4. `CatalogService` e risoluzione stagione

`CatalogModule` (provider `CatalogService`, esporta il metodo `quote`). Importato da `BookingsModule`
(dipendenza `bookings → catalog`, mai il contrario — ADR-0007/core-operativo §6).

```ts
async quote(ctx: { umbrellaId; timeSlotId; date; packageId?; type? }): Promise<QuoteOutcome>
```

Dentro `forTenant`:

1. Risolve l'ombrellone → `rowId`/`sectorId` (`Umbrella → Row → Sector`). FK fuori tenant → null → **422**.
2. **Risoluzione stagione:** trova la `Season` con `startDate <= date <= endDate`.
   - 0 stagioni → esito `NO_SEASON` → **422** "Nessuna stagione attiva per questa data".
   - **>1 stagioni** ("non deve accadere", invariante non-overlap §2): scelta **deterministica** (prima per
     `startDate`) **+ log dell'anomalia**, come la proiezione difensiva di A1 §5.
3. Carica le `Rate` del `Pricing` della stagione (`pricing.rates`).
4. Costruisce il `PricingContext` (`type` default `daily` in A3.1; `packageId` default `null`) e chiama
   `resolvePrice`. Esito `NO_RATE` → **422** (§3).
5. Ritorna `{ totalPrice, rate }`.

> **L'invariante non-overlap delle `Season`** non è enforced da CRUD in A3.1 (il listino è seeded): si
> **documenta** e il seed crea stagioni non sovrapposte. L'enforcement applicativo arriverà con l'editor
> listino ([D-032]). La gestione difensiva (>1 → deterministico + log) evita il crash nel frattempo.

> **Date/fuso** ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)): confronti su
> `@db.Date` in UTC (`toDbDate`), mai metodi locali; `date` di default = oggi `Europe/Rome` (rete di
> sicurezza, il FE invia sempre la data esplicita).

---

## 5. Endpoint

### `GET /api/bookings/quote` — prezzo prima di confermare

Sotto la `JwtAuthGuard` globale (tenant dal JWT; no Bearer → **401**; superuser → **400**).
Query `QuoteBookingDto` (class-validator):

- `umbrellaId`, `timeSlotId` (forma UUID `@Matches` 8-4-4-4-12, **non** `@IsUUID` stretto — A1 §10),
  `date` (`@IsCalendarDate`), `packageId?` (forma UUID), `type?` (`@IsIn` BookingType; default `daily`).
- Service `CatalogService.quote(...)`. Esiti → `BookingQuoteDTO { totalPrice }` (200) oppure 422
  (NO_SEASON/NO_RATE/FK invalida), 401/400 come sopra.

### `POST /api/bookings` — auto-pricing (modifica)

Il body `CreateBookingDto` **perde `totalPrice`**. Il `BookingsService.create`, dentro la **stessa
transazione** `forTenant`, dopo i controlli FK e **prima** dell'anti-overlap (o dopo — indifferente, ma
nella stessa tx): chiama `CatalogService.priceWithin(tx, ...)` — la variante che **riusa la transazione
corrente** (per non annidare transazioni Prisma; `quote()` apre invece la propria ed è usata dall'endpoint
`GET /bookings/quote`) — per ottenere il `totalPrice` **autoritativo** (il
server **ricalcola**, non si fida di un quote passato dal client → niente prezzo manomesso/stale), poi
`create` con quel prezzo. Errori pricing (NO_SEASON/NO_RATE) → **422** (la prenotazione non si crea senza
un prezzo valido). Anti-overlap → 409 invariato. `packageId`: salvato `null` in A3.1.

> **`quote` e `create` condividono la logica di pricing** (`CatalogService`): un solo punto di verità, due
> ingressi (preview vs commit). Il quote è una *preview*; il prezzo vincolante è quello ricalcolato in
> create.

### Invariati

`GET /api/bookings`, `DELETE /api/bookings/:id`, `PATCH /api/bookings/:id/payment` (A2) **invariati**.

---

## 6. Contratti (`@coralyn/contracts`)

```ts
/** Pacchetto/dotazione prenotabile (ADR-0006). */
export interface PackageDTO {
  id: string;
  name: string;
  equipment: Record<string, number>; // es. { sunbeds: 2, deckchairs: 1 }
}

/** Unità di prezzo di una Tariffa. */
export type RateUnit = 'day' | 'period';

/** Input per il preventivo di prezzo (engine, ADR-0006). */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  date: string;             // ISO yyyy-mm-dd
  packageId?: string;       // A3.1: assente (default nessun pacchetto)
  type?: BookingType;       // default 'daily'
}

/** Preventivo calcolato dall'engine. */
export interface BookingQuoteDTO {
  totalPrice: number;       // EUR, 2 decimali
}

export interface BookingDTO {
  // ... campi esistenti invariati ...
  packageId?: string;       // A3.1 (additivo): assente finché non si sceglie (A3.2)
}
```

**Cambio non-additivo (ammesso):** `CreateBookingInput` **perde `totalPrice`** (il server lo calcola).

```ts
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string;
  // totalPrice RIMOSSO — calcolato dal pricing engine (A3.1)
}
```

> **Perché è ammesso rompere il contratto.** Siamo **pre-release senza dati di produzione**; FE e BE sono
> nello stesso monorepo e si aggiornano in lockstep; la storia migrazioni è già stata squashata
> ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Rimuovere `totalPrice` è la scelta
> **zero-debito** decisa ("server autoritativo, niente override"): tenere un override manuale riaprirebbe
> la porta al prezzo a mano. Un override esplicito resta **additivo e rinviato** se mai servirà.

`BookingType`/`PaymentStatus`/`PaymentMethod`/`SlotState` invariati. **Proiezioni:** `toBookingDTO`
aggiunge `packageId: b.packageId ?? undefined`; nuova `toPackageDTO` (`equipment` json passthrough).

---

## 7. Seed, FE, test

### Seed (listino demo)

Estende il seed esistente (oggi: mappa demo, nessuna prenotazione). Aggiunge, per lo stabilimento demo:

- 1 `Package` *Standard* (`equipment` minimo), eventuale *Premium*.
- 1 `Season` *Estate 2026* (es. `2026-05-01 .. 2026-09-30`), 1 `Pricing`.
- `Rate`: **una catch-all obbligatoria** (tutte le dimensioni null, `unit=day`, prezzo base) + 1–2 regole
  specifiche per dimostrare la precedenza (es. una `{rowId: prima fila}` più cara; una `{periodStart/End:
  Ferragosto}`). UUID sintetici coerenti col pattern del seed (`@Matches`, non v4).

### FE (`apps/web-staff`) — modale "Nuova prenotazione", minimo

- **Rimuove l'input "Prezzo" a mano** dal modale ([MapView.vue](../../apps/web-staff/src/features/map/MapView.vue)).
- **Mostra il prezzo calcolato**: alla scelta di ombrellone+fascia+data, chiama `useBookingQuote(...)`
  (nuovo composable, query `GET /bookings/quote`) e mostra `€ totalPrice` (read-only). Stato di errore se
  422 (listino non configurato) — messaggio "Prezzo non disponibile: listino non configurato".
- **Create** invia il body **senza** `totalPrice` (il server calcola). Nessun selettore Pacchetto (A3.2).
- `useCreateBooking` invariato salvo il tipo del payload (niente `totalPrice`).
- **MSW** (test): handler `GET /api/bookings/quote` (test-only) che ritorna un prezzo fisso; bypass sul
  backend reale in dev.

> `BookingsView` (A2) resta valida: mostra `totalPrice` reale (ora calcolato). La **colonna Pacchetto**
> mostra ancora "—" finché A3.2 non porta il selettore. Nessuna regressione attesa sui test A2.

### Test (TDD, commit-per-layer)

Target da **non** regredire: ui-kit 14 · web-staff 43 · api unit 46 · api e2e 40.

- **api unit — `pricing.engine.spec.ts`** (`resolvePrice` puro), casi:
  - solo catch-all → la sceglie; nessuna rate → `NO_RATE`.
  - precedenza: `{rowId}` batte `{packageId}` (l'esempio §3); `{sectorId}` batte catch-all ma perde su
    `{rowId}`; **periodo** (sotto-periodo) batte una regola di fila (priorità 1).
  - matching: type wildcard vs specifico; fascia specifica vs wildcard; pacchetto null vs specifico.
  - `unit=day` multi-giorno → `price × giorni` (estremi inclusi); `unit=period` → forfait; daily → 1 giorno.
  - centesimi: niente imprecisione float sull'uguaglianza/moltiplicazione.
- **api unit — proiezione**: `toBookingDTO` mappa `packageId` (`null→undefined`); `toPackageDTO`.
- **api e2e — `pricing.e2e-spec.ts`** (`coralyn_test`, 2 tenant, seed listino):
  - `GET /bookings/quote` senza Bearer → 401; valido → 200 con il prezzo della rate attesa (precedenza).
  - `POST /bookings` **senza** `totalPrice` → 201 con `totalPrice` **calcolato** (= rate attesa); `GET`
    riflette.
  - data **fuori stagione** → 422 (NO_SEASON); listino senza catch-all e contesto non coperto → 422 (NO_RATE).
  - **isolamento**: quote/create di s2 su `umbrellaId`/`rate` di s1 → 404/422 (RLS).
  - superuser → 400; FK ombrellone/fascia inesistente → 422.
- **web-staff**: `MapView.spec` — il modale mostra il prezzo da quote (MSW) e la create invia il body
  senza `totalPrice`; rimozione del campo prezzo a mano. Eventuale `useBookingQuote` test isolato.

---

## 8. Verifica / DoD

- **Migrazione** crea `Package`/`Season`/`Pricing`/`Rate` + enum `RateUnit` + `Booking.packageId` + RLS +
  `@@unique` firma rate. **`prisma generate` PRIMA di `nest build`** e dopo il cambio branch/schema
  (gotcha A2 §4: il client può essere stale). Applicare le migrazioni a `coralyn_dev` **e** `coralyn_test`.
- Test verdi, conteggi **≥** ai target (con i nuovi). `pnpm -r build` + `eslint .` verdi.
- Docker `--profile full up -d --build api` (rebuild dopo il cambio BE, altrimenti il FE prende 404):
  login admin dev, creare una giornaliera **senza prezzo** → verificare `totalPrice` calcolato dal listino
  seed; `GET /bookings/quote` con Bearer → prezzo atteso; data fuori stagione → 422.
- FE: dev worker sul backend reale; il modale mostra il prezzo calcolato e crea senza prezzo a mano;
  `typecheck` OK; pulizia `apps/web-staff/node_modules/.vite` dopo il cambio contratti.
- **Doc:** aggiornare `README.md` (stato: A3.1 pricing engine implementato), `data-model.md` (`Package`/
  `Season`/`Pricing`/`Rate` **implementate**; `Rate.period`→`periodStart`/`periodEnd`, `scope`→`sectorId`/
  `rowId`; `Booking.packageId` ora presente; pricing engine attivo), `glossary.md` (togliere "(futuro)" da
  `Package`/`Season`/`Pricing`/`Rate`; aggiungere `RateUnit`); **scrivere [ADR-0032]** (engine: dimensioni
  + precedenza); **aggiungere [D-032]** (editor CRUD listino rimandato) in `deferred.md`; handoff A3.1.

---

## 9. Casi limite e regole d'integrità (riepilogo)

- **Prezzo è dato, mai input:** `POST /bookings` non accetta `totalPrice`; il server lo calcola. Impossibile
  un prezzo arbitrario.
- **No-match → 422**, mai €0: un booking senza tariffa applicabile è un errore di configurazione, non una
  prenotazione gratis. Listino ben formato ⇒ catch-all presente.
- **Fuori stagione → 422** (NO_SEASON). Stagioni **non sovrapposte** (invariante); >1 → deterministico +
  log (difensivo, A1 §5).
- **Precedenza deterministica:** ordine totale esplicito ([ADR-0032]); `@@unique` sulla firma ⇒ nessun
  pareggio finale. **`UmbrellaType` mai nel pricing** ([D-018]).
- **`unit`:** `day` × giorni (estremi inclusi) / `period` forfait; daily ⇒ 1 giorno. Aritmetica in centesimi.
- **Quote ≠ vincolo:** il quote è preview; il prezzo vincolante è **ricalcolato** in create (no trust del
  client).
- **Isolamento:** ogni query in `forTenant`; RLS FORCE su tutte le nuove tabelle; FK fuori tenant → 422; e2e
  a 2 tenant.
- **`packageId` nullable:** null in A3.1; l'engine matcha le rate con `packageId=null`. Il selettore è A3.2.
- **Create resta daily-only:** l'engine è generale (multi-giorno/period unit-testati) ma `periodic`/
  `subscription` si creano in A4.
- **Extra non prezzati:** `Booking.extras` modellato, non sommato dall'engine in A3.1.

## 10. Decisioni chiuse

1. **A3 spezzato:** A3.1 (catalogo + engine + auto-pricing, qui) → A3.2 (selettore Pacchetto + ricalcolo nel
   modale). (§1)
2. **Listino seeded; editor CRUD rinviato** ([D-032], gemello dell'opzione B). (§1, §7)
3. **Precedenza = Regola B** (lessicografica, ordine *periodo › fila › settore › pacchetto › fascia › tipo*),
   promossa ad **[ADR-0032]**. (§3)
4. **Prezzo server-autoritativo, niente override:** `CreateBookingInput` perde `totalPrice`. (§5, §6)
5. **Sotto-periodi subito:** `Rate.periodStart`/`periodEnd` (dimensione periodo nell'engine). (§2, §3)
6. **`@@unique` sulla firma della `Rate`** ⇒ ambiguità impossibile per costruzione. (§2, §3)
7. **No-match e no-season → 422** (mai €0/silenzioso); catch-all obbligatoria in un listino ben formato. (§3, §4)
8. **`UmbrellaType` esclusa dal pricing** ([D-018]); prezzo per posizione (Settore/Fila). (§1, §3)
9. **Quote endpoint** condivide la logica con la create; il prezzo vincolante è ricalcolato server-side. (§5)
