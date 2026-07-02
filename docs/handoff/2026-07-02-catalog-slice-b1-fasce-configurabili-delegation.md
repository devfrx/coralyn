# Handoff / Delega — Slice B1 "Fasce configurabili", da eseguire nella PROSSIMA sessione

> Documento di consegna. **Lo slice "Conferme coerenti & Rinnovi leggibili" è COMPLETO, MERGIATO su `main` e
> PUSHATO** (`origin/main` includeva `3b5db15` al momento della scrittura; sopra è stata poi committata la **spec di
> design di B1** `853a771` e questo handoff in cima). La prossima sessione **scrive il piano TDD ed esegue** lo slice
> B1 già progettato, poi prosegue in **sequenza** con B2 e Slice C (brainstorming+spec per B2/C prima di pianificare).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design
> (già fatta per B1) → RISOLVI le decisioni aperte con l'utente (già fatte per B1, spec §9) → **piano TDD** →
> implementa **subagent-driven, un commit per layer, test-first, da un NUOVO branch da `main`**.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi la documentazione rilevante**: la spec di B1
> [`docs/specs/2026-07-02-catalog-fasce-configurabili-b1-design.md`](../specs/2026-07-02-catalog-fasce-configurabili-b1-design.md)
> (4 layer, decisioni §9, rischi §7, B2 documentato §8), poi
> [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (fasce/slot),
> [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (orari `@db.Time`, round-trip UTC),
> [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (fascia = dimensione Rate), e la spec dello
> slice appena spedito [`docs/specs/2026-07-02-catalog-ux-confirms-renewals-design.md`](../specs/2026-07-02-catalog-ux-confirms-renewals-design.md)
> (contesto: `ConfirmDialog` di L1 che B1 riusa).

---

## 0. Situazione GIT
- **`main` = `origin/main`** con, in ordine: gli 8 commit dello slice Conferme&Rinnovi (fino a `3b5db15`), poi
  `853a771` (spec B1), poi questo handoff in cima. **All'avvio fai il sync standard §8 e fidati di `git log`, non di
  uno SHA scritto qui.**
- **Niente branch pendenti** (`catalog-confirms-renewals` eliminato dopo il merge FF). **Nessuna migrazione pendente.**
  Prossimo ADR libero: **0035** (B1 non ne richiede uno — incremento su ADR-0013).

## 1. Stato attuale (post slice "Conferme & Rinnovi", MERGIATO)
- **Baseline test da NON regredire (verificata live 2026-07-02):** **api unit 84 · api e2e 114 · web-staff 128
  (la suite globa gli spec di `ui-kit`) · ui-kit standalone 55.** Typecheck web-staff + ui-kit puliti (ui-kit ha ora
  la lib DOM nel tsconfig).
- Cosa ha spedito lo slice precedente: `ConfirmDialog` in ui-kit (riusabile — B1 lo usa per il delete-fascia);
  MapView `.mutate()`; **Rinnovi season-native** (`resolveSeasonById`, `SubscriptionsQueryDto`,
  `getByDestinationSeasonId`, contratti `*SeasonId`); microcopy campagne; + fix post-review (renew per id, DELETE
  campagna id malformato→404, empty-state gating rinnovi, ui-kit tsconfig DOM). Live-verificato.

## 2. LO SLICE — B1 "Fasce configurabili" (GIÀ PROGETTATO)
Spec approvata (design) e committata: **[docs/specs/2026-07-02-catalog-fasce-configurabili-b1-design.md](../specs/2026-07-02-catalog-fasce-configurabili-b1-design.md)**.
Decisioni **già risolte con l'utente** (spec §9). Resta da: scrivere il **piano TDD** ed **eseguirlo subagent-driven**
(un commit per layer), da un **nuovo branch** da `main`.

Quattro layer, in ordine (dettagli e regole precise nella spec):
1. **Contratti + backend CRUD** — `TimeSlotsController`/`TimeSlotsService` nel `CatalogModule` (pattern
   `SeasonsController`/`RatesController`); orari **"HH:MM"** round-trip UTC via nuovo `common/time.ts`
   (`toDbTime`/`formatDbTime`, con spec); validator `@IsClockTime()` gemello di `@IsCalendarDate`; `startTime<endTime`;
   **overlap fra fasce AMMESSO**; **delete-guard 409** (rate-ref o booking-ref, specchio di `deletePackage`) +
   **ultima fascia non eliminabile**; `TimeSlotDTO` espone `startTime`/`endTime` + `CreateTimeSlotInput`/`UpdateTimeSlotInput`.
   **Nessuna migrazione** (campi/FK esistono). e2e nuovo `time-slots.e2e-spec.ts`.
2. **Esposizione orari nel DTO mappa** — `map.projection.ts` include `startTime`/`endTime`; adegua `map.projection.spec`.
3. **FE editor fasce** nella vista Listino (`PricingView`) — lista + modale add/edit + delete via **`ConfirmDialog`**;
   nuovo `useTimeSlots.ts`; MSW handler `time-slots`.
4. **FE mappa: due metà derivate dagli orari** — regola deterministica §6 della spec (fascia "piena" riempie entrambe
   le metà via overlap già garantito dalla proiezione); fallback documentato; N-slot arbitrario → D-015 rimandato.

**Fuori scope (→ B2):** provenienza del prezzo (mostrare la `Rate` vincente nella modale + spiegare la precedenza).
Vedi §8 della spec B1: `resolvePrice` ritorna **già** la `rate` vincente, sarà soprattutto plumbing su
`BookingQuoteDTO` + UI. Brainstorming+spec dedicati per B2 prima di pianificare.

## 3. Sequenza dei prossimi slice (ordine deciso con l'utente)
1. **B1 "Fasce configurabili"** (sopra §2) — spec pronta, pianifica+esegui.
2. **B2 "Provenienza prezzo"** — spec §8 di B1 come traccia; fai **brainstorming+spec** dedicati e RISOLVI le decisioni
   con l'utente prima di pianificare. Estende `BookingQuoteDTO`/quote per esporre la Rate vincente; UI in MapView
   (modale) + editor Listino (precedenza ADR-0032).
3. **Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment`
   (`schema.prisma:191-201`; FE oggi edita solo `sunbeds`, `PricingView.vue`; `equipmentLabel` gestisce già chiavi
   ignote). **Decisione da prendere con l'utente:** free-form JSONB (rec: YAGNI) vs entità `EquipmentType` (→ nuovo ADR,
   confina con D-012). Brainstorming+spec prima.

## 4. D-0xx rimanenti da tenere in considerazione DOPO gli slice (registro: `docs/architecture/deferred.md`)
Da NON affrontare ora, ma da citare quando toccano l'area:
- **D-015** — orari arbitrari delle fasce: **concettualmente sbloccato da B1** (gli orari sono liberi HH:MM). Se serve
  un editor a "N turni liberi" con relativo rendering mappa N-slot, è qui che vive. B1 lo lascia rimandato.
- **D-012** — cabine/servizi accessori come risorse prenotabili: confina con Slice C (equipment). Se C sceglie l'entità
  `EquipmentType`, considera la parentela con D-012.
- **D-018** — prezzo per tipologia ombrellone; **D-033** — pricing multi-stagione; **D-030** — exclusion constraint DB
  anti-overlap: rimandati.
- Auth/hardening (D-026/D-027/D-029), i18n (D-003), GDPR (D-024): fuori area Catalogo, non toccarli.

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro con i
  tuoi tool, NON spawnare subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **⚠️ REBUILDA i container prima di testare in dev:** `docker compose --profile full up -d --build api web`. In questa
  sessione l'utente ha visto un **400 "date must be a real yyyy-mm-dd calendar date"** nei rinnovi in dev: NON era un
  bug del codice, era il **container `api` STANTÌO** (DTO vecchi a date) contro il FE nuovo (seasonId). Rebuild →
  risolto, verificato live 200. **Password admin container `coralyn-admin-8473`** (NON quella di `.env`). API su
  `localhost:3000/api`, web su `localhost:8080`, DB host `localhost:5433`. Stagioni dev: 2026 id `70000000-…-0001`,
  2027 id `70000000-…-0002`.
- **La suite `web-staff` globa gli spec `ui-kit`** (`../../packages/ui-kit/src/**/*.spec.ts`): non confondere i conteggi.
- **Dopo aver toccato `@coralyn/contracts`** (B1 tocca `TimeSlotDTO`): `corepack pnpm --filter @coralyn/contracts build`
  **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff.
- **Orari `@db.Time` round-trip UTC (ADR-0031):** SEMPRE `getUTCHours/getUTCMinutes` e
  `new Date('1970-01-01Thh:mm:00Z')`; **vietati** i metodi locali (slittamento). Concentra la conversione in
  `common/time.ts` con unit-spec (come il seed già fa per le fasce).
- **`prisma migrate dev`** ri-propone sempre uno spurio `DROP INDEX "Rate_signature_key"` → **rimuovilo** dal
  `migration.sql` generato; non è drift. (B1 NON dovrebbe richiedere migrazioni — verifica `prisma migrate status`.)
- **RLS FORCE** su tabelle tenant: `psql` diretto senza `app.current_tenant` mostra 0 righe (verifica via API con JWT
  o dentro `forTenant`).
- **ui-kit typecheck** ora è pulito (lib DOM aggiunta al tsconfig questo slice): non re-introdurre spec senza DOM.

## 6. Ancore di codice (file:riga, verificate 2026-07-02)
- **Pattern CRUD da rispecchiare**: `apps/api/src/catalog/seasons.controller.ts`, `seasons.service.ts`,
  `rates.controller.ts`, `rates.service.ts`; DTO in `apps/api/src/catalog/dto/`; proiezioni `season.projection.ts`,
  `rate.projection.ts`; registrazione in `CatalogModule` (`apps/api/src/catalog/catalog.module.ts`).
- **Delete-guard 409 da specchiare**: `catalog.service.ts:161-177` (`deletePackage`, pre-check `rate.count` +
  `booking.count` → `ConflictException`).
- **`TimeSlot`**: `apps/api/prisma/schema.prisma:95-107` (name/startTime/endTime `@db.Time(0)`/sortOrder). FK:
  `Booking_timeSlotId_fkey` **RESTRICT**, `Rate_timeSlotId_fkey` **SET NULL** (migrazioni `20260630125645_bookings`,
  `20260630203447_pricing`).
- **Overlap/anti-overlap (già overlap-aware)**: `apps/api/src/bookings/booking.availability.ts:8` (`slotsOverlap`,
  semiaperto) + `booking.availability.spec.ts:16-17` (Giornata vs metà); anti-overlap scrittura
  `bookings.service.ts:138-141` (`slotsOverlap(b.timeSlot, p.slot)`); proiezione mappa `map.projection.ts:52`
  (`stateBySlot` via `slotsOverlap`), `:37` (mapping `timeSlots`, oggi solo id/name/sortOrder → aggiungi orari).
- **Pricing (fascia = dimensione)**: `apps/api/src/catalog/pricing.engine.ts` (`resolvePrice` ritorna `{ ok,
  totalPrice, rate }` — la `rate` vincente serve a **B2**, non a B1).
- **Validator gemello**: `apps/api/src/common/is-calendar-date.ts` (crea `is-clock-time.ts` sullo stesso schema);
  `common/uuid.ts` (`UUID_SHAPE`); helper date esistente `apps/api/src/common/dates.ts` (crea `common/time.ts` gemello).
- **FE**: pill fasce `apps/web-staff/src/features/pricing/PricingView.vue:296-301` (da rendere editor); `useDayMap`
  `apps/web-staff/src/features/map/useDayMap.ts`; cella mappa `apps/web-staff/src/features/map/MapView.vue`
  (`slotState(u, idx)` usa `timeSlots[0]/[1]` — da derivare dagli orari, spec §6); `ConfirmDialog` da
  `@coralyn/ui-kit` (riuso delete); MSW `apps/web-staff/src/mocks/server.ts`; composabili pattern `useSeasons.ts`/`useRates.ts`.
- **Contratti**: `packages/contracts/src/index.ts` (`TimeSlotDTO` esposto dalla mappa; aggiungi orari + i due Input).

## 7. Workflow per lo slice (ADR-0009)
1. **Spec** — **già fatta** (§2).
2. **Decisioni aperte** — **già risolte** con l'utente (spec §9). Se in fase di piano emerge un nuovo bivio, chiedi.
3. **Piano TDD** — skill `superpowers:writing-plans` → `docs/superpowers/plans/`.
4. **Esegui** — skill `superpowers:subagent-driven-development`: un implementer per task (istruito a NON delegare),
   review indipendente per task, review whole-branch finale (opus), **un commit per layer**, da un **nuovo branch** da
   `main`. Non regredire i conteggi test (riverificali dal vivo).
5. **DOPO lo slice**: presenta lo stato all'utente e attendi conferma prima del successivo (poi B2: brainstorming+spec).

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare
in dev (password admin container `coralyn-admin-8473`).

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice "Conferme coerenti & Rinnovi leggibili" è COMPLETO, MERGIATO su `main` e PUSHATO. Verde su tutti i
> test (api unit 84 · e2e 114 · web-staff 128 · ui-kit 55), verificato live. La spec del PROSSIMO slice **B1 "Fasce
> configurabili"** è già scritta e committata su `main`.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev:
> `docker compose --profile full up -d --build api web`. DB host localhost:5433; password admin container
> `coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-02-catalog-slice-b1-fasce-configurabili-delegation.md`
> (sequenza slice, ancore di codice §6, gotcha §5 — in particolare: rebuild container obbligatorio; gli implementer
> subagent NON devono delegare), poi la spec `docs/specs/2026-07-02-catalog-fasce-configurabili-b1-design.md`, poi
> ADR-0013 (fasce), ADR-0031 (orari/UTC), ADR-0032 (fascia = dimensione Rate).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice già progettato B1 "Fasce configurabili" (4 layer:
> backend CRUD TimeSlots + orari HH:MM UTC + delete-guard 409; DTO orari nella mappa; FE editor fasce nel Listino con
> ConfirmDialog; FE mappa a due metà derivate dagli orari). (2) Poi B2 "Provenienza prezzo" (brainstorming+spec, RISOLVI
> le decisioni con me, poi piano+esegui). (3) Poi Slice C "Equipment personalizzato" (brainstorming+spec, decisione
> free-form vs entità EquipmentType con me). Tieni le D-0xx (D-015 orari arbitrari, D-012 servizi accessori, D-018
> prezzo tipologia…) in considerazione DOPO gli slice. Workflow ADR-0009 per OGNI slice: spec → risolvi decisioni con me
> → piano TDD → subagent-driven, un commit per layer, test-first, da un NUOVO branch da main. Non regredire i conteggi
> test (riverificali dal vivo).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
