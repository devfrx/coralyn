# Handoff / Delega — Stabilimento COMPLETO (Fase 1 + Fase 2) su `origin/main` · prossimi passi

> Documento di consegna per la **prossima sessione/agente**. **Supera** l'handoff
> [2026-07-04-stabilimento-fase1-in-corso-e-prossimi.md](2026-07-04-stabilimento-fase1-in-corso-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming →
> piano TDD → esecuzione **subagent-driven, un commit per layer, test-first** → review a due stadi → verifica LIVE →
> presenta e attendi conferma.

---

## 0. Situazione GIT
- **`origin/main` = `4d1c086`** (FF, in sync): **Stabilimento COMPLETO**. Il branch di lavoro
  `feat/stabilimento-rbac-rename` è stato **FF-mergiato su `main` e pushato**. Il branch locale/remoto esiste ancora
  (uguale a main) — eliminabile a piacere (`git branch -d feat/stabilimento-rbac-rename` + eventuale prune remoto).
- **Nessuna migrazione pendente.** L'ultima applicata è `20260704191049_add_user_disabled_at` (additiva,
  `User.disabledAt DateTime?`), presente su `coralyn_dev` e `coralyn_test`.
- **Prossimo ADR libero: 0040** (0039 = role-guard, creato in Fase 1). **Prossimo D libero: D-038.**
- ⚠️ **Push su `main` richiede ok ESPLICITO** dell'utente (il classifier blocca il default branch).

## 1. Cosa è stato consegnato (tutto su `origin/main`)
**Stabilimento overview** (read-only, slice precedente) + le **scritture** (questo completamento):
- **Fase 1 — rinomina + fondazione RBAC** (`21e5388`, `5e7ad5e`):
  - **[ADR-0039](../architecture/decisions/0039-rbac-role-guard.md)**: `@Roles(...)` decorator + `RolesGuard`
    **globale** (2° `APP_GUARD` dopo `JwtAuthGuard`). Rotte senza `@Roles` invariate; con `@Roles(Role.Admin)` → 403.
  - `PATCH /api/establishment` (rinomina, admin-only, tenant per PK — `Establishment` senza RLS).
  - FE: modale «Modifica» admin-gated in `EstablishmentView.vue`; staff resta "in arrivo".
- **Fase 2 — gestione utenti (D-025 core)** (`5f47533`, `fa29883`, `4d1c086`):
  - Migrazione **`User.disabledAt`** (soft-disable, additiva/nullable).
  - `POST /api/establishment/users` (crea staff/admin: email unica→**409**, `role @IsIn(['admin','staff'])`→superuser
    **400**, password `@MinLength(8)`, hash argon2 via `PasswordHasher`) e `PATCH /api/establishment/users/:id`
    (`{disabled}`: soft-disable/enable) — **entrambi `@Roles(Role.Admin)`**, tenant-scoped (filtro `establishmentId`
    esplicito, `User` **senza RLS** — ADR-0026).
  - **Invarianti anti-lockout** (→ **422**): no self-disable; no disabilitare l'ultimo admin attivo. (NB: (b) è
    isolabile solo a livello **unit** — in prod l'attore è sempre un admin attivo → coperto lì.)
  - **`login` respinge i disabilitati** (`401` generico, no enumerazione). Revoca token già emesso = **D-026** (8h).
  - `EstablishmentOverviewDTO.team[].disabledAt` esposto dalla projection.
  - FE: modale «Aggiungi utente» (email/password/ruolo) + azione disabilita/riabilita per riga + righe distinte
    ("Disabilitato") + **pending-guard** anti doppio-click; staff vede la lista **read-only**. 409/422 → toast del server.

**Test (baseline attuale, da NON regredire):** ui-kit **70** · web-staff **191** · api unit **134** · api e2e **182** ·
typecheck pulito. Verificato LIVE (Docker `--build api web`): API reale (create/disable/409/400/422/401-dopo-disable) +
browser (admin crea/disabilita, staff read-only, 0 errori console).

