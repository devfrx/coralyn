# Handoff / Delega — Slice "Conferme coerenti & Rinnovi leggibili" + roadmap Catalogo, da eseguire nella PROSSIMA sessione

> Documento di consegna. **Slice A "Scritture sicure & leggibili" è COMPLETO, MERGIATO su `main` e PUSHATO**
> (`origin/main` = `c414328`). Sopra è stata poi committata su `main` la **spec di design del prossimo slice**
> (`8e834a1`). La prossima sessione **pianifica ed esegue** lo slice già progettato, poi prosegue in **sequenza**
> con Slice B e C, tenendo le **D-0xx rimanenti** in considerazione dopo di essi.
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec di
> design (già fatta per il prossimo; da fare per B/C via brainstorming) → RISOLVI le decisioni aperte con l'utente
> → piano TDD → implementa **subagent-driven, un commit per layer, test-first, da un NUOVO branch da `main`**.

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi la documentazione rilevante**: la spec del prossimo slice
> [`docs/specs/2026-07-02-catalog-ux-confirms-renewals-design.md`](../specs/2026-07-02-catalog-ux-confirms-renewals-design.md)
> (4 layer, decisioni §9, rischi §8), poi la spec Slice A
> [`docs/specs/2026-07-02-catalog-slice-a-design.md`](../specs/2026-07-02-catalog-slice-a-design.md) (contesto
> appena spedito), [ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md) (prelazione),
> [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (fascia configurabile — Slice B),
> [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (una Rate = un prezzo),
> [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date/orari/stagioni), la spec D-032
> (`docs/specs/2026-07-01-pricing-editor-d032-design.md`) e la spec D-011.

---

## 0. Situazione GIT
- **`main` = `origin/main`** con, in ordine: `c414328` (Slice A), `8e834a1` (spec del prossimo slice), e il commit
  di questo handoff in cima. **All'avvio fai il sync standard §8 e fidati di `git log`, non di uno SHA scritto qui.**
- **Niente branch pendenti** (Slice A e il branch spec sono stati eliminati dopo il merge FF). Niente commit non
  pushati attesi (questo handoff viene pushato).
- **Nessuna migrazione pendente.** Prossimo ADR libero: **0035**.

## 1. Stato attuale (post Slice A)
- **Baseline test da NON regredire (verificata live 2026-07-02):** **api unit 83 · api e2e 112 · web-staff 119 ·
  ui-kit 41→49.** ⚠️ **La suite `web-staff` INCLUDE gli spec di `ui-kit`** (vitest include
  `../../packages/ui-kit/src/**/*.spec.ts`): "web-staff 119" = ~70 web-staff-only + 49 ui-kit; "ui-kit standalone"
  = 49. Quando aggiungi spec ui-kit, il totale web-staff cresce di conseguenza.
- Slice A spedito: `ApiError` col messaggio server, primitivo `Toast` in ui-kit, `onError` di default in
  `mutationResource` (toast globale), conferma delete-pacchetto, `GET /rates` `seasonId` obbligatorio→400, fix
  Modal a11y + Input string|number, mockup aspirazionale versionato. Live-verificato.

## 2. IL PROSSIMO SLICE — "Conferme coerenti & Rinnovi leggibili" (GIÀ PROGETTATO)
Spec approvata (design) e committata: **[docs/specs/2026-07-02-catalog-ux-confirms-renewals-design.md](../specs/2026-07-02-catalog-ux-confirms-renewals-design.md)**.
Le decisioni aperte sono **già risolte con l'utente** (spec §9). Resta da: scrivere il **piano TDD** ed
**eseguirlo subagent-driven** (un commit per layer), da un **nuovo branch** da `main`.

Quattro layer, in ordine:
1. **`ConfirmDialog` (ui-kit)** su `Modal` — API `title/description/confirm-label/cancel-label/tone` +
   `@confirm/@cancel`. Sostituisce `window.confirm` (stagione, pacchetto), **aggiunge** conferma a delete-tariffa
   e a "Chiudi campagna". Spec §3.
2. **`MapView` error-handling** — `confirmBooking`/`onCancel` da `await mutateAsync` (unhandled rejection) a
   `.mutate()`; modale prenotazione resta aperto su errore, si chiude su successo. Spec §4.
3. **Rinnovi season-native** — contratti (`originSeasonId`/`destinationSeasonId`,
   `RenewBookingInput.destinationSeasonId`), backend che risolve per id (nuovo `resolveSeasonById`), DTO con
   `UUID_SHAPE`, subscriptions con **DTO dedicato** (NON riusare `BookingsQueryDto` condiviso) + `seasonId`; FE con
   `<Select>` stagioni al posto delle date. Elimina il debito data↔stagione. Spec §5.
4. **Microcopy campagne** — spiegazione prelazione, legenda badge, empty state parlanti, conferma "Chiudi
   campagna" via `ConfirmDialog`. Niente wizard. Spec §6.

**Fuori scope (→ Slice B):** provenienza del prezzo nella modale prenotazione (mostrare la `Rate` combaciata) —
richiede estendere `BookingQuoteDTO`/`resolvePrice`, **stesso lavoro** dello spiegare-precedenza-in-editor già
destinato a B. Spec §7.

## 3. Sequenza dei prossimi slice (ordine deciso con l'utente)
1. **Slice "Conferme & Rinnovi"** (sopra §2) — spec pronta, pianifica+esegui.
2. **Slice B — "Fasce configurabili"** ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)):
   `TimeSlot` CRUD + orari (`startTime`/`endTime` "HH:MM", **round-trip UTC** per ADR-0031, vietati metodi locali);
   `TimeSlotsController/Service` in `CatalogModule` (pattern `SeasonsController`/`RatesController`); editor FE nella
   vista Listino (le pill fasce oggi mostrano solo `name`, `PricingView.vue:270-273`). **Nota all'ADR-0013**: gli
   orari erano "non esposti" nel booking; qui si espongono (additivo). Overlap fra fasce ammesso/intenzionale.
   Delete fascia referenziata → 409 (verifica le FK reali). **Qui confluisce la provenienza-prezzo** (§7 spec
   corrente): estendere `BookingQuoteDTO`/engine per esporre la `Rate` vincente e spiegare la precedenza in editor.
   Fai brainstorming+spec per B prima di pianificare.
