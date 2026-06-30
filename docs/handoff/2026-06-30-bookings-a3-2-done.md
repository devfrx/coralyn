# Handoff 2026-06-30 — Slice A3.2 selettore Pacchetto + re-quote: COMPLETATA

> Documento di consegna per il prossimo agente/sessione. Descrive cosa ha realizzato la slice A3.2
> (lettura pacchetti + selettore nel modale + re-quote + salvataggio `packageId` + colonna `BookingsView`),
> lo stato git, i confini mantenuti e le opzioni per i prossimi slice. **A3.2 completa l'increment A3.**

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR), tutte le
> `docs/specs/`, tutte le `docs/design/`, tutti i `docs/plans/` e i `docs/handoff/`. Più `README.md`
> di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **MERGIATA su `main`** (fast-forward, nessun conflitto) e **pushata su `origin/main`**: la slice A3.2
  (branch `feat/bookings-package-selector`, creato da `main` `cc12df0`) è integrata. Il branch feature è
  ora ancestor di `main`.
- Catena per layer (`git log --oneline cc12df0..main`): spec → piano → contratti → `toPackageDTO` →
  `GET /packages` → create+`packageId` → e2e → FE modale+re-quote → colonna `BookingsView` → doc → fix
  coerenza post-merge (commenti `packageId` schema/contracts + questo stato merge).
- I 4 branch storici `origin/feat/*` (api-identita-auth, bookings-daily, bookings-payment,
  coralyn-redesign-fe) erano già ancestor di `main` (interamente contenuti).

---

## 1. Cosa ha consegnato A3.2

### Backend (modulo `catalog`, dipendenza `bookings → catalog` invariata)

- **`GET /api/bookings/quote` invariato**; nuovo endpoint read-only **`GET /api/packages`**: lista i
  `Package` del tenant per il selettore FE. `PackagesController` **dentro il modulo `catalog`** (dominio già
  suo) → `CatalogService.listPackages()` → `forTenant` + proiezione `toPackageDTO`. RLS `tenant_isolation`
  FORCE su `Package` (A3.1) è la rete di sicurezza.
- **Proiezione `toPackageDTO`** (`apps/api/src/catalog/package.projection.ts`, nuova): `{ id, name, equipment }`
  (non espone `establishmentId`). Unit-testata.
