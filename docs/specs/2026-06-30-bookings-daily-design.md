# Prenotazioni — Slice A1 (giornaliera + mappa accesa) — Design Spec

- **Data:** 2026-06-30
- **Stato:** Implementata — slice A1 completata (vedere
  [piano](../plans/2026-06-30-bookings-daily.md) e
  [handoff](../handoff/2026-06-30-bookings-a1-done.md)); originariamente in revisione come slice A1
  dell'increment Prenotazioni, opzione A dell'handoff
  [2026-06-30-stato-post-rename-inglese](../handoff/2026-06-30-stato-post-rename-inglese.md) §2)
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI e doc in **italiano**
  ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
  (prenotazione unificata a intervallo), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
  (disponibilità a slot + anti-overlap), [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)
  (incasso base — **modellato, comportamento rinviato ad A2**),
  [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md) (rinnovo self-link — colonna
  presente, logica rinviata ad A4), [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)
  (RLS), [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (tenant dal JWT),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (fuso/date di calendario).

## 1. Obiettivo e confini

**Accendere la mappa.** Oggi `projectDayMap` forza `stateBySlot = 'free'` per ogni slot
([map.projection.ts:33](../../apps/api/src/map/map.projection.ts)). Questo slice introduce
l'entità `Booking` (sola prenotazione **giornaliera**), l'invariante anti-overlap a slot e la
derivazione reale dello stato della mappa dalle prenotazioni confermate. La `MapView` (FE)
passa dal mock al backend reale: crea una prenotazione dal modale, vede l'ombrellone cambiare
stato, la rilegge e la annulla dal drawer.

**Principio anti-debito (il timore dell'utente):** lo schema `Booking` nasce **con il set di
colonne completo** del [data-model](../design/data-model.md) (incasso, self-link rinnovo, type
a 3 valori) anche se la *logica* di A1 esercita solo `type=daily`. Così A2 (incasso), A3
(pricing engine) e A4 (abbonamenti/rinnovo) sono **aggiunte di logica e UI, senza migrazioni di
colonna**. L'invariante di disponibilità è implementato nella sua forma **generale** (intervalli
di date + intervalli di fascia), quindi periodiche e abbonamenti lo riusano senza riscrittura.

### In scope (A1)

- Modello Prisma `Booking` tenant-scoped + RLS `tenant_isolation` FORCE (SQL grezzo in migrazione).
- Enum DB: `BookingType`, `BookingStatus`, `PaymentStatus`, `PaymentMethod`.
- Invariante anti-overlap a slot (ADR-0013), **forma generale**, enforced nel service in transazione.
- Endpoint tenant-scoped: `POST /api/bookings` (crea giornaliera, valida disponibilità → 409 se
  occupato), `GET /api/bookings?date=YYYY-MM-DD` (prenotazioni confermate del giorno),
  `DELETE /api/bookings/:id` (annulla = `status=cancelled`).
- **Prezzo digitato a mano** (`totalPrice` dal payload). **Nessun pricing engine.**
- `projectDayMap` **slot-aware**: deriva `free|daily` dalle prenotazioni confermate (gli stati
  `booked`/`season` compaiono con periodiche/abbonamenti negli slice successivi).
- Contratti additivi in `@coralyn/contracts`: `BookingDTO`, `CreateBookingInput` + enum/tipi.
- FE: modale "Nuova prenotazione" e drawer della `MapView` collegati al backend reale.
- Seed demo: nessuna prenotazione (la mappa nasce libera). e2e a 2 tenant.

### Fuori scope (slice successivi, tutti additivi)

- **A2 — Incasso base** ([ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)):
  PATCH stato pagamento + UI. Le **colonne esistono già** da A1; in A1 sono ai default
  (`paymentStatus=unpaid`, `amountCollected=0`).
- **A3 — Pricing engine** (`Season`/`Pricing`/`Rate`,
  [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)): risoluzione prezzo
  a precedenze. È la parte delicata, isolata a sé. Con essa arriva l'entità `Package` e la FK
  `Booking.packageId` (vedi §2, nota).
- **A4 — Periodiche, abbonamenti e rinnovo**: `type=periodic` → stato `booked`;
  `type=subscription` → stato `season`; rinnovo via `previousBookingId` (colonna già presente).
- **Pagina `BookingsView`** (`/bookings`): resta **mockata** in A1; passa al backend reale con A2.
- Lista d'attesa ([D-006](../architecture/deferred.md)), `Package`/extra a prezzo, fasce a orario
  libero ([D-015](../architecture/deferred.md)).

## 2. Modello dati (Prisma)

Nuovo model `Booking` con `establishmentId @db.Uuid` + relazione a `Establishment` + indici,
come ogni entità tenant-scoped.

| Campo | Tipo | Note |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | |
| `establishmentId` | `String @db.Uuid` | tenant; FK a `Establishment` |
| `customerId` | `String @db.Uuid` | FK a `Customer` |
| `umbrellaId` | `String @db.Uuid` | FK a `Umbrella` |
| `timeSlotId` | `String @db.Uuid` | FK a `TimeSlot` (fascia prenotata) |
| `previousBookingId` | `String? @db.Uuid` | self-FK rinnovo ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)); **null in A1** |
| `startDate` | `DateTime @db.Date` | giornaliera: `startDate == endDate` |
| `endDate` | `DateTime @db.Date` | |
| `type` | `BookingType` | enum `daily\|periodic\|subscription`; **A1 usa solo `daily`** |
| `status` | `BookingStatus` | enum `confirmed\|cancelled`; A1 crea `confirmed`, annulla → `cancelled` |
| `totalPrice` | `Decimal @db.Decimal(10,2)` | **digitato a mano** in A1 |
| `extras` | `Json? @db.JsonB` | modellato, inutilizzato in A1 |
| `paymentStatus` | `PaymentStatus @default(unpaid)` | incasso base (ADR-0011) — default in A1 |
| `amountCollected` | `Decimal @db.Decimal(10,2) @default(0)` | default in A1 |
| `paymentMethod` | `PaymentMethod?` | null in A1 |
| `collectionDate` | `DateTime? @db.Date` | null in A1 |
| `createdAt` | `DateTime @default(now())` | ordinamento/diagnostica |

