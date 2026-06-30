# Handoff 2026-06-30 — Slice A3.1 pricing engine: COMPLETATA

> Documento di consegna per il prossimo agente/sessione. Descrive cosa ha realizzato la slice A3.1
> (catalogo + pricing engine + auto-pricing), lo stato git, i confini mantenuti e le opzioni per i
> prossimi slice.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> l'intera `docs/architecture/` (README + `deferred.md` + `glossary.md` + tutti gli ADR), tutte le
> `docs/specs/`, tutte le `docs/design/`, tutti i `docs/plans/` e i `docs/handoff/`. Più `README.md`
> di root e `packages/contracts/src/index.ts`.

---

## 0. Situazione GIT

- **MERGIATA su `main`** (2026-06-30, **fast-forward**, nessun conflitto): l'intera catena
  **A1 (`feat/bookings-daily`) → A2 (`feat/bookings-payment`) → A3.1 (`feat/bookings-pricing`)**
  è integrata su `main`. I branch feature sono ora ancestor di `main` (interamente contenuti).
- Storico per layer della catena bookings: `git log --oneline 60e38c5..main`
  (`60e38c5` = tip di `main` prima delle prenotazioni).
- Anche `feat/api-identita-auth` e `feat/coralyn-redesign-fe` risultavano già integrati in `main`.

---

## 1. Cosa ha consegnato A3.1

### Migrazione e schema

- **Nuove tabelle** con RLS `tenant_isolation` FORCE (SQL grezzo): `Package`, `Season`, `Pricing`,
  `Rate` — tutte tenant-scoped (`establishmentId`).
- **Nuovo enum DB** `RateUnit { day period }`.
- **Vincolo di non-ambiguità sulla firma `Rate`**: indice unico raw `Rate_signature_key` su `(pricingId, type, sectorId, rowId, packageId, timeSlotId, periodStart, periodEnd)` con `NULLS NOT DISTINCT` (Postgres 16; SQL grezzo in migrazione, perché Prisma `@@unique` non emette `NULLS NOT DISTINCT`) — ambiguità impossibile per costruzione.
- **`Booking.packageId`** — FK nullable additiva su `Package` (era rinviata da A1; null in A3.1,
  selettore in A3.2).
- **Refinement del data-model**: `Rate.period` (json) → due colonne `periodStart`/`periodEnd`
  (`@db.Date`); `Rate.scope "sector/row"` → FK nullable `sectorId`/`rowId`; `Rate` porta
  `establishmentId` direttamente per RLS.

### Backend

- **Pricing engine puro** `resolvePrice(ctx, rates)` (modulo `catalog`, file `pricing.engine.ts`):
  nessuna dipendenza Nest, esito discriminato (`{ ok: true; totalPrice; rate }` / `{ ok: false; reason: 'NO_RATE' }`).
  Matching multi-dimensione + **precedenza lessicografica esplicita**: periodo › fila › settore ›
  pacchetto › fascia › tipo ([ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md)).
  Calcolo `unit=day` (× giorni, centesimi interi) e `unit=period` (forfait).
- **`CatalogService`** (`forTenant`): risoluzione stagione attiva (NO_SEASON → 422), caricamento
  `Rate`, costruzione `PricingContext`, chiamata engine. Gestione difensiva >1 stagioni attive:
  deterministico + log (stessa logica della proiezione A1).
- **Auto-pricing su `POST /api/bookings`**: `CreateBookingDto` **non accetta più `totalPrice`**
  (calcolato dal server); il `BookingsService.create` chiama `CatalogService.priceWithin(tx, ...)`
  dentro la **propria** transazione `forTenant` (NIENTE transazione annidata). `CatalogService.quote(...)`
  apre invece la propria transazione ed è usato solo dall'endpoint `GET /bookings/quote`.
- **`GET /api/bookings/quote`**: preventivo prezzo prima di confermare (`QuoteBookingDto` →
  `BookingQuoteDTO { totalPrice }`); 422 se NO_SEASON/NO_RATE/FK invalida.
- **Dipendenza unidirezionale**: `bookings → catalog`, mai il contrario.

### Contratti (`@coralyn/contracts`)

- **Nuovi (additivi)**: `PackageDTO`, `RateUnit`, `QuoteBookingInput`, `BookingQuoteDTO`;
  `BookingDTO += packageId?`; `toPackageDTO`, `toBookingDTO` proietta `packageId`.
- **Cambio non-additivo (ammesso pre-release)**: `CreateBookingInput` **perde `totalPrice`**
  (server autoritativo). FE e BE aggiornati in lockstep.

### Frontend (`apps/web-staff`)

- **Rimosso l'input "Prezzo" a mano** dal modale "Nuova prenotazione" (`MapView.vue`).
- **Mostra il prezzo calcolato**: composable `useBookingQuote(...)` chiama `GET /api/bookings/quote`
  alla scelta di ombrellone+fascia+data; mostra `€ totalPrice` in sola lettura. Messaggio d'errore
  se 422 ("Prezzo non disponibile: listino non configurato").
- **`useCreateBooking`**: payload senza `totalPrice`.
- **MSW** (test only): handler `GET /api/bookings/quote` con prezzo fisso.
- `BookingsView` (A2) invariata: mostra `totalPrice` reale (ora calcolato). Colonna Pacchetto mostra
  "—" finché A3.2 non porta il selettore.

### Seed del listino demo

Un listino demo per lo stabilimento demo: 1 `Package` Standard, 1 `Season` Estate 2026, 1
`Pricing`, alcune `Rate` (catch-all obbligatoria + 1–2 regole specifiche per dimostrare la
precedenza). UUID sintetici coerenti col pattern del seed esistente.

---

## 2. Test e build

