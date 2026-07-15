# Handoff — D-035 S4 (canale cliente FE + endpoint) COMPLETA e mergiata · **modulo D-035 CHIUSO**

> **Data:** 2026-07-15 · **Autore sessione:** agente D-035 S4 (subagent-driven).
> **TL;DR:** **S4 completa** — il **canale cliente self-service** (app PWA `apps/web-customer` + 3 endpoint cliente)
> è implementato (TDD), rivisto (task-review a 2 stadi + **whole-branch opus**), **LIVE-verificato su Docker** e
> **mergiato FF + pushato** su `origin/main` (`333ef66`). Con S4 il **modulo D-035 è INTERAMENTE CHIUSO**
> (S1+S2 operatore, S3 auth, S4 canale FE). S4 è **additivo**: nessuna nuova tabella/migration.
> ⚠️ **La whole-branch review ha beccato un buco di sicurezza CRITICO pre-esistente (S3-era), ora fixato** (§3).

---

## 1. Stato `git` & baseline

- **`main` = `origin/main` = `333ef66`** (ALLINEATI, pushati 2026-07-15). Branch `feat/customer-channel-d035-s4`
  **eliminato** (FF, nessun merge commit). 18 commit da `7a4eaad` (base) a `333ef66`.
- **Baseline (LIVE su `main`):** **api unit 238** · **api e2e 354** (+9 S4: me/subscriptions, release cliente,
  ownership IDOR same-tenant, cross-tenant, RESOLD, regressione operatore, **cross-auth staff**) · **web-customer
  25** (5 file: http, session, ActivationView, MySubscriptionsView, AbsenceReleaseModal) · web-staff 364 · ui-kit
  111 · web-platform 16. Typecheck: `api tsc` **pulito**, `web-customer vue-tsc -b` **pulito**.
- **All'avvio prossima sessione:** `git fetch --all --prune` + ff (qui il locale è allineato) [[coralyn-machine-sync]].

## 2. Cosa è stato fatto (S4 — additivo su S1/S2/S3)

**Backend** (riuso del domain service, zero duplicazione):
- Estesi `bookings.service.ts` `releaseAbsence(id, input, opts?)` e `cancelAbsenceRelease(id, rid, opts?)` con
  `opts.source` (default `'operator'`) e `opts.actingCustomerId` (ownership). Nuovo
  `listSubscriptionsForCustomer(customerId)` = `listByCustomer` filtrato a `type='subscription'`.
- Nuovo **`CustomerBookingsController`** (`@Controller('customer')`, `@UseGuards(CustomerJwtGuard)` classe +
  `@Public()` per-metodo): `GET /customer/me/subscriptions`, `POST /customer/subscriptions/:bookingId/absence-releases`,
  `POST .../:rid/cancel`. Registrato in `BookingsModule` (che importa già `CustomerAuthModule` → nessun ciclo).
- **`source='customer'` è impostato dal controller, NON dal body** (un cliente non può spacciare
  `source='operator'`) — refinement di sicurezza rispetto allo `input.source` letterale della spec §6.3.
