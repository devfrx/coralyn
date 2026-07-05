# Spec — Invito credenziali via email (set-password link)

- **Data:** 2026-07-05
- **Stato:** approvata (brainstorming), pronta per il piano TDD
- **Workflow:** [ADR-0009](../../architecture/decisions/0009-documentazione-di-design.md) — brainstorming → **spec** → piano TDD → esecuzione subagent-driven → verifica LIVE
- **ADR nuovo:** **0042** (trasporto email + consegna credenziali)
- **Sblocca / sostituisce:** show-once password del provisioning ([platform-provisioning.service.ts](../../../apps/api/src/platform/platform-provisioning.service.ts)); realizza l'"invito via email per impostare la password" già deciso da [ADR-0028](../../architecture/decisions/0028-provisioning-tenant.md); assorbe la parte email-invito di [D-025](../../architecture/deferred.md).

---

## 1. Problema e obiettivo

Oggi la consegna delle credenziali di un nuovo lido avviene con una **password temporanea mostrata una volta** nella console superuser: una password in chiaro **esiste** (server-generated) e **viaggia** attraverso la UI del distributore, che la vede. È un interim consapevole. Inoltre **non esiste** alcun modo da UI per **resettare** la password di un admin che l'ha persa (solo intervento DB/seed).

**Obiettivo:** un **unico meccanismo** — invito via email con link *"imposta la tua password"* (token opaco, a scadenza, monouso) — che copre in modo DRY:

1. **Provisioning nuovo lido** — l'admin riceve l'invito e imposta la password (rimpiazza lo show-once).
2. **Reset password admin** dal console superuser — chiude il buco pratico odierno.
3. **(Futuro) inviti staff** — stesso token/pagina, `purpose=invite` (assorbe D-025).

**Invariante non negoziabile:** nessuna password in chiaro esiste, viene persistita o viaggia. Il distributore non vede mai una credenziale. La password la sceglie **solo** l'utente finale, sul proprio dispositivo, contro un token che dimostra il possesso della casella email.

## 2. Decisioni prese (con l'utente, 2026-07-05)

Criterio dell'utente per ogni fork: *"la soluzione più professionale, meno pigra, senza debiti"*.

| Fork | Decisione |
|---|---|
| **Trasporto email** | `MailerService` (porta astratta) + adapter **SMTP via nodemailer**; **Mailpit** come catcher in dev/test; provider-agnostico (swap a Postmark/SES = solo env). Nessun vendor-lock. |
| **Forma token** | **Opaco 256-bit** nel link; in DB **solo lo sha256** (raw mai persistito), con `expiresAt` + `consumedAt` (monouso) + `userId` + `purpose`. Revocabile, nessun segreto da ruotare. |
| **Pagina set-password** | Rotta **pubblica in web-staff** (`/imposta-password?token=…`), fuori auth guard; dopo il set → **redirect a `/login`** (impostare-poi-autenticarsi dimostra che la password funziona). Endpoint API app-agnostici su `AuthController`. |
| **Cleanup adiacenti** | **Incluso qui:** RegisterView → pagina informativa "attivazione su invito" ([ADR-0028](../../architecture/decisions/0028-provisioning-tenant.md)). **Deferiti:** D-045 (stub `/console` in web-staff) e `establishmentName` hardcoded (indipendenti). |

## 3. Architettura

Tre sottosistemi nuovi + due modifiche a superfici esistenti.

```
[web-platform: superuser]                         [web-staff: pubblico]
  Create modal ──POST /platform/establishments      SetPasswordView
  Detail: Reset ─POST …/:id/reset-admin-password       │  GET  /auth/credential-setup/:token
        │                                                └─ POST /auth/credential-setup
        ▼                                                        ▲
  ┌─────────────────────── apps/api ──────────────────────────────────┐
  │  PlatformProvisioningService   CredentialSetupService (nuovo)      │
  │        │ crea User(hash inutilizzabile)   │ issue()/redeem()       │
  │        └──────────── issue() ─────────────┤                        │
  │                                            ▼                        │
  │                                   CredentialSetupToken (nuovo, RLS-free)
  │                                            │                        │
  │                          MailerService (porta) → SmtpMailerService  │
  └────────────────────────────────────────────┼──────────────────────┘
                                                 ▼
                                          Mailpit (dev/test)  →  SMTP reale (prod)
```

### 3.1 Modello token — `CredentialSetupToken` (nuovo, RLS-free)