Conteggi **verificati** sul DoD post-merge (`pnpm -r build` + `eslint .` verdi):

| Suite | Prima di A3.1 | A3.1 (verificato) | Δ |
|---|---|---|---|
| ui-kit | 14 | 14 | — |
| web-staff | 43 | 43 | — (`MapView.spec` aggiornato: prezzo da quote + create senza prezzo) |
| api unit | 46 | 59 | +13 (engine ×12 + proiezione `packageId` ×1) |
| api e2e | 40 | 47 | +7 (pricing e2e a 2 tenant: quote/precedenza/no-season/isolamento) |

Nuovi unit: `pricing.engine.spec.ts` (precedenza, wildcard, unit, no-match, centesimi); proiezione
`toPackageDTO`/`toBookingDTO packageId`.
Nuovi e2e: `pricing.e2e-spec.ts` — quote 401/200/422; create senza `totalPrice` → 201 col prezzo
calcolato; NO_SEASON/NO_RATE; isolamento 2 tenant; superuser → 400.
Nuovi web-staff: `MapView.spec` — modale mostra prezzo da quote (MSW), create senza `totalPrice`.

---

## 3. Confini mantenuti (cosa A3.1 NON fa)

- **Creazione `periodic`/`subscription` non abilitata**: `POST /api/bookings` resta `daily-only`.
  L'engine è già generale e unit-testato sui casi multi-giorno (pronto per A4).
- **Selettore Pacchetto non presente**: `Booking.packageId` è null in A3.1; il selettore arriva in
  A3.2. L'engine matcha già `packageId=null` (catch-all).
- **Extra non prezzati**: `Booking.extras` modellato, non sommato dall'engine.
- **`UmbrellaType` fuori dal pricing**: per decisione esplicita ([D-018](../architecture/deferred.md));
  il prezzo è per posizione (Settore/Fila).
- **Editor CRUD del listino rimandato** ([D-032](../architecture/deferred.md)): il listino è seeded
  (stesso pattern della mappa). Il gestore non può modificarlo dall'app fino all'editor.
- **Invariante non-overlap delle `Season` non enforced da CRUD**: seeded, quindi le stagioni non si
  sovrappongono per costruzione. L'enforcement applicativo arriva con l'editor ([D-032](../architecture/deferred.md)).
- **A2 invariata**: `PATCH /api/bookings/:id/payment`, `BookingsView`, drawer incasso invariati.
  Nessuna regressione attesa sui test A2.

---

## 4. Insidie e gotcha (riconfermati + nuovi)

- **`prisma generate` dopo cambio branch/schema**: il client generato può essere stale dopo switch
  su un branch con nuove tabelle (`Package`/`Season`/`Pricing`/`Rate`/`RateUnit`) → rigenerare
  **prima** di `nest build`/test. Stesso gotcha di A2.
- **Migrazioni da applicare a entrambi i DB**: `coralyn_dev` e `coralyn_test`. La migrazione A3.1
  aggiunge le 4 nuove tabelle, l'enum `RateUnit` e la colonna `Booking.packageId`.
- **DB su Docker, porta 5433** (invariato).
- **Rebuild api Docker dopo modifiche BE**: `docker compose --profile full up -d --build api`,
  altrimenti il FE prende 404. Login dev: `admin@coralyn.dev` / `coralyn-admin-8473`.
- **`.env` / `.env.test` locali** (`coralyn_app:coralyn_app@localhost:5433/coralyn_{dev,test}`):
  gitignored, da allineare su ogni macchina.
- **Dev server FE**: `corepack pnpm --filter @coralyn/web-staff dev` → Vite su **:5173**. Tenere
  una sola istanza. **Pulire `apps/web-staff/node_modules/.vite`** dopo cambi contratti
  (`CreateBookingInput` ha perso `totalPrice`).
- **FK forma-UUID**: `@Matches(UUID_REGEX)`, **non** `@IsUUID` stretto (rischio mismatch su UUID
  sintetici del seed). Stesso pattern di A1/A2.
- **Fuso `Europe/Rome`** per date operative ([ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)):
  confronti su `@db.Date` in UTC (`toDbDate`), mai metodi locali. `CatalogService.quote` usa la
  stessa utility.
- **`corepack pnpm`** (pin 11.9.0).

---

## 5. Prossimi slice

- **A3.2 — Selettore Pacchetto + ricalcolo nel modale**: scelta del `Package` reale nel modale
  "Nuova prenotazione", re-quote al cambio pacchetto/fascia, colonna Pacchetto reale in
  `BookingsView`. **Branch da `main`** (A3.1 è mergiata). Additivo, nessun cambio all'engine.
- **A4 — Periodiche/abbonamenti** ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)):
  `type=periodic`→`booked`, `type=subscription`→`season`, rinnovo `previousBookingId`. L'engine
  A3.1 è già pronto per i casi multi-giorno e `unit=period`.
- **Editor CRUD listino** ([D-032](../architecture/deferred.md)): dopo A3.2, gemello dell'opzione B
  (setup mappa, [ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
- In alternativa: **B** setup-form mappa CRUD, **C** staff-mgmt & RBAC ([D-025](../architecture/deferred.md)).

---

## 6. Riferimenti

- **Spec A3.1:** [docs/specs/2026-06-30-bookings-pricing-a3-1-design.md](../specs/2026-06-30-bookings-pricing-a3-1-design.md)
- **ADR pricing engine:** [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md)
- **ADR dominio prenotazioni & pricing:** [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md)
- **ADR fascia:** [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
- **ADR fuso/date:** [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
- **Modello dati:** [docs/design/data-model.md](../design/data-model.md)
- **Handoff precedente (A2):** [2026-06-30-bookings-a2-done.md](2026-06-30-bookings-a2-done.md)
