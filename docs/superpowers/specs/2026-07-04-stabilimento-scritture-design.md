# Spec — Stabilimento: scritture (Modifica + gestione utenti, D-025 core) · 2026-07-04

> Design approvato in brainstorming (2026-07-04). Completa la sezione Stabilimento aggiungendo le **scritture** mancanti,
> lasciando fuori `Configura`/planimetria (**D-005**). Introduce la **fondazione RBAC** (role-guard) come nuovo
> **ADR-0039** e apre **D-025** nel suo nucleo (crea/elenca/disabilita staff), rimandando **solo** l'invito-via-email.
> Terminale: `superpowers:writing-plans` → piano TDD a layer, subagent-driven, un commit per layer.
> **Due fasi**, ciascuna una slice con presentazione+conferma prima della successiva.

## 1. Obiettivo
Le tre affordance "in arrivo" dello Stabilimento oggi sono disabilitate. Questo design attiva **`Modifica`** (rinomina
lido) e **`Inviti e gestione`** (gestione utenti), lasciando **`Configura`** = **[D-005](../../architecture/deferred.md)**
(editor planimetria, progetto strutturale a sé). Tutte le scritture sono **admin-only**, il che richiede un
**role-guard** che oggi non esiste (c'è solo `JwtAuthGuard` globale).

## 2. Decisioni risolte (brainstorming 2026-07-04)
- **Scope = Opzione 1**: `Modifica` (rinomina) + gestione utenti **minima ma corretta** (D-025 core). `Configura`/D-005
  fuori. Scartate: "solo Modifica" (pigra: lascia la card Utenti non funzionale) e "+ Configura" (reckless: la
  planimetria è un progetto a sé → scope-creep/debito).
- **Provisioning staff = direct-create**: l'admin crea lo staff impostando **email + password iniziale**. **Invito
  via-email DEFERITO** (SMTP/token/rotazione = infra separabile; non-debito perché non lascia buchi strutturali, solo
  una comodità futura). Coerente con la descrizione di D-025 ("admin crea/elenca/disabilita staff").
- **Disable soft**, non hard-delete: colonna `User.disabledAt` (migrazione additiva). Preserva integrità/audit
  (l'utente può essere referenziato da azioni storiche). **Il `login` respinge i disabilitati.** La **revoca immediata
  del token già emesso** resta a **[D-026](../../architecture/deferred.md)** (per ora il token scade a 8h — accettabile).
- **Invarianti anti-lockout** (non-pigra): l'admin **non** può disabilitare **sé stesso**, né **l'ultimo admin attivo**.
- **Role-guard admin-only** per tutte le scritture (`@Roles('admin')`); le letture restano com'è. Il **superuser** (di
  piattaforma) **non** gestisce lo staff di un tenant da questo gestionale → riceve **403** sulle scritture tenant (la
  sua console cross-tenant è fuori scope, [ADR-0015](../../architecture/decisions/0015-modello-utente-ruoli.md)).
- **RBAC come [ADR-0039]** (nuovo): decisione d'architettura riusabile (decoratore `@Roles` + `RolesGuard`).

## 3. Fondazione RBAC — ADR-0039 (Fase 1)
- `@Roles(...roles: Role[])` — decoratore via `SetMetadata('roles', roles)`.
- `RolesGuard implements CanActivate` — legge i ruoli richiesti dal `Reflector` (handler+class). **Se nessun `@Roles`
  → passa** (endpoint solo-auth invariati). Se presenti → richiede `req.user.role ∈ roles`, altrimenti **403 Forbidden**.
- Registrato come **2° `APP_GUARD` dopo `JwtAuthGuard`** (in `identity.module.ts`): l'auth-guard popola `req.user`
  prima che il role-guard lo legga (ordine di esecuzione = ordine di registrazione).
- Copre il buco tracciato in D-025 ("decoratori di ruolo") con un primitivo **completo**, non a metà.

## 4. Contratto — DTO/Input (in `@coralyn/contracts`, additivo)
```ts
// esteso (additivo): la card mostra anche lo stato disabilitato
interface EstablishmentMemberDTO {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  disabledAt: string | null;   // NUOVO — ISO datetime o null (attivo)
}

interface UpdateEstablishmentInput { name: string }                       // Fase 1 — rinomina
interface CreateStaffUserInput { email: string; password: string; role: 'admin' | 'staff' } // Fase 2
interface UpdateStaffUserInput { disabled: boolean }                       // Fase 2 — disable/enable
```
> `EstablishmentOverviewDTO` non cambia forma se non per il campo aggiunto in `team[]` (`disabledAt`); l'overview
> continua a includere admin+staff (superuser escluso), ora **con lo stato**.

## 5. Backend

### 5.1 Fase 1 — role-guard + rinomina
- **`PATCH /api/establishment`** — `@Roles('admin')`, tenant-scoped. Body `UpdateEstablishmentInput`
  (`@IsString`/`@IsNotEmpty`/`@MaxLength(120)` → **400** su vuoto/invalid). Aggiorna `Establishment.name` dove
  `id = tenantId` (dentro `forTenant`). Ritorna `{ id, name }`. Nel `EstablishmentController` esistente.
- Nuovi file guard: `apps/api/src/identity/roles.decorator.ts`, `roles.guard.ts` (+ registrazione APP_GUARD).

### 5.2 Fase 2 — gestione utenti (D-025 core)
- **Migrazione** `add_user_disabled_at`: `User.disabledAt DateTime?` (additiva, nullable). `User` **non ha RLS**
  ([ADR-0026](../../architecture/decisions/0026-identita-rls-utente.md)): tutte le query utenti restano filtrate
  **esplicitamente** per `establishmentId`.
- Nuovo `EstablishmentUsersController` (o metodi nel controller stabilimento) + `EstablishmentUsersService`, tutti
  **`@Roles('admin')`**, sotto **`/api/establishment/users`**:
  - **`POST /api/establishment/users`** — `CreateStaffUserInput`. `role` `@IsIn(['admin','staff'])` (mai `superuser` →
    400). Crea `User { establishmentId: tenantId, email, passwordHash: hash(password), role }`. **Email globale unica**
    → **409** su conflitto. Password hashata con `PasswordHasher` (argon2id, riuso `identity/`). Ritorna
    `EstablishmentMemberDTO`.
  - **`PATCH /api/establishment/users/:id`** — `UpdateStaffUserInput { disabled }`. Setta/azzera `disabledAt`.
    **Invarianti** (→ **422** con messaggio): (a) `id === req.user.id` (no self-disable); (b) disabilitare l'utente
    quando è **l'ultimo admin attivo** (conteggio admin con `disabledAt = null` che scenderebbe a 0). Ritorna il member.
- **`identity.service.login`**: dopo il match credenziali, se `user.disabledAt != null` → **401 generico**
  ("Credenziali non valide", niente enumerazione). Aggiorna il commento di sicurezza esistente.
- Il team **puro** (projection) espone `disabledAt` (mapping additivo in `establishment.projection.ts`).

## 6. Frontend

### 6.1 Fase 1 — rinomina
- `EstablishmentView`: il bottone **`Modifica`** (oggi disabled) diventa attivo **solo per admin** → apre un `Modal`
  (ui-kit) con un campo nome precompilato → `PATCH /establishment` → invalida la query `establishmentOverview`.
- **Gating**: `session.role === Role.Admin`. Per lo staff il bottone resta non-interattivo (o nascosto) — coerente con
  l'attuale "in arrivo".
- Composable: `mutationResource` (pattern esistente) per la rename; `useEstablishment.ts` o nuovo `useEstablishmentMutations.ts`.

### 6.2 Fase 2 — gestione utenti
- Card "Utenti e ruoli": **«Aggiungi utente»** (admin) → `Modal` con email + password + select ruolo (admin/staff) →
  `POST /establishment/users` → invalida overview. Errore 409 → toast "email già in uso".
- Per riga (admin): azione **disabilita/riabilita** → `PATCH /establishment/users/:id` → invalida. Righe disabilitate
  rese **distinte** (grigie + badge "Disabilitato"). Invarianti 422 → toast col messaggio.
- **Gating**: staff vede la lista **read-only** (nessun bottone di gestione), admin vede le azioni.

## 7. Fuori scope / deferiti (tracciati, non tagliati in silenzio)
- **`Configura` struttura** (settori/righe/ombrelloni/tipologie, editor planimetria) = **D-005**.
- **Invito-via-email** dello staff (SMTP, token d'invito, onboarding self-set-password) — futuro increment di D-025.
- **Cambio/reset password** dell'utente (self-service o admin-reset) — futuro; per ora la password è impostata alla
  creazione dall'admin.
- **Revoca immediata del token** di un utente disabilitato (oltre al rifiuto al login) = **D-026**.
- Campi extra sullo `Establishment` (logo, contatti, indirizzo) e `createdAt` sugli utenti — YAGNI (non nel mock).

## 8. Sequencing / DoD
- **Fase 1** (slice): ADR-0039 + `@Roles`/`RolesGuard` (+ unit) → `PATCH /establishment` (+ e2e: admin 200, staff 403,
  400 su vuoto, isolamento tenant) → contratti (`UpdateEstablishmentInput`) → FE modale rinomina + gating (+ test). **Un
  commit per layer. Presenta e attendi conferma.**
- **Fase 2** (slice): migrazione `disabledAt` → contratti (`CreateStaffUserInput`/`UpdateStaffUserInput` + `disabledAt`
  su member) → endpoint users + invarianti + login-reject-disabled + projection (+ unit/e2e) → FE gestione utenti
  (+ test). **Un commit per layer. Presenta e attendi conferma.**
- **Baseline da non regredire** (fine slice overview): ui-kit 70 · web-staff 183 · api unit 122 · api e2e 169 ·
  typecheck pulito. La Fase 2 **aggiunge una migrazione** (unica del completamento).
- Verifica **LIVE** per fase (rebuild `--build api web`; ⚠️ se rilanci il seed usa `DEV_ADMIN_PASSWORD=coralyn-admin-8473`).
