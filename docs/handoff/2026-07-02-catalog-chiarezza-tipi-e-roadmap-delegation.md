# Handoff / Delega — Slice "Chiarezza tipi prenotazione" + roadmap Catalogo

> Documento di consegna per la **prossima sessione**. Gli slice **B1 "Fasce configurabili"** e **B2 "Provenienza
> prezzo"** sono **COMPLETI, MERGIATI su `main` e PUSHATI** (`origin/main = d9efad2`). Verde su tutti i test,
> verificato live. La spec del **prossimo slice "Chiarezza tipi prenotazione"** è **già scritta e committata**
> (decisioni risolte con l'utente). La prossima sessione **scrive il piano TDD ed esegue** quello slice, poi prosegue
> con **Slice C "Equipment"** (brainstorming+spec prima).
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di design
> → RISOLVI le decisioni aperte con l'utente → **piano TDD** → implementa **subagent-driven, un commit per layer,
> test-first, da un NUOVO branch da `main`**.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi**: la spec dello slice
> [`docs/specs/2026-07-02-catalog-chiarezza-tipi-prenotazione-design.md`](../specs/2026-07-02-catalog-chiarezza-tipi-prenotazione-design.md)
> (3 layer, regola di calcolo §2, decisioni §7, migrazione §3.1), poi
> [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (dimensioni Rate/precedenza — lo slice
> **rimuove `unit`**), [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio pricing),
> [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date). Contesto B2:
> [`docs/specs/2026-07-02-catalog-provenienza-prezzo-b2-design.md`](../specs/2026-07-02-catalog-provenienza-prezzo-b2-design.md)
> (`matchedRate`/`matchedRateLabel` che questo slice adegua).

---

## 0. Situazione GIT
- **`main = origin/main = d9efad2`** con, in ordine: slice precedenti, poi B1 (fino a `a799665`), poi B2 (fino a
  `d9efad2`), poi questi documenti (spec chiarezza-tipi + questo handoff + D-034 in `deferred.md`). **All'avvio fai il
  sync standard §8 e fidati di `git log`, non di uno SHA scritto qui.**
- **Niente branch pendenti** (`catalog-fasce-configurabili` e `catalog-provenienza-prezzo` eliminati dopo i merge FF).
  **Nessuna migrazione pendente** (`prisma migrate status` pulito). Prossimo ADR libero: **0035**. Prossimo D libero:
  **D-035** (D-034 appena registrato).

## 1. Stato attuale (post B1+B2, MERGIATI)
- **Baseline test da NON regredire (verificata live 2026-07-02):** **api unit 89 · api e2e 126 · web-staff 141 (globa
  ui-kit) · ui-kit standalone 55.** Typecheck web-staff + ui-kit puliti.
- **B1 "Fasce configurabili"** (merged `a799665`): CRUD `TimeSlots` in `CatalogModule` + `common/time.ts` (HH:MM
  round-trip UTC) + `@IsClockTime` + `start<end`→400 + overlap-allowed + delete-guard 409 (rate/booking/ultima fascia);
  `map.projection` espone `startTime/endTime`; FE editor fasce; `MapView.halfSlots` deriva le due metà dagli orari.
- **B2 "Provenienza prezzo"** (merged `d9efad2`): il quote espone `matchedRate: RateDTO` (Rate vincente); modale
  "Tariffa applicata: «…»" (label composta nel FE, gestisce anche fila/periodo); editor tariffe ordinato per
  specificità + legenda ADR-0032. Prezzo server-autoritativo invariato. + fix wildcard tabella "—"→"Tutte/Tutti".

## 2. LO SLICE — "Chiarezza tipi prenotazione" (GIÀ PROGETTATO)
Spec approvata: **[docs/specs/2026-07-02-catalog-chiarezza-tipi-prenotazione-design.md](../specs/2026-07-02-catalog-chiarezza-tipi-prenotazione-design.md)**.
Decisioni **già risolte con l'utente** (spec §7). Resta da: **piano TDD** + esecuzione subagent-driven, un commit per
layer, da un **nuovo branch** da `main`.

**Problema:** `type` (daily/periodic/subscription) decide l'INTERVALLO ed è dimensione di prezzo; `unit` (day/period)
decide il CALCOLO ed è **ortogonale e non vincolato** → tariffe insensate (Abbonamento + `unit=day` = `price × ~120
giorni`) e confusione UI. **Soluzione (opzione 1, decisa):** il calcolo si **deriva dal tipo**, si **rimuove `unit`**:
- `daily` → `price × 1`; `periodic` → `price × giorni`; `subscription` → `price` (**forfait**, giorni ignorati).

Tre layer (dettagli nella spec):
1. **Backend — modello:** migrazione (drop `Rate.unit` + enum `RateUnit`; la firma unique NON include `unit`); engine
   calcola da `ctx.type`; rimozione `unit` da contratti/DTO/proiezioni/engine/seed (`seed-pricing.ts` centrale).
2. **FE editor:** via il selettore "Unità"; colonna Prezzo deriva il significato dal **tipo della tariffa**
   (`subscription`→"forfait", altrimenti "/giorno").
3. **FE prenotazione:** `matchedRateLabel` deriva "/g vs forfait" dal **tipo corrente**; **+ spiegazione inline** per
   ogni tipo nel modale.

**Fuori scope:** forfait-periodo → **D-034** (registrato). Sotto-decisione minore aperta (spec §7.4): avviso "manca
tariffa Abbonamento" — **default = no** (YAGNI); se l'utente lo vuole in fase di piano, è additivo.

## 3. Sequenza dei prossimi slice
1. **"Chiarezza tipi prenotazione"** (sopra §2) — spec pronta, **pianifica+esegui**.
2. **Slice C "Equipment personalizzato"** — editor "voce+quantità" sul JSONB `Package.equipment`
   (`schema.prisma:208-212`; FE oggi edita solo `sunbeds` in `PricingView.vue`; `equipmentLabel` gestisce già chiavi
   ignote). **Decisione da prendere con l'utente:** free-form JSONB (rec: YAGNI) vs entità `EquipmentType` (→ nuovo ADR,
   confina con D-012). **Brainstorming+spec prima.**

**Scartato dall'utente (non riproporre a meno di richiesta):** "solo combinazioni legali" nel modale prenotazione
(filtrare fascia×pacchetto alle sole con tariffa) — con la catch-all è di fatto un no-op; il modale già blocca il
confirm su `NO_RATE` (422 "listino non configurato").

## 4. D-0xx da tenere in vista DOPO gli slice (registro: `docs/architecture/deferred.md`)
Da NON affrontare ora, ma da citare quando toccano l'area:
- **D-034** (NUOVO) — **forfait per prenotazione periodica** (pacchetto-settimana a prezzo fisso). Nasce dal "per ora"
  di questo slice: reintroducibile senza rompere il modello (es. forfait a livello `Package`).
- **D-015** — orari arbitrari fasce (sbloccato concettualmente da B1).
- **D-012** — cabine/servizi accessori come risorse prenotabili: confina con Slice C.
- **D-018** — prezzo per tipologia ombrellone; **D-033** — pricing periodico multi-stagione; **D-030** — exclusion
  constraint DB anti-overlap: rimandati.
- Auth/hardening (D-025/026/027/028/029), i18n (D-003), GDPR (D-024): fuori area Catalogo, non toccarli.

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Istruisci ogni implementer: "fai TU il lavoro con i
  tuoi tool, NON spawnare subagent". Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **⚠️ REBUILDA i container prima di testare in dev:** `docker compose --profile full up -d --build api web`. In questa
  sessione l'utente ha visto **due volte** bug da container stantìo: `POST /api/time-slots` **404** (B1 non nell'api) e
  la label **"Tariffa applicata" vuota** (B2 non nell'api). NON erano bug: erano il container `api` vecchio. Rebuild →
  risolto, verificato live. **Password admin container `coralyn-admin-8473`** (NON quella di `.env`). API su
  `localhost:3000/api`, web docker su `localhost:8080`, **web vite dev su `localhost:5173`** (proxy `/api`→3000), DB
  host `localhost:5433`. Login dev: `admin@coralyn.dev` / `coralyn-admin-8473`. Stagioni dev: 2026 id `70000000-…-0001`,
  2027 id `70000000-…-0002`.
- **La suite `web-staff` globa gli spec `ui-kit`** (`../../packages/ui-kit/src/**/*.spec.ts`): non confondere i conteggi.
- **Dopo aver toccato `@coralyn/contracts`** (questo slice tocca `RateDTO`): `corepack pnpm --filter @coralyn/contracts
  build` **e** `rm -rf apps/web-staff/node_modules/.vite` prima dei test web-staff.
- **`prisma migrate dev`** ri-propone sempre uno spurio `DROP INDEX "Rate_signature_key"` → **rimuovilo** dal
  `migration.sql` generato (indice raw, non drift). Questo slice **richiede** una migrazione (drop `unit`): la firma
  unique della `Rate` NON include `unit`, quindi il drop è pulito.
- **Orari `@db.Time` round-trip UTC (ADR-0031):** `common/time.ts` è l'unica sede (`getUTCHours/Minutes`, mai locali).
- **RLS FORCE** su tabelle tenant: `psql` diretto senza `app.current_tenant` mostra 0 righe (verifica via API con JWT o
  dentro `forTenant`).

## 6. Ancore di codice (file:riga, verificate 2026-07-02)
- **Motore prezzo:** `apps/api/src/catalog/pricing.engine.ts` — `PricingContext.type` (già presente), `RateRow.unit`
  (`:25`, da rimuovere), calcolo `:90-92` (da riscrivere su `ctx.type`). Spec `pricing.engine.spec.ts` (factory
  `rate()` `:14`).
- **Intervallo dal tipo:** `apps/api/src/bookings/bookings.service.ts` — `deriveInterval` (`:81-102`, INVARIATO);
  `priceOrThrow`→`throwPriceError` e `quote` (B2, `:48-75`).
- **Proiezioni/service:** `catalog.service.ts` — `toRateRow` (`:27`), `rateRowToDTO` (B2), `priceWithin` (`:92`);
  `rate.projection.ts` `toRateDTO`; `rates.service.ts` create/update.
- **DTO:** `apps/api/src/catalog/dto/create-rate.dto.ts` + `update-rate.dto.ts` (campo `unit` + `UNITS` da rimuovere);
  `create-rate.dto.spec.ts`.
- **Schema/seed:** `apps/api/prisma/schema.prisma` (`RateUnit` `:203`, `Rate.unit` `:258`, `@@unique` senza `unit`);
  `apps/api/prisma/seed.ts`; helper e2e **`apps/api/test/helpers/seed-pricing.ts`** (centrale — usato da rates/bookings/
  packages/renewal-campaigns/seasons/time-slots e2e).
- **Contratti:** `packages/contracts/src/index.ts` — `RateDTO`/`RateUnit`/`CreateRateInput`/`UpdateRateInput`,
  `BookingQuoteDTO.matchedRate`.
- **FE editor:** `apps/web-staff/src/features/pricing/PricingView.vue` — modale tariffa (`rUnit`, `UNIT_OPTIONS`,
  `<Select>` unità, `unitLabel`), colonna Prezzo; `PricingView.spec.ts`.
- **FE prenotazione:** `apps/web-staff/src/features/map/MapView.vue` — `bookingType` Select (`:326-329`),
  `matchedRateLabel` (B2, usa `matchedRate.unit` → passare a `bookingType`), riga "Durata: stagione intera" (`:350`);
  `MapView.spec.ts`. MSW `apps/web-staff/src/mocks/server.ts` (`/rates`, `/bookings/quote`).

## 7. Workflow per lo slice (ADR-0009)
1. **Spec** — **già fatta** (§2).
2. **Decisioni aperte** — **già risolte** (spec §7); resta solo la sotto-decisione minore §7.4 (avviso), default = no.
3. **Piano TDD** — skill `superpowers:writing-plans` → `docs/superpowers/plans/`.
4. **Esegui** — skill `superpowers:subagent-driven-development`: un implementer per task (istruito a NON delegare),
   task-review indipendente per task (spec + qualità), review whole-branch finale (opus), **un commit per layer**, da un
   **nuovo branch** da `main`. Non regredire i conteggi test (riverificali dal vivo). Ordine layer: backend prima
   (motore+migrazione+contratti verdi), poi FE editor, poi FE prenotazione.
5. **DOPO lo slice**: presenta lo stato all'utente e attendi conferma prima del successivo (poi Slice C:
   brainstorming+spec).

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di testare
in dev (password admin container `coralyn-admin-8473`).

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: gli slice **B1 "Fasce configurabili"** e **B2 "Provenienza prezzo"** sono COMPLETI, MERGIATI su `main` e
> PUSHATI (`origin/main = d9efad2`). Verde su tutti i test (api unit 89 · e2e 126 · web-staff 141 · ui-kit 55),
> verificato live. La spec del PROSSIMO slice **"Chiarezza tipi prenotazione"** è già scritta e committata su `main`
> (decisioni risolte con me).
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev:
> `docker compose --profile full up -d --build api web` (in questa sessione bug da container stantìo visti due volte:
> 404 su rotta nuova, label vuota — non erano bug del codice). DB host localhost:5433; password admin container
> `coralyn-admin-8473`; login dev `admin@coralyn.dev`/`coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-02-catalog-chiarezza-tipi-e-roadmap-delegation.md`
> (sequenza slice, ancore di codice §6, gotcha §5 — rebuild container obbligatorio; implementer NON deve delegare;
> `seed-pricing.ts` è l'helper centrale; migrazione con lo spurio DROP INDEX da rimuovere), poi la spec
> `docs/specs/2026-07-02-catalog-chiarezza-tipi-prenotazione-design.md`, poi ADR-0032 (dimensioni Rate/precedenza),
> ADR-0006 (dominio pricing), ADR-0031 (date/UTC).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice già progettato "Chiarezza tipi prenotazione" (3
> layer: backend — il calcolo si deriva dal tipo di prenotazione, si RIMUOVE il campo `unit` dalla `Rate`, con
> migrazione; FE editor — via il selettore Unità; FE prenotazione — spiegazione dei tipi + `matchedRateLabel` per
> tipo). Regola: giornaliera→price×1, periodica→price×giorni, abbonamento→price forfait. (2) Poi Slice C "Equipment
> personalizzato" (brainstorming+spec, decisione free-form JSONB vs entità `EquipmentType` con me). Tieni i D-0xx
> (D-034 forfait-periodo appena registrato, D-015 orari arbitrari, D-012 servizi accessori, D-018 prezzo tipologia…) in
> considerazione DOPO gli slice. Workflow ADR-0009 per OGNI slice: spec → risolvi decisioni con me → piano TDD →
> subagent-driven, un commit per layer, test-first, da un NUOVO branch da main. Non regredire i conteggi test
> (riverificali dal vivo).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