Vive **fuori RLS**, accanto a `User`/`PlatformAuditLog` ([ADR-0026](../../architecture/decisions/0026-identita-rls-utente.md)): è un dato di identità pre-tenant. Aggiunta a [schema.prisma](../../../apps/api/prisma/schema.prisma):

```prisma
enum CredentialTokenPurpose {
  invite   // imposta password per un account appena creato (admin ora, staff in futuro)
  reset    // reset password avviato dal console superuser
}

model CredentialSetupToken {
  id              String                 @id @default(uuid()) @db.Uuid
  userId          String                 @db.Uuid
  tokenHash       String                 @unique   // sha256(raw) hex — il raw NON è mai persistito
  purpose         CredentialTokenPurpose
  expiresAt       DateTime
  consumedAt      DateTime?                        // monouso: valorizzato al redeem o all'invalidazione
  createdByUserId String?                @db.Uuid  // superuser emittente (audit); null = sistema/self
  createdAt       DateTime               @default(now())
  user            User                   @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([expiresAt])
}
```

`User` guadagna la back-relation `setupTokens CredentialSetupToken[]`. **Nessuna** modifica a colonne di `User` (`passwordHash` resta non-null, vedi §3.3).

**Regole:**
- **Emit**: genera 32 byte random (`randomBytes(32).toString('base64url')` → raw ~43 char), salva `tokenHash = sha256(raw)`, `expiresAt = now + TTL`, `purpose`, `createdByUserId`. **Prima** dell'insert, invalida i token vivi dello stesso utente (`UPDATE … SET consumedAt=now() WHERE userId=? AND consumedAt IS NULL`) → **un solo link vivo per utente**.
- **TTL** configurabile: env `CREDENTIAL_TOKEN_TTL_HOURS`, default **72** (3 giorni; adatto a onboarding B2B, unico valore per invite e reset in MVP).
- **Redeem**: lookup per `tokenHash`; valido sse esiste ∧ `consumedAt IS NULL` ∧ `expiresAt > now`. In transazione: aggiorna `User.passwordHash`, setta `consumedAt=now()` sul token, invalida i fratelli. RLS-free → `$transaction` semplice (niente GUC).

### 3.2 Sottosistema mail — `apps/api/src/mail/` (nuovo)

- **`MailerService`** — porta astratta (classe astratta o token DI) con `sendCredentialSetup(input): Promise<void>`.
- **`SmtpMailerService implements MailerService`** — nodemailer, transport da env: `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`. Registrato come provider reale in `MailModule`.
- **`credential-setup.email.ts`** — builder **puro** (testabile in isolamento): dato `{ email, rawToken, purpose, expiresAt, webStaffUrl }` produce `{ subject, text, html }` in italiano. Link = `${webStaffUrl}/imposta-password?token=${rawToken}`. Copy: niente password, spiega scadenza + uso unico, tono professionale. Subject/testo variano su `purpose` (invito vs reset).
- **`webStaffUrl`** da env `APP_WEB_STAFF_URL` (es. `http://localhost:8080`).
- **`MailModule`** esporta `MailerService`; importato da `PlatformModule` e `IdentityModule`.

**Testabilità:** unit/e2e sostituiscono `MailerService` con un **fake in-memory** (override del provider nel `TestingModule`) che cattura i messaggi inviati (incluso il `rawToken`) — deterministico, nessuna dipendenza esterna nei test. La verifica **LIVE** usa **Mailpit reale**.

### 3.3 Backend — endpoint

**Collocazione:** `CredentialSetupService` (issue + redeem) vive in un modulo dedicato **`apps/api/src/credential/` (`CredentialModule`)** che esporta il service e importa `MailModule`. Lo importano `PlatformModule` (per `issue` dal provisioning/reset) e `IdentityModule` (per `redeem`, esposto dagli endpoint pubblici su `AuthController`). Così la logica token è un'unità sola, testabile in isolamento, senza dipendenze circolari tra platform e identity.

**Superuser (emissione) — [platform.controller.ts](../../../apps/api/src/platform/platform.controller.ts):**

- `POST /api/platform/establishments` **(modificato):** crea Establishment + User(admin) con `passwordHash` **inutilizzabile** (`argon2(randomBytes)` — nessun raw noto, login impossibile finché non impostata), poi `CredentialSetupService.issue(userId, 'invite', actorId)` + invio email. La response **non** contiene più `temporaryPassword`. Audit `create_establishment` invariato (metadata `{ …, invited: true }`).
- `POST /api/platform/establishments/:id/reset-admin-password` **(nuovo):** individua l'admin del lido, `issue(userId, 'reset', actorId)` + email. Nuovo `PlatformAction.reset_admin_password`. Se il lido ha **≠ 1 admin** → **409** con messaggio chiaro (selezione multi-admin rinviata a quando il console elenca gli utenti). Response `{ adminEmail, expiresAt }`.

