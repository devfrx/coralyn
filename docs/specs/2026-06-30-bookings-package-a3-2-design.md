# Prenotazioni — Slice A3.2 (selettore Pacchetto + ricalcolo nel modale) — Design Spec

- **Data:** 2026-06-30
- **Stato:** In revisione — secondo sotto-slice dell'increment **A3 (Pricing)**, completa A3 dopo
  [A3.1](2026-06-30-bookings-pricing-a3-1-design.md) (catalogo + engine + auto-pricing).
- **Convenzione:** codice e DB in **inglese**, nomi DB nativi (no `@@map`); UI a video e doc in
  **italiano** ([ADR-0030](../architecture/decisions/0030-codice-e-db-in-inglese.md)). Ponte IT↔EN nel
  [glossario](../architecture/glossary.md).
- **ADR di riferimento:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
  (Ombrellone-pacchetto; il `Package` è dimensione del pricing),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (engine a precedenze — la
  dimensione pacchetto **esiste già**, A3.2 **non** tocca l'engine),
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (RLS),
  [ADR-0026](../architecture/decisions/0026-identita-rls-utente.md) (tenant dal JWT),
  [ADR-0021](../architecture/decisions/0021-server-state-frontend.md) (server-state TanStack Query),
  [D-018](../architecture/deferred.md) (la **tipologia** NON è dimensione di prezzo; il **pacchetto** sì),
  [D-032](../architecture/deferred.md) (editor CRUD del listino — resta rinviato).
- **Nessun nuovo ADR.** A3.2 riafferma il modello di ADR-0006/0032 (pacchetto = dimensione **opzionale**);
  la scelta "opzionale, non obbligatorio" è registrata qui come **decisione chiusa** (§7) e nel glossario,
  senza introdurre una precedenza nuova.

---

## 1. Obiettivo e confini

**Far scegliere il Pacchetto e vederne l'effetto sul prezzo.** A3.1 ha acceso il pricing server-side
ma la create salva sempre `packageId = null` (catch-all) e il modale non offre il pacchetto. A3.2
aggiunge il **selettore Pacchetto** nel modale "Nuova prenotazione", **ricalcola** il prezzo al cambio
(re-quote), **salva** il `packageId` sulla prenotazione, e mostra il pacchetto scelto nella
`BookingsView`. È un increment **puro additivo**: nessun cambio a engine, schema `Rate`, RLS, A2.

**Pacchetto = dimensione opzionale (decisione chiusa, §7).** Il modello A3.1 è già coerente con
"opzionale": `Booking.packageId` nullable, `Rate.packageId` wildcard, `Rate` catch-all obbligatoria,
contratti `packageId?`. Rendere il pacchetto obbligatorio in A3.2 imporrebbe una regola di livello-UI
sopra un campo nullable, senza enforcement DB, rendendo morto il ramo `packageId=null` dell'engine: è il
"debito silenzioso" vietato da [ADR-0002](../architecture/decisions/0002-decision-rubric.md) filtro 4.
Quindi `null` resta legittimo (= **tariffa base, nessun pacchetto**), ma reso **deliberato** dal selettore
(opzione esplicita "Nessun pacchetto"), non un default accidentale.

### In scope (A3.2)

- **`GET /api/packages`** read-only, tenant-scoped: lista dei `Package` del tenant per il selettore.
  Controller dentro il modulo **`catalog`** (dominio già suo); proiezione `toPackageDTO`.
- **`Booking.packageId` valorizzabile sulla create**: `CreateBookingInput`/`CreateBookingDto`
  `+= packageId?` (forma UUID, `@IsOptional`); `BookingsService.create` lo passa a `priceWithin` (che lo
  accetta già) e lo **salva** sulla `Booking` (oggi hard-coded `null`).
- **Re-quote nel modale**: `useBookingQuote` `QuoteParams += packageId?`; la `queryKey` e l'URL del quote
  includono `packageId`; al cambio pacchetto/fascia la query si re-invalida e mostra il nuovo prezzo. Il
  `GET /bookings/quote` accetta già `packageId?` (A3.1, [quote-booking.dto](../../apps/api/src/bookings/dto/quote-booking.dto.ts)).
- **Selettore Pacchetto nel modale** (`MapView.vue`): `<select>` come quello Cliente, popolato da
  `usePackages`, con opzione **"Nessun pacchetto"** (value `''` → `packageId` omesso). Default = nessun
  pacchetto.
- **Colonna "Pacchetto" in `BookingsView`** (nuova): risoluzione `packageId → Package.name` client-side
  via `usePackages` (mappa DTO-pura, stesso pattern di `umbrellaLabel`/`customerName`); "—" se assente.
- **Contratti additivi**: `CreateBookingInput += packageId?`. (`PackageDTO`, `QuoteBookingInput.packageId?`,
  `BookingDTO.packageId?` esistono già da A3.1.)
- **`usePackages`** composable (gemello di `useCustomers`) + chiave `queryKeys.packages`.
- e2e a 2 tenant (`GET /packages` 401/200/isolamento; create con `packageId` → prezzo della rate del
  pacchetto; quote con `packageId`); unit della proiezione `toPackageDTO` e della create che salva
  `packageId`; web-staff (selettore + re-quote + colonna; MSW `GET /api/packages`).

### Fuori scope (rinviato)

- **Editor CRUD del listino** (`Season`/`Pricing`/`Rate`/`Package` da form): resta **[D-032]**. A3.2 legge
  i `Package` seeded, non li gestisce.
- **`Package.equipment` come display ricco** nel selettore (es. "Standard · 2 lettini, 1 sdraio"): in A3.2
  il selettore mostra **solo il nome** (come il select Cliente). `equipment` è già nel `PackageDTO`; il
  display ricco è additivo (YAGNI ora).
- **Pacchetto obbligatorio / "Package di default per tenant"**: scartati (§7). `null` = tariffa base.
- **Creazione `periodic`/`subscription`**: la create resta **daily-only** (A4). L'engine è già generale.
- **Colonna "Tipo" reale in `BookingsView`**: resta hard-coded "Giornaliero" (corretto per daily-only).
- **Prezzo per `UmbrellaType`**: escluso ([D-018]); A3.2 non tocca l'engine né lo schema `Rate`.
- **Extra a prezzo** (`Booking.extras`): modellato, non sommato. Rinviato (come A3.1).

---

## 2. Backend

Dipendenza invariata: `bookings → catalog`, mai il contrario. Nessuna migrazione (lo schema A3.1 ha già
`Package`, `Booking.packageId`, RLS sulle nuove tabelle). `prisma generate` non necessario (schema
invariato), ma **`prisma generate` prima di `nest build`** resta buona prassi su cambio branch.

### 2.1 `GET /api/packages` — lista pacchetti del tenant

Sotto la `JwtAuthGuard` globale (tenant dal JWT; no Bearer → **401**; superuser → **400** via guard).
Read-only, nessun parametro. Pattern identico a `customers` ([customers.controller.ts](../../apps/api/src/customers/customers.controller.ts),
[customers.service.ts](../../apps/api/src/customers/customers.service.ts)).

- **`PackagesController`** (`@Controller('packages')`) **dentro il modulo `catalog`**: tiene la cosa nel
  dominio che già possiede `Package`/`Season`/`Pricing`/`Rate`. `GET /` → `CatalogService.listPackages()`.
- **`CatalogService.listPackages(): Promise<PackageDTO[]>`** — `tenant.require()` + `forTenant` +
  `tx.package.findMany()` + `toPackageDTO`. RLS `tenant_isolation` FORCE su `Package` (A3.1) è la rete di
  sicurezza: la query è comunque tenant-scoped.
- **`toPackageDTO(p: Package): PackageDTO`** — proiezione pura (oggi **inesistente**, va creata):
  `{ id, name, equipment: p.equipment as Record<string, number> }`. Vive in
  `apps/api/src/catalog/package.projection.ts` (gemello di `booking.projection.ts`), unit-testata.
- **`CatalogModule`** dichiara `PackagesController` (oltre a `CatalogService` già esistente).

> `CatalogModule` oggi esporta solo `CatalogService` e non ha controller. A3.2 gli aggiunge un controller
> read-only: il modulo resta cohesivo (catalogo = dati + ora lettura pacchetti), `BookingsModule` continua
> a importarlo per il pricing senza cambiare nulla.

### 2.2 `POST /api/bookings` — salva `packageId` e prezza col pacchetto

- **`CreateBookingDto += packageId?`**: `@IsOptional() @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })`
  (forma UUID, **non** `@IsUUID` stretto — A1 §10; `UUID_SHAPE` già esportato da
  [create-booking.dto.ts](../../apps/api/src/bookings/dto/create-booking.dto.ts)).
- **`BookingsService.create`** ([bookings.service.ts:54](../../apps/api/src/bookings/bookings.service.ts#L54)):
  quando `packageId` è presente, lo **pre-valida nel tenant** insieme alle altre FK (vedi §2.3), poi lo
  passa a `catalog.priceWithin(tx, { ..., packageId: input.packageId ?? null })` (che lo accetta già) **e**
  lo scrive in `tx.booking.create({ data: { ..., packageId: input.packageId ?? null } })` (oggi il campo
  non è passato → default `null`).

### 2.3 Validità FK `packageId`

Pattern A1/A2/A3.1: la **forma** UUID è validata nel DTO; l'**esistenza-nel-tenant** è verificata con un
`findFirst` nel tenant **prima** del pricing/create — è ciò che la `create` già fa per slot/umbrella/customer
([bookings.service.ts:60-65](../../apps/api/src/bookings/bookings.service.ts#L60), → **422** "Cliente,
ombrellone o fascia non validi"). A3.2 **estende lo stesso check** al pacchetto: se `input.packageId` è
presente, `const pkg = await tx.package.findFirst({ where: { id: input.packageId } })`; se assente → **422**
"Pacchetto non valido". Così l'esito è coerente con "FK fuori tenant → 422" di A3.1 (la RLS rende il
pacchetto di un altro tenant invisibile → `findFirst` null → 422), il messaggio è chiaro, e la
`tx.booking.create` non incontra mai un errore FK grezzo su `packageId`. (Decisione chiusa §7.)

---

## 3. Contratti (`@coralyn/contracts`)

Un solo cambio, **additivo**:

```ts
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string;        // ISO yyyy-mm-dd
  packageId?: string;  // A3.2 (additivo): pacchetto scelto; assente = nessun pacchetto (tariffa base)
}
```

Invariati e già presenti da A3.1: `PackageDTO`, `RateUnit`, `QuoteBookingInput` (con `packageId?`),
`BookingQuoteDTO`, `BookingDTO.packageId?`. Nessun breaking change.

---

## 4. Frontend (`apps/web-staff`)

### 4.1 `usePackages` + query key

- **`queryKeys.packages(tenantId)`** in [queryKeys.ts](../../apps/web-staff/src/lib/queryKeys.ts):
  `['packages', tenantId]`.
- **`usePackages()`** (gemello di [useCustomers](../../apps/web-staff/src/features/customers/useCustomers.ts)):
  `useQuery({ queryKey: queryKeys.packages(session.establishmentId), queryFn: () => apiFetch<PackageDTO[]>('/packages') })`.
  Posizione: **`apps/web-staff/src/features/bookings/usePackages.ts`** (coesione col modale e con
  `useBookingQuote`, già in `features/bookings/`).

### 4.2 Modale "Nuova prenotazione" (`MapView.vue`)

- **State**: `const packageId = ref<string>('');` (`''` = nessun pacchetto). `openModal()` lo resetta a `''`.
- **Selettore** (dopo il blocco Fascia, prima del Prezzo): `<select v-model="packageId">` con
  `<option value="">Nessun pacchetto</option>` + `v-for` sui `packages` (`usePackages`). Etichetta "Pacchetto".
- **Re-quote**: `quoteParams` (computed) `+= packageId: packageId.value || undefined`. Cambiando il
  pacchetto, la `queryKey` di `useBookingQuote` cambia → re-fetch → nuovo prezzo mostrato (già la riga
  Prezzo esistente). Nessun nuovo elemento UI per il prezzo (riusa quello di A3.1).
- **Create**: `confirmBooking()` aggiunge `packageId: packageId.value || undefined` al payload di
  `createBooking.mutateAsync`.

### 4.3 `useBookingQuote` — parametro `packageId`

```ts
export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  date: string;
  packageId?: string; // A3.2: opzionale
}
```

- `queryKey` `+= params.value?.packageId ?? ''`.
- `queryFn`: append `&packageId=${p.packageId}` all'URL **solo se** `packageId` presente.
- `enabled` invariato (pacchetto opzionale → non condiziona l'abilitazione).

### 4.4 `BookingsView.vue` — colonna "Pacchetto"

- **`usePackages`** → mappa `packageName: Map<id, name>` (computed, come `umbrellaLabel`).
- **`cols`**: inserire `{ key: 'pacchetto', label: 'Pacchetto' }` dopo la colonna "Tipo".
- **`<td>`**: `{{ b.packageId ? (packageName.get(b.packageId) ?? '—') : '—' }}`. DTO-puro, nessuna
  chiamata extra (i `Package` sono già caricati una volta dal composable condiviso, cache TanStack).

### 4.5 MSW (test-only)

- Handler `http.get('/api/packages', () => HttpResponse.json([{ id, name, equipment }]))` con 1–2 pacchetti.
- Handler `POST /api/bookings`: accetta il `packageId` opzionale nel body e lo riflette nella risposta.
- Handler `GET /api/bookings/quote`: può variare il prezzo in base a `packageId` (per testare il re-quote),
  o restare fisso se il test del re-quote verifica solo la nuova chiamata.

---

## 5. Test (TDD, commit-per-layer)

Target da **non** regredire: ui-kit 14 · web-staff 43 · api unit 59 · api e2e 47.

- **api unit — `package.projection.spec.ts`** (nuovo): `toPackageDTO` mappa `id`/`name`/`equipment`.
- **api unit — `bookings.service` / proiezione**: create con `packageId` lo persiste (o test mirato sulla
  costruzione del `data`); senza `packageId` resta `null` (regressione A3.1).
- **api e2e — `packages.e2e-spec.ts`** o estensione di `bookings.e2e-spec.ts` (2 tenant, seed listino):
  - `GET /api/packages` senza Bearer → **401**; con Bearer → **200** con i `Package` del tenant (non quelli
    dell'altro tenant → **isolamento** RLS); superuser → **400**.
  - `POST /bookings` con `packageId` valido → **201**, `totalPrice` riflette la rate del pacchetto se esiste
    (per dimostrarlo serve una `Rate { packageId }` nel seed e2e — **aggiungere** una rate pacchetto
    all'helper [seed-pricing.ts](../../apps/api/test/helpers/seed-pricing.ts)); `GET /bookings` riflette il
    `packageId`.
  - `POST /bookings` con `packageId` inesistente nel tenant → **422** (§2.3).
  - quote con `packageId` → prezzo della rate pacchetto (precedenza pacchetto vs catch-all).
- **web-staff — `MapView.spec`**: il modale mostra il selettore Pacchetto (opzioni da MSW); il cambio
  pacchetto re-interroga il quote (nuovo prezzo); la create invia `packageId`. Eventuale `usePackages`
  test isolato.
- **web-staff — `BookingsView.spec`** (se presente) o nuovo: la colonna "Pacchetto" mostra il nome
  risolto / "—" quando assente.

---

## 6. Verifica / DoD

- Nessuna migrazione; schema invariato. `prisma generate` prima di `nest build` su cambio branch (gotcha
  A2/A3.1). DB locale porta **5433** (`coralyn_dev`/`coralyn_test`).
- Test verdi, conteggi **≥** ai target (con i nuovi). `pnpm -r build` + `eslint .` verdi.
- Docker `--profile full up -d --build api` (rebuild dopo il cambio BE, altrimenti il FE prende 404):
  login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`); aprire il modale → scegliere un pacchetto →
  il prezzo si **aggiorna** (re-quote); confermare → la `BookingsView` mostra il pacchetto nella nuova
  colonna; `GET /api/packages` con Bearer → lista pacchetti.
- FE: dev worker sul backend reale; `typecheck` OK; **pulire `apps/web-staff/node_modules/.vite`** dopo il
  cambio contratti (`CreateBookingInput += packageId`).
- **Doc:** aggiornare `README.md` (stato: A3.2 selettore Pacchetto implementato; A3 completo),
  `data-model.md` (nota: `Booking.packageId` ora **valorizzabile/valorizzato**, non più solo presente),
  `glossary.md` (nota su `Package` opzionale = tariffa base; selettore in A3.2 → implementato);
  handoff A3.2.

---

## 7. Decisioni chiuse

1. **Pacchetto = dimensione opzionale** (`null` = tariffa base, nessun pacchetto). Scartati: **obbligatorio**
   (imporrebbe una regola UI su un campo nullable senza enforcement DB, rende morto il wildcard dell'engine —
   debito silenzioso) e **"Package di default per tenant"** (gold-plating contro YAGNI; cambia le assunzioni
   catch-all di A3.1). `null` reso **deliberato** dall'opzione "Nessun pacchetto" nel selettore. (§1, §2.2)
2. **`GET /api/packages` read-only nel modulo `catalog`** (non un modulo nuovo): il catalogo già possiede
   `Package`. Dipendenza `bookings → catalog` invariata. (§2.1)
3. **Scope completo**: selettore + re-quote nel modale **e** colonna Pacchetto in `BookingsView`. Chiude A3
   sulla visualizzazione. (§1, §4.4)
4. **`packageId` inesistente nel tenant → 422** (coerente con "FK fuori tenant → 422" A3.1), mai pacchetto
   fantasma salvato silenziosamente. (§2.3)
5. **Nessun nuovo ADR**: A3.2 riafferma ADR-0006/0032; la scelta opzionale è registrata qui e nel glossario.
   (header)
6. **Selettore mostra solo il nome** (`equipment` display ricco rinviato, YAGNI); editor CRUD listino resta
   **[D-032]**. (§1)
7. **Engine, schema `Rate`, RLS, A2 invariati**; create resta daily-only; `UmbrellaType` fuori dal pricing
   ([D-018]). (§1)