3. **Slice C — "Equipment personalizzato"**: editor dinamico "voce+quantità" sul JSONB `Package.equipment` già
   esistente (`schema.prisma:191-201`; FE oggi edita solo `sunbeds` `PricingView.vue:313`, `equipmentLabel`
   `:49-61` già gestisce chiavi ignote). **Decisione da prendere:** free-form JSONB (rec: YAGNI) vs entità
   `EquipmentType` (confina con D-012 servizi accessori). Se entità → nuovo ADR. Brainstorming+spec prima.

## 4. D-0xx rimanenti da tenere in considerazione DOPO gli slice (registro: `docs/architecture/deferred.md`)
Da NON affrontare ora, ma da citare quando toccano l'area:
- **D-015** — orari arbitrari delle fasce (10–13): sbloccato *concettualmente* da Slice B; il modello a `Fascia` è
  già generalizzabile. Se B espone gli orari, valuta se D-015 diventa banale o resta rimandata.
- **D-012** — cabine/servizi accessori come risorse prenotabili: confina con Slice C (equipment). Se C sceglie
  l'entità `EquipmentType`, considera la parentela con D-012.
- **D-018** — prezzo per tipologia ombrellone: additivo all'engine (un `ambito`); resta rimandato salvo domanda.
- **D-033** — pricing periodica multi-stagione: rimandato (stagioni non contigue nell'MVP).
- **D-030** — exclusion constraint DB anti-overlap prenotazioni: rimandato (invariante applicativa sufficiente).
- Auth/hardening (D-026/D-027/D-029), i18n (D-003), GDPR cliente (D-024): fuori dall'area Catalogo, non toccarli.

## 5. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** In questa sessione un subagent Task ha tentato di
  spawnare un figlio annidato invece di lavorare (nesting non consentito) → nessun output, e in parallelo al
  ri-dispatch ha causato una **race** su un file (dup di una funzione, poi ripulita). **Istruisci ogni implementer:
  "fai TU il lavoro con i tuoi tool, NON spawnare subagent".** Se un implementer finisce a mani vuote, verifica
  `git log`/working-tree PRIMA di ri-dispatchare, e dopo un ri-dispatch verifica l'assenza di doppioni.
- **La suite `web-staff` globa gli spec `ui-kit`** (vedi §1): non confondere i conteggi.
- **Container dev**: password admin del container è **`coralyn-admin-8473`** (NON quella di `.env` `coralyn-admin`;
  la login fallisce con quella di `.env`). API su `localhost:3000/api`, web su `localhost:8080`. **Rebuilda prima
  di testare in dev:** `docker compose --profile full up -d --build api web`. DB host `localhost:5433`.
- **`SEED_ON_START: "true"`** nel container api semina admin + stabilimento dev (00000000-…-0001) + 2 stagioni.
- **Report file dei subagent**: se scrivi il path del report come `C:\...` in un contesto bash, può finire come
  file spazzatura mangled nella root — usa path forward-slash o `.superpowers/sdd/task-N-report.md` relativo.
- **`prisma migrate dev`** ri-propone sempre uno spurio `DROP INDEX "Rate_signature_key"` (indice raw D-032 non
  modellato) → **rimuovilo SEMPRE** dal `migration.sql` generato; non è drift. (Slice "Conferme & Rinnovi" NON
  richiede migrazioni; Slice B potrebbe non richiederle — `TimeSlot` esiste già a schema.)
- **RLS FORCE** su tabelle tenant: `psql` diretto senza `app.current_tenant` mostra 0 righe (verifica via API con
  JWT o dentro `forTenant`).
- **Contratti**: dopo aver toccato `@coralyn/contracts`, `corepack pnpm --filter @coralyn/contracts build` e
  `rm -rf apps/web-staff/node_modules/.vite`. (`pnpm -r build` fa girare `prepare`→build contracts.)
- **Anti-overlap prelazione**: `dateRangesOverlap` è la fonte unica; il where Prisma delle finestre lo duplica con
  commento "keep in sync" (`renewal-campaigns.service.ts:62-63`).

## 6. Ancore di codice (file:riga, verificate 2026-07-02)
- **ConfirmDialog / conferme**: `packages/ui-kit/src/components/Modal.vue`, `ModalFooter.vue`; usi delete in
  `apps/web-staff/src/features/pricing/PricingView.vue` (`confirmDeleteSeason` :36-40, `confirmDeletePackage`
  :49-52, delete-tariffa `deleteRate.mutate` :293).
- **MapView**: `apps/web-staff/src/features/map/MapView.vue` (`confirmBooking` :125-137, `onCancel` :138-140,
  `modalBooking` :142, quote/error :143-155/:316).
- **Rinnovi FE**: `apps/web-staff/src/features/renewals/RenewalsView.vue` (date inputs :59-66, badge :49-53, CTA
  apri/chiudi :74/:79, Rinnova :95/:114); `apps/web-staff/src/features/renewals/useRenewals.ts`
  (`useSubscriptions` :9, `useRenewalCampaign` :30, `useOpenCampaign` :40, `useRenewBooking` :19); `useSeasons` in
  `apps/web-staff/src/features/pricing/useSeasons.ts`.
- **Rinnovi BE**: `apps/api/src/bookings/renewal-campaigns.controller.ts` / `.service.ts` (`open` :21, `getByDest`
  :51, `close` :102); DTO `apps/api/src/bookings/dto/open-renewal-campaign.dto.ts`,
  `renewal-campaign-query.dto.ts`; `apps/api/src/bookings/bookings.service.ts` (`renew` :255-293,
  `listSubscriptions` :296); controller `apps/api/src/bookings/bookings.controller.ts` (subscriptions :20-23, usa
  `BookingsQueryDto` **condiviso** :4-8 → NON modificarlo, crea DTO dedicato).
- **resolveSeasonWithin / resolveSeasonById (nuovo)**: `apps/api/src/catalog/catalog.service.ts:58-74`
  (`resolveSeasonWithin`); il nuovo `resolveSeasonById` ne è il mirror per id.
- **UUID validator**: `apps/api/src/common/uuid.ts` (`UUID_SHAPE`); calendario `common/is-calendar-date.ts`.
- **Contratti rinnovi**: `packages/contracts/src/index.ts` (`OpenRenewalCampaignInput` :195, `RenewBookingInput`
  :166, `RenewalCampaignDTO` :202, `SubscriptionListItemDTO` :171).
- **Slice B (fasce)**: `apps/api/prisma/schema.prisma` `TimeSlot` (name/startTime/endTime/sortOrder, oggi solo
  seedate); pill fasce FE `PricingView.vue:270-273`, opzioni da `useDayMap().timeSlots`.
- **Slice C (equipment)**: `schema.prisma` `Package.equipment Json @db.JsonB`; FE `PricingView.vue:313` (sunbeds),
  `equipmentLabel` :49-61.

## 7. Workflow per OGNI slice (ADR-0009)
1. **Spec** — per il prossimo slice è **già fatta** (§2). Per B e C: brainstorming (skill `superpowers:brainstorming`)
   → spec in `docs/specs/`.
2. **Risolvi le decisioni aperte con l'utente** prima del piano.
3. **Piano TDD** — skill `superpowers:writing-plans` → `docs/superpowers/plans/`.
4. **Esegui** — skill `superpowers:subagent-driven-development`: un implementer per task (istruito a NON delegare),
   review indipendente per task, review whole-branch finale (opus), un commit per layer, da un **nuovo branch** da
   `main`. Non regredire i conteggi test (riverificali dal vivo).
5. **DOPO ogni slice**: presenta lo stato all'utente e attendi conferma prima del successivo.

## 8. Sync macchina "zagor"/"Jays"
All'avvio: `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i container prima di
testare in dev (password admin container `coralyn-admin-8473`).

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: Slice A "Scritture sicure & leggibili" del consolidamento Catalogo è COMPLETO, MERGIATO su `main` e
> PUSHATO. Verde su tutti i test (api unit 83 · e2e 112 · web-staff 119 · ui-kit 49), verificato live. La spec del
> PROSSIMO slice ("Conferme coerenti & Rinnovi leggibili") è già scritta e committata su `main`.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`
> prima di fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev:
> `docker compose --profile full up -d --build api web`. DB host localhost:5433; password admin container
> `coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-02-catalog-confirms-renewals-and-roadmap-delegation.md`
> (sequenza slice, ancore di codice §6, gotcha §5 — in particolare: gli implementer subagent NON devono delegare),
> poi la spec del prossimo slice `docs/specs/2026-07-02-catalog-ux-confirms-renewals-design.md`, poi ADR-0034
> (prelazione), ADR-0013 (fasce), ADR-0031 (date/stagioni), ADR-0032 (una Rate = un prezzo).
>
> TASK, in sequenza: (1) PIANIFICA ed ESEGUI lo slice già progettato "Conferme coerenti & Rinnovi leggibili"
> (4 layer: ConfirmDialog in ui-kit + conferme distruttive; MapView error-handling; Rinnovi season-native con
> backend seasonId; microcopy campagne). (2) Poi Slice B "Fasce configurabili" (ADR-0013; qui confluisce la
> provenienza-prezzo rimandata). (3) Poi Slice C "Equipment personalizzato". Per B e C fai prima brainstorming+spec
> e RISOLVI con me le decisioni aperte. Tieni le D-0xx rimanenti (D-015 orari arbitrari, D-012 servizi accessori,
> D-018 prezzo tipologia…) in considerazione DOPO gli slice, senza affrontarle ora. Workflow ADR-0009 per OGNI
> slice: spec → risolvi decisioni con me → piano TDD → subagent-driven, un commit per layer, test-first, da un
> NUOVO branch da main. Non regredire i conteggi test (riverificali dal vivo).
>
> DOPO ogni slice: presentami lo stato e attendi conferma prima del successivo.
