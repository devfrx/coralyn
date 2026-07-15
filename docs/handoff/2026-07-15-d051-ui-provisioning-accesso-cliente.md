# Handoff — D-051 (UI operatore provisioning accesso cliente in web-staff) COMPLETA e mergiata

> **Data:** 2026-07-15 · **Autore sessione:** agente D-051 (subagent-driven).
> **TL;DR:** **D-051 completa** — la **UI operatore** per generare/revocare l'accesso cliente dalla Scheda cliente
> in `web-staff` è implementata (TDD, 7 task), rivista (task-review a 2 stadi + **whole-branch opus Ready**),
> **LIVE-verificata su Docker** e **mergiata FF + pushata** su `origin/main` (`8159017`). Additiva:
> **nessuna nuova tabella/migration**. Chiude l'ultimo tassello operatore del canale cliente (modulo D-035).

---

## 1. Stato `git` & baseline

- **`main` = `origin/main` = `8159017`** (ALLINEATI, pushati 2026-07-15). Branch `feat/customer-access-ui-d051`
  **eliminato** (FF, nessun merge commit). 9 commit da `807a1ac` (base) a `8159017`.
- **Baseline (LIVE su `main`):** **web-staff 387** (+12: 3 hook, 3 modale, 4 card, 2 detail-view) · **api e2e**
  Customer access **19** (13 S3 + **6 D-051**: 4 stati none/issued/active/revoked + 404 cross-tenant + 403 non-admin) ·
  ui-kit 111. Typecheck: `api tsc` **pulito**, `web-staff vue-tsc -b` **pulito**.
- **All'avvio prossima sessione:** `git fetch --all --prune` + ff (qui il locale è allineato) [[coralyn-machine-sync]].

## 2. Cosa è stato fatto (additivo, nessuna migration)

**Backend** (`apps/api`):
- **Nuovo `GET /bookings/:id/customer-access`** (`@Roles(Admin)`) → `CustomerAccessStatusDTO`
  `{ state: 'none'|'issued'|'active'|'revoked', lastActivatedAt }`. Il metodo `CustomerAccessService.accessStatus`
  **esisteva già** (da S3) ma non era cablato a nessuna rotta.