## 2. IL PROSSIMO PASSO (da confermare con l'utente)
Lo Stabilimento è **chiuso**. Sequenza prodotto suggerita (confermare sempre prima di partire):
1. **D-024 — GDPR cliente** (soft-delete/anonimizzazione) **oppure** **D-012 — Cabine/servizi accessori** (risorsa
   gemella dell'Ombrellone; slice grande).
2. Poi la **visione grande D-035** (canale cliente + "assenze comunicate").
3. Oppure **D-005 — editor planimetria** (sblocca `Configura` dello Stabilimento, ancora "in arrivo").
- **D-034** (forfait periodico) è **DEPRIORITIZZATO** — non riproporlo per primo.

## 3. Follow-up aperti (tracciati, non bloccanti)
- ⚠️ **Prisma drift — `Rate_signature_key`** (indice raw `NULLS NOT DISTINCT`, ADR-0032, non esprimibile con
  `@@unique`): ogni `prisma migrate dev` ripesca uno spurio `DROP INDEX`. Già gestito manualmente nella migrazione
  `add_user_disabled_at`, ma **da risolvere alla radice** (workflow `--create-only`, o rappresentazione drift-free).
  **Spawnato come task/chip separato.** Candidato **D-038** se si vuole formalizzarlo nel registro.
- **`/auth/me` non espone il nome stabilimento** → la nav header usa il default hardcoded `'Lido Maestrale'` mentre la
  pagina Stabilimento mostra il nome reale. Fix quando si tocca `/me`/sessione.
- **Invito-via-email** dello staff (SMTP/token/onboarding) — futuro increment di D-025 (ora è direct-create).
- **Cambio/reset password** utente (self o admin-reset) — futuro; ora la password è impostata alla creazione.
- **D-037** (401 → redirect login globale FE) e **D-026** (revoca token) restano aperti in `deferred.md`.

## 4. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifiche a `packages/contracts/src/index.ts`
  → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** di typecheck/test api.
- **Container dev stale = 404**: dopo cambi BE → `docker compose --profile full up -d --build api web`.
- **`RolesGuard` è GLOBALE**: dopo modifiche ai guard/rotte, ri-esegui **tutta** la suite api (unit + e2e). Endpoint
  senza `@Roles` devono restare invariati (il guard ritorna `true` se `!required`).
- **`User` NON ha RLS** (ADR-0026): query utenti filtrate **esplicitamente** per `establishmentId`. `Establishment`
  non ha RLS (update per PK `id = tenantId` è sicuro).
- ⚠️ **`prisma migrate dev` e il drift `Rate_signature_key`** (vedi §3): se rigeneri una migrazione, **controlla** che
  `migration.sql` non contenga un `DROP INDEX "Rate_signature_key"` spurio; se sì, rimuovilo e ricrea l'indice raw
  (`CREATE UNIQUE INDEX … NULLS NOT DISTINCT`, come in `20260630203447_pricing`).
- ⚠️ **`seed.ts` fa UPSERT dell'admin**: lancialo **sempre** con `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- **DB**: dev `coralyn_dev`, test `coralyn_test`, entrambi `localhost:5433`, utente/pass `coralyn_app`/`coralyn_app`.
  Prisma **non** auto-carica il `.env` di root da `apps/api` → passa `DATABASE_URL` inline per i comandi migrate.
- **Bash tool su Windows** (Git Bash/POSIX): niente here-string PowerShell; commit multi-riga con `git commit -F -` +
  heredoc; path assoluti (cwd persiste). Per `docker compose exec` con path assoluti usa `MSYS_NO_PATHCONV=1`
  (altrimenti Git Bash converte `/app/...` in path Windows → "Cwd must be an absolute path").
- **Preview LIVE FE**: `preview_start "web-staff"` (Vite); se 5173 è occupato Vite passa a **5174** mentre il proxy del
  preview è su un'altra porta → **naviga direttamente a `http://localhost:5174/…`**. web Docker = `8080`.
- **Sessione FE scaduta ≠ bug** (token 8h): schermata in-errore → **re-login** prima di gridare al bug (D-037).
- **Vitest + ui-kit `Modal`** (reka-ui portal → teleport su `document.body`): nei test del modale usa
  `mountApp(View, { attachTo: document.body })` + `document.querySelector` + `w.unmount()` (come `MapView.spec.ts`).

## 5. Ancore di codice (VERIFICATE 2026-07-04)
- **API Stabilimento**: [`apps/api/src/establishment/`](../../apps/api/src/establishment/) —
  `establishment.controller.ts` (`GET overview`, `PATCH` rinomina), `establishment-users.controller.ts` +
  `establishment-users.service.ts` (create/setDisabled + invarianti), `establishment.service.ts`/`.projection.ts`
  (overview con `disabledAt`), `dto/`.
- **RBAC**: [`apps/api/src/identity/`](../../apps/api/src/identity/) — `roles.decorator.ts`, `roles.guard.ts`,
  `current-user.decorator.ts`, `password-hasher.ts`; registrazione 2° `APP_GUARD` in `identity.module.ts`;
  `identity.service.ts` (`login` respinge disabilitati).
- **FE**: [`apps/web-staff/src/features/establishment/`](../../apps/web-staff/src/features/establishment/) —
  `EstablishmentView.vue`, `useEstablishment.ts` (overview + rename + create/setDisabled mutations).
- **Contratti**: `packages/contracts/src/index.ts` — `EstablishmentMemberDTO` (con `disabledAt`),
  `UpdateEstablishmentInput`, `CreateStaffUserInput`, `UpdateStaffUserInput`.
- **Riuso**: `prisma.forTenant`/`TenantContext.require()`, `Reflector`, ui-kit `Modal`/`Field`/`Input`/`Select`/`Button`;
  FE `queryResource`/`mutationResource` + `queryKeys.ts`.

## 6. Workflow (ADR-0009) + sync macchina
All'avvio: `git fetch --all --prune` → `git checkout main && git merge --ff-only origin/main`. Path
`C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays). Slice creativo:
`brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida + review a due stadi, un
commit per layer) → verifica LIVE → presenta e attendi conferma. Merge su `main` = **FF con ok esplicito**.
⚠️ Rebuild container prima di testare in dev; rebuild `@coralyn/contracts` dopo checkout.
