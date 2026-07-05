# Handoff / Delega — Platform Console COMPLETA (backend + `web-platform`) su `origin/main` · prossima slice: invito credenziali via email

> Documento di consegna per la **prossima sessione/agente**. **Supera**
> [2026-07-05-configura-completo-e-prossimi.md](2026-07-05-configura-completo-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming →
> piano TDD → esecuzione **subagent-driven, un commit per layer, TDD** → review a due stadi → verifica LIVE → presenta.
> **Leggi questo per primo.**

---

## 0. Situazione GIT — LEGGERE CON ATTENZIONE
- **`origin/main` = `main` locale = `5132f5b`** (pushato, tree pulito). **Platform Console COMPLETA e pushata**: backend (Slice A) + frontend `apps/web-platform` (Slice B).
- Repo: `github.com/devfrx/coralyn`. Monorepo pnpm (`corepack pnpm@11.9.0`, Node ≥22): `packages/{contracts,ui-kit}` + `apps/{api,web-staff,web-platform}`.
- ⚠️ **Push su `main` richiede ok ESPLICITO** dell'utente (default branch). Lavoro creativo su **feature branch → FF-merge con ok**.
- **Prossimo ADR libero: 0042. Prossimo D libero: D-046** (D-040…D-045 già registrati, vedi §3).
- **Due task in background avviati dall'utente** (sessioni separate, vedi §4): fix typecheck `map.projection.spec` (utile) e `styles/main.css` (ridondante, già risolto inline). Se producono branch, il prossimo agente li valuti/merghi.

## 1. Cosa è COMPLETO su `origin/main`

### Platform Console — backend (Slice A)
Modulo `apps/api/src/platform/`, cross-tenant, tutto `@Roles(Role.Superuser)`:
- `GET /api/platform/establishments` (+`/:id`) — metriche aggregate **PII-free** per lido via **loop `prisma.forTenant`** ([ADR-0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)): `PlatformMetricsService`.
- `POST /api/platform/establishments` — crea lido + primo admin, ritorna **password temporanea una-tantum** (server-generated, argon2, mai persistita in chiaro): `PlatformProvisioningService`.
- `POST /api/platform/establishments/:id/{suspend,reactivate}` — con **audit in-transaction**.
- Nuovo modello **`PlatformAuditLog`** (RLS-free, solo mutazioni del superuser) + `Establishment.createdAt/suspendedAt` (migrazione `20260705130000_platform_console`, applicata a dev+test).
- Il **login respinge gli utenti di lidi sospesi** (`Establishment.suspendedAt` → 401 generico).
- Bootstrap primo superuser via **seed env-gated** (`PLATFORM_SUPERUSER_EMAIL`/`PLATFORM_SUPERUSER_PASSWORD`; no-op senza env). Dev: `super@coralyn.dev`/`coralyn-super-9182`, `establishmentId=null`.

### Platform Console — frontend `apps/web-platform` (Slice B)
SPA **dedicata** al distributore ([ADR-0041](../architecture/decisions/0041-app-frontend-dedicata-platform.md)), sibling di `web-staff`, riusa `@coralyn/ui-kit`+`@coralyn/contracts`:
- **Session store solo-superuser**: `login()` E `rehydrate()` rifiutano i non-superuser (difesa in profondità); token in **chiave localStorage dedicata** `coralyn.platform.auth.token` (no collisione con web-staff).
- Router con guard `meta.role: Superuser`; home `/establishments`.
- Chrome **purpose-built** `PlatformShell` (topbar brand + nav + logout) + `ToastHost` (errori mutation visibili); `LoginView` brandizzato "Coralyn Platform".
- **Vista lista** (tabella metriche + badge "Sospeso" + suspend/reactivate via `ConfirmDialog`), **modale create** (password una-tantum copiabile), **vista dettaglio** (StatTile aggregati). **Nessuna UI che mostri PII dei bagnanti.**
- MSW + Vitest: **14 test**. Deploy: `Dockerfile`+`nginx.conf`+servizio compose **porta 8081**.
- Review finale Opus ✅ (0 Critical/Important, ToastHost incluso). **Verifica LIVE ok**: login super→lista con dato reale; admin di lido→**403**; anonimo→**401**.

### Sotto (già su main da prima)
Configura struttura COMPLETO (editor logico admin-only) · FE+auth+mappa+bookings A1-A4+listino D-032+report+rinnovi D-011+Stabilimento (RBAC ADR-0039, utenti D-025).

**Test baseline (NON regredire):** ui-kit **70** · web-staff **210** · web-platform **14** · api unit **178** · api e2e **222**.
⚠️ `tsc --noEmit` NON è pulito: **errore pre-esistente non-nostro** in `apps/api/src/map/map.projection.spec.ts` (fixture `Sector` senza `kind`, fallout dell'aggiunta `SectorKind` in Configura). Jest resta verde (ts-jest transpile-only). **Fix in corso** (§4).

## 2. IL PROSSIMO PASSO — Slice "Invito credenziali via email (set-password link)"
**Decisione prodotto 2026-07-05 (utente):** la "password mostrata una volta" attuale è **interim**. La consegna credenziali va fatta via **email con link "imposta la tua password"** (token firmato, a scadenza, monouso) — **NON** spedendo la password in chiaro. Motivazione: privacy/minimizzazione (il distributore non vede mai la credenziale) + il pattern professionale non fa mai esistere/viaggiare una password in chiaro. Allineato ad [ADR-0028](../architecture/decisions/0028-provisioning-tenant.md) ("invito via email per impostare la password").

**Un solo meccanismo che copre tutti i casi di generazione credenziale (DRY):**
1. **Provisioning nuovo lido** (rimpiazza lo show-once): l'admin del lido riceve l'invito e imposta la password.
2. **Reset-password admin di un lido** dalla console superuser — **buco pratico attuale**: oggi se un admin perde la password non c'è modo di rimediare da UI (solo DB/seed). Serve un `POST /api/platform/establishments/:id/reset-admin-password` (o invito equivalente).
3. (Futuro) **Inviti staff** — assorbe la parte deferita di [D-025](../architecture/deferred.md) (badge "Inviti e gestione · in arrivo" in `web-staff EstablishmentView`).

**È un sottosistema NUOVO** (oggi l'app non manda email): serve un **mailer** (SMTP generico o provider tipo Postmark/SES + secret), un **modello token** (hash + scadenza + monouso, non-RLS come `User`), un **endpoint/pagina pubblici `set-password`** (fuori auth), un **catcher email in dev/test** (Mailpit/Mailhog) e i test. **Non è "gestione di base temporanea"** → merita il giro completo **brainstorming → spec → piano TDD** (ADR-0009). **Prima domanda da decidere con l'utente:** provider/trasporto email (SMTP vs provider) e forma token/pagina set-password.

**Roadmap prodotto dopo l'email** (dal registro, confermare con utente): **D-024** GDPR cliente · **D-012** cabine/servizi accessori · **D-035** canale cliente "assenze comunicate" · **D-036** report avanzato · **D-013** sospensione/cessione abbonamento · **D-033** pricing periodico multi-stagione.

## 3. Follow-up / deferred rilevanti (fonte autorevole: [`deferred.md`](../architecture/deferred.md))
- **D-045** — **cleanup coerenza post-ADR-0041**: rimuovere lo **stub console superuser in `web-staff`** (rotta `/console` + `features/console/ConsoleView.vue`, badge "in arrivo") ora **obsoleto** (la console è `web-platform`); e far **rifiutare a `web-staff` il login dei superuser** (specularmente a `web-platform`). Basso rischio, mirroring del pattern esistente.
- **D-042** — impersonation / accesso PII puntuale per supporto (escape-hatch controllato alla parete rigida, con audit di lettura).
- **D-043** — vista materializzata `establishment_metrics` (upgrade del loop `forTenant` a scala).
- **D-044** — `User.lastLoginAt` (oggi `lastActivityAt` = proxy `max(Booking.createdAt)`).
- **D-040** — estrarre `EstablishmentStructureView.vue` (~406 righe) + esportare union `SectorKind`/`UmbrellaIconKey` da contracts.
- **D-041** — `ExceptionFilter` globale Prisma `P2002 → 409` (chiude la TOCTOU check-then-create dei service CRUD).
- **D-038** drag-reorder struttura · **D-037** gestione globale `401` FE · **D-005** editor pixel · Hardening auth D-026/D-027/D-028/D-029 (gated su esposizione pubblica).

## 4. In-flight & mock/placeholder noti (contesto per il prossimo agente)
- **Task background (sessioni separate dell'utente):**
  - **Fix typecheck `map.projection.spec.ts`** — genuino, ripulisce l'unico errore `tsc --noEmit`. Se atterra su un branch, **merger­lo** (poi baseline typecheck pulita).
  - **`web-platform/src/styles/main.css`** — **RIDONDANTE**: già risolto inline nel commit `8eedb55`. La sessione parallela troverà il file presente; se creasse un commit duplicato/conflittuale, **scartarlo**.
- **Interim/mock ancora in codice:**
  - **Show-once password** (`web-platform CreateEstablishmentModal.vue`: "…mostrata una sola volta…") → sostituito dalla slice email (§2).
  - **`/console` stub in web-staff** → obsoleto, vedi D-045.
  - **`web-staff` `session.ts` `establishmentName = 'Lido Maestrale'`** hardcoded: `/auth/me` non espone il nome stabilimento → la nav web-staff usa il default. Fix quando si tocca `/me`.
  - **`web-staff` `/register` (`RegisterView.vue`)**: per [ADR-0028](../architecture/decisions/0028-provisioning-tenant.md) deve essere pagina informativa "attivazione su invito" (niente self-registration). Verificare che non crei account.
  - Badge "· in arrivo" residui in `web-staff EstablishmentView.vue` (Modifica/Configura/Inviti) = fallback non-admin o sotto-feature legittime (inviti = slice email), **non** mock morti.

## 5. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test.
- **Migrazioni**: `prisma migrate dev` NON gira non-interattivo → hand-authora la cartella e `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (`localhost:5433`, `coralyn_app`/`coralyn_app`), poi `generate`. `DATABASE_URL` inline (Prisma non auto-carica il `.env` di root da `apps/api`). ⚠️ Non `prisma db push` (drift `Rate_signature_key`, D-039).
- **`RolesGuard` globale** → dopo modifiche a guard/rotte ri-esegui **tutta** la suite api (unit+e2e).
- **Tabelle di dominio RLS FORCE** → ogni accesso in `prisma.forTenant(tenantId, tx=>…)`; `Establishment`/`User`/`PlatformAuditLog` sono **fuori RLS**. Count via psql diretto su tabelle RLS serve `SELECT set_config('app.current_tenant','…', false)`.
- **Seed**: `u()`→uuid v4 validi; se cambi id nel seed serve `prisma migrate reset`. Superuser: lancia con `PLATFORM_SUPERUSER_EMAIL/PASSWORD` set. Admin dev: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- **Container**: `docker compose --profile full up -d --build api web web-platform` dopo cambi (stale=404). Porte: **web-staff 8080, web-platform 8081, api 3000, db 5433**. `MSYS_NO_PATHCONV=1` per `docker exec` con path assoluti. `$UID` è readonly in bash → altro nome.
- **web-platform**: token key `coralyn.platform.auth.token`; login rifiuta i non-superuser; preview Vite su 5174 (via `preview_start "web-platform"`), ma verifica più affidabile = **Docker 8081** + `fetch`/`curl` autenticato.
- **Login API**: campo token = **`accessToken`**; `POST /api/auth/login` → `{accessToken,user}`.
- **Vitest + ui-kit `Modal`/`ConfirmDialog`** (reka-ui teleport su `document.body`): nei test `mountApp(View,{attachTo:document.body})` + `document.querySelector` + `w.unmount()` + helper `settle()` (flush+macrotask+flush). Fixture email con TLD `.test`/`.example` (`@IsEmail` rifiuta domini con cifra tipo `*.e2e`).

## 6. Ancore di codice (VERIFICATE 2026-07-05)
- **Platform BE**: `apps/api/src/platform/` — `platform.controller.ts` (`@Roles(Superuser)` a livello classe), `platform-metrics.service.ts` (loop `forTenant`, riusa `report.projection.occupancyPct` + `common/dates`), `platform-provisioning.service.ts` (transazione interattiva RLS-free), `dto/create-establishment.dto.ts`, `platform.module.ts`. Login guard: `apps/api/src/identity/identity.service.ts`. e2e: `apps/api/test/platform.e2e-spec.ts`. Seed: `apps/api/prisma/seed.ts` (blocco superuser env-gated).
- **Platform FE**: `apps/web-platform/src/` — `stores/session.ts` (solo-superuser), `router/index.ts` (guard), `app/{PlatformShell,AuthLayout,ToastHost}.vue`, `features/auth/LoginView.vue`, `features/establishments/{usePlatformEstablishments.ts,EstablishmentsListView.vue,CreateEstablishmentModal.vue,EstablishmentDetailView.vue}`, `mocks/{server,handlers}.ts`, `lib/{http,authToken,queryClient,queryKeys,useQueryResource,toasts}.ts`. Deploy: `Dockerfile`, `nginx.conf`, servizio `web-platform` in `docker-compose.yml`.
- **Spec + piani + ADR Platform**: spec [2026-07-05-platform-console-superuser-design.md](../superpowers/specs/2026-07-05-platform-console-superuser-design.md); piani [slice-a-backend](../superpowers/plans/2026-07-05-platform-console-slice-a-backend.md) e [slice-b-frontend](../superpowers/plans/2026-07-05-platform-console-slice-b-frontend.md); ADR [0040](../architecture/decisions/0040-lettura-aggregata-cross-tenant.md), [0041](../architecture/decisions/0041-app-frontend-dedicata-platform.md).
- **Pattern FE da rispecchiare**: `apps/web-staff/src/features/establishment/*` (ui-kit + test teleport), `lib/useQueryResource.ts` (factory), `app/ToastHost.vue`.

## 7. Workflow (ADR-0009)
All'avvio: `git fetch --all --prune`. Path `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Lavoro creativo: `brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida — istruire "fai tutto tu, niente deleghe"; review a due stadi / o verifica inline per task meccanici + review finale Opus) → verifica LIVE → presenta e attendi conferma. Merge su `main` = **FF con ok esplicito**. Rebuild `@coralyn/contracts` dopo checkout; rebuild container prima di testare in dev.
