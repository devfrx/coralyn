# Handoff / Delega — Redesign Scheda Cliente (mock) + fix mappa + pagine mock + D-0xx

> ## ⛔ SUPERATO (2026-07-04) — snapshot storico, NON eseguire i "task" qui sotto
> Tutto ciò che questo handoff dava come "da fare" è **fatto e su `main`**: redesign Scheda cliente (§2), **fix mappa**
> pomeriggio (§5), bottone «Abbonamento» collegato e «Presenza» **rimosso** (§4). Handoff autorevole corrente:
> **[2026-07-04-mappa-abbonamento-e-prossimi.md](2026-07-04-mappa-abbonamento-e-prossimi.md)**. Il testo sotto è
> conservato come fotografia del 2026-07-03 (tracciabilità), ma è **datato**: il prossimo passo reale è Report/Stabilimento.

> Documento di consegna per la **prossima sessione**. **Supera** il precedente handoff
> [2026-07-03-scheda-cliente-e-pagine-mock.md](2026-07-03-scheda-cliente-e-pagine-mock.md) (il cui "prossimo passo" —
> lo slice funzionale Scheda Cliente 360° — è ora **fatto**). Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**:
> per ogni slice, spec → RISOLVI le decisioni con l'utente → **piano TDD** (`superpowers:writing-plans`) → esecuzione
> **subagent-driven, un commit per layer, test-first**. **DOPO ogni slice: presenta lo stato e attendi conferma.**

---

## 0. Situazione GIT (all'avvio fai il sync §8; fidati di `git log`, non degli SHA qui)
- **Branch di lavoro: `feat/scheda-cliente-360`** (7 commit da `main` `ba218f5`), **NON mergiato** (scelta utente: "lascia il branch, non integrare"). Contiene:
  - `0376703` piano 360° · `cc27955`/`ff5508e`/`8c580a0`/`f45c42a` i 4 layer funzionali · `4c236d0` polish post-review (F1/F2/F3) · `1b48d7a` **spec del redesign** (questo è il prossimo lavoro).
