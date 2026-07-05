# Handoff / Delega — Slice "Invito credenziali via email (set-password link)" COMPLETA su `origin/main` · prossima slice: **invito staff via email** (completa D-025)

> Documento di consegna per la **prossima sessione/agente**. **Supera**
> [2026-07-05-platform-console-completo-e-prossimi.md](2026-07-05-platform-console-completo-e-prossimi.md).
> Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: mock/spec → brainstorming →
> piano TDD → esecuzione **subagent-driven, un commit per layer, TDD** → review a due stadi → verifica LIVE → presenta.
> **Leggi questo per primo.**

---

## 0. Situazione GIT — LEGGERE CON ATTENZIONE
- **`origin/main` = `main` locale = `ad7e334`** (pushato, tree pulito). Contiene la slice **Invito credenziali via email COMPLETA** (17 commit) + il fix di completamento FE `LoginView` (conferma "Password impostata" al ritorno da set-password).
- **Include il cherry-pick del fix tsc `map.projection.spec`** (`Sector.kind` nella fixture): il typecheck ora è **PULITO ovunque** (`tsc`/`vue-tsc` exit 0 su api, web-staff, web-platform). Non è più un problema pendente.
- Repo: `github.com/devfrx/coralyn`. Monorepo pnpm (`corepack pnpm@11.9.0`, Node ≥22): `packages/{contracts,ui-kit}` + `apps/{api,web-staff,web-platform}`.
- ⚠️ **Push su `main` richiede ok ESPLICITO** dell'utente (default branch). Lavoro creativo su **feature branch → FF-merge con ok**.
- **Prossimo ADR libero: 0043. Prossimo D libero: D-047** (D-046 usato in questa sessione).

## 1. Cosa è COMPLETO su `origin/main` (questa sessione)

### Slice "Invito credenziali via email (set-password link)" — [ADR-0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)
Sostituisce la "password mostrata una volta" del provisioning con un invito via **link set-password**. Nessuna password in chiaro esiste, viene persistita o viaggia mai; il distributore non vede mai la credenziale.
- **Modello `CredentialSetupToken`** (RLS-free, accanto a `User`/`PlatformAuditLog`): token opaco 256-bit nel link, in DB solo `sha256(raw)`; `expiresAt` (TTL env `CREDENTIAL_TOKEN_TTL_HOURS`=72h) + `consumedAt` (monouso con **claim atomico race-safe**); un solo token vivo per utente (l'emit invalida i precedenti). Migr. `20260705140000_credential_setup_token`; enum `CredentialTokenPurpose {invite,reset}` + valore `PlatformAction.reset_admin_password` (dev+test).
- **Sottosistema mail** `apps/api/src/mail/`: porta astratta `MailerService` + adapter SMTP `SmtpMailerService` (nodemailer) + builder puro `credential-setup.email.ts`. Config via env; **provider-swappable** (Postmark/SES = solo env). **Mailpit** in dev/test (compose: SMTP `1025` / UI `8025`). Invio **best-effort** (persist-then-send: log WARN su fallimento, recupero via reset).
- **`CredentialModule`** (`apps/api/src/credential/`): `CredentialSetupService.issueAndSend(userId, email, purpose, createdByUserId, auditWithinTx?)` / `getContext(raw)` / `redeem(raw, password)`. Importato da `IdentityModule` (redeem) e `PlatformModule` (issue).
- **Endpoint pubblici** `@Public()` su `AuthController`: `GET /api/auth/credential-setup/:token` → `{email,purpose}` (404 generico se invalido/scaduto/consumato) · `POST /api/auth/credential-setup` `{token,password}` → **204** (DTO `@MinLength(10)`).
- **Provisioning** (`platform-provisioning.service.ts`): `create` ora crea l'admin con hash **inutilizzabile** + invia invito (`invite`); response `{establishment,adminEmail,expiresAt}` (niente `temporaryPassword`). Nuovo superuser-only `POST /api/platform/establishments/:id/reset-admin-password` (`reset`, **audit atomico** con l'emissione token via `auditWithinTx`; 409 se ≠1 admin attivo).
- **FE web-platform**: `CreateEstablishmentModal` mostra "invito inviato a {email}, scade il {data}" (niente password copiabile); `EstablishmentDetailView` ha l'azione **Reset password admin** (ConfirmDialog → toast). 
- **FE web-staff**: pagina **pubblica** `/imposta-password?token=` (`SetPasswordView.vue`, heading purpose-aware invite/reset, validazione ≥10+match) → redirect `/login?setPassword=1`; **`LoginView`** mostra banner verde di conferma quando arriva `?setPassword=1`. `RegisterView` verificata già informativa (ADR-0028).