**Pubblico (redeem) — [auth.controller.ts](../../../apps/api/src/identity/auth.controller.ts), `@Public()`, app-agnostico:**

- `GET /api/auth/credential-setup/:token` → `{ email, purpose }` se valido; **404 generico** altrimenti (nessuna enumerazione; lookup per hash). Serve alla pagina per mostrare "imposta la password per {email}" o lo stato d'errore.
- `POST /api/auth/credential-setup` → `{ token, password }`; DTO con policy password (`@MinLength(10)`); imposta `passwordHash` (argon2), consuma il token, invalida i fratelli, **una** `$transaction`; **204 No Content**. La vecchia password (caso reset) resta valida fino al redeem (semantica standard di reset).

**Postura sicurezza:** rate-limiting/timing (D-027/D-029) restano deferiti; un token 256-bit **hashato a riposo** è non-enumerabile e non-bruteforzabile (spazio 2^256). Errori sempre generici. Da annotare in ADR-0042.

### 3.4 Frontend

**web-platform (superuser):**
- `CreateEstablishmentModal.vue`: **rimuove** la UI copia-password; su successo mostra *"Invito inviato a {email}. Il link scade il {data}."*
- `EstablishmentDetailView.vue`: nuova azione **"Reset password admin"** (via `ConfirmDialog`) → POST reset → toast *"Invito di reset inviato a {email}."*
- `usePlatformEstablishments.ts` + handler MSW + contracts aggiornati.

**web-staff (pubblico):**
- Nuova rotta **pubblica** `{ path: '/imposta-password', meta: { public: true, bare: true } }` in [router/index.ts](../../../apps/web-staff/src/router/index.ts) → `features/auth/SetPasswordView.vue`:
  - **mount**: `GET credential-setup/:token` → form (mostra email, *"Imposta la password per {email}"*) **oppure** stato d'errore (*"Link non valido o scaduto"* + link a `/login`).
  - **form**: password + conferma, validazione (min 10, match), submit → `POST` → successo → redirect `/login` con toast di successo (*"Password impostata, accedi."*).
- `RegisterView.vue` **(cleanup ADR-0028):** diventa pagina informativa "attivazione su invito" — nessun form di creazione account, nessuna chiamata auth; contatto + link a `/login`. Verificare che non crei account.

### 3.5 Contracts (`@coralyn/contracts`)

- `CreateEstablishmentResponse`: **rimuove** `temporaryPassword`; diventa `{ establishment, adminEmail, expiresAt }`.
- Nuovi tipi: `ResetAdminPasswordResponse { adminEmail; expiresAt }`, `CredentialSetupContext { email; purpose: 'invite' | 'reset' }`, input `SetPasswordInput { token; password }`.
- Rebuild `@coralyn/contracts` dopo la modifica (gotcha §5 handoff).

### 3.6 Config / infra