- **Ownership a 2 assi:** RLS (tenant da `req.tenantId` del guard) **+** `actingCustomerId` (dal principal JWT)
  nel `where` del `findFirst`; mismatch → `NOT_FOUND` → **404** (nessun leak d'esistenza).

**Frontend** — nuova app **`apps/web-customer`** (clone di `web-platform`, pattern [ADR-0041]):
- Scaffold PWA (Vite/Vue3/Pinia/vue-router/TanStack Query/vite-plugin-pwa), **porta docker 8082**, launch.json 5175.
- `src/lib/http.ts`: `apiFetch(path, init?, opts?)` con **interceptor 401→refresh→retry-once** (D-037); su refresh
  fallito **o retry ancora-401** → `onAuthFailure()` (logout+redirect attivazione). **`retryOn401:false`** sugli
  endpoint auth (`/customer/refresh`,`/customer/activate`) per **evitare la ricorsione** (vedi §3 gotcha). Refresh
  **single-flight** (una sola rotazione per N 401 concorrenti → niente theft-detection lockout).
- `src/stores/session.ts`: `activate(token,pin)`/`refresh()`/`logout()`/`rehydrate()`. Chiavi localStorage
  **distinte**: `coralyn.customer.access.token` / `coralyn.customer.refresh.token`.
- Viste: `ActivationView` (token da `?token=` + PIN → `activate`, errore generico), `MySubscriptionsView` (lista
  read-only, "Segnala assenza" gated su `absenceConsentAt`, storico release con badge `resold`/azione "Annulla"),
  `AbsenceReleaseModal` (giorno futuro nello span + motivo → `useReleaseAbsence`). Errori del modale **generici
  inline** (`useReleaseAbsence` `quiet:true`); `useCancelRelease` **non-quiet** di proposito (azione inline, serve
  il feedback 409 RESOLD).

**Docs (DoD [ADR-0009]):** ADR-0049 addendum "S4 realizzata"; `flows.md §7` nota `source='customer'`; 4 mockup
`docs/design/mockups/web-customer-*.html`; `deferred.md` (**D-035 → CHIUSA**; **D-037 → Risolta per web-customer**,
resta aperta per web-staff). Piano: `docs/superpowers/plans/2026-07-15-canale-cliente-d035-s4.md`.

## 3. ⚠️ Buco CRITICO cross-auth trovato dalla whole-branch review — FIXATO (importante)

**Sintomo:** staff e cliente firmano il JWT con lo **stesso `JWT_SECRET`**, e `identity/token.service.ts`
`verify()` (staff) **non controllava `kind`**. Un **access token cliente** (`kind:'customer'`, senza `role`)
verificava quindi la firma sulla `JwtAuthGuard` staff; poiché `RolesGuard` lascia passare le rotte **senza
`@Roles`**, un token cliente poteva raggiungere rotte staff (`GET /bookings`, `GET /customers` = PII di tutto il
tenant, `PATCH /bookings/:id/payment` = cassa), scoped solo dalla RLS-tenant. Asimmetria: il `CustomerJwtGuard`
già rifiutava i token staff, ma non viceversa. [ADR-0049] **dichiarava** la garanzia che il codice non applicava.
Pre-esistente da **S3**, ma **S4 lo rende live** (token cliente nei browser reali su canale pubblico).

**Fix** (`ae9d8ec`, TDD): `TokenService.verify()` **rifiuta `payload.kind === 'customer'`** (→ 401), mirror di
`CustomerTokenService` che accetta solo `kind='customer'`. Regression e2e in
`customer-subscriptions.e2e-spec.ts`: token cliente su `GET /api/bookings` e `GET /api/customers` → **401** (RED
pre-fix = 200). Staff invariati (i token staff non hanno `kind`). **Difesa-in-profondità futura:** valutare
secret/audience separati per i due canali (non fatto — fuori scope, il check `kind` chiude il buco).

## 4. GOTCHA / lezioni (per la prossima sessione)

- **`web-customer` NON deve rompere l'anti-ricorsione dell'interceptor:** gli endpoint auth vanno chiamati con
  `apiFetch(..., { retryOn401: false })`, altrimenti un 401 su `/customer/refresh` (token scaduto/revocato) rientra
  nell'interceptor → **loop infinito** che blocca il mount (`rehydrate()` è awaited prima di `app.mount`). Il
  `refresh()` è **single-flight** (`refreshInFlight` module-scoped, clear in `finally`): non trasformarlo in
  per-chiamata (riaprirebbe la race theft-detection).
- **`test/helpers/insert-booking-with-coverage.ts`** ora accetta `type?`/`absenceConsentAt?` opzionali
  (default `'daily'`/`null`, backward-compat) → per creare abbonamenti consentiti nei test/LIVE.
- **`web-customer` non ha MSW mock server** (a differenza di web-staff): i suoi spec mockano `fetch`/`apiFetch`
  direttamente; `src/test/setup.ts` è minimale (non copiabile da web-platform, che importa `@/mocks/server`).
- **Gate typecheck FE reale** = `corepack pnpm --filter @coralyn/web-customer run typecheck` (`vue-tsc -b`).
- **Comandi test:** api e2e `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t '<pat>'` (NON ri-passare
  `--config`); web-customer `corepack pnpm --filter @coralyn/web-customer test`. **Non** parallelizzare web `test`
  e api `test:e2e`.
- **LIVE Docker:** `docker compose --profile full up -d --build` → web-customer su **:8082**, web-staff 8080,
  web-platform 8081, api 3000, db 5433, Mailpit 8025. `activationUrl` è **relativo** in dev (`CUSTOMER_APP_URL`
  non settato) → in prod va settato. **Dato di test LIVE lasciato nel DB dev** (subscription + 2 release per Mario
  Verdi, tenant `000...001`) — reversibile con `db:reset` + reseed.

## 5. Prossimi passi (backlog `deferred.md` — da valutare con l'utente)

- **D-035 è CHIUSA.** Nessun lavoro residuo sul canale cliente.
- **D-037 lato web-staff:** la stessa gestione globale del 401 (interceptor) serve ancora a web-staff (lì è aperta:
  gestione *graceful* del 401 senza refresh, il pattern web-customer è riusabile).
- **D-005/D-038/D-040** — editor struttura «Configura» (layer pixel/coordinate, drag-reorder, estrazione
  composabili di `EstablishmentStructureView.vue`).
- **D-047** — audit di tenant per le azioni admin-in-tenant (include provisioning/revoca accesso cliente).
- **D-036** (report avanzato/heatmap, lega a occupancy% D-048) · **D-042/043/044/046** (platform console).
- **Minori/infra:** D-015, D-021, D-023, D-024, D-025, D-031, D-033/034. **D-012** (cabine/servizi) — ⚠️ l'utente
  lo ritiene poco utile, **non partire senza riconferma**.
- Prossimo **ADR** libero **0050**, prossimo **D** libero **D-051**.

## 6. Metodo (replicato — preferenze utente)

Review spec (già confermata) → **writing-plans** (TDD, piano unico un-solo-merge) → **subagent-driven** (implementer
per task, review a 2 stadi + **whole-branch opus**; fix Crit/Imp con re-review; Minor a triage finale) → **verifica
LIVE su Docker** → **presentare e attendere OK esplicito** per merge FF **e** push (entrambi ottenuti). **DoD
[ADR-0009]:** design docs aggiornati nello stesso task. **Preferenza:** soluzione professionale/senza-debiti (i 5
Minor sono stati fixati su richiesta dell'utente prima del merge, non deferiti).

## 7. Riferimenti

- Piano S4: [2026-07-15-canale-cliente-d035-s4.md](../superpowers/plans/2026-07-15-canale-cliente-d035-s4.md) ·
  Spec S3+S4: [2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md](../superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md).
- Auth cliente: [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) · Assenze:
  [ADR-0048](../architecture/decisions/0048-assenze-comunicate-release-occupazione.md) · App dedicata:
  [ADR-0041](../architecture/decisions/0041-app-frontend-dedicata-platform.md).
- Codice API: `apps/api/src/bookings/customer-bookings.controller.ts`, `bookings.service.ts` ·
  `apps/api/src/identity/token.service.ts` (fix cross-auth) · e2e `apps/api/test/customer-subscriptions.e2e-spec.ts`.
- FE: `apps/web-customer/` (http.ts, stores/session.ts, features/subscriptions/*).
- Registro [`deferred.md`](../architecture/deferred.md) · Handoff precedente:
  [2026-07-15-d035-s3-canale-cliente-auth-completo-e-prossimi.md](2026-07-15-d035-s3-canale-cliente-auth-completo-e-prossimi.md).
