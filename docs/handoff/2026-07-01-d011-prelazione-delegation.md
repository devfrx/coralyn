# Handoff / Delega — Prelazione abbonamenti (D-011), da eseguire nella PROSSIMA sessione

> Documento di consegna. **D-032 (editor CRUD del listino) è COMPLETO** su un branch **non
> ancora mergiato** (`feat/d032-pricing-editor`). Il prossimo slice è **D-011 (prelazione
> abbonamenti)**, la cui **esecuzione — spec → piano → implementazione TDD — è delegata alla
> sessione successiva** (l'utente ha scelto D-011 e ha chiesto un handoff perfetto).

> ⚠️ **PRIMA DI SCRIVERE CODICE — leggi TUTTA la documentazione** ([ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)):
> `docs/architecture/` (README + `deferred.md` righe **D-011**/D-012/D-013/D-006, `glossary.md`
> voci *Abbonamento/Rinnovo/Anzianità*), [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)
> (gestione abbonamenti — **D-011 è esplicitamente il "fuori MVP" rimandato lì**),
> [ADR-0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) (dominio
> prenotazioni), [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)
> (anti-overlap a slot), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
> (date operative Europe/Rome). Per il **contesto di prezzo/rinnovo** vedi la spec e l'handoff di
> D-032 (`docs/specs/2026-07-01-pricing-editor-d032-design.md`, questo handoff è il suo seguito).

---

## 0. Situazione GIT (leggere con attenzione — c'è lavoro non mergiato)

- **`main`** è fermo a `ccf739a` in locale, **avanti di 2 commit rispetto a `origin/main` non
  pushati** (fix rotte login `9b74b80` + autoPort dev-server `ccf739a`). **Non fare hard reset**:
  un `merge --ff-only origin/main` è sicuro, un reset distruttivo perde quei 2 commit.
- **`feat/d032-pricing-editor`** = `main` + **4 commit D-032** (`813e2d9` contratti · `782a2ed`
  backend · `ad8cbab` frontend · `0713fe9` docs), **NON mergiato** (l'utente ha scelto "tieni il
  branch così"). Verde su tutti i test, verificato live. `deferred.md` già lo segna Risolto.
- **D-011 NON dipende da D-032** (estende A4.2, che è già su `main`). Due opzioni per iniziare,
  **chiedi all'utente**:
  1. Se l'utente nel frattempo ha mergiato D-032 su `main` → branch D-011 da `main`.
  2. Altrimenti → branch D-011 **da `main`** comunque (D-011 non tocca il listino), lasciando
     `feat/d032-pricing-editor` in attesa. Evita di partire da `feat/d032-pricing-editor` (porteresti
     dentro D-032 non ancora deciso).
- **Nessuna migrazione pendente.** Container `coralyn-api` e `coralyn-db` erano UP e freschi
  (rebuild del 2026-07-01 ~14:58).

## 1. Cosa ha prodotto QUESTA sessione (D-032)

Editor CRUD del listino consegnato secondo ADR-0009, subagent-driven, **un commit per layer**:
- **Contratti** (`813e2d9`): `SeasonDTO`/`RateDTO`/input, `UpdateRateInput` con dimensioni
  clearabili (`| null`).
- **Backend** (`782a2ed`): `SeasonsController`/`RatesController` + scritture `PackagesController`
  in `CatalogModule` (ora esplicito in `AppModule`); `Pricing` 1:1 automatico e mai esposto;
  delete stagione a cascata applicativa (Rate→Pricing→Season, FK RESTRICT); non-ambiguità `Rate`
  (indice raw `Rate_signature_key`, `23505`→`P2002`→**409**) **senza migrazione**; **delete
  pacchetto referenziato → 409** (le FK `packageId` di `Rate`/`Booking` sono `ON DELETE SET NULL`,
  non RESTRICT — un catch `P2003` sarebbe codice morto e cancellerebbe azzerando silenziosamente).
  Validator generici `IsCalendarDate`/`UUID_SHAPE` spostati in `apps/api/src/common/`.
- **Frontend** (`ad8cbab`): `PricingView` da mock a editor reale; riuso `ui-kit` (ADR-0033);
  icona `trash-2` aggiunta al registry (additivo); conferma sul delete stagione.
- **Docs** (`0713fe9`): D-032 in `deferred.md` §Risolte + piano
  `docs/superpowers/plans/2026-07-01-pricing-editor-d032.md`.

`pricing.engine.ts` e `schema.prisma` **intatti**. Whole-branch review (opus) + fix + re-review
clean. **Verifica visiva live riuscita** (editor carica dati reali dal backend, modali funzionano).

## 2. IL TASK della prossima sessione — D-011

**Prelazione abbonamenti completa** (da [ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md),
sezione "Fuori MVP → D-011"): **finestre di rinnovo con scadenza, rilascio automatico del posto se
non rinnovato, priorità per anzianità**. Estende A4.2 (rinnovo in un clic + lista abbonati +
seniority, già implementati).

**Workflow (ADR-0009):** scrivi PRIMA la **spec di design** (investigativa, cita file:riga come ha
fatto la spec D-032), decidi le questioni aperte (§4), poi **scrivi il piano TDD**
(`superpowers:writing-plans`) e **eseguilo task-by-task** (`superpowers:subagent-driven-development`),
un commit per layer, test-first, da un **nuovo branch** (vedi §0 per la base).

### Scope indicativo (da raffinare nella spec)
- **Modello "campagna di prelazione"**: per la stagione entrante, ogni abbonato della stagione
  precedente ha una **finestra** (dal … al …) entro cui esercitare la prelazione (rinnovare il
  proprio posto). Priorità/ordine per **anzianità** (`seniority`, già derivata).
- **Scadenza + rilascio automatico**: allo scadere della finestra senza rinnovo, il posto si
  **libera** (diventa prenotabile da altri). Oggi il rinnovo è manuale e il posto resta "occupato"
  solo se esiste una `Booking confirmed` nella stagione destinazione — quindi "rilascio" qui
  significa gestire lo **stato della finestra/offerta**, non cancellare una prenotazione che non
  esiste ancora.
- **Frontend**: estende `RenewalsView` (campagna rinnovi) con lo stato delle finestre
  (aperta/scaduta/esercitata), l'ordinamento per anzianità, e le azioni di prelazione.

## 3. Confini / fuori scope (proponi nella spec, poi conferma con l'utente)
- **Notifiche** di scadenza/rinnovo → dipendono dal modulo notifiche ([D-006](../architecture/deferred.md)), **fuori**.
- **Sospensione/cessione/disdetta** → [D-013](../architecture/deferred.md), **fuori**.
- **Pagamento anticipato / caparra** per confermare la prelazione → probabilmente fuori (lega a [D-009](../architecture/deferred.md)).

## 4. ⚠️ Decisioni di design da prendere PRIMA (probabile ADR-0034)

Queste emergono dalla mappatura del codice esistente (vedi §6). **Non c'è un pattern già pronto**:
D-011, a differenza di D-032, **introduce architettura nuova** → **valuta se serve un ADR** (il
prossimo libero è **0034**; D-032 non ne ha richiesti, ma D-011 con scheduling/nuovi stati sì).

1. **Come modellare la "finestra di prelazione" e la sua scadenza.** Opzioni: (a) entità/tabella
   nuova `RenewalOffer`/`PreemptionWindow` (customer+umbrella+season origine/destinazione, apertura,
   scadenza, stato); (b) campi additivi su qualcosa di esistente; (c) puramente derivato (finestra =
   `[oggi, season.endDate + grace]`) senza persistere lo stato. Trade-off: persistere dà audit e
   stato esplicito ma è più pesante; derivare è leggero ma non traccia "esercitata/scaduta".
2. **Rilascio automatico: come si attiva.** **NON esiste alcuna infrastruttura di scheduling/cron**
   nell'API (verificato: nessun `@nestjs/schedule`, `@Cron`, `setInterval`, Bull — vedi §6.7).
   Opzioni: (a) **valutazione lazy** (la finestra si considera "scaduta" quando la si legge/quando si
   tenta un'azione, confrontando con `todayInRome()` — nessun job, coerente con lo stile applicativo
   di A1/anti-overlap); (b) **job schedulato** (`@nestjs/schedule` ScheduleModule) che a scadenza
   marca/rilascia; (c) DB polling. **Raccomandazione da valutare:** la lazy-evaluation è la più
   coerente con l'MVP (niente nuova infra, niente stato di background), come l'anti-overlap è
   applicativo e non un exclusion-constraint DB ([D-030](../architecture/deferred.md)). Se si sceglie
   (b)/(c) serve un ADR per la scelta dello scheduler.
3. **Serve un nuovo `BookingStatus`?** Oggi solo `confirmed | cancelled` (`schema.prisma:53-56`).
   La prelazione riguarda **offerte di rinnovo**, non prenotazioni: probabilmente lo stato vive
   sull'entità/finestra di prelazione, **non** su `Booking` → evita di toccare l'enum `BookingStatus`
   se non necessario (cambiarlo tocca mappa/disponibilità/pagamenti). Decidilo esplicitamente.
4. **Priorità per anzianità**: `seniority` è **derivata a query-time** (risalita catena
   `previousBookingId`, `bookings.service.ts:282-314`), non memorizzata. Per ordinamenti/priorità
   della campagna va bene così (profondità catena = 1 per stagione, economico). Non denormalizzare
   senza motivo (YAGNI).
5. **Interazione con l'anti-overlap**: il check esclude la sorgente del rinnovo
   (`bookings.service.ts:129-140`, esclude `previousBookingId`). La prelazione deve **preservare**
   questo: finché la finestra di un abbonato è aperta, il suo posto non dev'essere prenotabile da
   altri; alla scadenza/rinuncia, si libera.

## 5. Insidie note (gotcha) — verificate questa sessione

- **Container `coralyn-api` stantio**: se in dev vedi 404 su endpoint che *dovrebbero* esistere,
  **rebuilda prima di sospettare un bug**: `docker compose --profile full up -d --build api`.
  Verifica la data: `docker inspect coralyn-api --format '{{.Created}}'` contro gli ultimi commit BE.
- **Login dev**: `admin@coralyn.dev` / `coralyn-admin-8473` (confermato funzionante live questa
  sessione). Se 401, il container potrebbe essere stato riseedato con la default `coralyn-admin`.
- **RLS FORCE** su `Booking`/`Rate`/`Season`/`Pricing`/`Package`: `psql` diretto senza
  `app.current_tenant` mostra 0 righe. Verifica via API con JWT, o dentro `prisma.forTenant`.
- **Preview dev-server (verificato questa sessione, gotcha nuovo)**: `preview_start` per `web-staff`
  ha assegnato un **proxy autoPort morto** (la porta proxy NON era in ascolto → `chrome-error`).
  Il **vero** dev server Vite era raggiungibile direttamente sulla porta che stampa nei log (es.
  `5174`, perché `5173` era occupata). Naviga lì con `location.replace('http://localhost:5174/…')`
  via `preview_eval` (la nav JS da una error-page è bloccata, ma `location.replace` verso l'URL Vite
  reale funziona). Login+navigazione a `/pricing` poi funzionano. Vedi `[[coralyn-dev-preview-env]]`.
- **Prisma non è l'unica fonte di verità sui vincoli** (lezione D-032): constraint/comportamenti FK
  possono vivere nelle **migrazioni raw** e non in `schema.prisma`. Es. `Rate_packageId`/
  `Booking_packageId` sono `ON DELETE SET NULL` (migrazione, non schema). Verifica sempre la
  migrazione raw + DB vivo prima di assumere un comportamento FK.
- **Conteggio test** (baseline **aggiornata** dopo D-032, da NON regredire): ui-kit **41** ·
  web-staff **93** (31 file, include ui-kit) · api **unit 77** (15 suite) · api **e2e 90** (8 suite).
  *Nota:* questi numeri valgono sul branch `feat/d032-pricing-editor`. **Su `main` senza D-032** la
  baseline è quella pre-D-032: ui-kit 41 · web-staff 83 · api unit 68 · e2e 73. Riverifica dal vivo
  la baseline del branch da cui parti, prima di aggiungere test D-011.

## 6. Ancore di codice per D-011 (file:riga, dalla mappatura di questa sessione)

- **Modello `Booking`**: `apps/api/prisma/schema.prisma:153-184` (`previousBookingId` nullable;
  **nessuna FK Season**; `status` enum `confirmed|cancelled` a righe 53-56).
- **Rinnovo A4.2**: controller `apps/api/src/bookings/bookings.controller.ts:35-38`
  (`POST /:id/renew`); service `bookings.service.ts:207-246` (guardie: doppio-rinnovo 409 a 220-224,
  stessa-stagione 422 a 229-230, type/status). Helper condiviso `priceAndWrite`
  `bookings.service.ts:108-169` (anti-overlap 129-140 esclude la sorgente; prezzo server-autoritativo).
- **Lista abbonati + seniority**: `GET /bookings/subscriptions?date=` controller `:20-23`, service
  `listSubscriptions` `:248-275`, `computeSeniority` (risalita catena) `:282-314`, proiezione
  `subscription.projection.ts:6-23` (`SubscriptionListItemDTO` con `seniority`/`renewed`).
- **Anti-overlap/disponibilità**: `booking.availability.ts` (`slotsOverlap` semi-aperto,
  `dateRangesOverlap` chiuso); `cancel` (soft-delete → libera lo slot) `bookings.service.ts:316-327`.
- **Date utils**: `apps/api/src/common/dates.ts` (`todayInRome`, `toDbDate`, `formatDbDate`,
  `resolveDate`, `isValidCalendarDate`) — utili per le finestre con scadenza.
- **Contratti**: `packages/contracts/src/index.ts` — `RenewBookingInput` (:164-168),
  `SubscriptionListItemDTO` (:170-182), `BookingType`/`BookingStatus`.
- **Frontend**: `apps/web-staff/src/features/renewals/RenewalsView.vue` (picker stagione
  origine/destinazione, `DataTable`, colonna Anzianità, badge stato, bottone Rinnova) +
  `useRenewals.ts` (`useSubscriptions`/`useRenewBooking`). D-011 estende questa vista.
- **Scheduling/cron**: **NON esiste** in `apps/api` — vedi §4.2 (decisione lazy vs job, possibile ADR).
- **Test A4.2**: `apps/api/test/bookings.e2e-spec.ts:262-357` (rinnovo, guardie, catena seniority,
  anti-overlap su rinnovo) — non regredire.

## 7. Stato test da preservare
Sul branch D-011 (partendo da `main` senza D-032): ui-kit **41** · web-staff **83** · api unit **68**
· e2e **73**. Se D-032 verrà mergiato prima: ui-kit **41** · web-staff **93** · api unit **77** ·
e2e **90**. **Riverifica dal vivo** la baseline effettiva del branch di partenza. `corepack pnpm -r
build` + `corepack pnpm eslint .` verdi. Prossimo ADR libero: **0034** (probabile per D-011, vedi §4).

## 8. Macchina "zagor" / "Jays" (sync)
All'avvio esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only
origin/main` prima di fidarti del tree o creare un branch. Path: `C:\Users\zagor\Desktop\coralyn`
(zagor) o `C:\Users\Jays\Desktop\new` (Jays). **Attenzione (vedi §0)**: `main` è avanti di 2 commit
non pushati e D-032 vive su `feat/d032-pricing-editor` non mergiato — non distruggerli.

---

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; su un'altra macchina può essere
> C:\Users\Jays\Desktop\new).
>
> STATO: D-032 (editor CRUD del listino) è COMPLETO ma su un branch NON mergiato
> (`feat/d032-pricing-editor`, 4 commit: contratti→backend→frontend→docs). Verde su tutti i test
> (api unit 77 · e2e 90 · web-staff 93 · ui-kit 41), verificato live. `main` è fermo a ccf739a,
> avanti di 2 commit non pushati (login/autoPort). Nessun altro branch pendente.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only
> origin/main` prima di fidarti del tree o creare un branch. NON distruggere i 2 commit non pushati
> di main né il branch `feat/d032-pricing-editor`.
>
> PRIMA COSA (ADR-0009): leggi TUTTA la documentazione, in particolare l'handoff
> `docs/handoff/2026-07-01-d011-prelazione-delegation.md` (questo doc — contiene le decisioni di
> design da prendere §4, le ancore di codice §6, e i gotcha §5), poi ADR-0012 (D-011 è il "fuori
> MVP" rimandato lì), ADR-0006/0013/0031, `docs/architecture/` (README + deferred + glossary).
>
> TASK: esegui D-011 (prelazione abbonamenti: finestre di rinnovo con scadenza, rilascio automatico
> del posto, priorità per anzianità — estende A4.2). Workflow ADR-0009: scrivi PRIMA la spec di
> design investigativa (cita file:riga), RISOLVI con me le decisioni aperte del §4 dell'handoff
> (modello finestra, rilascio lazy-vs-job → probabile ADR-0034, se serve un nuovo BookingStatus),
> poi scrivi il piano TDD e implementalo task-by-task (subagent-driven), un commit per layer,
> test-first, da un NUOVO branch (vedi §0: parti da `main`; D-011 NON dipende da D-032). Non
> regredire i conteggi test (riverificali dal vivo sul branch di partenza).
>
> DOPO D-011: presentami lo stato e il prossimo slice candidato, poi attendi la mia conferma.