**Enum DB** (nativi, come `Role`):
`BookingType { daily periodic subscription }`, `BookingStatus { confirmed cancelled }`,
`PaymentStatus { unpaid partial paid }`, `PaymentMethod { cash card transfer other }`.

**Relazioni inverse** da aggiungere ai model esistenti: `Establishment.bookings`,
`Customer.bookings`, `Umbrella.bookings`, `TimeSlot.bookings`, e il self-link
`previousBooking`/`renewals` su `Booking`.

**Indici:** `@@index([establishmentId])`, `@@index([umbrellaId])`,
`@@index([establishmentId, startDate, endDate])` (supporta la query del giorno e il controllo
disponibilità).

> **Nota su `packageId` (l'unica colonna rinviata).** Il data-model prevede `Booking.packageId`,
> ma `Package` **non esiste ancora** (arriva con A3). Aggiungerla ora significherebbe creare la
> tabella `Package` fuori scope. È l'**unico** campo differito: diventerà una FK **nullable
> additiva** quando `Package` atterra. Siamo **pre-release senza dati di produzione** (la storia
> migrazioni è già stata squashata in [ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)),
> quindi è una migrazione contenuta, non debito silenzioso. Tracciato qui e in §8.

**RLS:** nella migrazione, SQL grezzo identico al pattern di
[`20260630104422_init`](../../apps/api/prisma/migrations/20260630104422_init/migration.sql):

```sql
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Booking"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

Tutte le query passano da `PrismaService.forTenant(tenantId, …)`.

## 3. Disponibilità e invariante anti-overlap (il cuore)

**Unità di disponibilità:** `(Umbrella, data, TimeSlot)` ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)).

**Invariante (forma generale):** non esistono due `Booking` con `status=confirmed` che condividano
lo **stesso `umbrellaId`**, con **intervalli di date `[startDate, endDate]` intersecanti** **e**
**fasce sovrapposte**. Due fasce si sovrappongono se i loro intervalli orari **semiaperti**
`[startTime, endTime)` si intersecano (non basta l'uguaglianza dell'`id`: così una futura
"Giornata intera" che copre Mattina **e** Pomeriggio è gestita senza riscrittura). Per
`[start, end)` semiaperto, fasce **contigue** (Mattina 08–13 / Pomeriggio 13–19) **non**
collidono al bordo delle 13:00 ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)).

**Enforcement (A1):** controllo applicativo dentro la transazione `forTenant` prima della
`create`. Si caricano le `Booking` confermate dello stesso `umbrellaId` con date intersecanti, si
risolve l'intervallo orario della loro `TimeSlot` e di quella richiesta, e se due si sovrappongono
→ **`409 Conflict`** (`ConflictException`, messaggio IT). La giornaliera ha
`startDate == endDate == data`.

> **Decisione (chiusa):** enforcement **applicativo-in-transazione** in A1. La finestra di
> *race* fra due create concorrenti sullo stesso slot è accettata per il deploy interno
> mono-operatore; l'**exclusion constraint** Postgres (`btree_gist` su `umbrellaId` +
> `daterange` + range orario) è tracciato come hardening additivo in
> [D-030](../architecture/deferred.md).

## 4. Endpoint `bookings`

`BookingsModule` (controller + service) importato in `AppModule`. Tutti gli endpoint sono
protetti dalla `JwtAuthGuard` globale (no `@Public()`); il tenant arriva dal JWT
(`TenantContext.require()`), niente Bearer → **401**. Validazione via DTO `class-validator` +
`ValidationPipe` globale.

- **`POST /api/bookings`** — body `CreateBookingDto`: `customerId` (UUID), `umbrellaId` (UUID),
  `timeSlotId` (UUID), `date` (forma `/^\d{4}-\d{2}-\d{2}$/` **+ validità di calendario**: la
  regex da sola accetta `2026-13-40`, va respinta come **400**), `totalPrice` (number ≥ 0, max 2
  decimali, ≤ 99 999 999,99). Il service: forza `type=daily`, `status=confirmed`,
  `startDate=endDate=date`; verifica che customer/umbrella/timeSlot appartengano al tenant (RLS
  garantisce l'isolamento, ma una FK inesistente → **422**); applica l'invariante (§3) → 409;
  crea. Risposta `201` + `BookingDTO`.
- **`GET /api/bookings?date=YYYY-MM-DD`** — `BookingDTO[]` delle prenotazioni **confermate** del
  giorno (per il drawer e la verifica). `date` opzionale → **oggi in `Europe/Rome`**
  ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)), non UTC. Ordinate
  per `createdAt`.
- **`DELETE /api/bookings/:id`** — annulla (`status=cancelled`); idempotente sul già annullato;
  inesistente → 404. Risposta `200`/`204`. (Soft via stato, non hard-delete: conserva lo storico,
  coerente con [D-024](../architecture/deferred.md).)

Service sottile; proiezione `toDTO` pura (mappa `null → undefined`, `Decimal → number`,
`Date → 'YYYY-MM-DD'`), come `CustomersService`.

## 5. Proiezione mappa slot-aware

`projectDayMap` riceve in più le `Booking` confermate della data (aggiunte a `MapSource`).
`MapService.getDayMap` le carica nella stessa `forTenant` (confermate, con
`startDate <= date <= endDate`).

Derivazione per `(umbrella, slot)`: `stateBySlot[slot.id]` = stato della prenotazione confermata
la cui `TimeSlot` **si sovrappone** allo `slot` corrente (stesso criterio d'intervallo orario di
§3); altrimenti `'free'`. Mappatura `type → SlotState`:

| `BookingType` | `SlotState` | Slice |
|---|---|---|
| `daily` | `daily` | **A1** |
| `periodic` | `booked` | A4 |
| `subscription` | `season` | A4 |

In A1, con sole `daily`, la mappa mostra `free`/`daily`. La funzione resta **pura e
unit-testabile**; il commento "INCREMENT BOUNDARY" attuale va sostituito con la logica reale.

**Difensivo (caso "non deve accadere"):** l'invariante (§3) garantisce **una** sola confermata
per `(umbrella, fascia)`. Se per bug/race ne arrivassero due, la proiezione è deterministica —
prende la **prima per `createdAt`** — e il punto di lettura **logga l'anomalia** invece di
crashare. Il caricamento delle date intersecanti usa il confronto UTC su `@db.Date`
([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)): mai metodi locali.

## 6. Contratti (`@coralyn/contracts`) — additivi

Aggiunte (nessun rename/rimozione degli export esistenti):

```ts
export type BookingType = 'daily' | 'periodic' | 'subscription';
export type BookingStatus = 'confirmed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface BookingDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;            // ISO yyyy-mm-dd
  endDate: string;
  type: BookingType;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus; // A2: oggi sempre 'unpaid'
  amountCollected: number;      // A2: oggi 0
}

