# Editor CRUD del listino (D-032) — Design Spec

- **Data:** 2026-07-01
- **Stato:** Approvato (design). **Esecuzione delegata alla sessione successiva** — vedi handoff
  [2026-07-01-pricing-editor-delegation.md](../handoff/2026-07-01-pricing-editor-delegation.md).
- **Decisione rimandata di riferimento:** [D-032](../architecture/deferred.md) ("Editor CRUD del
  listino — `Season`/`Pricing`/`Rate`/`Package` via form per l'admin").
- **ADR di riferimento:** [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md)
  (motore di prezzo, precedenza dimensioni), [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)
  (componenti FE condivisi — questo editor li riusa), [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)
  (setup strutturato, "gemello" per convenzione citata da D-032), [ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md).
- **Convenzione:** codice/DB inglese; UI/doc italiano. **Nessun nuovo ADR richiesto** — D-032 è
  un incremento CRUD che applica pattern già decisi (CRUD tenant-scoped come `Customers`,
  motore prezzo già specificato da ADR-0032), non introduce nuova architettura.
- **Prossimo ADR libero (se dovesse servire in corso d'opera): 0034.**

---

## 1. Situazione attuale (verificata leggendo il codice, non assunta)

- **Modelli Prisma già esistenti** (`apps/api/prisma/schema.prisma`): `Season` (nome + date
  stagione), `Pricing` (wrapper 1:1 con `Season`, `@@unique([seasonId])`, **nessun campo
  proprio** oltre le relazioni), `Rate` (dimensioni **tutte nullable**: `type`, `sectorId`,
  `rowId`, `packageId`, `timeSlotId`, `periodStart`/`periodEnd`, più `price Decimal(10,2)` e
  `unit RateUnit`), `Package` (`name`, `equipment Json`). Tutti con RLS (`establishmentId`).
- **⚠️ Gap critico:** ADR-0032 prescrive un vincolo di **non-ambiguità** sulle combinazioni di
  dimensioni di `Rate` (`@@unique` su tutte le colonne dimensione con semantica *NULLS NOT
  DISTINCT*, Postgres 16+) — **il vincolo non è presente nello schema attuale**. Il motore
  prezzo (`pricing.engine.ts`) assume implicitamente che non esistano due `Rate` con la stessa
  combinazione esatta di dimensioni (altrimenti `compareSpecificity` potrebbe restituire un
  pareggio non gestito). **Questo editor introduce per la prima volta una via applicativa per
  scrivere `Rate`**: senza il vincolo DB, un bug applicativo potrebbe creare ambiguità silenziose.
  **Task 0 di questo lavoro: aggiungere la migrazione con l'`@@unique` mancante**, prima di
  qualunque endpoint di scrittura.
- **Motore prezzo** (`apps/api/src/catalog/pricing.engine.ts`): puro, testato, **non va
  toccato**. Precedenza (dalla più specifica): `periodStart` → `rowId` → `sectorId` →
  `packageId` → `timeSlotId` → `type`. `unit: 'day'` moltiplica per giorni inclusivi;
  `unit: 'period'` è forfait. Arrotondamento a 2 decimali.
- **Endpoint oggi:** `GET /api/packages` (sola lettura, `PackagesController`). **Nessun
  endpoint di scrittura** per `Season`/`Pricing`/`Rate`/`Package`.
- **`CatalogModule`** è raggiungibile solo **transitivamente** (importato da `BookingsModule`,
  non elencato in `AppModule.imports`). Funziona (verificato: `GET /api/packages` risponde
  200), ma non è esplicito. Poiché questo lavoro aggiunge controller nuovi allo stesso modulo,
  **aggiungere `CatalogModule` esplicitamente a `AppModule.imports`** per chiarezza (nessun
  cambio di comportamento, solo leggibilità del grafo moduli).
- **Seed** (`apps/api/prisma/seed.ts`): crea già 2 `Season` (2026, 2027), 1 `Package`
  ("Standard"), 5 `Rate` (incluse tariffe catch-all e per abbonamento) — dati di partenza validi
  e non ambigui, utili come fixture e2e.
- **Contratti oggi** (`packages/contracts/src/index.ts`): solo `PackageDTO` e `RateUnit`
  esistono. **Nessun `SeasonDTO`/`PricingDTO`/`RateDTO`/input di scrittura** — tutti da creare.
- **Frontend:** `apps/web-staff/src/features/pricing/PricingView.vue` è **interamente mock**
  (array locali `pacchetti`/`fasce`/`tariffe`, bottoni "Nuova tariffa" e selettore stagione non
  funzionanti). Usa già `DataTable` (API a slot, non ancora migrata a data-driven perché le sue
  colonne centrali destra-allineate userebbero `px-3.5` non `px-[18px]` — vedi
  [handoff refactor FE](../handoff/2026-07-01-pricing-editor-delegation.md) per il dettaglio).

## 2. Obiettivo e vincoli

Sostituire il mock di `PricingView` con un **editor reale**: l'admin gestisce `Season`,
`Package` e `Rate` (tariffe) dall'app, invece che solo dal seed. `Pricing` **non è esposto
all'utente**: è plumbing 1:1 con `Season` (nessun campo proprio), quindi **creato/eliminato
automaticamente insieme alla `Season`** — nessun `PricingController` dedicato.

- **In scope:** CRUD `Season` (create/list/delete — niente update: una stagione sbagliata si
  cancella e ricrea, niente campi mutabili oltre nome/date che richiederebbero rivalidazione
  tariffe); CRUD `Package` (create/update/delete, oltre alla `list` già esistente); CRUD `Rate`
  (create/update/delete, list per stagione); editor FE con selettore stagione reale, card
  pacchetti con modale crea/modifica/elimina, tabella tariffe con modale crea/modifica/elimina.
- **Fuori scope:** pricing per tipologia ombrellone (già [D-018]), versionamento storico prezzi,
  validazione di sovrapposizione tra `Season` diverse (il modello attuale non la richiede: ogni
  `Rate` appartiene a una sola `Season` via `Pricing`), multi-valuta, undo/redo, import/export.
- **Vincolo di fedeltà visiva (eredità ADR-0033):** l'editor è un **redesign funzionale** (la
  vista mock diventa reale), non un'estrazione strutturale — qui **non si applica** il vincolo
  "zero regressione visiva" nello stesso senso del refactor precedente. Tuttavia lo **stile deve
  restare quello dei mock/token** (stessi componenti `ui-kit`: `DataTable`, `PageToolbar`,
  `ModalFooter`, `Field`/`Input`/`Select`, `formatEuro`) — **riuso deliberato** per validare
  l'astrazione appena completata.
- **Non-ambiguità:** ogni scrittura di `Rate` deve essere respinta con **409** (non 500) se crea
  un duplicato esatto di dimensioni per la stessa `Pricing` — stesso pattern già usato per il
  check anti-overlap dei rinnovi (A4.2 review: "escludi la sorgente dall'anti-overlap; select id
  nel check anti-doppio").

## 3. Modifiche allo schema (Task 0 — prerequisito)

Migrazione Prisma che aggiunge il vincolo mancante:

```prisma
model Rate {
  // … campi esistenti invariati …
  @@unique([pricingId, type, sectorId, rowId, packageId, timeSlotId, periodStart, periodEnd])
}
```

> Postgres di default tratta `NULL` come *distinct* in un `UNIQUE` (due righe con più colonne
> `NULL` non collidono) — è il comportamento **richiesto** qui (i.e. due catch-all "vuoti" per
> `Pricing` diversi non collidono, ma **non impedisce due catch-all identici sulla stessa
> `Pricing`**, che è invece il bug che vogliamo prevenire). Verificare in fase di piano se la
> versione Postgres del progetto supporta `NULLS NOT DISTINCT` (PG 15+): se sì, aggiungerla
> esplicitamente nel constraint; se il progetto è su una versione precedente, il vincolo DB da
> solo **non basta** per il caso "tutto NULL" e serve un check applicativo aggiuntivo
> (select-then-insert nella stessa transazione, come già fatto per l'anti-overlap A4.2) — **il
> piano deve verificare la versione Postgres effettiva** (`docker exec coralyn-db psql --version`
> o equivalente) e scegliere di conseguenza.

## 4. Contratti da aggiungere (`packages/contracts/src/index.ts`)

```ts
export interface SeasonDTO {
  id: string;
  name: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;
}
export interface CreateSeasonInput {
  name: string;
  startDate: string;
  endDate: string;
}

export interface RateDTO {
  id: string;
  seasonId: string; // esposto al FE come seasonId, non pricingId (Pricing è plumbing interno)
  type?: BookingType;
  sectorId?: string;
  rowId?: string;
  packageId?: string;
  timeSlotId?: string;
  periodStart?: string;
  periodEnd?: string;
  price: number;
  unit: RateUnit;
}
export type CreateRateInput = Omit<RateDTO, 'id'>;
export type UpdateRateInput = Partial<Omit<RateDTO, 'id' | 'seasonId'>>;

export interface CreatePackageInput { name: string; equipment: Record<string, number> }
export type UpdatePackageInput = Partial<CreatePackageInput>;
```

> **Nota di collocazione:** `RateDTO` espone `seasonId` (non `pricingId`) perché `Pricing` è un
> dettaglio implementativo — il FE ragiona per stagione, non per "listino". Il backend traduce
> `seasonId` → `pricingId` internamente (una query per trovare il `Pricing` 1:1 della `Season`).

## 5. Backend — endpoint da aggiungere

Nuovo modulo `SeasonsController`/`RatesController` in `apps/api/src/catalog/` (accanto a
`PackagesController` esistente), stesso pattern di `apps/api/src/customers/` (riferimento
diretto: tenant-scoped via `forTenant`, DTO projection, `class-validator` DTO per il body):

- `GET /seasons` — lista stagioni del tenant.
- `POST /seasons` — crea `Season` **e** la sua `Pricing` 1:1 in una transazione (l'admin non
  vede mai `Pricing`).
- `DELETE /seasons/:id` — elimina `Season` (cascade su `Pricing`→`Rate`, verificare `onDelete`
  nello schema — se assente, aggiungere `onDelete: Cascade` sulle relazioni `Pricing.season` e
  `Rate.pricing` in questa stessa migrazione).
- `POST /packages`, `PATCH /packages/:id`, `DELETE /packages/:id` — aggiunte a
  `PackagesController` esistente (che ha già `GET`).
- `GET /rates?seasonId=` — lista tariffe di una stagione (risolve `seasonId`→`pricingId`
  internamente).
- `POST /rates`, `PATCH /rates/:id`, `DELETE /rates/:id` — scrittura, con il check di
  non-ambiguità (§3) che mappa la violazione a **409** con messaggio "Esiste già una tariffa
  con queste dimensioni per questa stagione."

## 6. Frontend — editor reale al posto del mock

`PricingView.vue` sostituisce gli array locali con query reali:

- **Selettore stagione:** `useSeasons()` (query) sostituisce il bottone statico "Estate 2026";
  `Select` di `ui-kit` per il cambio stagione attiva (stato locale, non Pinia — non serve
  persistere tra viste).
- **Card pacchetti:** `usePackages()` (già esiste, sola lettura — estenderla con
  `useCreatePackage`/`useUpdatePackage`/`useDeletePackage`, stesso pattern factory
  `useQueryResource` del refactor appena fatto). Modale crea/modifica con `Field`+`Input`+
  `ModalFooter` (stesso pattern di `CustomersView`).
- **Tabella tariffe:** `useRates(seasonId)` sostituisce l'array `tariffe`. La tabella **resta
  sull'API a slot di `DataTable`** (stessa motivazione già scritta per il mock: le colonne
  destra-allineate centrali non sono compatibili con `TD_RIGHT`) **a meno che** in fase di piano
  si scelga di ridisegnare le colonne (redesign è **dentro lo scope** qui, a differenza del
  refactor precedente — quindi migrare a `DataTable` data-driven **è permesso** se il piano
  decide di normalizzare le colonne; tracciare la scelta). Modale crea/modifica tariffa con
  selettori per ciascuna dimensione (`Select` per tipo/settore/fila/pacchetto/fascia,
  `Input type="date"` per il periodo, `Input type="number"` per il prezzo, `formatEuro` per la
  sola visualizzazione).
- **Riuso deliberato** (validazione ADR-0033): `PageToolbar`, `ModalFooter`, `Field`/`Input`/
  `Select`, `formatEuro`, `useQueryResource` — nessun nuovo componente `ui-kit` dovrebbe servire
  (YAGNI, ADR-0033 §4: crearne uno nuovo solo se un pattern emerge e non è coperto).

## 7. Rischi e mitigazioni

- **Ambiguità silenziosa di `Rate`** → vincolo DB (§3) + check applicativo 409 prima
  dell'insert, stesso pattern anti-overlap A4.2.
- **`onDelete` mancante su `Pricing`/`Rate`** → verificare in fase di piano; se assente, Prisma
  rifiuta la delete con FK violation invece di fare cascade — decidere esplicitamente
  (cascade vs blocco con messaggio "Elimina prima le tariffe di questa stagione").
- **`CatalogModule` non esplicito in `AppModule`** → aggiungerlo esplicitamente (nessun rischio,
  solo pulizia — non bloccante se il piano decide di lasciarlo transitivo, ma consigliato).
- **Redesign delle colonne tariffa** → se il piano normalizza le colonne per usare `DataTable`
  data-driven, verificare che il nuovo layout resti nello stile dei mock/token (non serve
  fedeltà pixel al mock *attuale*, che è solo un placeholder — serve fedeltà al **linguaggio
  visivo** ADR-0018/0027).

## 8. Fasi (indicative — il piano dettagliato le espande in step TDD)

1. **Migrazione DB**: vincolo non-ambiguità `Rate` + (se necessario) `onDelete` cascade.
2. **Contratti**: `SeasonDTO`/`RateDTO`/input di scrittura (§4).
3. **Backend Seasons**: `GET`/`POST`/`DELETE /seasons` (+ Pricing 1:1 automatico).
4. **Backend Packages**: aggiungere `POST`/`PATCH`/`DELETE` a `PackagesController` esistente.
5. **Backend Rates**: `GET`/`POST`/`PATCH`/`DELETE /rates`, check non-ambiguità → 409.
6. **Frontend composables**: `useSeasons`, estendere `usePackages`, `useRates` (sopra
   `useQueryResource`).
7. **Frontend `PricingView`**: sostituire mock con dati reali + modali crea/modifica/elimina per
   le 3 entità, riusando i componenti `ui-kit` del refactor precedente.
8. **E2E**: almeno un test e2e per il flusso "crea stagione → crea tariffa → GET quote la usa"
   (chiude il cerchio con `BookingsService`/`pricing.engine.ts` già esistenti).

## 9. Decisioni chiuse

1. **`Pricing` non esposto**: creato/eliminato automaticamente con `Season`, nessun
   `PricingController`. (§2, §5)
2. **Vincolo di non-ambiguità mancante viene aggiunto** come prerequisito (Task 0), non come
   scope opzionale. (§3)
3. **`Season` non ha `update`**: si cancella e ricrea. (§2)
4. **Redesign delle colonne tariffa è permesso** (a differenza del refactor ADR-0033, qui non
   c'è vincolo di fedeltà pixel al mock attuale, solo al linguaggio visivo). (§6, §7)
5. **Nessun nuovo ADR**: incremento CRUD su architettura già decisa (ADR-0032 per il motore
   prezzo, pattern CRUD già stabilito da `Customers`). (frontmatter)