- **`POST /api/bookings` salva e prezza `packageId`**: `CreateBookingDto += packageId?`
  (`@IsOptional @Matches(UUID_SHAPE)`, forma UUID, non `@IsUUID` stretto). `BookingsService.create`
  **pre-valida** il pacchetto nel tenant insieme alle altre FK (`tx.package.findFirst` → **422** "Pacchetto
  non valido" se assente, stesso pattern di cliente/ombrellone/fascia), lo passa a `catalog.priceWithin(tx,
  { ..., packageId })` (che lo accetta già da A3.1) e lo **scrive** sulla `Booking`.

### Contratti (`@coralyn/contracts`)

- **`CreateBookingInput += packageId?`** (additivo). `PackageDTO`, `QuoteBookingInput.packageId?`,
  `BookingDTO.packageId?`, `RateUnit` erano già presenti da A3.1. **Nessun breaking change.**

### Frontend (`apps/web-staff`)

- **`usePackages`** (`features/bookings/usePackages.ts`, gemello di `useCustomers`) + chiave
  `queryKeys.packages(tenantId)`.
- **Modale "Nuova prenotazione" (`MapView.vue`)**: selettore `<select>` Pacchetto con opzione **"Nessun
  pacchetto"** (default; value `''` → `packageId` omesso) + opzioni da `usePackages`. `quoteParams` include
  `packageId` → al cambio pacchetto/fascia la query `useBookingQuote` si re-invalida e il prezzo si
  **ricalcola** (la riga Prezzo di A3.1 è riusata). Il payload della create include `packageId`.
- **`useBookingQuote`**: `QuoteParams += packageId?`; incluso in `queryKey` e nell'URL (solo se presente).
- **`BookingsView.vue`**: **nuova** colonna "Pacchetto" (dopo "Tipo"); risoluzione `packageId → Package.name`
  client-side via `usePackages` (mappa DTO-pura, come `umbrellaLabel`/`customerName`); "—" se assente.
- **MSW** (test only): handler `GET /api/packages`; `GET /api/bookings/quote` ora ritorna 35 col `packageId`,
  28 senza (per testare il re-quote); `POST /api/bookings` riflette il `packageId` opzionale.

---

## 2. Test e build

DoD verificato (`pnpm -r build` + `eslint .` verdi):

| Suite | Prima di A3.2 | A3.2 (verificato) | Δ |
|---|---|---|---|
| ui-kit | 14 | 14 | — |
| web-staff | 43 | 44 | +1 (`BookingsView.spec`: colonna Pacchetto; `MapView.spec` esteso: selettore + re-quote, count invariato) |
| api unit | 59 | 61 | +2 (`package.projection.spec` ×2) |
| api e2e | 47 | 53 | +6 (create con `packageId` ×1, `packageId` invalido → 422 ×1, `GET /packages` ×4) |

Nuovi: `package.projection.spec.ts` (proiezione); e2e `GET /packages` (401/200/isolamento/400) + create con
pacchetto (prezzo 60 dalla rate pacchetto, persistenza) + `packageId` inesistente → 422. Helper e2e
`seed-pricing.ts` esteso con una `Rate { packageId }` (60/giorno).

---

## 3. Confini mantenuti (cosa A3.2 NON fa)

- **Pacchetto opzionale** (decisione chiusa): `null` = tariffa base, nessun pacchetto. **Obbligatorio**
  e **"Package di default per tenant"** scartati (imporrebbero una regola UI su un campo nullable /
  gold-plating). Vedi [spec A3.2 §7](../specs/2026-06-30-bookings-package-a3-2-design.md).
- **Engine, schema `Rate`, RLS, migrazioni: invariati.** Nessuna migrazione (lo schema A3.1 aveva già
  `Package`, `Booking.packageId`, RLS). La dimensione `packageId` era già nell'engine (ADR-0032).
- **Editor CRUD del listino**: resta **[D-032]**. A3.2 **legge** i `Package` seeded, non li gestisce.
- **`Package.equipment` display ricco** nel selettore: mostrato solo il **nome** (come il select Cliente);
  `equipment` è nel DTO ma non reso. Additivo.
- **Create resta daily-only** (A4); `UmbrellaType` fuori dal pricing ([D-018]); extra non prezzati.
- **A2 invariata** (incasso/`BookingsView` payment), **colonna "Tipo"** resta hard-coded "Giornaliero".

---

## 4. Insidie e gotcha (riconfermati)

- **`prisma generate` su cambio branch**: il client può essere stale; rigenerare prima di `nest build`.
  **NB:** in questo repo non esiste lo script `prisma` nel `package.json` dell'api — usare
  `corepack pnpm --filter @coralyn/api exec prisma generate` (oppure `nest build` rileva i tipi se il
  client è già generato; A3.2 non cambia lo schema, quindi non serve rigenerare).
- **`ValidationPipe({ whitelist: true })`**: un campo non dichiarato nel DTO viene **scartato** → il
  `packageId` DEVE stare in `CreateBookingDto`, altrimenti la create lo ignora silenziosamente.
- **Migrazioni**: **nessuna** in A3.2. (Lo schema è quello di A3.1, già applicato a `coralyn_dev`/`coralyn_test`.)
- **DB su Docker, porta 5433** (invariato). Gli e2e caricano `.env.test` da soli (`test/jest-setup-env.ts`).
- **`.env` / `.env.test`** sono alla **root del repo** (non in `apps/api/`): `coralyn_dev`/`coralyn_test` su 5433.
- **Rebuild api Docker dopo modifiche BE**: `docker compose --profile full up -d --build api` (altrimenti il
  FE prende 404). Login dev: `admin@coralyn.dev` / `coralyn-admin-8473`.
- **Pulire `apps/web-staff/node_modules/.vite`** dopo cambi contratti (`CreateBookingInput += packageId`).
- **FK forma-UUID**: `@Matches(UUID_SHAPE)`, non `@IsUUID` stretto (UUID sintetici del seed).
- **`corepack pnpm`** (pin 11.9.0).
- **Cast TS proiezione**: `PackageDTO → Record<string, unknown>` richiede `as unknown as` (conversione non
  diretta) nei test.

---

## 5. Prossimi slice

- **A4 — Periodiche/abbonamenti** ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)):
  `type=periodic`→`booked`, `type=subscription`→`season`, rinnovo `previousBookingId`. L'engine è già pronto
  per i casi multi-giorno e `unit=period`.
- **Editor CRUD listino** ([D-032](../architecture/deferred.md)): admin gestisce `Season`/`Pricing`/`Rate`/
  `Package` da form; gemello dell'opzione B (setup mappa, [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
  Ora che `GET /packages` esiste e la lettura è in place, il CRUD è il passo naturale.
- In alternativa: **B** setup-form mappa CRUD, **C** staff-mgmt & RBAC ([D-025](../architecture/deferred.md)).

---

## 6. Riferimenti

- **Spec A3.2:** [docs/specs/2026-06-30-bookings-package-a3-2-design.md](../specs/2026-06-30-bookings-package-a3-2-design.md)
- **Piano A3.2:** [docs/plans/2026-06-30-bookings-package-a3-2.md](../plans/2026-06-30-bookings-package-a3-2.md)
- **Handoff precedente (A3.1):** [2026-06-30-bookings-a3-1-done.md](2026-06-30-bookings-a3-1-done.md)
- **ADR pricing engine:** [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md)
- **ADR dominio prenotazioni & pricing:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
- **Modello dati:** [docs/design/data-model.md](../design/data-model.md)

---

## 7. Stato merge

- **Mergiata FF su `main` e pushata su `origin/main`.** Build `-r` + `eslint .` verdi; test 14/44/61/53
  verificati sul risultato mergiato. Branch feature locale eliminato dopo il merge (pattern A1/A2/A3.1).
- **Verifica live Docker (opzionale, non ancora eseguita):** `docker compose --profile full up -d --build api`
  + dev FE, poi scegliere un pacchetto nel modale → il prezzo si ricalcola → la prenotazione mostra il
  pacchetto nella `BookingsView`. Il comportamento è già coperto dai test automatici (FE con MSW: selettore
  + re-quote + colonna; e2e: endpoint + create + prezzo pacchetto + isolamento).
- **Prossimo ADR libero: 0033** (A3.2 non ha introdotto ADR; riafferma ADR-0006/0032).
