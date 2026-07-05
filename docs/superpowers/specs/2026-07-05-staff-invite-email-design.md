# Spec — Slice "Invito staff via email" (completa D-025)

> Design validato (brainstorming ADR-0009). Superata la parte residua di
> [D-025](../../architecture/deferred.md): oggi la creazione staff mostra ancora un
> **campo password** (l'admin la imposta a mano) — l'ultimo flusso mai convertito
> all'invito. Riusa **interamente** il meccanismo credenziali già costruito
> ([ADR-0042](../../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md)):
> `CredentialSetupService.issueAndSend`, pagina pubblica `/imposta-password`, Mailpit.

## 1. Obiettivo e scope

Convertire la creazione staff **all'invito via email** ed aggiungere il **gemello
reset-password staff** (tenant-scoped), così l'intera storia credenziali è coerente
(provisioning admin + reset-admin + **staff** = un solo meccanismo). Soluzione
zero-debito, non mezza misura.

**In scope:**
- BE: `EstablishmentUsersService.create` → hash inutilizzabile + `issueAndSend('invite')`.
- BE: nuovo `POST /api/establishment/users/:id/reset-password` (admin-only, tenant-scoped) → `issueAndSend('reset')`.
- Contract: `CreateStaffUserInput` perde `password`; nuovo `ResetStaffPasswordResponse`.
- FE `web-staff`: form "aggiungi utente" senza password → "invito inviato"; azione "reset password" per membro.
- Test: api unit + e2e `establishment-users`, web-staff `EstablishmentView.spec`.

**Fuori scope (deferito, tracciato):**
- **Audit di tenant** delle azioni admin-in-tenant → nuova voce **D-047** (vedi §7).
- **Cambio-ruolo** di un utente esistente (residuo D-025, invariato).
- Mostrare la scadenza dell'invito nei toast FE (il response reset la porta comunque).

## 2. Decisione di design: audit delle azioni admin-in-tenant

`reset-admin-password` scrive `PlatformAuditLog`, ma è un log **di piattaforma**
(azione superuser, RLS-free, scritto dal distributore). Invito/reset **staff** sono
azioni **admin-in-tenant**: oggi **non esiste un audit-log di tenant**, quindi ogni
audit qui sarebbe net-new.

**Scelta: nessun sottosistema di audit in questa slice.** Motivazioni (rubrica ADR-0002):
- **Convenzioni/consistenza:** un `TenantAuditLog` che copre *solo* invito+reset (2 di
  ~6 mutazioni admin: create/disable/enable/role-change sono già su `main` e non
  auditate) creerebbe una **nuova** incoerenza. Un audit di tenant professionale deve
  coprirle **tutte** → è una slice a sé, non un bolt-on alla storia credenziali.
- **Modularità:** audit-di-tenant è un sottosistema distinto (tabella RLS-FORCE +
  service + migrazione a due DB + test); non appartiene a "invito staff".
- **Zero debito (filtro 4):** il debito *tracciato* è ammesso, quello silenzioso no.
  E non è nemmeno un vuoto: `CredentialSetupToken` persiste già `createdByUserId` +
  `purpose` + `createdAt`/`consumedAt` → **ogni invito e reset lascia già una traccia
  interrogabile chi/quando/cosa nel DB**. Il lavoro completo è registrato come **D-047**.

Nessun **ADR-0043** in questa slice; si riusa ADR-0042. (Se in futuro si costruisce
l'audit di tenant, sarà ADR-0043.)

## 3. Contract (`packages/contracts/src/index.ts`) — contracts-first

- **`CreateStaffUserInput`**: rimuovere `password` → `{ email: string; role: 'admin' | 'staff' }`.
  Aggiornare il doc-comment (non più "password iniziale impostata dall'admin"; ora
  "invito-via-email, ADR-0042; ruolo mai `superuser`").
- **Nuovo `ResetStaffPasswordResponse { email: string; expiresAt: string }`** — speculare a
  `ResetAdminPasswordResponse`, ma campo `email` (il target può essere admin o staff) e
  tenant-scoped. `expiresAt` = ISO, scadenza del link di reset.
- **Rebuild `@coralyn/contracts` nello STESSO layer del cambio BE**: la api e2e (ts-jest)
  **type-checka** l'intero progetto → un cambio contract da solo rompe il build finché i
  consumer non sono allineati. Allineare contract + BE insieme.

## 4. BE — conversione `create` all'invito

File: `apps/api/src/establishment/establishment-users.service.ts`,
`establishment-users.controller.ts`, `establishment.module.ts`,
`dto/create-staff-user.dto.ts`.

- **Module:** `EstablishmentModule` importa `CredentialModule` (che esporta
  `CredentialSetupService`). Il service mantiene `PasswordHasher` (per l'hash inutilizzabile)
  e aggiunge `CredentialSetupService`.
- **Controller `@Post()`:** passa `@CurrentUser() user` → `this.users.create(body, user.id)`.
- **DTO `CreateStaffUserDto`:** rimuovere il campo `password` + i suoi validator
  (`@IsString/@IsNotEmpty/@MinLength(8)`); restano `@IsEmail email` e `@IsIn(['admin','staff']) role`.
- **`create(input, adminId)`** (speculare a `platform-provisioning.service.create`):
  1. `tenantId = this.tenant.require()`.
  2. hash **inutilizzabile**: `await this.hasher.hash(randomBytes(32).toString('base64url'))`.
  3. `prisma.user.create({ data: { establishmentId: tenantId, email, passwordHash: unusableHash, role }, select: MEMBER_SELECT })`;
     `catch` `P2002` → `ConflictException('Email già in uso')`.
  4. `await this.credentials.issueAndSend(user.id, input.email, 'invite', adminId)` (fuori dalla
     create: `issueAndSend` ha la propria transazione; persist-then-best-effort-send).
  5. **ritorna `EstablishmentMemberDTO`** invariato (il membro compare nella lista team; il FE
     mostra il toast "invito inviato"). Nessun audit.
- **Invariante:** lo staff invitato **non può fare login** finché non fa redeem (hash
  inutilizzabile; il login già respinge un hash non corrispondente). Dopo redeem, login ok.

## 5. BE — reset password staff (tenant-scoped)

Nuovo `POST /api/establishment/users/:id/reset-password`.

- **Controller:** `@Post(':id/reset-password') @Roles(Role.Admin)` →
  `resetPassword(@Param('id') id, @CurrentUser() user)` → `this.users.resetPassword(id, user.id)`.
- **Service `resetPassword(id, adminId): Promise<ResetStaffPasswordResponse>`:**
  1. `tenantId = this.tenant.require()`.
  2. `target = prisma.user.findFirst({ where: { id, establishmentId: tenantId }, select: { id, email, disabledAt } })`.
  3. `if (!target)` → **404** `NotFoundException('Utente non trovato')` (il tenant-scoping è il
     confine di sicurezza: un id fuori tenant è indistinguibile da inesistente).
  4. `if (target.disabledAt !== null)` → **422**
     `UnprocessableEntityException('Non puoi resettare la password di un utente disabilitato')`
     (reset su disabilitato = vicolo cieco: il login resterebbe 401).
  5. `const { expiresAt } = await this.credentials.issueAndSend(target.id, target.email, 'reset', adminId)`.
  6. `return { email: target.email, expiresAt: expiresAt.toISOString() }`. Nessun audit; **niente
     `PlatformAuditLog`** (è scope-superuser).
- **Nessun self-guard, nessuna restrizione admin→admin:** `issueAndSend` **non** tocca il
  `passwordHash` corrente (solo emette token + invia mail; l'hash cambia solo al redeem) →
  un reset **non può bloccare fuori nessuno**, il target mantiene la password finché non fa
  redeem lui. Colma anche un gap reale: `reset-admin-password` (superuser) richiede
  **esattamente 1 admin attivo**, quindi non può resettare un admin-collega; questo sì.

## 6. FE (`web-staff`)

File: `apps/web-staff/src/features/establishment/EstablishmentView.vue`, `useEstablishment.ts`.

- **`useEstablishment.ts`:**
  - `useCreateStaffUser`: il tipo `CreateStaffUserInput` perde `password` da solo (nessun cambio
    di codice oltre l'import già presente); continua a ritornare `EstablishmentMemberDTO`.
  - **`useResetStaffPassword`** (nuovo): `mutationResource`,
    `mutationFn: (id: string) => apiFetch<ResetStaffPasswordResponse>('/establishment/users/'+id+'/reset-password', { method: 'POST' })`.
    **Nessun `invalidates`** (il reset non cambia l'overview).
- **`EstablishmentView.vue`:**
  - **Modale "Aggiungi utente":** rimuovere il `Field`/`Input` password + il ref `newPassword`.
    `submitAddUser` valida solo l'email. Aggiungere una riga-hint "Riceverà un'email per
    impostare la password." Il bottone "Crea utente" → **"Invia invito"**. `onSuccess`:
    chiudi modale + `pushToast('Invito inviato a ' + email + '.')`.
  - **Azione reset per riga team:** `Button "Reset password"` con
    `v-if="isAdmin && !u.you && !u.disabled"` (stessa convenzione di gating del bottone
    disabilita) → apre un `ConfirmDialog` (pattern di `RenewalsView`/`EstablishmentStructureView`)
    → al confirm `resetStaff.mutate(id)` → `pushToast('Link di reset inviato a ' + email + '.')`.
  - Import `ConfirmDialog` da `@coralyn/ui-kit`, `pushToast` da `@/lib/toasts`.
  - Il badge non-admin `«Inviti e gestione · in arrivo»` (riga 149) **resta invariato**: è il
    fallback per non-admin, coerente con i fratelli Modifica/Configura (handoff §4). La feature
    "diventa reale" sul ramo **admin** (invito + reset).

## 7. Deferred da registrare — D-047

Aggiungere a `docs/architecture/deferred.md`:

> **D-047 — Audit di tenant per le azioni admin-in-tenant.** Le mutazioni admin sul proprio
> lido (invito/reset credenziali staff, create/disable/enable staff, futuro cambio-ruolo) non
> hanno un audit-log di tenant; `reset-admin-password` usa `PlatformAuditLog` che è scope
> superuser. Traccia tecnica parziale già presente: `CredentialSetupToken.createdByUserId` +
> `purpose` + timestamp per invito/reset. Trigger: esposizione multi-operatore o richiesta di
> tracciabilità/compliance a livello lido. Impatto se ignorata: bassa (traccia token esiste per
> le azioni credenziali; le altre mutazioni restano non auditate). Additivo: tabella dominio
> RLS-FORCE tenant-scoped + service + scrittura atomica nella tx dell'azione + eventuale
> **ADR-0043**, coprendo **tutte** le mutazioni admin (non solo credenziali).

## 8. Testing

Baseline da NON regredire (solo crescere): ui-kit **70** · web-staff **219** ·
web-platform **16** · api unit **190** · api e2e **226**. Typecheck PULITO ovunque.

- **api unit** (`establishment-users.service.spec.ts`, mockando `CredentialSetupService`):
  - create: chiama `issueAndSend(userId, email, 'invite', adminId)`; hash passato a `user.create`
    ≠ alcuna password nota (inutilizzabile); P2002 → 409.
  - reset: happy path chiama `issueAndSend(_, _, 'reset', adminId)`; target fuori tenant → 404;
    target disabilitato → 422.
- **api e2e** (`establishment-users.e2e-spec.ts`, `fake-mailer`):
  - create: il body **non** accetta più `password`; lo staff invitato **non** fa login (401)
    finché non fa redeem del token catturato dal mailer, poi login **ok**.
  - reset: dopo redeem la **nuova** password funziona e la **vecchia** dà **401**;
    reset da non-admin **403**, anonimo **401**, target fuori tenant **404**, disabilitato **422**.
- **web-staff** (`EstablishmentView.spec.ts`, MSW + `vi.mock('vue-router')`):
  - la form "aggiungi utente" **non** ha il campo password; submit → toast "Invito inviato".
  - azione "Reset password" su un membro → ConfirmDialog → confirm → toast "Link di reset inviato".

## 9. Workflow / ops (ADR-0009)

- **Nessuna migrazione** (`CredentialSetupToken` + purpose `invite`/`reset` già esistono).
- Feature branch `feat/d025-staff-invite`; **FF-merge su `main` solo con ok esplicito**.
- Rebuild `@coralyn/contracts` dopo l'edit contract; rebuild container + **clear SW cache**
  prima della verifica LIVE.
- **LIVE** (via API + Mailpit `:8025`): admin invita staff → email in Mailpit → set-password →
  login staff ok; reset → vecchia pw **401** / nuova **ok**; non-admin **403**, target fuori
  tenant **404**, disabilitato **422**.
- Porte: web-staff **8080**, api **3000**, db **5433**, Mailpit UI **8025** / SMTP **1025**.
  Login: campo token = **`accessToken`**; admin dev `admin@coralyn.dev`/`coralyn-admin-8473`.
