# Handoff / Delega — Slice "Scheda Cliente 360°" + sequenza pagine mockate + D-0xx

> Documento di consegna per la **prossima sessione**. Lo slice **"D-030 — anti-overlap a livello DB"** è **COMPLETO,
> MERGIATO e PUSHATO** su `main`. La nuova direzione (decisa con l'utente 2026-07-03) è: **prima dei prossimi D-0xx,
> completare le pagine ancora mockate del frontend**, partendo dalla **Scheda Cliente**, la cui **spec di design è
> APPROVATA e committata su `main`** — **da pianificare ed eseguire** (è il prossimo passo reale).
>
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per ogni slice, spec →
> RISOLVI le decisioni con l'utente → **piano TDD** (`superpowers:writing-plans`) → implementa **subagent-driven, un
> commit per layer, test-first, da un NUOVO branch da `main`**. **DOPO ogni slice: presenta lo stato e attendi
> conferma prima del successivo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8; fidati di `git log`, non degli SHA qui)
- **`main` = `HEAD`** include D-030 (6 commit, `d419cc4`→`45baaa6`) + la **spec Scheda Cliente** (`f3d031a`) + questo
  handoff + fix coerenza `deferred.md`. **`origin/main` era a `45baaa6`** al momento della scrittura: **verifica se la
  spec/handoff sono stati PUSHATI** (`git status`; se `main` è ahead, l'utente deve `git push origin main` — sull'altra
  macchina serve per vedere spec+handoff). **Nessun branch pendente.**
- **Migrazioni applicate** (`coralyn_dev` + `coralyn_test`): ultima
  `20260703101757_booking_slot_minutes_anti_overlap` (D-030). **La Scheda Cliente NON richiede migrazioni** (solo un
  endpoint di lettura + FE).
- **Prossimo ADR libero:** **0038** (0037 = D-030). **Prossimo D libero (registro):** **D-035**.
- **⚠️ Rebuild container dev:** nell'ultima sessione il rebuild (`docker compose --profile full up -d --build api web`)
  è **fallito per assenza di rete** (`EAI_AGAIN` su npm). Il **DB dev è già migrato** e il codice è provato dagli e2e,
  ma **il container `api` in esecuzione potrebbe essere pre-D-030**: rifai il rebuild sulla tua macchina prima di
  smoke-testare in dev.