- **Refactor DRY:** estratto `private resolveCustomerId(bookingId)` — risoluzione booking→customer **tenant-scoped
  sotto RLS** (`prisma.forTenant`), unico punto usato da `provisionAccess`/`revokeAccess`/`accessStatusForBooking`.
  Nuovo `accessStatusForBooking(bookingId)` risolve il customer (RLS) poi delega a `accessStatus`, ora **`private`**
  (nessun chiamante per `customerId` grezzo → **niente IDOR cross-tenant**; l'endpoint 404 su booking fuori-tenant).

**Frontend** (`apps/web-staff`):
- **`CustomerAccessCard.vue`** (`SectionCard` «Accesso cliente» nella Scheda cliente): badge di stato (Mai generato /
  Emesso / Attivo / Revocato + ultima attivazione), **«Genera accesso»/«Rigenera»** (toggle su `hasAccess`=issued|active)
  e **«Revoca»** (solo se hasAccess, via `ConfirmDialog`). Azioni gated `isAdmin`; stato visibile anche a non-admin.
  Montata solo quando il cliente ha **≥1 abbonamento** (usa il primo booking-abbonamento come id rappresentativo —
  qualunque booking del cliente risolve lo stesso customer, la rotazione è per-cliente).
- **`CustomerAccessModal.vue`** (reveal **una-volta**, pattern `CreateEstablishmentModal`): **QR** (`<img>` da
  `qrcode.toDataURL(activationUrl)`), **link** e **PIN** con copia (`navigator.clipboard`), scadenza, avviso
  «non più recuperabile». Il QR/link è significativo solo con `CUSTOMER_APP_URL` configurato (in dev è relativo).
- **3 hook** in `useCustomers.ts`: `useCustomerAccessStatus` (query), `useProvisionCustomerAccess`,
  `useRevokeCustomerAccess` (mutation, invalidano lo stato) — pattern `queryResource`/`mutationResource`.
- **Nuova dip `qrcode`** (+ `@types/qrcode`) in web-staff; icone **`copy`/`smartphone`** aggiunte alla registry
  offline di `@coralyn/ui-kit`.

**Docs (DoD [ADR-0009]):** `deferred.md` (**D-051 → Risolta**), `flows.md §9` (nota UI operatore sulla macchina
a stati enrollment), ADR-0049 addendum «D-051 realizzata», mockup `docs/design/mockups/web-staff-customer-access.html`.
Spec/piano: `docs/superpowers/{specs,plans}/2026-07-15-ui-provisioning-accesso-cliente-d051*`.

## 3. Whole-branch review (opus) — Ready-to-merge

Nessun Critical/Important. Verificato: risoluzione tenant-scoped sotto RLS + `APP_GUARD` admin-only (non-admin → 403
prima di `resolveCustomerId`); `accessStatus` privato single-caller; nessun oracle 403-vs-404; seam
hook↔card↔modal↔view coerenti + invalidation corretta. **2 fix minori applicati** (`8159017`): `onGenerate` avvolto
in try/catch (niente unhandled rejection; il toast globale `mutationResource.onError` resta), e typo baseline
`deferred.md` 353→354. **Minor residui accettati** (reviewer «leave»): `fmtExpires` accetta `undefined` (difensivo);
`CustomerAccessModal.spec` non copre expires/done/null-QR; «Revoca» senza `:loading` (finestra chiusa dal ConfirmDialog).

## 4. GOTCHA / note (per la prossima sessione)

- **Accesso cliente = per-`Customer`**, ma gli endpoint prendono un `bookingId` (punto d'ingresso → risolve il
  customer sotto RLS). La card usa il primo abbonamento come id rappresentativo; provision **ruota** enrollment+sessioni.
- **Verifica LIVE** (Docker `--profile full`): login `admin@coralyn.dev`/**`coralyn-admin-8473`** (default `coralyn-admin`
  può 401 — reseed lo clobbera [[coralyn-dev-preview-env]]). Backend via curl su booking abbonamento reale:
  `active`→provision(`issued`,url+pin+expiresAt)→revoke(204)→`revoked`; unauth 401. FE nel container :8080:
  card render stato live + modale con **QR PNG reale** generato client-side. **⚠️ Il browser-pane preview va in timeout
  su screenshot** (reka-ui modal + animazioni) — verificato via `javascript_tool` (`document.querySelector` sui
  data-testid), non via screenshot. **Dato dev residuo:** un enrollment `issued` lasciato su Mario Verdi (reversibile
  con `db:reset` + reseed).
- **Comando test:** web-staff `corepack pnpm --filter @coralyn/web-staff test` (globa anche ui-kit specs); api e2e
  mirati `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access'` (NON ri-passare `--config`).
  **Non** parallelizzare web `test` e api `test:e2e`. Gate typecheck FE reale = `vue-tsc -b`.

## 5. Prossimi passi (backlog `deferred.md` — da valutare con l'utente)

- **D-037 lato `web-staff`:** interceptor 401 globale (logout+redirect); il pattern di `web-customer` (single-flight
  refresh) è riusabile ma web-staff non ha refresh → basta logout+redirect.
- **D-005/D-038/D-040** — editor struttura «Configura» (drag-reorder, re-parent, estrazione composabili).
- **D-047** — audit di tenant per le azioni admin-in-tenant (include provisioning/revoca accesso cliente D-051).
- **D-036** (report avanzato/heatmap, lega a occupancy% D-048) · **D-042/043/044/046** (platform console).
- **Minori/infra:** D-012 (cabine) ⚠️ l'utente lo ritiene poco utile — **non partire senza riconferma**.
- Prossimo **ADR** libero **0050**, prossimo **D** libero **D-052**.

## 6. Riferimenti

- Spec: [2026-07-15-ui-provisioning-accesso-cliente-d051-design.md](../superpowers/specs/2026-07-15-ui-provisioning-accesso-cliente-d051-design.md) ·
  Piano: [2026-07-15-ui-provisioning-accesso-cliente-d051.md](../superpowers/plans/2026-07-15-ui-provisioning-accesso-cliente-d051.md).
- Auth cliente: [ADR-0049](../architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md) (addendum D-051) ·
  Consegna credenziali: [ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md).
- Codice API: `apps/api/src/customer-auth/customer-access.service.ts`, `apps/api/src/bookings/bookings.controller.ts` ·
  e2e `apps/api/test/customer-access.e2e-spec.ts`.
- FE: `apps/web-staff/src/features/customers/{CustomerAccessCard,CustomerAccessModal}.vue`, `useCustomers.ts`,
  `CustomerDetailView.vue`.
- Registro [`deferred.md`](../architecture/deferred.md) · Handoff precedente:
  [2026-07-15-d035-s4-canale-cliente-completo.md](2026-07-15-d035-s4-canale-cliente-completo.md).