**Test baseline (NON regredire):** ui-kit **70** · web-staff **219** · web-platform **16** · api unit **190** · api e2e **226**. Typecheck **PULITO** ovunque.
**Verifica LIVE ok (18/18)**: provisioning → email in Mailpit → set-password → login; token consumato → 404; reset → nuova password ok / vecchia 401; admin→reset-admin 403, anon 401, password debole 400. (Fatta via API+Mailpit; il modale web-platform verificato nel bundle del container.)

### Sotto (già su main da prima)
Platform Console COMPLETA (backend superuser + `web-platform` 8081) · Configura struttura COMPLETO · FE+auth+mappa+bookings+listino+report+rinnovi+Stabilimento (RBAC, gestione utenti D-025 core).

## 2. IL PROSSIMO PASSO — Slice "Invito **staff** via email" (completa D-025)
**Contesto (segnalato dall'utente 2026-07-05):** oggi quando l'**admin del lido aggiunge un membro dello staff**, la form mostra ancora un **campo password** (l'admin la imposta a mano). Era l'ultima parte **deferita** di [D-025](../architecture/deferred.md): l'obiettivo dichiarato era *"un solo meccanismo che copre provisioning + reset-admin + **staff**"*. Il meccanismo è **interamente costruito e riusabile** (`CredentialSetupService`, pagina `/imposta-password`, Mailpit). Il badge `«Inviti e gestione · in arrivo»` in [`EstablishmentView.vue:149`](../../apps/web-staff/src/features/establishment/EstablishmentView.vue) è esattamente questo placeholder.

**Soluzione raccomandata (professionale, zero-debito, NON mezza misura):** convertire la creazione staff all'invito **E** aggiungere il gemello **reset-password staff** dell'admin, così l'intera storia credenziali è coerente:
- **BE:** `EstablishmentUsersService.create` ([establishment-users.service.ts:23](../../apps/api/src/establishment/establishment-users.service.ts)) → crea lo staff con hash inutilizzabile + `credentials.issueAndSend(user.id, email, 'invite', adminId)`. `EstablishmentModule` importa `CredentialModule`; il controller passa `@CurrentUser` alla create. **Togli `password`** da `CreateStaffUserDto` + dal contract `CreateStaffUserInput` ([contracts/index.ts:406](../../packages/contracts/src/index.ts)).
- **BE (nuovo, gemello tenant-scoped):** `POST /api/establishment/users/:id/reset-password` (admin-only, target deve appartenere al tenant) → `issueAndSend(staffId, email, 'reset', adminId)`. Specularità con `reset-admin-password` ma **tenant-scoped** (usa `TenantContext`, non `PlatformAuditLog`).
- **Decisione di design aperta (da chiarire in brainstorming):** l'audit. `reset-admin-password` scrive `PlatformAuditLog` (azione superuser). L'invito/reset **staff** è azione **admin-in-tenant**: oggi non esiste un audit-log di tenant. Opzioni: nessun audit (MVP), o introdurre un log di tenant. → possibile **ADR-0043** se si decide di aggiungere audit di tenant; altrimenti nessun nuovo ADR (riusa ADR-0042).
- **FE:** in `EstablishmentView.vue` togli il campo password dalla form "aggiungi membro" → "invito inviato a {email}"; il badge `«Inviti e gestione · in arrivo»` diventa reale; aggiungi un'azione "reset password" per membro. Aggiorna `useEstablishment.ts` (`CreateStaffUserInput` senza password) + spec.
- **Test:** api unit (staff create senza password → emette invito; reset); e2e `establishment-users` (lo staff **non** fa login finché non fa redeem, poi sì; reset invalida la vecchia); web-staff spec (form senza password, invito mostrato, azione reset).
- **Contratto:** `/establishment/users` perde `password` → contracts-first + rebuild `@coralyn/contracts`; l'api e2e **type-checka** (vedi §5) quindi allinea BE+contract insieme.

**Roadmap prodotto dopo lo staff-invite** (dal registro, confermare con utente): **D-024** GDPR cliente · **D-012** cabine/servizi · **D-035** canale cliente "assenze comunicate" · **D-036** report avanzato · **D-013** sospensione/cessione abbonamento.

## 3. Follow-up / deferred rilevanti (fonte autorevole: [`deferred.md`](../architecture/deferred.md))
- **D-025 (residuo)** — **invito staff** (§2) + **cambio-ruolo** di un utente esistente.
- **D-045** — cleanup: rimuovere lo **stub `/console` in `web-staff`** (`features/console/ConsoleView.vue` + rotta, badge "in arrivo") ora **obsoleto** (console = `web-platform`); e far **rifiutare a `web-staff` il login dei superuser** (specularmente a `web-platform`). Basso rischio, mirroring esistente. **Ancora aperto.**
- **D-046** — visibilità **deliverability** dell'invito in console (flag `emailSent` + banner): oggi l'invio è best-effort (WARN nei log), la console riporta comunque successo.
- **D-042** impersonation/accesso PII per supporto · **D-043** vista materializzata `establishment_metrics` · **D-044** `User.lastLoginAt` · **D-040** estrai `EstablishmentStructureView` · **D-041** ExceptionFilter `P2002→409` · **D-037** gestione globale 401 FE · **D-038** drag-reorder struttura · **D-005** editor pixel · hardening auth **D-026/D-027/D-028/D-029** (gated su esposizione pubblica).

## 4. Interim / mock noti (contesto per il prossimo agente)
- **`web-staff` `session.ts:13` `establishmentName='Lido Maestrale'`** hardcoded: `/auth/me` non espone il nome dello stabilimento → la nav usa il default. Da sistemare quando si tocca `/me` (esporre il nome; il DTO `UserDTO` non ce l'ha).
- **`web-staff` `/console` stub** (`features/console/ConsoleView.vue` + rotta) → obsoleto, vedi **D-045**.
- **Campo password nella creazione staff** (`EstablishmentView.vue`) → è il gap del **§2** (non un bug, era deferito).
- Badge `«Modifica · in arrivo»` / `«Configura · in arrivo»` in `EstablishmentView.vue` = **fallback per non-admin** (sotto-feature legittime), NON mock morti. `«Inviti e gestione · in arrivo»` = placeholder dello staff-invite (§2).
- **Mailpit è un catcher**: in dev tutte le email finiscono in `http://localhost:8025`, **non** vengono recapitate a caselle reali (in prod = SMTP reale via env). Il "non è arrivata la mail" segnalato era questo: la mail c'era, in Mailpit.

## 5. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **`@coralyn/contracts` compila in `dist/` (gitignored)**: dopo checkout o modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test.
- **api e2e: ts-jest TYPE-CHECKA** (non transpile-only): l'intero progetto api deve compilare perché gli e2e girino. Una modifica contracts-first rompe gli e2e finché i consumer non sono allineati → allinea BE+contract nello stesso layer.
- **Boot MailModule**: `SmtpMailerService` legge `MAIL_HOST`/`MAIL_FROM`/`APP_WEB_STAFF_URL` via `getOrThrow` in costruzione → l'api **non parte** senza. Presenti in: root `.env`/`.env.test` (locali, gitignored), `docker-compose.yml` (api env), documentati in `.env.example`. **Ogni nuovo e2e che monta `AppModule`** ha bisogno di `MAIL_HOST` in `.env.test` (già presente).
- **PWA service worker (`autoUpdate`)**: web-staff e web-platform registrano un SW che precache il bundle. **Dopo un rebuild container, il browser può servire lo SPA VECCHIO dalla cache SW** → *Clear site data* / *Unregister* / reload completo. (Il "modale mostra ancora la password" segnalato era questo: il bundle del container era già quello nuovo.)
- **Migrazioni**: hand-authora la cartella + `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (`localhost:5433`, `coralyn_app`/`coralyn_app`), `DATABASE_URL` inline; poi `generate`. **Mai** `db push`/`migrate dev` (non interattivo). `ALTER TYPE … ADD VALUE` va in una migrazione **separata** dall'uso runtime del valore.
- **`RolesGuard` globale** → dopo modifiche a guard/rotte ri-esegui **tutta** la suite api (unit+e2e).
- **Tabelle di dominio RLS FORCE** → `prisma.forTenant(tenantId, tx=>…)`; `User`/`Establishment`/`PlatformAuditLog`/`CredentialSetupToken` sono **fuori RLS**.
- **Container**: `docker compose --profile full up -d --build api web web-platform mailpit`. Porte: **web-staff 8080, web-platform 8081, api 3000, db 5433, Mailpit UI 8025 / SMTP 1025**. `MSYS_NO_PATHCONV=1` per `docker exec` con path assoluti.
- **Login API**: campo token = **`accessToken`**. Superuser dev **`super@coralyn.dev`/`coralyn-super-9182`** (ora seedato via compose `PLATFORM_SUPERUSER_EMAIL/PASSWORD`, upsert idempotente). Admin dev `admin@coralyn.dev`/`coralyn-admin-8473`.
- **Test FE**: web-staff auth-spec usano MSW globale (`mocks/server.ts`) + `vi.mock('vue-router')`; ui-kit Modal/ConfirmDialog teleport → `attachTo:document.body` + `document.querySelector` + `settle()`. Fixture email TLD `.test`/`.example`.

## 6. Ancore di codice (VERIFICATE 2026-07-05)
- **Mail/credential BE**: `apps/api/src/mail/` (`mailer.service.ts` porta, `smtp-mailer.service.ts`, `credential-setup.email.ts`, `mail.module.ts`) · `apps/api/src/credential/` (`credential-setup.service.ts`, `token-hash.ts`, `credential.module.ts`) · `apps/api/src/identity/auth.controller.ts` (public credential-setup) + `dto/set-password.dto.ts` · fake mailer test: `apps/api/test/helpers/fake-mailer.ts`.
- **Provisioning/reset BE**: `apps/api/src/platform/platform-provisioning.service.ts` (`create` + `resetAdminPassword`), `platform.controller.ts`. e2e: `apps/api/test/{platform,credential-setup}.e2e-spec.ts`.
- **Staff (da modificare nel §2)**: `apps/api/src/establishment/establishment-users.{service,controller}.ts`, `dto/create-staff-user.dto.ts`; contract `CreateStaffUserInput` (`packages/contracts/src/index.ts:406`); FE `apps/web-staff/src/features/establishment/{EstablishmentView.vue, useEstablishment.ts}`.
- **FE set-password/login**: `apps/web-staff/src/features/auth/{SetPasswordView.vue, LoginView.vue}` + rotta `/imposta-password` in `router/index.ts`.
- **FE web-platform**: `apps/web-platform/src/features/establishments/{CreateEstablishmentModal.vue, EstablishmentDetailView.vue, usePlatformEstablishments.ts}`, `mocks/handlers.ts`.
- **Spec + piano + ADR**: spec [2026-07-05-credential-invite-email-design.md](../superpowers/specs/2026-07-05-credential-invite-email-design.md); piano [2026-07-05-credential-invite-email.md](../superpowers/plans/2026-07-05-credential-invite-email.md); ADR [0042](../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md).
- **Pattern da rispecchiare per lo staff-invite**: `platform-provisioning.service.ts` (hash inutilizzabile + `issueAndSend`), `platform.controller.ts` (rotta reset), `web-platform CreateEstablishmentModal.vue` (UI "invito inviato").

## 7. Workflow (ADR-0009)
All'avvio: `git fetch --all --prune`. Path `C:\Users\Jays\Desktop\new` (Jays) / `C:\Users\zagor\Desktop\coralyn` (zagor). Lavoro creativo: `brainstorming` → `writing-plans` → `subagent-driven-development` (implementer NON annida — "fai tutto tu, niente deleghe"; review a due stadi spec+qualità per layer + review finale) → verifica LIVE → presenta e attendi conferma. Merge su `main` = **FF con ok esplicito**. Rebuild `@coralyn/contracts` dopo checkout; rebuild container (+ clear SW cache) prima di testare in dev.
