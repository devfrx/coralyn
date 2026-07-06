# Handoff / Delega — Filone "rendile vere" COMPLETO (5 slice mergiate) · spec fasce↔mappa PRONTA · prossimi

> Documento di consegna per la **prossima sessione**. **Supersede**
> [2026-07-06-d024-cleanup-date-nav-e-prossimi.md](2026-07-06-d024-cleanup-date-nav-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming (RISOLVI le
> decisioni con l'utente) → piano TDD → subagent-driven (un commit per layer, TDD, review a due stadi + whole-branch finale su
> opus) → verifica LIVE → **presenta e attendi conferma**. Push su `main` = **FF con ok ESPLICITO** dell'utente. **Leggi questo per primo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8)
- **`main` locale = `origin/main` = `b28e0cf`** (+ il commit docs di questo handoff/spec), tree pulito, tutto pushato. Nessun branch di lavoro aperto.
- **Prossimo ADR libero: 0044** (0043 = erasure GDPR). **Prossimo D libero: D-048.**
- **Nessuna migrazione pendente.** Nessun cambio schema in questa sessione.

## 1. Cosa è COMPLETO su `main` (questa sessione, 2026-07-06) — filone "rendile vere" §3 CHIUSO
Cinque slice, ciascuna: brainstorming → spec → piano TDD → subagent-driven → review 2 stadi + whole-branch **opus (Ready to merge, 0 Crit/0 Imp)** → verifica LIVE → FF merge + push. Ledger completo in [.superpowers/sdd/progress.md](../../.superpowers/sdd/progress.md).

1. **Navigazione data** (`activeDate`): frecce ±1 + picker `<input type=date>`, default **oggi** Europe/Rome (`lib/dates.ts` `addDays`/`todayIso` UTC-safe DST), gating route-meta `usesDate` (solo `/map`,`/bookings`), hint erasure GDPR scollegato da `activeDate`→`todayIso()`. Spec `2026-07-06-date-navigation-design.md`.
2. **Modifica cliente**: modale **unica** di edit (`EditCustomerModal.vue`, nome+cognome+contatti precompilati → `useUpdateCustomer` PATCH), card "Anagrafica" resa **read-only**; via il bottone morto + la doppia affordance; **nome ora modificabile**. Spec `2026-07-06-edit-customer-design.md`.
3. **Ricerca clienti**: componente **riutilizzabile `SearchInput`** nello ui-kit (icona+input+clear); `CustomersView` filtra client-side per **nome+telefono** (telefono normalizzato solo-cifre), empty-state + contatore filtrato. Spec `2026-07-06-customer-search-design.md`.
4. **Nome stabilimento**: `UserDTO.establishmentName: string|null` esposto da `/auth/login`+`/auth/me`; `identity.service` include la relazione establishment (query di sospensione login **consolidata** in 1 query, behavior-preserving); FE store `establishmentName` = **computed** dalla sessione (Sidebar); subtitle `/map` → "Vista per giornata" (via nome hardcoded + conteggio finto "47 ombrelloni"). Spec `2026-07-06-establishment-name-design.md`.
5. **D-045 login-guard**: `web-staff` **rifiuta i superuser** (login throw pre-token + rehydrate logout, mirror inverso di web-platform) + `Sidebar.spec` (copre il render del nome). `deferred.md` D-045 marcato **COMPLETO**. Spec `2026-07-06-staff-login-guard-design.md`.

**Baseline test (verificata LIVE all'HEAD `b28e0cf`, RUN autoritativi):** ui-kit **73** · web-staff **257** · web-platform **16** · api unit **200** · api e2e **235** (`--runInBand`) · typecheck PULITO ovunque.

## 2. IL PROSSIMO PASSO — Fasce orarie ↔ mappa (spec PRONTA, da pianificare+eseguire)
Spec: **[docs/superpowers/specs/2026-07-06-timeslots-map-design.md](../superpowers/specs/2026-07-06-timeslots-map-design.md)** — **brainstorming GIÀ FATTO, decisioni confermate**. Prossima azione: `writing-plans` (TDD) → subagent-driven.
**In breve:** il dato è già N-aware (`UmbrellaDTO.stateBySlot` per ogni fascia; la logica booking itera già `timeSlots`), ma il **visivo comprime N→2** (`halfSlots` in [MapView.vue:55](../../apps/web-staff/src/features/map/MapView.vue), 2 box hardcoded "Mattina/Pomeriggio" :307-318, messaggio "intera giornata" :333). Assorbe i **3 bug** (fasce centrali sparite / nomi ignorati / messaggio errato). **Decisioni confermate:** cella `UmbrellaCell` **N-agnostica a spicchi** (props `slotStates: SlotState[]` al posto di `morning/afternoonState`, conic-gradient); modale con **N box reali** (`v-for` su `timeSlots`, nomi/orari/stato reali, selezionabili); messaggio disponibilità **computato**; modello = **partizione disgiunta** → **FE-only** (verificare nel piano che il map projection popoli `stateBySlot` per TUTTE le fasce con un caso a 3 fasce). **Deferito (candidato D-0xx):** fasce **sovrapposte / "giornata intera"** con blocco cross-fascia = logica backend, decisione di dominio separata (§7 spec).

## 3. Residui "rendile vere" minori (hardcode FE ancora presenti)
Piccoli, opzionali, non tracciati come D-:
- **Sidebar.vue:32** — "**Stagione 2026**" hardcoded nel banner stabilimento (nessuna sorgente stagione in sessione; serve un dato/endpoint stagione attiva).
- **Sidebar.vue:54** — ruolo "**Amministratore**" hardcoded sotto l'email utente: dovrebbe derivare da `session.role` (Admin→Amministratore, Staff→Operatore/Staff).
- **LoginView.vue:36** — footer "Stagione 2026 · sessione protetta" (decorativo).
- Nota: le "· in arrivo" in `EstablishmentView`/`Report` sono **fallback legittimi** per non-admin o sotto-feature, NON obsoleti (vedi `deferred.md` D-045 NB).

## 4. D-0xx di dominio da affrontare (registro [`deferred.md`](../architecture/deferred.md); CONFERMA priorità con l'utente)
- **D-012** — Cabine/servizi accessori prenotabili (nuova risorsa + disponibilità + pricing, stesso pattern ombrellone). Slice grande, massimo valore-prodotto.
- **D-035** — Canale cliente "assenze comunicate" (il cliente segnala dal proprio dispositivo di NON essere presente → l'operatore rivende il posto abbonato liberato). Nuova superficie client-facing. **Invariante non negoziabile:** senza segnalazione esplicita, l'operatore NON può rivendere (nessuna presunzione d'assenza). Alto valore, grande.
- **D-036** — Report cruscotto avanzato (heatmap, medie di periodo, serie stagione, export, rinnovo inline).
- **D-013** — Sospensione/cessione/disdetta abbonamento.
- Security (gated su esposizione pubblica): D-026/D-027/D-028/D-029 (refresh token, rate-limit, RLS User, timing login). D-047 = audit tenant admin. D-037 = gestione globale 401 FE. D-041 = filtro `P2002→409` globale. D-017 = brand/dominio email.

## 5. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **pnpm, MAI npm** ([[coralyn-pnpm-not-npm]]): `npm install` corrompe `node_modules`. Usa `corepack pnpm install`; se chiede purge senza TTY → `CI=true corepack pnpm install`. Su zagor può persistere il prompt di purge: vale una `CI=true corepack pnpm install` a inizio sessione.
- **api e2e paralleli FLAKY su zagor** — run autoritativi: **`corepack pnpm --filter @coralyn/api test:e2e --runInBand`** (senza `--` prima di `--runInBand`).
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` prima di typecheck/test (api E FE). api e2e (ts-jest) type-checka il progetto → allinea contracts+consumer nello stesso layer.
- **Gotcha conteggio test**: `apps/web-staff/vitest.config.ts` **globa** `../../packages/ui-kit/src/**/*.spec.ts` → uno spec ui-kit conta in ENTRAMBE le suite. Per la slice fasce↔mappa (tocca `UmbrellaCell` in ui-kit) verificare **ui-kit E web-staff**.
- **Modale ui-kit = reka-ui (teleport su body)**: nei test `attachTo: document.body` + `document.querySelector` + eventi nativi + `w.unmount()` (pattern in `CustomersView.spec.ts`/`EditCustomerModal.spec.ts`).
- **Container dev**: `docker compose --profile full up -d --build [api web web-platform mailpit]`. Porte: web-staff **8080**, web-platform **8081**, api **3000**, db **5433**, Mailpit **8025**. Container stale = 404/endpoint nuovi mancanti → rebuild. Login admin `admin@coralyn.dev`/`coralyn-admin-8473`; superuser `super@coralyn.dev`/`coralyn-super-9182` (web-platform); email → Mailpit.
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e --runInBand`; web-staff `--filter web-staff test` / `typecheck`; web-platform `--filter web-platform test` / `typecheck`; ui-kit `--filter @coralyn/ui-kit test` / `typecheck`. (L'API non ha script `typecheck` — l'e2e ts-jest copre il type-check.)

## 6. Ancore di codice (VERIFICATE 2026-07-06)
- **Fasce↔mappa (§2):** [features/map/MapView.vue](../../apps/web-staff/src/features/map/MapView.vue) (`halfSlots` :55, `slotState` :71, `open` :89, box template :307-318, messaggio :333-335), [ui-kit/UmbrellaCell.vue](../../packages/ui-kit/src/components/UmbrellaCell.vue); modello `TimeSlot`/`stateBySlot` in `packages/contracts/src/index.ts`; mock fasce `apps/web-staff/src/mocks/data/seed.ts` (`timeSlotsSeed`, 2 fasce disgiunte).
- **Nome stabilimento (fatto):** `packages/contracts` `UserDTO.establishmentName`; `apps/api/src/identity/identity.service.ts` (login/me include); `apps/web-staff/src/stores/session.ts` (computed), `app/Sidebar.vue`.
- **D-045 (fatto):** `apps/web-staff/src/stores/session.ts` (guard login/rehydrate), mirror `apps/web-platform/src/stores/session.ts`.
- **Residui hardcode (§3):** `apps/web-staff/src/app/Sidebar.vue:32,54`.

## 7. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). ⚠️ **Molto lavoro arriva dall'altra macchina** — fidati di `git log`, non degli SHA qui. Rebuild container + `@coralyn/contracts` prima di testare in dev. Per slice creative: `brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida; review 2 stadi per layer + whole-branch su opus) → verifica LIVE → presenta e attendi conferma. Traccia in `.superpowers/sdd/progress.md`. Merge su `main` = **FF con ok ESPLICITO**.

## 8. Messaggio di delega (apertura prossima sessione) — vedi risposta in chat
Il messaggio pronto da incollare è fornito separatamente nel turno di chat che accompagna questo handoff.