- **`main` = `ba218f5`** (Scheda Cliente 360° e redesign **non** ancora su main).
- **File sporco non committato:** `docs/design/mockups/gestionale-lidi-aspirazionale.html` (edit locale dell'utente, ~2/-10 righe; pre-esistente a questa sessione). **Non toccato di proposito** — decidi con l'utente se committarlo.
- **Nessuna migrazione pendente.** Prossimo **ADR libero: 0038**. Prossimo **D libero: D-035**.
- **⚠️ Container:** rebuildati in questa sessione dal working tree del branch (immagini 15:31, up, `api` healthy). Includono l'endpoint `GET /customers/:id/bookings` e i 4 layer + polish. **Se cambi branch/codice, rifai** `docker compose --profile full up -d --build api web`.

## 1. Stato attuale (verificato LIVE 2026-07-03 all'HEAD `1b48d7a`)
- **Baseline test da NON regredire:** **api unit 111 · api e2e 158 · web-staff 156 (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito (EXIT 0). *(web-staff 156 INCLUDE i 55 di ui-kit — non doppio-contare.)*
- **Slice "Scheda Cliente 360°" — COMPLETO, reviewato, NON integrato.** Endpoint arricchito `GET /customers/:id/bookings` → `CustomerBookingDTO[]` (`umbrellaLabel`/`seasonName`/`seniority`/`renewed`/`prelazione`), prelazione via **helper condiviso** `computeRenewalWindowState` (fonte unica, usato anche da `renewal-campaigns.service.getByDestinationSeasonId`), 3 card FE reali. Review whole-branch (opus): **merge=YES, 0 Critical/0 Important**, 4 Minor non bloccanti. Dettaglio per-task nel ledger SDD **`.superpowers/sdd/progress.md`** (scratch git-ignored: leggilo per il racconto completo, incluso il verify live in dev).
- **DECISIONE APERTA:** l'utente ha scelto di **non integrare** il branch per ora. Il redesign (§2) **estende lo stesso branch**. Chiedi all'utente quando mergiare (probabile: dopo il redesign, così la Scheda cliente atterra su `main` già in versione aspirazionale).

## 2. IL PROSSIMO PASSO — Redesign visivo Scheda Cliente (spec APPROVATA, da pianificare+eseguire)
Spec: **[docs/superpowers/specs/2026-07-03-scheda-cliente-redesign.md](../superpowers/specs/2026-07-03-scheda-cliente-redesign.md)** (approvata in brainstorming 2026-07-03; decisioni §7).
**Cosa fa:** porta la vista [`/customers/:id`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue) alla qualità del **mock aspirazionale** (schermata `Scheda cliente`), estraendo i primitivi condivisi nel `ui-kit` — professionale, riutilizzabile, senza debiti.
**Decisioni già risolte con l'utente:**
- **Scope = SOLO la Scheda cliente** (le altre schermate del mock verranno mostrate separatamente, §4).
- **Estrarre nel `ui-kit`:** `SectionCard` (card con header-a-icona — pattern di **ogni** card del mock), `Callout` (box tinto per la prelazione), + estensione retro-compatibile di [`StatTile`](../../packages/ui-kit/src/components/StatTile.vue) (`tone` coral + `layout: 'label-first'`). **Riusa l'esistente:** `DataTable`+`TD_*`, `Badge`, `Avatar`, `Icon`, `KpiCard` (riferimento header-icona).
- **Arricchimento backend (soluzione senza debiti):** `packageName?` + `sectorName?` su `CustomerBookingDTO`, join server-side in `listByCustomer` (`include: { umbrella: { include: { row: { include: { sector: true } } } }, package: true }`; relazioni già esistenti, nessuna migrazione) → badge pacchetto «Comfort» e chip ombrellone «C · 15».
- **Token, non hex** (mappa i valori del mock su `--color-*`/`--radius-*`; aggiungi token in `theme.css` se manca, non hardcodare).
- **Layer previsti** (spec §8): 1) ui-kit `SectionCard`+`Callout`+`StatTile` + specs. 2) contracts+backend `packageName`/`sectorName` (stesso commit: confine di compilazione) + unit projection + e2e. 3) FE ridisegno 3 card + `PAYMENT_METHOD_LABEL` in [`statusMaps.ts`](../../apps/web-staff/src/lib/statusMaps.ts) + seed MSW + test render.
**Prossima azione:** `superpowers:writing-plans` → piano TDD → esecuzione subagent-driven sullo **stesso branch `feat/scheda-cliente-360`**.

## 3. Come VEDERE il mock (React SPA, una schermata alla volta)
Il mock `docs/design/mockups/gestionale-lidi-aspirazionale.html` è una **"Bundled Page"** (~625KB: 624KB di CSS Tailwind inline + markup in `<script>` React; niente base64). **NON leggerlo raw** (spreca contesto). Per vederlo:
1. È già in `.claude/launch.json` come config **`mockups`** (`python -m http.server 8090`). `preview_start` "mockups" → naviga a `http://localhost:8090/docs/design/mockups/gestionale-lidi-aspirazionale.html`.
2. Mostra **una schermata alla volta** (le altre non sono nel DOM). Nav via i bottoni sidebar (Mappa/Prenotazioni/Clienti/Listino/Report). Per le sotto-schermate: clicca una riga (es. un cliente → **Scheda cliente**) o il selettore stabilimento → **Stabilimento**. Trucco affidabile: `preview_eval` con `document.elementFromPoint(x,y)` sulle coordinate della riga (i click sintetici su selettore CSS non sempre triggerano gli handler React delegati).
3. **Screenshot** con `preview_screenshot`; misura valori esatti con `preview_eval`+`getComputedStyle` (mappa su token, non copiare hex).