## 1. Stato attuale (post D-030, MERGIATO+PUSHATO)
- **Baseline test da NON regredire (su `main`, verificata live 2026-07-03):** **api unit 101 · api e2e 153 · web-staff
  153 (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. *(web-staff 153 INCLUDE i 55 di ui-kit —
  non doppio-contare.)*
- **"D-030 — anti-overlap a livello DB"** (merged+pushed, `d419cc4`→`45baaa6`): `EXCLUDE USING gist booking_no_overlap`
  su `Booking` (`umbrellaId =`, `daterange('[]')`, `int4range('[)')` dei minuti-fascia denormalizzati, `WHERE
  status='confirmed'`), colonne `slotStartMin/slotEndMin` `@default(0)` popolate DB-autoritative da trigger `BEFORE
  INSERT OR UPDATE OF "timeSlotId"`, `btree_gist`, backfill sotto `NO FORCE`/`FORCE` (RLS). Mapping `23P01→409` via
  `isBookingOverlapExclusion` (matcha il NOME constraint) in `priceAndWrite`. Invariante stagioni rinnovo `dest >
  origin.endDate` enforcata in DUE punti (`renewal-campaigns.open()` + `bookings.renew()` pre-flight 422) → constraint
  = backstop di SOLA race. **ADR-0037** (raffina 0006/0013). Review whole-branch (opus): **merge=YES, 0
  Critical/Important**. Live-verify DB in dev OK.

## 2. LA NUOVA SEQUENZA (decisa con l'utente 2026-07-03) — pagine mockate PRIMA dei D-0xx
Mappa dello stato reale delle 4 aree mockate (verificata leggendo il codice, §4):
1. **Scheda Cliente** (`/customers/:id`) — **spec APPROVATA** (§3), `pianifica + esegui`. **Questo è il prossimo passo.**
2. **Bottone «Abbonamento» della card ombrellone** — quick win (backend già esiste), poi il resto. «Presenza» è un
   concetto da definire.
3. **Report** (`/report`) — mock totale; serve decidere QUALI KPI + endpoint di aggregazione.
4. **Stabilimento** (`/establishment`) — il più grande; la parte di valore (config struttura + team) tocca **RBAC =
   D-025 (security, deferito)**. Farla per ultima o in versione minimale read-only.

**In una riga:** il prossimo passo è lo **slice Scheda Cliente** (spec approvata → piano → esecuzione). Dopo, in ordine:
bottone Abbonamento → Report → Stabilimento; poi i **D-0xx** (§5, conferma con l'utente).

## 3. Lo slice "Scheda Cliente 360°" (già progettato)
Spec approvata: **[docs/superpowers/specs/2026-07-03-scheda-cliente-design.md](../superpowers/specs/2026-07-03-scheda-cliente-design.md)**.
Decisioni **già risolte** (spec §7). Resta: **piano TDD + esecuzione** (subagent-driven, da nuovo branch da `main`).

**Cosa fa:** la vista [`CustomerDetailView.vue`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue)
ha intestazione + anagrafica **già reali**; le **3 card in fondo sono stub «In arrivo»** (righe 15-19 e 58-67). Le
rende reali con **un solo endpoint arricchito** `GET /customers/:id/bookings` → `CustomerBookingDTO[]` (nuovo DTO in
`packages/contracts`), che alimenta tutte e tre le card (derivazioni FE dello stesso dato `Booking.customerId`).

**Decisioni chiave (spec §7, risolte "professionale/senza-debito"):**
- **Un endpoint arricchito** (non 3): `umbrellaLabel` (join), `seasonName` (risolta), e per le sole `subscription`
  `seniority` (riuso [`computeSeniority`](../../apps/api/src/bookings/seniority.ts)), `renewed`, `prelazione` (finestra
  APERTA).
- **Prelazione INCLUSA** (è nell'intento dello stub) ma via **helper condiviso**: estrai il calcolo stato-finestra
  `open/exercised/expired` da `renewal-campaigns.service.ts` `getByDestinationSeasonId` in
  [`renewal-window.projection.ts`](../../apps/api/src/bookings/renewal-window.projection.ts) come
  `computeRenewalWindowState(...)`, usato da ENTRAMBE le viste (fonte unica, no drift). La vista Rinnovi resta
  invariata nel comportamento (e2e rinnovi devono restare verdi).
- **Cancellate mostrate attenuate** nello storico (record veritiero). **Card read-only** (nessuna nuova scrittura).
- **Nessuna migrazione, nessun nuovo ADR** (incremento di lettura sull'architettura esistente).

**Layer previsti (piano TDD; la prelazione atterra per ULTIMA → separabile in slice B se troppo grande):**
1. `CustomerBookingDTO` in contracts + endpoint base (bookings del cliente + `umbrellaLabel`/`seasonName`/`seniority`/
   `renewed`) + e2e. 2. FE: `useCustomerBookings` + le 3 card SENZA prelazione (storico raggruppato per stagione,
   anzianità+rinnovi, saldo). 3. Estrai `computeRenewalWindowState` (rifattorizza Rinnovi, comportamento invariato) +
   arricchimento `prelazione` nell'endpoint + e2e. 4. FE: nota prelazione nella card Abbonamento.

**Confine di scope (YAGNI):** niente dettaglio-prenotazione (non esiste → righe non navigabili); niente prelazione
duplicata (fonte unica); niente nuove azioni (rinnovo/incasso restano su mappa/Rinnovi).

## 4. Le altre pagine mockate (stato VERIFICATO leggendo il codice 2026-07-03)
Ordinate come da sequenza §2. Router: [`apps/web-staff/src/router/index.ts`](../../apps/web-staff/src/router/index.ts).

- **Bottoni card ombrellone** — [`MapView.vue`](../../apps/web-staff/src/features/map/MapView.vue), `<aside v-if="sel">`
  (~righe 283-328). **3 REALI**: «Registra incasso» (`PATCH /bookings/:id/payment`), «Annulla prenotazione» (`DELETE
  /bookings/:id`), «Nuova prenotazione» (modale + `GET /bookings/quote` + `POST /bookings`). **2 MORTI (nessun
  `@click`)**: **«Abbonamento»** — backend `POST /bookings` con `type=subscription` **esiste già** (riusa il flusso
  della modale «Nuova prenotazione» pre-impostata su subscription) → **slice S**; **«Presenza»** — **nessun concetto né
  endpoint** (check-in giornaliero? da definire con l'utente prima).
- **Report** — [`ReportView.vue`](../../apps/web-staff/src/features/report/ReportView.vue), **mock totale** (commento
  "Mock seam: dati demo statici"): KPI cards, incassi 7gg, mix stati ombrelloni, abbonamenti in scadenza — tutti
  hardcoded. **Nessun** endpoint di aggregazione nell'API. Slice **M**: serve (a) decidere con l'utente QUALI KPI, (b)
  endpoint di aggregazione (incassi/giorno, occupazione %, scadenze) derivabili dalle prenotazioni. Componenti
  ui-kit già pronti (BarChart, StackedBar).
- **Stabilimento** — [`EstablishmentView.vue`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue),
  **mock** (stats struttura, utenti, nome/stagione hardcoded; badge «Configura»/«Inviti» `tone="soon"`; logout reale).
  Backend **tutto mancante**: `/establishments` (read/update), gestione utenti/team, config settori/ombrelloni. **Front
  S / retro L**; la parte di valore (editare struttura, invitare utenti) tocca **RBAC = D-025 (deferito, security)**.
  Farla per ultima, o una versione minimale read-only (mostra stats reali dalla mappa/catalogo) come primo passo.

## 5. D-0xx da affrontare DOPO le pagine mockate (registro: [`docs/architecture/deferred.md`](../architecture/deferred.md))
Ordinati per valore/principio (confermati con l'utente 2026-07-03; **conferma la scelta con lui prima di partire**):
- **D-024 — cancellazione/anonimizzazione `Cliente` (GDPR).** Trigger **già materializzato** (`Booking.customerId`
  esiste). Rilevante mercato IT; più economico prima che i dati si accumulino. Slice medio. *(Nota: lo slice Scheda
  Cliente rende più naturale D-024 — entrambe ruotano attorno alle prenotazioni del cliente.)*
- **D-012 — cabine/servizi accessori prenotabili.** Massimo valore-prodotto (altra linea di ricavo), ma **slice
  grande** (nuova risorsa prenotabile + disponibilità + pricing).
- **Security/hardening (D-025 RBAC · D-026 refresh/revoca token · D-027 rate-limit login · D-029 login a tempo
  costante):** gated sull'esposizione pubblica/multi-operatore. **D-025 diventa un prerequisito** se si vuole la parte
  "team/inviti" della pagina Stabilimento.
- **Bassa priorità:** D-018, D-015, D-033. **D-034 (forfait periodico) DEPRIORITIZZATO come speculativo — non
  riproporlo per primo.**
- **Fuori area corrente:** D-003 (i18n), D-031 (fuso per-tenant), D-002/004/006/008/009 (moduli successivi).

## 6. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON deve delegare/annidare.** Nell'ultima sessione un implementer di follow-up ha
  **annidato un subagent** (per cercare la forma di un endpoint che non gli serviva) ed è finito a divagare → stoppato,
  il controller ha completato a mano. **Istruisci ESPLICITAMENTE ogni implementer: "fai TU il lavoro, NON spawnare
  subagent".** Se finisce a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **Scheda Cliente: fonte unica prelazione.** Non re-implementare lo stato-finestra: estrai `computeRenewalWindowState`
  e fallo usare a `getByDestinationSeasonId` E al nuovo endpoint. Verifica che gli e2e rinnovi restino verdi dopo la
  rifattorizzazione.
- **`seasonName` con stagioni sovrapposte** (possibile post-D-030): se più stagioni contengono `startDate`, scegli
  deterministicamente quella con `startDate` più recente (è solo un'etichetta di raggruppamento).
- **Dipendenza di modulo** `customers → bookings` per l'endpoint `/customers/:id/bookings` (nessun ciclo: bookings non
  importa customers). In alternativa `/bookings?customerId=` in `BookingsController` (meno accoppiamento, URL meno
  RESTful) — il piano decide.
- **⚠️ Migrazioni che LEGGONO tabelle tenant sotto RLS FORCE** (ruolo `coralyn_app` NOBYPASSRLS): `ALTER TABLE … NO
  FORCE`/`FORCE` attorno alla lettura, o legge 0 righe. *(Non serve per Scheda Cliente — nessuna migrazione — ma vale
  per D-024/D-012.)*
- **`.env.test` è al ROOT.** Per comandi **prisma** sotto `--filter`, carica `DATABASE_URL` senza stamparlo (il
  classifier blocca la materializzazione di credenziali): `set -a; . ./.env; set +a` (dev) / `set -a; . ./.env.test;
  set +a` (test). P1002 advisory-lock su `migrate deploy` → `pg_terminate_backend` sull'holder (postgres in container
  `coralyn-db`, superuser `coralyn`).
- **⚠️ Non far girare `prisma db seed` locale senza `DEV_ADMIN_PASSWORD=coralyn-admin-8473`** (l'upsert admin resetta la
  pwd al default).
- **Drift `Rate_signature_key`** (indice raw non modellato) fa ri-promptare `migrate dev` — pre-esistente, atteso; non
  creare migration stray.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api
  test:e2e`; web-staff `--filter web-staff test`; typecheck `--filter web-staff typecheck`. "worker failed to exit
  gracefully" di Jest = rumore di teardown pre-esistente, non un fallimento.
- **Micro-nit doc (non bloccante):** `docs/design/data-model.md:242` paragona la prelazione app-level a "stessa
  filosofia di D-030" — dopo D-030 l'anti-overlap ha anche un backstop DB (l'app resta primaria). La prelazione resta
  correttamente app-only; l'analogia è solo leggermente imprecisa.

## 7. Ancore di codice (file:riga, VERIFICATE 2026-07-03)
- **Vista Scheda Cliente:** [`CustomerDetailView.vue`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue)
  — header+anagrafica reali (`useCustomer`/`useUpdateCustomer`); 3 card stub `upcoming` righe 15-19, template 58-67
  (`<Badge tone="soon">In arrivo</Badge>`). Composabile clienti: `apps/web-staff/src/features/customers/useCustomers.ts`.
- **Backend clienti:** [`customers.controller.ts`](../../apps/api/src/customers/customers.controller.ts) — `GET`,
  `GET :id`, `POST`, `PATCH` (nessun `:id/bookings`).
- **Anzianità:** [`seniority.ts`](../../apps/api/src/bookings/seniority.ts) `computeSeniority(tx, ids)`.
- **Prelazione (da estrarre):** [`renewal-campaigns.service.ts`](../../apps/api/src/bookings/renewal-campaigns.service.ts)
  `getByDestinationSeasonId` (stato `open/exercised/expired`); projection
  [`renewal-window.projection.ts`](../../apps/api/src/bookings/renewal-window.projection.ts).
- **DTO:** [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) — `BookingDTO` (:176),
  `CustomerDTO` (:9), `SubscriptionListItemDTO` (:212). Aggiungere `CustomerBookingDTO`.
- **e2e da estendere/creare:** [`customers.e2e-spec.ts`](../../apps/api/test/customers.e2e-spec.ts) (o dedicato);
  regressione [`renewal-campaigns.e2e-spec.ts`](../../apps/api/test/renewal-campaigns.e2e-spec.ts).
- **Altre pagine mock:** `MapView.vue` aside ~283-328; `ReportView.vue`; `EstablishmentView.vue`.

## 8. Workflow (ADR-0009) + sync macchina
1. Spec — **fatta** per Scheda Cliente (§3). 2. Decisioni — **risolte** (spec §7). 3. **Piano TDD** —
   `superpowers:writing-plans` → `docs/superpowers/plans/`. 4. **Esegui** — `superpowers:subagent-driven-development`:
   per ogni layer, implementer (NON delega) + task-review (spec ✅ + quality) + fix se Critical/Important, poi **review
   whole-branch finale (opus)**, **un commit per layer**, da un **nuovo branch da `main`**. Traccia in
   `.superpowers/sdd/progress.md` (scratch git-ignored). 5. **DOPO**: presenta lo stato all'utente e **attendi
   conferma** prima della pagina successiva.
   - **Lezione (accorpamento layer):** layer che condividono un confine di compilazione/contratto atterrano nello
     STESSO commit. Per Scheda Cliente: `CustomerBookingDTO` (contracts) + l'endpoint che lo produce devono compilare
     insieme; la card FE che lo consuma può essere un layer a parte.
- **Sync macchina "zagor"/"Jays":** all'avvio `git fetch --all --prune` poi `git checkout main && git merge --ff-only
  origin/main`. Path `C:\Users\zagor\Desktop\coralyn` (zagor) o `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuilda i
  container prima di testare in dev (pwd admin container `coralyn-admin-8473`). Login dev `admin@coralyn.dev` /
  `coralyn-admin-8473`; API `localhost:3000/api` (health `/health`); web `8080`; DB host `5433`.

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice **"D-030 — anti-overlap a livello DB"** è COMPLETO, MERGIATO e PUSHATO su `main` (EXCLUDE constraint
> `booking_no_overlap` + trigger minuti-fascia DB-autoritativi + mapping `23P01→409` + pre-flight 422 su rinnovo in
> stagione sovrapposta; ADR-0037). Verde su tutti i test (api unit 101 · e2e 153 · web-staff 153 · ui-kit 55 ·
> typecheck pulito), review opus 0 Critical/Important. La nuova direzione (decisa con me) è: **prima dei prossimi
> D-0xx, completare le pagine ancora mockate del FE**, partendo dalla **Scheda Cliente**, la cui **spec di design è
> APPROVATA e committata su `main`** (`docs/superpowers/specs/2026-07-03-scheda-cliente-design.md`; decisioni risolte
> con me), **da pianificare ed eseguire**.
>
> MACCHINA: esegui SEMPRE `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main` prima di
> fidarti del tree o creare un branch. ⚠️ Rebuilda i container prima di testare in dev: `docker compose --profile full
> up -d --build api web` (nell'ultima sessione il rebuild è fallito per assenza di rete — falla sulla tua macchina). DB
> host `localhost:5433`; login dev `admin@coralyn.dev` / `coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-03-scheda-cliente-e-pagine-mock.md` (sequenza §2, slice
> Scheda Cliente §3, altre pagine mock §4, D-0xx §5, gotcha §6 — incl. "implementer NON annida", ancore §7, workflow
> §8), poi la spec `docs/superpowers/specs/2026-07-03-scheda-cliente-design.md`, poi ADR-0034 (prelazione/anzianità, che
> questo slice riusa via helper condiviso) e ADR-0009 (workflow).
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI lo slice **"Scheda Cliente 360°"** — un endpoint arricchito
> `GET /customers/:id/bookings` → `CustomerBookingDTO[]` (`umbrellaLabel`, `seasonName`, e per le sole subscription
> `seniority`/`renewed`/`prelazione`) che alimenta le 3 card stub della vista dettaglio cliente (Storico · Abbonamento
> e anzianità · Pagamenti e saldo). Prelazione INCLUSA ma via **helper condiviso** `computeRenewalWindowState` estratto
> da `renewal-campaigns.service.ts` (fonte unica, e2e rinnovi devono restare verdi); cancellate mostrate attenuate;
> read-only; nessuna migrazione, nessun nuovo ADR. Il piano stratifica la prelazione come ultimo layer (separabile in
> slice B se troppo grande). Backend + FE. (2) Poi, in ordine: **bottone «Abbonamento» della card ombrellone** (quick
> win, backend già esiste; «Presenza» = concetto da definire con me), **Report** (decidi i KPI con me + endpoint di
> aggregazione), **Stabilimento** (il più grande, la parte team/config tocca RBAC = D-025). (3) Poi i D-0xx: **D-024**
> (GDPR cliente, trigger già materializzato) o **D-012** (cabine, grande) — CONFERMA con me la scelta prima di partire;
> **D-034 deprioritizzato, non riproporlo**. Workflow ADR-0009 per OGNI slice: spec → risolvi decisioni con me → piano
> TDD → subagent-driven (implementer NON delega/annida; layer accoppiati per compilazione nello stesso commit), un
> commit per layer, test-first, da un NUOVO branch da main. Non regredire i conteggi test (riverificali dal vivo: api
> unit 101 · e2e 153 · web-staff 153 · ui-kit 55).
>
> DOPO ogni slice/pagina: presentami lo stato e attendi conferma prima del successivo.