export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string;                 // ISO yyyy-mm-dd (giornaliera)
  totalPrice: number;
}
```

`SlotState` (già `free|season|daily|booked`) **invariato**.

## 7. Frontend (`apps/web-staff`) — collegamento `MapView`

Obiettivo FE minimo: **creare una giornaliera e vedere la mappa accendersi**, poi rileggerla e
annullarla. La pagina `BookingsView` resta mockata (A2).

- **Composable `useBookings.ts`** (TanStack, pattern di `useCustomers`): `useDayBookings(date)`
  (query, `queryKey` tenant+date), `useCreateBooking()` e `useCancelBooking()` (mutation che
  invalidano `dayMap` **e** `bookings` del giorno).
- **Modale "Nuova prenotazione"** ([MapView.vue:180](../../apps/web-staff/src/features/map/MapView.vue)):
  - **Cliente**: ricerca/selezione fra i `Customer` reali (riusa la query clienti). Se la lista è
    **vuota / nessun risultato**, mostra un percorso per **creare il cliente** (link a `/customers`).
  - **Fascia**: opzioni da `map.timeSlots` **reali** (non più hardcoded `Giornata/Mattina/Pomeriggio`).
    **Pre-seleziona la fascia libera** dell'ombrellone e **disabilita** quelle già occupate, così
    l'utente non sceglie una fascia che darebbe 409 garantito.
  - **Prezzo**: input numerico (digitato a mano).
  - **Data**: `session.activeDate`, **inviata sempre esplicita**
    ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)).
  - Il selettore **Pacchetto** è **rimosso/nascosto** in A1 (nessun `Package` finché A3).
  - "Conferma" → `useCreateBooking`; errore 409 → messaggio "fascia non disponibile".
- **Drawer ombrellone**: sostituire il `booking` mockato
  ([MapView.vue:54-58](../../apps/web-staff/src/features/map/MapView.vue)) con il dato reale
  ricavato da `useDayBookings` filtrato per `umbrellaId` + fascia selezionata (mostra cliente,
  fascia, prezzo, stato). Il dettaglio è **per-fascia**: un ombrellone con mattina occupata e
  pomeriggio libero mostra la prenotazione solo sulla fascia pertinente. "Annulla prenotazione" →
  `useCancelBooking`.
- **MSW**: handler `/api/bookings` **solo nei test** (`mocks/server.ts`); in dev il worker fa
  bypass sul backend reale. `mapSeed` resta ma le prenotazioni non sono più mock nel drawer.

## 8. Seed, test e2e, unit

- **Seed**: invariato (nessuna `Booking`; la mappa demo nasce libera). Gli e2e creano i propri dati.
- **api e2e** (`coralyn_test`, isolamento a 2 tenant, helper esistenti `seed-map`/`seed-auth`):
  - `POST /bookings` senza Bearer → 401.
  - create giornaliera valida → 201; `GET /bookings?date` la ritorna; `GET /map?date` mostra
    l'ombrellone `daily` su quella fascia, `free` sull'altra.
  - **anti-overlap**: seconda create su stesso umbrella+data+fascia → **409**; fascia diversa →
    201 (mattina e pomeriggio non collidono).
  - **isolamento**: tenant s2 non vede le prenotazioni di s1; create di s2 su un `umbrellaId` di
    s1 → fallisce (FK fuori tenant).
  - `DELETE /bookings/:id` → la mappa torna `free`; ri-create sullo stesso slot dopo l'annullo → 201
    (una `cancelled` non blocca).
  - **validazione**: `date` calendariale impossibile (`2026-13-40`) → 400; `totalPrice` negativo → 400.
  - **superuser** (JWT con `establishmentId` null) su `POST /bookings` → respinto **400**
    (`TenantContext.require()` → "Tenant non risolto"), non crea.
  - Applicare le migrazioni a `coralyn_test` (`migrate deploy` o `migrate reset --skip-seed`).
- **api unit**: `projectDayMap` puro — nessuna prenotazione ⇒ tutto `free`; una `daily` ⇒ `daily`
  sulla fascia sovrapposta e `free` sulle altre; chiavi `stateBySlot` = id delle fasce ritornate;
  **due confermate sullo stesso slot** ⇒ stato deterministico (prima per `createdAt`).
  Unit dell'invariante: sovrapposizione fasce per intervallo orario; fasce **contigue** al bordo
  (13:00) **non** collidono; intervalli di date intersecanti. Unit della utility data: "oggi" in
  `Europe/Rome` a cavallo della mezzanotte (no off-by-one); round-trip `@db.Date` in UTC.

## 9. Verifica / DoD

- Migrazione `bookings` crea tabella + enum + RLS; `prisma generate` prima di `nest build`.
- Test verdi (target da **non** regredire): ui-kit 14 · web-staff (≥40, +nuovi) · api unit (≥9,
  +proiezione/invariante) · api e2e (≥22, +bookings).
- `pnpm -r build` + `eslint .` verdi. Docker `--profile full up -d --build`: create via `:8080`
  con Bearer → mappa accesa; no-Bearer → 401.
- FE: dev worker sul backend reale; `MapView.spec` aggiornata verde; `typecheck` OK; pulizia
  `apps/web-staff/node_modules/.vite` dopo il cambio contratti.
- Doc: aggiornare `README.md` (stato) e `data-model.md` (`Booking` ora **implementata**, nota
  `packageId` differita); allineare il `resolveDate` della mappa ad [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md);
  handoff successivo. Già fatti in questo spec: [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md),
  voci deferred [D-030](../architecture/deferred.md)/[D-031](../architecture/deferred.md).
  Glossario: già copre Booking/Prenotazione.

## 10. Casi limite e regole d'integrità

Regole rese esplicite per non lasciarle all'improvvisazione (riepilogo dei punti emersi in
revisione; i test relativi sono in §8).

- **Fuso/date** ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)): "oggi"
  in `Europe/Rome`, non UTC; round-trip `@db.Date`/`@db.Time` in UTC; il FE invia `activeDate`
  esplicita. Evita l'off-by-one a mezzanotte (oggi presente nel `resolveDate` della mappa).
- **Validazione `date`**: forma `YYYY-MM-DD` **+** validità calendariale reale (no `2026-13-40`).
- **`totalPrice`**: `Decimal(10,2)`, ≥ 0, max 2 decimali, ≤ 99 999 999,99.
- **FK fuori tenant**: customer/umbrella/timeSlot inesistenti nel tenant → 422 (RLS non li trova).
- **Superuser** (`establishmentId` null nel JWT): respinto sugli endpoint tenant-scoped (**400**,
  `TenantContext.require()` → "Tenant non risolto"), mai create con tenant nullo.
- **Solo create + cancel in A1** (niente PATCH): per correggere cliente/fascia/prezzo si **annulla
  e si ricrea**. La modifica in-place è additiva, rinviata ad A2.
- **Anti-overlap = unica guardia**; doppio-click sullo stesso slot → la seconda create va in 409
  (idempotenza di fatto). Due confermate sullo stesso slot "non devono accadere": proiezione
  difensiva deterministica + log (§5).
- **Fasce semiaperte** `[start, end)`: contigue non collidono; fascia con `end < start`
  (oltre mezzanotte) **non supportata** in A1.
- **Prenotazione `unpaid` occupa comunque lo slot**: lo stato mappa dipende da `type`/`status`,
  non dal pagamento (semantica confermata; l'incasso è A2).

### Adiacenti — tracciati, fuori A1

- **Mutazione mappa con prenotazioni esistenti** (sposto un `Umbrella`, cambio gli orari di una
  `TimeSlot`): impatta retroattivamente le sovrapposizioni. Da affrontare col CRUD mappa (opzione B).
- **Audit** (chi crea/annulla): non tracciato in A1 ([D-016](../architecture/deferred.md)/ADR-0015).
- **Catena rinnovo** (annullare una `Booking` che è `previousBookingId` di un'altra): con A4.
- **Tenant vuoto** (senza fasce/ombrelloni): mappa vuota, create impossibile — atteso.
- **Walk-in "Presenza" / "Sposta prenotazione"**: bottoni mock nel drawer, non modellati.

## 11. Decisioni chiuse

1. **Enforcement anti-overlap**: applicativo-in-transazione in A1; exclusion constraint Postgres
   tracciato in [D-030](../architecture/deferred.md). (§3)
2. **`status` = `confirmed|cancelled`**; `draft` (la "Bozza" della `BookingsView` mock) rinviato ad A2.
3. **Scope FE**: solo la `MapView` in A1; `BookingsView` resta mockata fino ad A2.
4. **Fuso/date**: promosso ad [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
   (fuso `Europe/Rome` fisso, per-tenant in [D-031](../architecture/deferred.md)).