## 4. Le ALTRE schermate del mock (contesto per pagine future — l'utente le mostrerà una alla volta)
Il mock copre **8 schermate** (`data-screen-label`): **Mappa, Prenotazioni, Clienti, Listino, Report, Scheda cliente, Stabilimento, Struttura** + schermate auth/landing ("La spiaggia, gestita con leggerezza", "Bentornato", "Porta il tuo lido su Coralyn", "Crea il tuo stabilimento"). Linguaggio visivo coerente: sfondo cream, testo teal-scuro `#22303A`, accento coral, card bianche con **header-a-icona**, badge coral/verde/ambra, numeri-grandi, tabelle pulite. **I primitivi estratti nel redesign (`SectionCard`/`Callout`/`StatTile`) sono generici → riusali per queste schermate.** Stato reale del FE per area mockata (dal precedente handoff §4, ancora valido):
- **Bottoni card ombrellone (mappa):** «Abbonamento» e «Presenza» sono **morti** (nessun `@click`); «Abbonamento» = riuso flusso `POST /bookings type=subscription` (backend già esiste); «Presenza» = concetto da definire con l'utente.
- **Report** (`ReportView.vue`): mock totale, nessun endpoint d'aggregazione — servono KPI (da decidere con l'utente) + endpoint.
- **Stabilimento** (`EstablishmentView.vue`): mock; la parte team/config tocca **RBAC = D-025** (deferito, security). Vista minimale read-only come primo passo. *(Il mock «Stabilimento» mostrato in questa sessione: card Informazioni/Struttura/Utenti e ruoli/Sessione — buon riferimento.)*

