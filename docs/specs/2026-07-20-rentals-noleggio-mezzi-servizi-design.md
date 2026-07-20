# Noleggio mezzi/servizi — catalogo articoli + tariffe stagionali + banco noleggi (`RentalItem`/`RentalTariff`/`Rental`) — Design Spec

- **Data:** 2026-07-20
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-20. **Da pianificare ed
  eseguire** (ADR-0009).
- **Origine:** feature **core** nuova. Il lido noleggia mezzi/servizi (pedalò, canoe, SUP, babysitting…) a tempo, spesso a
  un cliente al banco, in modo indipendente dall'ombrellone. Oggi il dominio non ha alcun concetto di noleggio: `Package` +
  `EquipmentType` modellano la dotazione **inclusa** in una prenotazione (non venduta a parte, non prezzata per voce,
  ADR-0036), e il motore `Rate` prezza gli **ombrelloni** su dimensioni (tipo/settore/fila/pacchetto/fascia/periodo) che non
  si applicano a un pedalò. Il noleggio è un **bounded context distinto**.
- **Confine con D-012:** D-012 (cabine/servizi accessori come **risorse prenotabili**, stesso pattern dell'Ombrellone) resta
  deferred e distinto: la cabina è una risorsa **prenotabile in anticipo** con occupazione anti-overlap; il noleggio è un
  evento **al banco, ora**, con disponibilità solo informativa. Nessuna sovrapposizione di modello.
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio prenotazioni/
  pricing — il noleggio è **fuori** da questo asse), [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)
  (incasso base derivato server-side — **riusato** tale e quale), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
  (fuso Roma/date operative), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (motore Rate — **non**
  toccato), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow). **Nuovo ADR-0050** (§9).