- `docker-compose.yml`: nuovo servizio **`mailpit`** (`axllent/mailpit`, SMTP `1025`, UI `8025`). `api` guadagna env `MAIL_HOST=mailpit MAIL_PORT=1025 MAIL_SECURE=false MAIL_FROM=… APP_WEB_STAFF_URL=http://localhost:8080` + `CREDENTIAL_TOKEN_TTL_HOURS=72`.
- Per `pnpm dev` locale (api sull'host): `MAIL_HOST=localhost` verso Mailpit dockerizzato.
- Migrazione **hand-authored** (`CredentialSetupToken` + enum `CredentialTokenPurpose` + valore enum `reset_admin_password` su `PlatformAction`) → `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (gotcha §5), poi `generate`. **Non** `db push`.

## 4. Flussi

**Provisioning:** superuser crea lido → API crea User(hash inutilizzabile) + token `invite` + email → l'admin apre il link → `GET` mostra il form → `POST` imposta la password (204) → redirect `/login` → login OK.

**Reset admin:** superuser apre dettaglio lido → "Reset password admin" → API emette token `reset` (invalida eventuali token vivi) + email → l'admin imposta la nuova password → la vecchia smette di funzionare al redeem → login con la nuova.

**Errori:** token inesistente/scaduto/consumato → `GET`/`POST` 404 → la pagina mostra "Link non valido o scaduto" + link a `/login`.

## 5. Testing (TDD, baseline da NON regredire: ui-kit 70 · web-staff 210 · web-platform 14 · api unit 178 · api e2e 222)

- **contracts:** compila; `temporaryPassword` rimosso non rompe i consumer.
- **api unit:**
  - `credential-setup.email.ts` (builder puro): subject/link/copy corretti per invite e reset; il link contiene il raw; nessuna password nel corpo.
  - `CredentialSetupService`: `issue` crea hash (mai raw), setta scadenza, invalida i fratelli; `redeem` imposta password + consuma + rifiuta scaduto/consumato/inesistente.
  - `PlatformProvisioningService.create`: non ritorna password, emette invito, chiama il mailer (fake), utente non-loginabile finché non impostata.
  - Reset service: emette token `reset` + email; ≠1 admin → 409.
- **api e2e:**
  - `POST establishments` → 201, **nessuna** password nel body, 1 email catturata col token; login pre-redeem → 401; `POST credential-setup` → 204; login post-redeem → 200.
  - `reset-admin-password` → email catturata; redeem → nuova password OK, vecchia KO.
  - `GET credential-setup` valido/invalido/scaduto/consumato.
  - Rotte pubbliche raggiungibili senza auth; endpoint superuser → 403 per admin/anonimo (ri-eseguire **tutta** la suite api per il RolesGuard globale, gotcha §5).
- **web-platform:** modal mostra "invito inviato" (niente copia-password); azione reset nel dettaglio; handler MSW.
- **web-staff:** `SetPasswordView` — token valido rende il form e invia; token invalido → errore; redirect su successo. `RegisterView` non effettua chiamate auth. Test teleport/`settle()` per ui-kit (gotcha §5).

## 6. Esecuzione — subagent-driven, un commit per layer, TDD

Branch: **`feat/credential-invite-email`** (già creato; include il cherry-pick del fix tsc `map.projection.spec` → baseline `tsc --noEmit` pulita). Implementer **non annidano** ("fai tutto tu, niente deleghe"). FF-merge su `main` **solo con ok esplicito**.

1. **contracts** — nuovi tipi + rimozione `temporaryPassword`; rebuild contracts.
2. **schema + migrazione** — `CredentialSetupToken`, enum, valore `reset_admin_password`; migrate deploy dev+test; generate.
3. **mail module + infra** — `MailerService`/`SmtpMailerService`/builder + `MailModule` + servizio `mailpit` in compose + env.
4. **api redeem** — `CredentialSetupService` + endpoint pubblici `GET`/`POST credential-setup` (TDD unit+e2e).
5. **api emissione** — provisioning modificato + `reset-admin-password` + audit (TDD; ri-esegui tutta la suite api).
6. **web-platform** — modal + azione reset + handler (TDD).
7. **web-staff** — `SetPasswordView` + rotta pubblica + `RegisterView` informativa (TDD).
8. **ADR-0042** + aggiornamento `deferred.md` (chiude la parte email di D-025; nota residui) + **verifica LIVE** (docker `--profile full` + Mailpit: provisiona lido → email in Mailpit UI 8025 → imposta password → login web-staff; reset → login con nuova).

## 7. Fuori scope (deferiti, tracciati)

- **D-045** — rimozione stub `/console` in web-staff + rifiuto login superuser lì (indipendente).
- `establishmentName='Lido Maestrale'` hardcoded (dipende da `/auth/me` che esponga il nome).
- Cambio-ruolo utente e reset **self-service** dello staff (increment futuri D-025).
- Rate-limiting/timing-safe login (D-027/D-029), refresh/revoca token (D-026), gestione globale 401 FE (D-037).
- Template email ricchi / provider SDK con webhook bounce (swap additivo via la porta `MailerService`).

## 8. Rubric check ([ADR-0002](../../architecture/decisions/0002-decision-rubric.md))

1. **Professionalità** — pattern standard di consegna credenziali (token opaco hashato monouso, set-password page); nessuna password in chiaro mai; SMTP-behind-port è la scelta portabile e non pigra.
2. **Convenzioni** — riusa `@Public()`, `ConfigService`, `PasswordHasher`, pattern RLS-free di `User`/`PlatformAuditLog`, ui-kit + MSW/Vitest; nodemailer+Mailpit sono lo standard di settore.
3. **Modularità** — `MailerService` porta con adapter sostituibile; token in service dedicato; pagina pubblica isolata; endpoint app-agnostici. Ogni unità testabile in isolamento.
4. **Zero debito** — sostituisce (non affianca) lo show-once; chiude il buco reset-admin; la scelta di transport/pagina non lascia buchi silenziosi (i residui sono tracciati in §7). Un unico meccanismo DRY per tutti i casi di credenziale.