## 5. ⚠️ FIX MAPPA (bug PRE-ESISTENTE, separato — l'utente ha scelto "fixo dopo")
**Chip effimera creata:** `task_4e9fef8a` («Fix mappa: prenotazioni pomeriggio non visibili nell'aside») — ma le chip **non persistono** tra riavvii app, quindi il record durevole è QUI.
**Sintomo:** nella mappa, un ombrellone la cui unica prenotazione è sulla fascia **Pomeriggio** mostra "Postazione disponibile" invece del dettaglio + «Registra incasso»/«Annulla». Le prenotazioni del **mattino** funzionano → **le prenotazioni pomeridiane non sono incassabili/annullabili dalla mappa**.
**Root cause:** in [`MapView.vue`](../../apps/web-staff/src/features/map/MapView.vue) il pannello dettaglio è gated su `currentBooking` ([:101-106](../../apps/web-staff/src/features/map/MapView.vue:101)), che cerca la prenotazione SOLO su `selectedSlotId`; questo parte di default sulla **prima fascia (Mattina)** ([:98-99](../../apps/web-staff/src/features/map/MapView.vue:98)) e in view-mode non è mai cambiato (i box Mattina/Pomeriggio [:296-303](../../apps/web-staff/src/features/map/MapView.vue:296) NON hanno `@click`; `selectedSlotId` cambia solo in `openModal()` [:142](../../apps/web-staff/src/features/map/MapView.vue:142)).
**Fix alla radice (TDD, branch SEPARATO da `main` — non è dello slice Scheda cliente):** (a) in `open(u,...)` defaulta `selectedSlotId` alla fascia che HA una prenotazione per quell'ombrellone (fallback prima fascia); (b) rendi i box Mattina/Pomeriggio cliccabili (`@click` → `selectedSlotId = halfSlots[0/1].id`) con indicatore di selezione. Attenzione TDZ (`selectedSlotId` dichiarato dopo `open`: sposta la dichiarazione o usa `watch(sel)`). Test-first: `MapView.spec.ts` semina una prenotazione solo-pomeriggio, apre l'aside, asserisce dettaglio + pulsanti. Non regredire web-staff 156.

## 6. D-0xx da affrontare DOPO le pagine mock (registro [`deferred.md`](../architecture/deferred.md); conferma con l'utente)
- **D-024 — GDPR cliente** (soft-delete/anonimizzazione). Reso più naturale dallo slice Scheda cliente (ruota attorno alle prenotazioni del cliente). Slice medio.
- **D-012 — cabine/servizi accessori prenotabili.** Massimo valore-prodotto ma **slice grande** (nuova risorsa + disponibilità + pricing).
- **CONFERMA la scelta D-024 vs D-012 con l'utente PRIMA di partire.** **D-034 (forfait periodico) DEPRIORITIZZATO — non riproporlo per primo.** Security (D-025 RBAC ecc.) gated su esposizione pubblica; **D-025 è prerequisito** per la parte team/inviti dello Stabilimento.

## 7. Insidie note (gotcha) — LEGGI PRIMA DI ESEGUIRE
- **Subagent-driven: l'implementer NON delega/annida subagent.** Istruiscilo esplicitamente ("fai TU il lavoro"). Se torna a mani vuote, verifica `git log`/working-tree PRIMA di ri-dispatchare.
- **Branch del redesign = `feat/scheda-cliente-360`** (estende il funzionale non mergiato). NON partire da `main` (perderesti `CustomerBookingDTO`/`listByCustomer`). Il **fix mappa** invece è un branch SEPARATO da `main`.
- **`ui-kit` non ha build** e **web-staff globa le sue spec** → un componente nuovo in `ui-kit` è visibile a web-staff senza step di build, ma i suoi test contano sia standalone (55) sia dentro web-staff (156).
- **Prelazione = fonte unica** (`computeRenewalWindowState`): non re-implementare lo stato-finestra; gli e2e rinnovi (22/22) devono restare verdi.
- **Container dev stale = 404 sul nuovo endpoint** (causa reale delle "card vuote" in questa sessione). Dopo ogni cambio codice da testare in dev: **rebuild** (`docker compose --profile full up -d --build api web`).
- **`.env.test` al ROOT** per comandi prisma sotto `--filter`; **NON** `prisma db seed` locale senza `DEV_ADMIN_PASSWORD=coralyn-admin-8473`. Drift `Rate_signature_key` = atteso.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e`; web-staff `--filter web-staff test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.

## 8. Ancore di codice (VERIFICATE 2026-07-03)
- **Vista:** [`CustomerDetailView.vue`](../../apps/web-staff/src/features/customers/CustomerDetailView.vue) (+ card estratte `CustomerHistoryCard`/`CustomerSubscriptionsCard`/`CustomerPaymentsCard` nella stessa cartella); composable [`useCustomers.ts`](../../apps/web-staff/src/features/customers/useCustomers.ts) (`useCustomerBookings`).
- **Backend:** [`bookings.service.ts`](../../apps/api/src/bookings/bookings.service.ts) `listByCustomer`; projection [`customer-booking.projection.ts`](../../apps/api/src/bookings/customer-booking.projection.ts); helper [`renewal-window.projection.ts`](../../apps/api/src/bookings/renewal-window.projection.ts) `computeRenewalWindowState`; rotta [`customers.controller.ts`](../../apps/api/src/customers/customers.controller.ts) `GET :id/bookings`.
- **DTO:** [`packages/contracts/src/index.ts`](../../packages/contracts/src/index.ts) `CustomerBookingDTO`.
- **e2e:** [`customer-bookings.e2e-spec.ts`](../../apps/api/test/customer-bookings.e2e-spec.ts); regressione [`renewal-campaigns.e2e-spec.ts`](../../apps/api/test/renewal-campaigns.e2e-spec.ts).
- **ui-kit da toccare/riusare:** [`Card.vue`](../../packages/ui-kit/src/components/Card.vue), [`KpiCard.vue`](../../packages/ui-kit/src/components/KpiCard.vue), [`StatTile.vue`](../../packages/ui-kit/src/components/StatTile.vue), [`DataTable.vue`](../../packages/ui-kit/src/components/DataTable.vue), [`Badge.vue`](../../packages/ui-kit/src/components/Badge.vue); export in [`packages/ui-kit/src/index.ts`](../../packages/ui-kit/src/index.ts); token in [`theme.css`](../../packages/ui-kit/src/styles/theme.css).
- **Mappa (fix §5):** [`MapView.vue`](../../apps/web-staff/src/features/map/MapView.vue).

## 9. Workflow (ADR-0009) + sync macchina
1. Spec redesign — **fatta** (§2). 2. Decisioni — **risolte** (spec §7). 3. **Piano TDD** — `superpowers:writing-plans` → `docs/superpowers/plans/`. 4. **Esegui** — `superpowers:subagent-driven-development`: per ogni layer, implementer (NON delega) + task-review (spec ✅ + quality) + fix se Critical/Important, poi **review whole-branch finale (opus)**, un commit per layer. Traccia in `.superpowers/sdd/progress.md`. 5. **DOPO**: presenta lo stato e **attendi conferma**.
- **Sync macchina "zagor"/"Jays":** all'avvio `git fetch --all --prune` poi `git checkout main && git merge --ff-only origin/main`; poi `git checkout feat/scheda-cliente-360` (il branch di lavoro). Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Rebuild container prima di testare in dev. Login dev `admin@coralyn.dev` / `coralyn-admin-8473`; API `localhost:3000/api` (health `/health`); web `8080`; DB host `5433`.

## 10. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new).
>
> STATO: lo slice funzionale **"Scheda Cliente 360°"** è COMPLETO e reviewato (endpoint `GET /customers/:id/bookings` arricchito + 3 card reali + prelazione via helper condiviso `computeRenewalWindowState`; review opus merge=YES, 0 Crit/0 Imp) ma **NON mergiato**, sul branch **`feat/scheda-cliente-360`** (7 commit da `main`). Verde: api unit 111 · e2e 158 · web-staff 156 · ui-kit 55 · typecheck pulito (verificato LIVE). La spec del **redesign visivo della Scheda cliente** (allineamento al mock aspirazionale, SOLO le schede) è **APPROVATA e committata** (`docs/superpowers/specs/2026-07-03-scheda-cliente-redesign.md`).
>
> MACCHINA: SEMPRE `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main` → poi `git checkout feat/scheda-cliente-360`. ⚠️ Rebuild container prima di testare in dev: `docker compose --profile full up -d --build api web` (il container stale = 404 sul nuovo endpoint = "card vuote"). DB `localhost:5433`; login `admin@coralyn.dev` / `coralyn-admin-8473`.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-03-scheda-cliente-redesign-mock-e-pending.md` (redesign §2, come vedere il mock §3, altre schermate mock §4, FIX MAPPA §5, D-0xx §6, gotcha §7, ancore §8), poi la spec del redesign, poi il ledger `.superpowers/sdd/progress.md`.
>
> TASK, in sequenza: (1) PIANIFICA (piano TDD) ed ESEGUI il **redesign Scheda cliente** sul branch `feat/scheda-cliente-360`: estrai `SectionCard`+`Callout` nel ui-kit + estendi `StatTile` (`tone`/`layout`, retro-compatibile); arricchisci `CustomerBookingDTO` con `packageName`/`sectorName` (join server-side, nessuna migrazione); ridisegna le 3 card fedeli al mock (numero-grande anzianità, callout prelazione ambra, storico raggruppato con conteggi, 2 stat-box + DataTable pagamenti); token non hex; read-only. Un commit per layer, subagent-driven (implementer NON annida), non regredire i conteggi. (2) Poi, con l'utente: decidi se **mergiare** `feat/scheda-cliente-360` in `main` (FF, come D-030). (3) Poi in ordine, mostrandoti i mock volta per volta: bottone «Abbonamento» mappa · Report (KPI+endpoint) · Stabilimento (RBAC=D-025). (4) **FIX MAPPA** (§5, branch SEPARATO da main, quando l'utente vuole). (5) D-0xx: **D-024** o **D-012** — CONFERMA con l'utente; D-034 deprioritizzato.
>
> DOPO ogni slice/pagina: presentami lo stato e attendi conferma prima del successivo.