- **Convenzione:** codice/DB in inglese ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)); UI/doc in
  italiano. Money `Decimal(10,2)`, confronti in centesimi interi (come `resolvePayment`). RLS FORCE tenant-scoped su ogni
  nuova tabella. **Baseline test da NON regredire** (da riverificare live all'avvio dello slice, `main`): api unit/e2e,
  web-staff, ui-kit — conteggi da rilevare al momento (lo schema è evoluto molto oltre il README).
- **Richiede una migrazione** (solo additiva: 3 nuove tabelle + RLS; nessun dato preesistente da convertire).

---

## 1. Situazione attuale (verificata leggendo il codice)

- **Schema** ([`schema.prisma`](../../apps/api/prisma/schema.prisma)): nessun concetto di noleggio. `Season` (non
  sovrapposte per tenant — invariante), `Pricing(seasonId @unique)` → `Rate` (umbrella-centrico). Campi incasso su `Booking`:
  `paymentStatus`/`amountCollected`/`paymentMethod`/`collectionDate`; enum `PaymentStatus`/`PaymentMethod` **riusabili**.
- **Season resolver riusabile**: `CatalogService.resolveSeasonWithin(tx, dateISO)` → `{ ok, id, startDate, endDate }`; le
  prenotazioni lanciano `422 "Nessuna stagione attiva per questa data"` quando `ok=false`
  ([`bookings.service.ts:235`](../../apps/api/src/bookings/bookings.service.ts)). **Riuso questo** al checkout.
- **Incasso puro riusabile**: `resolvePayment(input, totalPrice, today)`
  ([`booking.payment.ts`](../../apps/api/src/bookings/booking.payment.ts)) — deriva `paymentStatus` da
  `amountCollected` vs `totalPrice`, confronto in centesimi, `OVER_TOTAL`/`METHOD_REQUIRED`. **Riuso tale e quale**.
- **Pattern catalogo/archiviazione** ([`equipment-types.controller.ts`](../../apps/api/src/catalog/equipment-types.controller.ts),
  `catalog.service.ts` §createEquipmentType/archive/delete): controller sottile → service `forTenant(tenantId, tx => …)` (RLS),
  projection pura, `archivedAt` soft-delete, hard-delete guardato (409 se non archiviato o referenziato), unicità nome
  case-insensitive con `@@unique` DB come rete.
- **RLS in migration** ([migration equipment](../../apps/api/prisma/migrations/20260703081533_add_equipment_type_and_package_equipment/migration.sql)):
  ogni tabella tenant → `ENABLE` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation USING/WITH CHECK
  (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")`. Prisma non la genera: va scritta a mano.
- **Time/date** ([`common/dates.ts`](../../apps/api/src/common/dates.ts), [`common/time.ts`](../../apps/api/src/common/time.ts)):
  `todayInRome()` → data ISO Roma; `@db.Date` per le date operative; `createdAt @default(now())` = istante timestamptz.

## 2. Obiettivo e principio (deciso)

Modellare il noleggio come **bounded context dedicato** con tre entità tenant-scoped: catalogo **`RentalItem`** (cosa si
noleggia), **`RentalTariff`** (opzioni di prezzo **per Stagione**), **`Rental`** (la transazione al banco). Il noleggio ha
un **modello di tempo reale** (uscita/rientro) e **tariffe proprie**, separate dal motore `Rate`. Disponibilità **opzionale
e informativa** (mai un blocco). Incasso **riusa** l'infrastruttura ADR-0011. Cliente **opzionale**.

**Decisioni risolte in brainstorming** (dettaglio in §8):
1. **Disponibilità opzionale/informativa** — `stock` nullable; nessun vincolo DB, nessun blocco al sovra-noleggio.
2. **Tempo reale uscita/rientro** — `startAt` (istante, di norma "ora") + `returnedAt` nullable; **non** si riusa `TimeSlot`.
3. **Tariffe proprie sull'articolo** — non si estende il motore `Rate`.
4. **Tariffe season-scoped** — la riga tariffa porta `seasonId` (coerenza col resto del listino, storicizzazione, zero
   debito), **senza** replicare il wrapper `Pricing`/catch-all né le dimensioni di `Rate` (sarebbe over-engineering).
5. **Cliente opzionale** — `customerId` nullable.
6. **Tariffa = opzione a prezzo fisso** (non contatore al minuto): `totalPrice = tariff.price × units`, snapshot al checkout.
7. **Stato derivato dai timestamp** — nessun enum di stato ridondante.

## 3. Modello dati (schema + migrazione additiva)

### 3.1 Schema ([`schema.prisma`](../../apps/api/prisma/schema.prisma))

```prisma
model RentalItem {
  id              String         @id @default(uuid()) @db.Uuid
  establishmentId String         @db.Uuid
  name            String
  stock           Int?           // null = scorta non tracciata; N = capacità (solo informativa)
  archivedAt      DateTime?
  establishment   Establishment  @relation(fields: [establishmentId], references: [id])
  tariffs         RentalTariff[]
  rentals         Rental[]

  @@unique([establishmentId, name])   // identità dell'articolo nel catalogo (trim + case-insensitive lato service)
  @@index([establishmentId])
}

model RentalTariff {
  id              String       @id @default(uuid()) @db.Uuid
  establishmentId String       @db.Uuid
  rentalItemId    String       @db.Uuid
  seasonId        String       @db.Uuid   // IMMUTABILE dopo la creazione (l'update tocca solo label/price/duration/sortOrder)
  label           String                  // libera, es. "30 min", "1 ora", "Mezza giornata"
  price           Decimal      @db.Decimal(10, 2)
  durationMinutes Int?                     // opzionale, per l'"uscita prevista" informativa; non ricalcola il prezzo
  sortOrder       Int
  archivedAt      DateTime?
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  rentalItem      RentalItem    @relation(fields: [rentalItemId], references: [id], onDelete: Cascade)
  season          Season        @relation(fields: [seasonId], references: [id])
  rentals         Rental[]

  @@index([establishmentId])
  @@index([rentalItemId, seasonId])
}

model Rental {
  id              String         @id @default(uuid()) @db.Uuid
  establishmentId String         @db.Uuid
  rentalItemId    String         @db.Uuid
  rentalTariffId  String         @db.Uuid
  customerId      String?        @db.Uuid   // opzionale: walk-up anonimo o cliente in anagrafica
  units           Int            @default(1) // n. di unità fisiche noleggiate in questa transazione (asse scorta)
  startAt         DateTime       @default(now())
  returnedAt      DateTime?                   // null = ancora fuori (attivo). Idempotente al rientro.
  cancelledAt     DateTime?                   // void soft (errore operatore). Stato: cancelled > returned > active.
  totalPrice      Decimal        @db.Decimal(10, 2) // snapshot = tariff.price × units
  // Incasso base (ADR-0011): identico a Booking.
  paymentStatus   PaymentStatus  @default(unpaid)
  amountCollected Decimal        @default(0) @db.Decimal(10, 2)
  paymentMethod   PaymentMethod?
  collectionDate  DateTime?      @db.Date
  createdAt       DateTime       @default(now())

  establishment   Establishment  @relation(fields: [establishmentId], references: [id])
  rentalItem      RentalItem     @relation(fields: [rentalItemId], references: [id], onDelete: Restrict)
  rentalTariff    RentalTariff   @relation(fields: [rentalTariffId], references: [id], onDelete: Restrict)
  customer        Customer?      @relation(fields: [customerId], references: [id])

  @@index([establishmentId])
  @@index([rentalItemId])
  @@index([establishmentId, startAt])
}
```

Relazioni inverse su `Establishment` (`rentalItems`/`rentalTariffs`/`rentals`), `Season` (`rentalTariffs`), `Customer`
(`rentals`). **`onDelete`**: `RentalTariff→rentalItem` = **Cascade** (eliminare un articolo rimuove le sue tariffe);
`Rental→rentalItem` e `Rental→rentalTariff` = **Restrict** (una tariffa/articolo referenziato da noleggi non è
hard-deletabile → coerente con l'archiviazione). `units ≥ 1`, `stock ≥ 0`, `durationMinutes ≥ 1` enforced applicativo (DTO),
non CHECK DB (stile del progetto; il CHECK anti-overlap resta D-030).

### 3.2 Migrazione (additiva, no data-copy)

Una sola migration `add_rentals`:
1. `CREATE TABLE "RentalItem" | "RentalTariff" | "Rental"` (con FK, unique, index come sopra).
2. Per **ognuna** delle 3 tabelle: `ENABLE` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation` (USING + WITH
   CHECK su `app.current_tenant`), rispecchiando esattamente la migration equipment. **Nessun** data-copy (feature nuova).

Applicare a `coralyn_dev` e `coralyn_test`; `prisma migrate status` pulito su entrambi. Aggiornare **`seed.ts`** (2–3
`RentalItem` demo con `stock` misto null/valorizzato + 2–3 `RentalTariff` sulla stagione demo) e, se serve, i seed di test.

## 4. Backend — nuovo modulo `rentals` (mirror di `catalog`/`bookings`)

### 4.1 Contratti ([`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts))

- `RentalItemDTO { id; name; stock: number | null; archived?: true }`.
- `RentalTariffDTO { id; rentalItemId; seasonId; label; price: number; durationMinutes: number | null; archived?: true }`.
- `RentalDTO { id; rentalItemId; rentalItemName; rentalTariffId; tariffLabel; customerId: string | null; customerName?:
  string; units; startAt; returnedAt: string | null; status: 'active' | 'returned' | 'cancelled'; totalPrice; paymentStatus;
  amountCollected; paymentMethod?; collectionDate? }` (`status`/nomi **derivati/risolti** dalla projection: nessun secondo
  fetch lato FE). `RentalAvailabilityDTO { rentalItemId; stock: number | null; out: number; available: number | null }`
  (`available = stock==null ? null : max(0, stock − out)`).
- Input: `CreateRentalItemInput { name; stock?: number | null }`; `UpdateRentalItemInput = Partial<…>`;
  `CreateRentalTariffInput { label; price; durationMinutes?: number | null; sortOrder? }` (il `rentalItemId` è nel path, la
  stagione è **quella attiva** o esplicita — vedi §4.3); `UpdateRentalTariffInput` (**no** `seasonId`, immutabile);
  `CheckoutRentalInput { rentalItemId; rentalTariffId; customerId?: string | null; units?: number }`. Incasso: **riusa**
  `SettlePaymentInput`.

### 4.2 Catalogo `RentalItem` (`rental-items.controller.ts` — mirror `equipment-types.controller.ts`)

- `GET /rental-items?includeArchived=true` (default solo attivi) → include `availability` corrente per articolo (§6).
- `POST /rental-items` `{ name, stock? }` → 201; nome trim + unicità per tenant (409 su duplicato).
- `PATCH /rental-items/:id` `{ name?, stock? }` (stessa validazione unicità; `stock` nullable).
- `POST /rental-items/:id/archive` | `/restore` → 201 (soft `archivedAt`).
- `DELETE /rental-items/:id` → 200 **solo se archiviato + 0 noleggi riferiti** (`Rental`), altrimenti 409. Le tariffe seguono
  in cascade solo all'hard-delete dell'articolo (che è già bloccato se ci sono noleggi).

### 4.3 Tariffe `RentalTariff` (`rental-tariffs.controller.ts`, nested per articolo)

- `GET /rental-items/:itemId/tariffs?seasonId=&includeArchived=` → default: stagione **attiva** (`resolveSeasonWithin(today)`)
  o `seasonId` esplicito; solo attive salvo flag.
- `POST /rental-items/:itemId/tariffs` `{ label, price, durationMinutes?, sortOrder? }` → 201; `seasonId` = stagione attiva
  (o esplicita via query/body) — validata esistente nel tenant (422 se assente). **Nessuna unicità** su `label` (è un'etichetta
  libera; `sortOrder` ordina — scelta §8.9).
- `PATCH /rental-tariffs/:id` `{ label?, price?, durationMinutes?, sortOrder? }` → **non** modifica `seasonId` né
  `rentalItemId` (immutabili). Edit del prezzo **non** ritocca i `Rental` esistenti (snapshot).
- `POST /rental-tariffs/:id/archive` | `/restore`; `DELETE /rental-tariffs/:id` → 200 solo se archiviata + 0 noleggi
  riferiti, altrimenti 409.

### 4.4 Banco — transazione `Rental` (`rentals.controller.ts` — mirror flusso `bookings`)

- `POST /rentals` (**uscita/checkout**) `CheckoutRentalInput` → 201. Validazione di dominio:
  - `today = todayInRome()`; `season = resolveSeasonWithin(tx, today)` → **422 "Nessuna stagione attiva per questa data"** se
    `ok=false` (riuso identico a bookings).
  - `rentalTariffId` esiste nel tenant, **non archiviato**, appartiene a `rentalItemId`, ed è della **stagione risolta** →
    altrimenti 422 "Tariffa non valida per l'articolo/stagione".
  - `units` intero ≥ 1 (default 1) → altrimenti 422; `customerId`, se presente, esiste nel tenant (RLS) → altrimenti 422.
  - Scrittura: `startAt = now()`, `totalPrice = tariff.price × units` (snapshot), incasso a `unpaid`. **Nessun** controllo
    scorta bloccante (disponibilità informativa). Ritorna `RentalDTO`.
- `PATCH /rentals/:id/return` (**rientro**) → setta `returnedAt = now()` se attivo; **idempotente** se già rientrato
  (no-op, mantiene il primo `returnedAt`); **409** se `cancelled`. Libera la scorta informativa.
- `PATCH /rentals/:id/cancel` (**annullo/void**) → setta `cancelledAt = now()`; **409 se `amountCollected > 0`**
  ("Storna l'incasso prima di annullare il noleggio" — il reset incasso passa da `/payment`; il rimborso ricco è **D-009**);
  idempotente se già annullato.
- `PATCH /rentals/:id/payment` `SettlePaymentInput` → **riusa `resolvePayment(input, rental.totalPrice, today)`**; mappa
  `OVER_TOTAL`→422, `METHOD_REQUIRED`→422 (come bookings). **409 se `cancelled`** (non si incassa su un noleggio annullato).
  Consentito su attivo **e** su rientrato (paga-al-rientro è un flusso principale).
- `GET /rentals?date=` → elenco dei noleggi con `startAt` nel giorno (data Roma), stato/nomi risolti, + blocco
  `availability` per articolo attivo. `date` default = oggi.

### 4.5 Projection pure (`rental-item.projection.ts`, `rental-tariff.projection.ts`, `rental.projection.ts`)

- `toRentalItemDTO(row)`: `{ id, name, stock, ...(archivedAt ? { archived: true } : {}) }`.
- `toRentalTariffDTO(row)`: `{ id, rentalItemId, seasonId, label, price: Number, durationMinutes, ...(archived) }`.
- `toRentalDTO(row)`: risolve `status` (cancelled>returned>active dai timestamp), `rentalItemName`, `tariffLabel`,
  `customerName?`, serializza `Decimal→number`, `startAt/returnedAt→ISO`. **Pura**, testata a parte.
- `computeAvailability(item, activeRentals)`: `out = Σ units (attivi)`; `available = stock==null ? null : max(0, stock − out)`.

## 5. Frontend — nuova feature `rentals` ([`apps/web-staff/src/features/rentals/`](../../apps/web-staff/src/features/))

- **Vista "Banco noleggi"** (`RentalsView.vue`): tabella dei noleggi del giorno con stato (Attivo/Rientrato/Annullato),
  disponibilità live per articolo, e azioni: **Nuovo noleggio** (modale: articolo → tariffa della stagione attiva → cliente
  opzionale con la rubrica esistente → unità → prezzo in **sola lettura** = anteprima `tariff.price × units` dal DTO tariffa,
  **senza** endpoint di quote; il server resta autoritativo con lo snapshot al checkout), **Registra
  rientro**, **Registra incasso** (riusa il pattern incasso di `BookingsView`), **Annulla**.
- **Configurazione catalogo & tariffe** (`RentalCatalogView.vue` o sezione, mirror UX `PricingView`): griglia CRUD articoli
  (nome, scorta opzionale) + "Archiviati (N)" a scomparsa; per ogni articolo, editor tariffe **della stagione selezionata**
  (label/prezzo/durata opzionale/ordine) con archivia/ripristina/elimina + `ConfirmDialog`.
- Query/mutation Vue Query (`useRentalItems`/`useRentalTariffs`/`useRentals` + mutation) e mock MSW in
  [`mocks/server.ts`](../../apps/web-staff/src/mocks/server.ts). Nuova voce di **navigazione** ("Noleggi") nell'app-shell.

## 6. Disponibilità (opzionale, informativa) — comportamento ai bordi

- `stock = null` → UI mostra "—" (non tracciata); `available = null`.
- `available = max(0, stock − out)`; se `out > stock` → mostra `0` con hint "oltre scorta (+K)" — **mai** blocca il checkout.
- "Attivo adesso" = `cancelledAt IS NULL AND returnedAt IS NULL` (nessun noleggio è mai futuro: `startAt = now` al checkout).
- Nessuna unità fisica numerata (pedalò #1…#5): un conteggio basta per l'informativa (YAGNI → **D-052**, §10).

## 7. Piano di test (TDD)

- **Unit (BE puri)**: `toRentalItemDTO`/`toRentalTariffDTO` (archived omesso quando attivo; `stock` null passa); `toRentalDTO`
  (status derivato cancelled>returned>active; nomi risolti; Decimal→number); `computeAvailability` (stock null→null, out>stock
  clamp a 0, somma units solo attivi); riuso `resolvePayment` (già coperto — verificare mapping errori nel controller rentals).
- **e2e** (nuovi spec, mirror `packages`/`bookings`):
  - `rental-items.e2e-spec.ts`: CRUD + `includeArchived`; archive/restore; DELETE 200 (archiviato+0 noleggi) / 409
    (referenziato o non archiviato); unicità nome 409; isolamento tenant.
  - `rental-tariffs.e2e-spec.ts`: create sotto stagione attiva/esplicita (422 se stagione assente); `seasonId` immutabile in
    PATCH; archive/restore/delete guardato; isolamento tenant.
  - `rentals.e2e-spec.ts`: checkout ok (201, prezzo = price×units, snapshot); 422 se nessuna stagione / tariffa
    archiviata/di altra stagione/di altro articolo / units<1 / cliente cross-tenant; **return** (setta returnedAt, idempotente,
    409 se cancelled); **cancel** (void, 409 se amountCollected>0, idempotente); **payment** (riuso resolvePayment, 422
    OVER_TOTAL/METHOD_REQUIRED, 409 se cancelled, consentito su returned); `GET ?date=` (filtra per giorno Roma + availability).
- **web-staff**: catalogo articoli (crea/rinomina/scorta/archivia/ripristina/elimina con ConfirmDialog) + editor tariffe per
  stagione + banco (nuovo noleggio con prezzo read-only, rientro, incasso, annulla) + disponibilità live. MSW aggiornato.
- **Baseline**: rilevare i conteggi live su `main` all'avvio; attesi solo incrementi additivi; typecheck pulito.

## 8. Decisioni (risolte in brainstorming 2026-07-20) + revisione avversariale (casi limite)

1. **Disponibilità opzionale/informativa** (utente): `stock` nullable, nessun vincolo/blocco. *Edge*: `out>stock` → clamp 0 +
   hint; mai errore.
2. **Tempo reale uscita/rientro** (utente): `startAt`+`returnedAt`; **non** si riusa `TimeSlot` (fascia grossa umbrella-centrica).
   *Edge*: `returnedAt<startAt` impossibile (rientro = now ≥ startAt).
3. **Tariffe proprie** (utente): non si estende `Rate` (dimensioni incompatibili col noleggio).
4. **Season-scoped** (delegato → scelta professionale): coerenza col listino, storicizzazione, zero debito di migrazione
   futura; **minimale** (`seasonId` sulla riga, no wrapper `Pricing`/catch-all → no over-engineering). *Edge*: stagioni non
   sovrapposte (invariante) → nessuna ambiguità di risoluzione; nessuna stagione oggi → 422 (riuso bookings); articolo senza
   tariffa nella stagione → non noleggiabile finché non se ne crea una.
5. **Cliente opzionale** (utente): `customerId` nullable. *Edge*: cliente anonimizzato (GDPR) mantiene il link storico.
6. **Tariffa = prezzo fisso** (revisione): `totalPrice = price × units`, snapshot; `returnedAt` serve a disponibilità/storia,
   **non** ricalcola. Evita il debito degli arrotondamenti al minuto; rispecchia il banco reale. *Edge dichiarato —
   overtime*: se il cliente resta oltre la durata della tariffa, l'MVP **non** riconteggia (l'operatore sceglie una tariffa
   adeguata o registra un secondo noleggio); overtime automatico = **D-053** (§10).
7. **Stato derivato dai timestamp** (revisione): `cancelled > returned > active`; niente enum ridondante (single source of
   truth, stile repo). 
8. **`units` = conteggio fisico, non unità di tempo** (revisione — edge scovato): separa l'asse scorta dall'asse durata (che
   vive nella tariffa scelta). Un `Rental` = una transazione = **un** incasso (rispecchia `Booking`: un pagamento per
   transazione). *Edge dichiarato — rientro parziale*: il rientro è **tutto-o-niente** sul noleggio; per restituire una parte
   di un gruppo, l'operatore annulla+ri-noleggia. Rientro/gestione per-unità sfalsata = **D-052** (§10).
9. **Etichetta tariffa libera, non unica** (revisione): `label` è descrittiva, ordinata da `sortOrder`; niente `@@unique`
   parziale (eviterebbe un indice raw partial-unique = debito sproporzionato). Doppioni = responsabilità operatore, non
   integrità dati. L'**identità** unica resta il nome dell'`RentalItem`.
10. **Cancel guardato dall'incasso** (revisione): 409 se `amountCollected>0`; lo storno passa dal reset incasso; rimborso
    ricco = **D-009** (Cassa). Nessun campo `refundedAmount` sul noleggio (no over-engineering). Payment/return coerenti con lo
    stato (`cancelled` → 409 su payment/return).
11. **`seasonId`/`rentalItemId` immutabili sulla tariffa** (revisione): l'update tocca solo label/price/duration/sortOrder →
    protegge lo snapshot e l'identità stagione.

## 9. ADR-0050 (nuovo)

Creare [`docs/architecture/decisions/0050-noleggio-mezzi-servizi.md`](../architecture/decisions/0050-noleggio-mezzi-servizi.md):
formalizza il **noleggio come bounded context** (catalogo `RentalItem` + tariffe **season-scoped** `RentalTariff` +
transazione `Rental` a tempo reale), distinto dal dominio prenotazioni/pricing (ADR-0006/0032) e dalla dotazione inclusa
(ADR-0036); **riuso** dell'incasso base (ADR-0011) e del fuso Roma (ADR-0031); disponibilità **informativa** (no vincolo);
tariffa a **prezzo fisso** snapshot; stato **derivato dai timestamp**; confine esplicito con **D-012** (risorsa prenotabile).
Aggiorna il **glossario** con `RentalItem`/`RentalTariff`/`Rental` e i termini IT (Articolo noleggiabile/Tariffa di
noleggio/Noleggio).

## 10. Fuori scope (YAGNI) → nuovi deferred

- **D-052** — Unità fisiche numerate + rientro parziale/sfalsato di un gruppo (oggi: conteggio + rientro tutto-o-niente).
- **D-053** — Overtime automatico / billing a durata reale (oggi: tariffe a prezzo fisso a scaglioni).
- **Reports** — Ricavi noleggio nei report ([`reports` module](../../apps/api/src/reports/)): **slice separata successiva**,
  non nel core. (Il join stagione passa da `Rental → RentalTariff.seasonId`, nessuna denormalizzazione.)
- **Copia tariffe da stagione precedente** (nicety di configurazione) → deferred se richiesto.
- **Prenotazione anticipata di un noleggio** → è D-012 (risorsa prenotabile), fuori da questo bounded context.

## 11. Scope, branch, logistica

- **Slice unico**, **nuovo branch da `main`** (ADR-0009). Nessuna regressione dei conteggi (rilevati live).
- **Layer previsti (un commit per layer):** (1) schema + migration additiva + RLS + seed; (2) catalogo BE `RentalItem`
  (contratti, CRUD, archivio, projection, e2e); (3) tariffe BE `RentalTariff` (contratti, CRUD season-scoped, projection, e2e);
  (4) banco BE `Rental` (checkout/return/cancel/payment/availability, riuso resolveSeasonWithin+resolvePayment, projection,
  e2e); (5) FE catalogo & tariffe; (6) FE banco noleggi + navigazione; (7) glossario + ADR-0050 + deferred D-052/D-053.
- **Workflow ADR-0009:** questa spec → (approvazione utente) → piano TDD (`writing-plans`) → esecuzione subagent-driven,
  test-first, un commit per layer.
