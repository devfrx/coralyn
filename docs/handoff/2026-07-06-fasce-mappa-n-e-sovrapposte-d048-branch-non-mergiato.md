# Handoff / Delega — Mappa: N fasce + fasce sovrapposte (D-048) COMPLETE su branch **NON mergiato** · prossimi

> Documento di consegna per la **prossima sessione**. **Supersede**
> [2026-07-06-rendile-vere-completo-fasce-mappa-spec-e-prossimi.md](2026-07-06-rendile-vere-completo-fasce-mappa-spec-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: spec (brainstorming, decisioni risolte con
> l'utente) → piano TDD → subagent-driven (un commit per layer, TDD, review a due stadi + whole-branch finale su **opus**) →
> verifica LIVE → **presenta e attendi conferma**. Push su `main` = **FF con ok ESPLICITO** dell'utente. **Leggi questo per primo.**

---

## 0. Situazione GIT (all'avvio fai il sync §7) — ⚠️ BRANCH DI LAVORO APERTO, NON MERGIATO
- **`main` = `origin/main` = `e89d72b`** (invariato: NON contiene il lavoro qui sotto).
- **Branch di lavoro `feat/timeslots-map` = `582e618`** (da `main` `e89d72b`), tree pulito. **Contiene DUE slice complete impilate**, entrambe verdi + whole-branch-reviewed **Ready to merge (opus)**, **MAI mergiate per scelta esplicita dell'utente** («non mergiare ancora»). Commit (dal più recente):
  - `582e618` docs: piani TDD (N-fasce + D-048)
  - `97ae684` feat(web-staff): fascia coperta resa onesta — **D-048 T4**
  - `dc01c1c` feat(ui-kit): token + resa 'covered' in UmbrellaCell — **D-048 T3**
  - `df55e8d` feat(api): report escludono le fasce coperte (occupancyStates) — **D-048 T2**
  - `4a3f559` feat(api): stato 'covered' nel map projection + coveredBySlot — **D-048 T1**
  - `52e0a73` docs: spec D-048 fasce sovrapposte
  - `42b61c1` feat(web-staff): mappa rende N fasce reali (celle a spicchi, drawer N box, messaggio computato) — **N-fasce T3**
  - `1413133` feat(ui-kit): UmbrellaCell N-agnostica a spicchi (slotStates[]) — **N-fasce T2**
  - `dd66c0f` test(api): projection popola stateBySlot per ogni fascia (N=3, FE-only lock) — **N-fasce T1**
- **Prossimo ADR libero: 0044. Prossimo D libero: dopo D-048 → D-049** (D-048 = queste fasce sovrapposte, **NON ancora in `deferred.md`**, vedi §4).
- **Nessuna migrazione pendente.** Nessun cambio schema in queste slice (solo tipi in `contracts` + logica projection/FE).

## 1. Cosa è COMPLETO sul branch (2026-07-06) — due slice
Ledger dettagliato: [.superpowers/sdd/progress.md](../../.superpowers/sdd/progress.md).

### 1a. N-fasce ↔ mappa (rende N fasce **disgiunte** arbitrarie) — assorbe 3 bug
Spec [2026-07-06-timeslots-map-design.md](../superpowers/specs/2026-07-06-timeslots-map-design.md), piano [2026-07-06-timeslots-map.md](../superpowers/plans/2026-07-06-timeslots-map.md). FE-only (§5 verificata: `map.projection.ts` popolava già `stateBySlot` per ogni fascia). `UmbrellaCell` da `morning/afternoonState` → **`slotStates: SlotState[]`** a spicchi conic-gradient (tinta piena se uniforme). `MapView`: celle a N spicchi, drawer con **N box reali** (nome/orario/stato, selezionabili), messaggio disponibilità **computato**. Rimossa ogni compressione N→2. Bug risolti: fasce centrali sparite / nomi ignorati / messaggio "intera giornata" errato.

### 1b. Fasce sovrapposte (D-048) — "Giornata intera" come prodotto reale + stato **`covered`** onesto
Spec [2026-07-06-timeslots-overlap-design.md](../superpowers/specs/2026-07-06-timeslots-overlap-design.md), piano [2026-07-06-timeslots-overlap.md](../superpowers/plans/2026-07-06-timeslots-overlap.md). **NON FE-only.** Origine: l'utente ha creato una fascia "Giornata int." (08–19) sovrapposta a Mattina/Pomeriggio e la mappa la mostrava come **prenotata fantasma** ("Giornaliero" senza cliente/importo), perché il projection usava "prima booking sovrapposta vince". Fix:
- **`SlotState` += `'covered'`** ([contracts](../../packages/contracts/src/index.ts)); `UmbrellaDTO.coveredBySlot?: Record<string,string[]>` (opzionale nel tipo, il projection lo popola sempre per le coperte).
- **Projection a due fasi** ([map.projection.ts](../../apps/api/src/map/map.projection.ts) `resolveSlot`): booking **diretta** (`timeSlotId===slot.id`) → stato dal tipo; altrimenti overlap con **altra** fascia → `'covered'` (+ `coveredBySlot` = ids fasce copritrici, dedup); altrimenti `'free'`. **L'overlap resta SOLO backend**; il FE legge `coveredBySlot`, non ricalcola nulla.
- **Reports** ([report.projection.ts](../../apps/api/src/reports/report.projection.ts) `occupancyStates` + [reports.service.ts](../../apps/api/src/reports/reports.service.ts)): le coperte **escluse** da occupazione e `stateMix` (una coperta è l'ombra di una booking contata sulla sua fascia diretta → niente doppio conteggio).
- **ui-kit**: token `--color-state-covered: #BEB6A8` (+`-ink`) in [theme.css](../../packages/ui-kit/src/styles/theme.css); `covered` in `fill`/`ink` di `UmbrellaCell`.
- **web-staff** [MapView.vue](../../apps/web-staff/src/features/map/MapView.vue): `STATE_COLOR`/`STATE_LABEL.covered='Non disponibile'`; box coperta "Non disponibile"; drawer helper `coveringInfo` → **"coperta da {fascia} — {cliente} · €{importo}"**; coperta **non prenotabile** (già esclusa da `freeSlotOptions`/`slotIsBusy`). Esaustività `Record<SlotState>` completata anche in `lib/chartColors.ts` e `features/report/ReportView.vue`.
- **Simmetrico**: full-day prenotata → metà coperte; metà prenotate → full-day coperta.
- **Coerenza backend**: il vincolo DB `booking_no_overlap` (ADR-0037) impedisce già la doppia prenotazione di fasce sovrapposte → il FE che non offre le coperte è allineato (tentativo diretto = 409 gentile, ora solo backstop).

**Baseline test LIVE sul branch `582e618` (RUN autoritativi, eseguiti dal controller):** ui-kit **79** · web-staff **268** · web-platform **16** · api unit **205** · api e2e **235** (`--runInBand`) · typecheck PULITO ovunque. *(Su `main` e89d72b la baseline è ancora ui-kit 73 · web-staff 257 · api unit 200 · e2e 235.)*

**Review:** ogni task Spec ✅/Approved (0 Crit/0 Imp); whole-branch **opus** su N-fasce = *Ready to merge Yes*; whole-branch **opus** su D-048 (52e0a73..97ae684) = *Ready to merge Yes*. Nessun Critical/Important su nessuna delle due.

## 2. Stato DEV / Docker — l'app gira col codice del branch
- Container **ricostruiti** (2026-07-06): `coralyn-api`, `coralyn-web` (8080), `coralyn-web-platform` (8081) rebuild dal tree del branch; `coralyn-db` (5433) e `coralyn-mailpit` (8025) **intatti** (dati preservati). Comando usato: `docker compose --profile full up -d --build api web web-platform`.
- **Conseguenza utile:** il DB contiene ancora la fascia "Giornata int." sovrapposta + le booking create a mano dall'utente → su `localhost:8080` l'ombrellone 9 ora mostra la fascia coperta come **"Non disponibile"** con il dettaglio copritori (non più il fantasma "Giornaliero"). Login admin `admin@coralyn.dev` / `coralyn-admin-8473`.
- Se ricostruisci di nuovo dopo modifiche a `contracts`/api: **attenzione al gotcha purge** (§6) che azzera il Prisma client.

## 3. DECISIONI IN SOSPESO (chiedi all'utente prima di agire)
1. **Merge FF su `main`** — il branch porta **entrambe** le slice (N-fasce + D-048), verdi e approvate. L'utente ha detto «non mergiare ancora». Quando dà l'ok: `git checkout main && git merge --ff-only feat/timeslots-map && git push`. **Al merge:** registra **D-048** in [`deferred.md`](../architecture/deferred.md) (spostalo tra le **Risolte** con riferimento a spec+branch, come le altre implementate — NON lasciarlo tra i deferiti, è costruito).
2. **Colore stato `covered`** (`#BEB6A8`) — l'utente vuole **rivederlo dopo** (flag di review: possibile vicinanza al `--color-state-normal-mark #D8CDBB`, ma su righe diverse della legenda). Se lo cambi: ritocca **solo** il token in `theme.css` e rirun i test (nessuna logica dipende dal valore).

## 4. "Altri mock" / hardcode residui (rendile-vere leftovers) — piccoli, FE
⚠️ **La MSW (`apps/web-staff/src/mocks/`) è SOLO per i test**: in dev/prod il FE colpisce il backend reale via proxy Vite (commenti espliciti in `main.ts`/`server.ts`). **Non** è "dato finto in app.** I veri hardcode residui:
- **[Sidebar.vue:32](../../apps/web-staff/src/app/Sidebar.vue)** — "**Stagione 2026**" hardcoded nel banner stabilimento (nessuna sorgente stagione in sessione; serve un dato/endpoint stagione attiva).
- **[Sidebar.vue:54](../../apps/web-staff/src/app/Sidebar.vue)** — ruolo "**Amministratore**" hardcoded sotto l'email: dovrebbe derivare da `session.role` (Admin→Amministratore, Staff→Operatore/Staff).
- **[LoginView.vue](../../apps/web-staff/src/features/auth/LoginView.vue)** — footer "Stagione 2026 · sessione protetta" (decorativo).
- NB: le "· in arrivo" in `EstablishmentView`/`Report` sono **fallback legittimi** per non-admin o sotto-feature, NON obsoleti.

## 5. D-0xx di dominio da affrontare (registro [`deferred.md`](../architecture/deferred.md); CONFERMA priorità con l'utente)
Il filone "rendile vere" è chiuso; la mappa (N + sovrapposte) è chiusa (branch). Prossimi candidati, per valore:
- **D-012** — Cabine/servizi accessori prenotabili (nuova risorsa, stesso pattern ombrellone). Slice grande, massimo valore-prodotto.
- **D-035** — Canale cliente "assenze comunicate" (il cliente segnala di NON essere presente → l'operatore rivende il posto abbonato liberato). Nuova superficie client-facing. **Invariante non negoziabile:** senza segnalazione esplicita, l'operatore NON può rivendere (nessuna presunzione d'assenza). Alto valore, grande.
- **D-036** — Report cruscotto avanzato (heatmap, medie di periodo, serie stagione, export, rinnovo inline). *(NB: sinergia con D-048 — l'occupancy% sotto slot sovrapposte è deferita nella spec D-048 §7: qui andrebbe ridefinita formalmente.)*
- **D-013** — Sospensione/cessione/disdetta abbonamento.
- **D-015** — Disponibilità a orari arbitrari (fasce fini): il modello a `Fascia` è ormai N-agnostico e overlap-aware → generalizzabile senza riscrittura, se richiesto.
- Security (gated su esposizione pubblica): D-026/D-027/D-028/D-029 (refresh token, rate-limit, RLS User, timing login). D-037 = gestione globale 401 FE. D-041 = filtro `P2002→409` globale. D-047 = audit tenant admin. D-046 = deliverability invito in console.

## 6. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **pnpm, MAI npm** ([[coralyn-pnpm-not-npm]]): usa `corepack pnpm`. Se chiede purge senza TTY → `CI=true corepack pnpm install`. **Su zagor il purge può scattare anche durante `typecheck`/`--filter contracts build`.**
- **⚠️ Gotcha grave osservato in D-048 T1:** `corepack pnpm --filter @coralyn/contracts build` ha **triggerato il purge di `node_modules`** → ha **azzerato il Prisma client generato** → i test api non compilavano finché non si rifà `prisma generate`. Se ricostruisci contracts e poi i test api falliscono con errori Prisma, **rigenera il client** (`corepack pnpm --filter @coralyn/api exec prisma generate` o equivalente) prima di ritestare.
- **`@coralyn/contracts` compila in `dist/` (gitignored):** dopo modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test (api E FE). api e2e (ts-jest) type-checka il progetto.
- **api e2e paralleli FLAKY su zagor** — run autoritativi: **`corepack pnpm --filter @coralyn/api test:e2e --runInBand`** (targettabile con `-- <pattern>`, es. `-- map`).
- **Gotcha conteggio test**: `apps/web-staff/vitest.config.ts` **globa** `../../packages/ui-kit/src/**/*.spec.ts` → gli spec ui-kit contano in ENTRAMBE le suite. Per slice che toccano `UmbrellaCell` verificare **ui-kit E web-staff**.
- **Aggiungere un valore a `SlotState`** rompe (per esaustività) 6 mappe `Record<SlotState,...>`: `UmbrellaCell` `fill`/`ink` (ui-kit); `MapView` `STATE_COLOR`/`STATE_LABEL`, `lib/chartColors.ts` `STATE_VAR`, `features/report/ReportView.vue` `STATE_LABEL` (web-staff). Il typecheck le elenca tutte — è la rete di sicurezza.
- **Modale ui-kit = reka-ui (teleport su body)**: nei test `attachTo: document.body` + `document.querySelector` + eventi nativi + `w.unmount()`.
- **Container dev**: `docker compose --profile full up -d --build [api web web-platform mailpit]`. Porte: web-staff **8080**, web-platform **8081**, api **3000**, db **5433**, Mailpit **8025**. Login admin `admin@coralyn.dev`/`coralyn-admin-8473`; superuser `super@coralyn.dev`/`coralyn-super-9182` (web-platform); email → Mailpit.

## 7. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune`. **NB: `main` NON è avanzato** (il lavoro è sul branch non mergiato) → **NON** fare `checkout main`/reset che perderebbe il branch. Fai `git checkout feat/timeslots-map` e riparti da lì (o mergia su `main` se l'utente dà l'ok, §3). Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). ⚠️ Molto lavoro arriva dall'altra macchina — fidati di `git log`. Rebuild container + `@coralyn/contracts` prima di testare in dev. Per slice creative: `brainstorming` (RISOLVI le decisioni con l'utente) → `writing-plans` → `subagent-driven-development` → review 2 stadi per layer + whole-branch su opus → verifica LIVE → presenta e attendi conferma. Traccia in `.superpowers/sdd/progress.md`.

## 8. Ancore di codice (VERIFICATE 2026-07-06, branch `582e618`)
- **Mappa N-fasce:** [MapView.vue](../../apps/web-staff/src/features/map/MapView.vue) (`timeSlots` ordinato per sortOrder :41, `slotStatesFor` :54, drawer `v-for` box :293, messaggio :315), [ui-kit/UmbrellaCell.vue](../../packages/ui-kit/src/components/UmbrellaCell.vue) (`slotStates`, `bg`/`uniform` esposti via `defineExpose`).
- **Fasce sovrapposte (D-048):** [map.projection.ts](../../apps/api/src/map/map.projection.ts) (`resolveSlot`), [contracts](../../packages/contracts/src/index.ts) (`SlotState`, `UmbrellaDTO.coveredBySlot`), [report.projection.ts](../../apps/api/src/reports/report.projection.ts) (`occupancyStates`), [MapView.vue](../../apps/web-staff/src/features/map/MapView.vue) (`coveringInfo`, drawer covered), [theme.css](../../packages/ui-kit/src/styles/theme.css) (`--color-state-covered`).
- **Booking overlap (invariante backend):** [booking.availability.ts](../../apps/api/src/bookings/booking.availability.ts) (`slotsOverlap`), [bookings.service.ts](../../apps/api/src/bookings/bookings.service.ts) (pre-check + vincolo `booking_no_overlap`).
- **Hardcode residui (§4):** [Sidebar.vue:32,54](../../apps/web-staff/src/app/Sidebar.vue).

## 9. Messaggio di delega (apertura prossima sessione) — vedi risposta in chat
Il messaggio pronto da incollare è fornito separatamente nel turno di chat che accompagna questo handoff.
