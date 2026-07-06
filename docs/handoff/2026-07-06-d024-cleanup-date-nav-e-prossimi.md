# Handoff / Delega — D-024 GDPR erasure + cleanup UI morta FATTI · spec navigazione data pronta · prossimi filoni

> Documento di consegna per la **prossima sessione**. **Supersede** l'handoff precedente
> [2026-07-05-credential-invite-email-completo-e-prossimi.md](2026-07-05-credential-invite-email-completo-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming (RISOLVI le
> decisioni con l'utente) → piano TDD → subagent-driven (un commit per layer, TDD, review a due stadi + whole-branch finale) →
> verifica LIVE → **presenta e attendi conferma**. Push su `main` (default branch) = **FF con ok ESPLICITO** dell'utente.
> **Leggi questo per primo.**

---

## 0. Situazione GIT (all'avvio fai il sync §8)
- **`main` locale = `origin/main` = `6feebf3`**, tree pulito, tutto pushato. Nessun branch di lavoro aperto.
- Ultimi commit rilevanti: `6feebf3` cleanup UI morta · `1effcdb`…`2a84020` slice D-024 GDPR erasure · sotto, ~123 commit dall'altra macchina (Scheda Cliente, RBAC/Configura Stabilimento, Report, Platform Console, invito credenziali+staff email).
- **Prossimo ADR libero: 0044** (0043 = erasure GDPR). **Prossimo D libero: D-048** (D-047 usato).
- **Nessuna migrazione pendente.** Container dev rebuildati oggi dal working tree di `main` (api/web/web-platform/mailpit/db up & healthy).

## 1. Cosa è COMPLETO su `main` (questa sessione, 2026-07-06)

### D-024 — Cancellazione/anonimizzazione cliente (GDPR) — [ADR-0043](../architecture/decisions/0043-erasure-e-retention-cliente-gdpr.md)
`DELETE /api/customers/:id` **admin-only**: 0 prenotazioni → **delete reale**; con storico passato/cancellato →
**anonimizzazione in place irreversibile** (scrub `firstName='Cliente'`/`lastName='rimosso'`/`phone`/`email`/`notes`→null +
`anonymizedAt`/`anonymizedBy`); **409** se relazione attiva = prenotazione `confirmed` con `endDate >= oggi` **OPPURE**
**finestra di prelazione aperta** (riusa `computeRenewalWindowState`, fonte unica). `list()` esclude gli anonimizzati.
FE: azione admin-only adattiva nella Scheda cliente (label/disable dallo storico, confirm, toast esito-aware, banner
"Dati personali rimossi"). Migrazione `add_customer_anonymized_fields`. **Resta deferito** solo il **consenso/informativa
(Art. 13)** alla creazione. Review whole-branch (opus): merge=YES, 0 Crit/0 Imp. Spec
[2026-07-06-gdpr-customer-erasure-d024-design.md](../superpowers/specs/2026-07-06-gdpr-customer-erasure-d024-design.md), piano
[2026-07-06-gdpr-customer-erasure-d024.md](../superpowers/plans/2026-07-06-gdpr-customer-erasure-d024.md).

### Cleanup UI morta web-staff (commit `6feebf3`) — D-045 parziale
Rimossi: **campana notifiche** + **barra ricerca globale decorativa** (Topbar) + **stub `/console`** (view + rotta + link
sidebar, obsoleto post-ADR-0041). **RESTA D-045:** far rifiutare a `web-staff` il **login dei superuser** (cambio
comportamento + test, mirroring `apps/web-platform/src/stores/session.ts`).

**Baseline test (verificata LIVE all'HEAD `6feebf3`, RUN autoritativi):** ui-kit **70** · web-staff **227** · web-platform
**16** · api unit **200** · api e2e **235** (con `--runInBand`) · typecheck PULITO ovunque.

## 2. IL PROSSIMO PASSO — Navigazione data (spec PRONTA, da confermare+pianificare+eseguire)
Spec: **[docs/superpowers/specs/2026-07-06-date-navigation-design.md](../superpowers/specs/2026-07-06-date-navigation-design.md)**
(decisioni §3 **proposte, da confermare con l'utente** prima di pianificare).
**Perché è la priorità:** `session.activeDate` è **hardcoded `'2026-06-27'`** e le frecce ‹ › in Topbar sono morte →
**l'app è bloccata su un singolo giorno**. `activeDate` è già la sorgente reattiva consumata da mappa/prenotazioni/rinnovi
(query-keys) → **manca solo il mutatore + un default a "oggi"**. Slice FE-only piccola, nessun backend.
**Decisioni proposte (spec §3):** default = oggi Europe/Rome (util `todayIso()`); controlli = frecce ±1 giorno + picker
`<input type="date">` per salto arbitrario; visibilità **solo** su Mappa/Prenotazioni via route-meta `usesDate`; nessuna
persistenza; nessun limite. **Insidia:** aritmetica date UTC-safe (DST), util `addDays` con test (spec §4). Follow-up correlato:
scollegare l'hint erasure in `CustomerDetailView` da `activeDate` → `todayIso()` (spec §5).
**Prossima azione:** brainstorming per confermare §3 → `writing-plans` → subagent-driven.

## 3. Filone "rendile vere" — UI mockata con backend spesso già pronto (dall'audit 2026-07-06)
Oltre alla navigazione data (§2, la prima), restano queste — piccole feature, non rimozioni:
- **«Modifica» cliente** ([CustomerDetailView.vue:80](../../apps/web-staff/src/features/customers/CustomerDetailView.vue)): bottone morto, ma `PATCH /customers/:id` **esiste già** → serve solo la form/modale di edit. Effort S/M.
- **Ricerca clienti** ([CustomersView.vue:29](../../apps/web-staff/src/features/customers/CustomersView.vue)): oggi un `<div>` finto → sostituire con input reale + filtro client-side della tabella. Effort S.
- **Nome stabilimento hardcoded** "Lido Maestrale" ([stores/session.ts:13](../../apps/web-staff/src/stores/session.ts) + subtitle route `/map` in [router/index.ts:10](../../apps/web-staff/src/router/index.ts)): `/auth/me` non espone il nome → aggiungerlo a `UserDTO`/`/auth/me` (piccola modifica BE) e leggerlo nello store. Effort M.
- **D-045 residuo**: `web-staff` login rifiuti i superuser (§1). Effort S.

## 4. Slice grossa — Fasce orarie ↔ mappa (design gap + bug, richiede brainstorm)
**Il nodo:** il modello `TimeSlot` è **N fasce arbitrarie** (`name`/`startTime`/`endTime`/`sortOrder`, ADR-0013), ma la
**mappa hardcoda 2 box "MATTINA/POMERIGGIO"**. In [MapView.vue:55](../../apps/web-staff/src/features/map/MapView.vue) (`halfSlots`)
prende inizio/fine giornata, scarta la fascia "piena" e tiene solo la **prima** (→"Mattina") e l'**ultima** (→"Pomeriggio").
**Conseguenze (bug reali):**
1. **Fasce centrali sparite:** con 3+ fasce, la fascia di mezzo è invisibile/non prenotabile dalla mappa.
2. **Nomi/orari reali ignorati:** i box dicono sempre "MATTINA/POMERIGGIO" ([:310](../../apps/web-staff/src/features/map/MapView.vue)) anche se le fasce si chiamano altrimenti — ecco perché "non si capisce come si collega una fascia arbitraria alla card".
3. **Messaggio disponibilità errato:** cliccando una fascia libera, [MapView.vue:334](../../apps/web-staff/src/features/map/MapView.vue) mostra "Postazione disponibile **per l'intera giornata**" hardcoded, **senza** controllare se l'altra metà è occupata (riprodotto dall'utente: mattina prenotata, pomeriggio → "intera giornata disponibile").
**È una vera slice di design** (come deve presentare la mappa N fasce arbitrarie? nomi/orari reali, tutte le fasce, messaggio
disponibilità corretto, prenotazione per-fascia). **Assorbe i 3 bug.** Richiede brainstorming (no quick-fix isolato).

## 5. D-0xx di dominio da affrontare (registro [`deferred.md`](../architecture/deferred.md); CONFERMA con l'utente)
- **D-012** — Cabine/servizi accessori prenotabili (nuova risorsa + disponibilità + pricing, stesso pattern ombrellone). Slice grande, massimo valore-prodotto.
- **D-035** — Canale cliente "assenze comunicate" (il cliente segnala dal proprio dispositivo di non essere presente → l'operatore può rivendere il posto abbonato liberato). Richiede una **nuova superficie client-facing**. Alto valore, grande. **Invariante non negoziabile:** senza segnalazione esplicita, l'operatore NON può rivendere (nessuna presunzione d'assenza).
- **D-036** — Report cruscotto avanzato (heatmap, medie di periodo, serie stagione, export, rinnovo inline).
- **D-013** — Sospensione/cessione/disdetta abbonamento.
- Security (gated su esposizione pubblica): D-026/D-027/D-028/D-029 (refresh token, rate-limit, RLS User, timing login). D-047 = audit di tenant. D-037 = gestione globale 401 FE. D-041 = filtro `P2002→409` globale.

## 6. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **pnpm, MAI npm** ([[coralyn-pnpm-not-npm]]): `npm install` corrompe `node_modules` (`Cannot read properties of null`). Usa `corepack pnpm install`; se pnpm chiede di purgare `node_modules` ma non ha TTY → `CI=true corepack pnpm install`. ⚠️ Su questa macchina persiste il prompt di purge (strascico di un `npm install`): vale una `CI=true corepack pnpm install` pulita a inizio sessione.
- **api e2e paralleli FLAKY su zagor** (contention DB, `max_connections`) — pre-esistente, indipendente dal codice. Per run autoritativi: **`corepack pnpm --filter @coralyn/api test:e2e --runInBand`** (senza `--` intermedio, altrimenti jest lo prende come pattern → 0 match).
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` prima di typecheck/test. **api e2e ts-jest TYPE-CHECKA** l'intero progetto → modifiche contracts-first rompono gli e2e finché i consumer non sono allineati (allinea BE+contract nello stesso layer).
- **`.env.test` al ROOT** serve per prisma/e2e; su zagor mancavano le chiavi `MAIL_*` (aggiunte localmente, gitignored). Ogni e2e che monta `AppModule` ha bisogno di `MAIL_HOST` in `.env.test`.
- **Migrazioni**: hand-author la cartella + `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (`localhost:5433`, `coralyn_app`/`coralyn_app`, `DATABASE_URL` inline), poi `generate`. Mai `db push`/`migrate dev`. L'entrypoint del container api fa `migrate deploy` su `coralyn_dev` all'avvio.
- **Container dev**: `docker compose --profile full up -d --build [api web web-platform mailpit]`. Porte: web-staff **8080**, web-platform **8081**, api **3000**, db **5433**, Mailpit UI **8025**/SMTP **1025**. Container stale = 404 su endpoint nuovi / SPA vecchio (clear service-worker cache). `MSYS_NO_PATHCONV=1` per `docker exec` con path assoluti.
- **Mailpit è un catcher dev** ([[coralyn-dev-email-mailpit]]): tutte le email credenziali finiscono in `:8025`, NON a caselle reali. È by-design, non un bug.
- **Login API**: campo token = **`accessToken`**. Admin dev `admin@coralyn.dev`/`coralyn-admin-8473`; Superuser dev `super@coralyn.dev`/`coralyn-super-9182` (web-platform 8081).
- **Comandi test** (root, `corepack pnpm`): api unit `--filter @coralyn/api test`; api e2e `--filter @coralyn/api test:e2e --runInBand`; web-staff `--filter web-staff test`; web-platform `--filter web-platform test`; ui-kit `--filter @coralyn/ui-kit test`; typecheck `--filter web-staff typecheck`.

## 7. Ancore di codice (VERIFICATE 2026-07-06)
- **Navigazione data (§2):** [stores/session.ts](../../apps/web-staff/src/stores/session.ts) (`activeDate`), [app/Topbar.vue](../../apps/web-staff/src/app/Topbar.vue) (frecce+label), [router/index.ts](../../apps/web-staff/src/router/index.ts) (route-meta `usesDate`). Consumatori: `features/map/{MapView.vue,useDayMap.ts}`, `features/bookings/{BookingsView.vue,useBookings.ts}`, `features/renewals/RenewalsView.vue`, `features/customers/CustomerDetailView.vue:33`.
- **Fasce↔mappa (§4):** [features/map/MapView.vue](../../apps/web-staff/src/features/map/MapView.vue) (`halfSlots` :55, box template :310, messaggio :334); modello `TimeSlot` in [prisma/schema.prisma:109](../../apps/api/prisma/schema.prisma).
- **Rendile vere (§3):** `features/customers/{CustomerDetailView.vue,CustomersView.vue}`; `stores/session.ts`; per il nome stabilimento: `apps/api/src/identity/auth.controller.ts` (`/auth/me`) + `UserDTO` in `packages/contracts/src/index.ts`.
- **D-024 (fatto):** `apps/api/src/customers/{customers.service.ts,customers.controller.ts}`, `apps/api/test/customers.e2e-spec.ts`; FE `features/customers/CustomerDetailView.vue` + `useCustomers.ts` (`useDeleteCustomer`).

## 8. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). ⚠️ **Molto lavoro arriva dall'altra macchina** — fidati di `git log`, non degli SHA qui. Rebuild container + `@coralyn/contracts` prima di testare in dev. Per slice creative: `brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida — "fai tutto tu"; review a due stadi per layer + whole-branch finale su opus) → verifica LIVE → presenta e attendi conferma. Traccia in `.superpowers/sdd/progress.md`. Merge su `main` = **FF con ok ESPLICITO**.

## 9. Messaggio di delega pronto da incollare (apertura prossima sessione)

> Continua il progetto Coralyn (C:\Users\zagor\Desktop\coralyn; altra macchina C:\Users\Jays\Desktop\new). Monorepo **pnpm**
> (mai `npm`), NestJS+Prisma (RLS) / Vue 3 (web-staff 8080 + web-platform 8081) / contracts condivisi.
>
> STATO: `main` = `origin/main` = `6feebf3`, pulito. Questa sessione ha chiuso **D-024 GDPR erasure cliente** (mergiato) e un
> **cleanup UI morta** (mergiato). Verde LIVE: ui-kit 70 · web-staff 227 · web-platform 16 · api unit 200 · api e2e 235
> (`--runInBand`) · typecheck pulito.
>
> MACCHINA: SEMPRE `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Se pnpm chiede di purgare
> node_modules → `CI=true corepack pnpm install`. Rebuild container prima di testare in dev (`docker compose --profile full up -d --build`).
> api e2e autoritativi con `--runInBand`. Login admin `admin@coralyn.dev`/`coralyn-admin-8473`; email → Mailpit :8025.
>
> PRIMA COSA (ADR-0009): leggi l'handoff `docs/handoff/2026-07-06-d024-cleanup-date-nav-e-prossimi.md` (fatto §1, prossimo passo
> navigazione data §2, filone "rendile vere" §3, slice fasce↔mappa §4, D-0xx §5, gotcha §6, ancore §7), poi la spec della
> navigazione data.
>
> TASK, in sequenza (mostrando all'utente e attendendo conferma dopo ciascuno): (1) **Navigazione data** — CONFERMA con l'utente
> le decisioni proposte nella spec `docs/superpowers/specs/2026-07-06-date-navigation-design.md` §3 (default oggi Europe/Rome;
> frecce ±1 + picker; visibilità solo Mappa/Prenotazioni via route-meta; no persistenza), poi PIANIFICA (TDD) ed ESEGUI
> subagent-driven (util `addDays`/`todayIso` UTC-safe con test; wiring Topbar; gating route-meta; scollega l'hint erasure di
> CustomerDetailView da activeDate). FE-only, non regredire web-staff 227. (2) Poi le altre "rendile vere" (§3): «Modifica»
> cliente (PATCH esiste), ricerca clienti, nome stabilimento (/auth/me), D-045 login-guard superuser. (3) Poi, come slice di
> design dedicata, **fasce orarie ↔ mappa** (§4): brainstorm su come la mappa presenta N fasce arbitrarie; assorbe i 3 bug
> (fasce centrali sparite, nomi ignorati, messaggio "intera giornata" errato). (4) D-0xx di dominio: **D-012** / **D-035** /
> **D-036** / **D-013** — CONFERMA priorità con l'utente.
>
> DOPO ogni slice/pagina: presentami lo stato e attendi conferma prima del successivo.
