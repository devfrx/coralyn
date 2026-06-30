# Spec di design — Identità & Auth (modulo `identita`)

- **Data:** 2026-06-29
- **Status:** Proposto
- **Modulo:** `identita` (2 di 7 nell'ordine del Core: `core → identita → mappa → …`)
- **Riferimenti:** [spec Core §6/§11](2026-06-27-core-operativo-design.md) ·
  [data-model](../design/data-model.md) · [Plan 1 — Core Foundation](../plans/2026-06-28-core-foundation.md) ·
  [handoff](../handoff/2026-06-28-backend-next-identita-auth.md) ·
  ADR [0010](../architecture/decisions/0010-isolamento-multi-tenant.md) ·
  [0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md) ·
  [0023](../architecture/decisions/0023-contatti-cliente-colonne-tipizzate.md) (pattern DTO/validazione)

## 1. Obiettivo

Dare al Core un'**autenticazione reale**: un `Utente` staff fa login con email e password,
riceve un **JWT**, e una **guard** ne ricava tenant e ruolo impostando `req.tenantId`. La guard
**sostituisce** il `TenantMiddleware` provvisorio (header `X-Stabilimento-Id`) del Plan 1, senza
toccare `TenantContext`, `forTenant`, né i moduli di dominio (`clienti`). È la dipendenza di tutti
i moduli a valle: prima che reggano `mappa`/`catalogo`/`prenotazioni`, il tenant deve arrivare dal
token, non da un header fidato.

## 2. Scope

### In scope (cuore irriducibile dell'auth)
- Modello `Utente` **minimo** (vedi §4) + migrazione; relazione inversa su `Stabilimento` (additiva).
- **Hashing password** con argon2id (servizio `PasswordHasher`, TDD).
- `POST /api/auth/login` → `{ accessToken, utente }`; credenziali errate → **401 generico**.
- `GET /api/auth/me` (protetta) → profilo dell'utente corrente (il FE reidrata la sessione).
- **`JwtAuthGuard` globale** che valida il Bearer, popola `req.user` e `req.tenantId`; decoratore
  **`@Public()`** per `login` e `/health`. **Rimozione** del `TenantMiddleware`.
- **Seed** del primo `Stabilimento` + admin (per dev ed e2e).
- Aggiornamento di `clienti.e2e-spec.ts` al nuovo flusso (Bearer al posto dell'header).
- **Contracts** additivi: `UtenteDTO`, `LoginInput`, `LoginResponse` (riuso enum `Ruolo`).
- **ADR**: 0024 (strategia auth), 0025 (hashing), 0026 (trattamento identità/RLS di `Utente`).

### Fuori scope (rimandato → §11)
Gestione utenti (admin crea/elenca staff, RBAC sugli endpoint), console superuser cross-tenant
(modulo `audit`, [ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)),
refresh/revoca token, rate-limiting sul login, reset password, campi `Utente.attivo`/`creatoIl`
(**YAGNI** finché non c'è gestione utenti che li usi). [D-023](../architecture/deferred.md)
(least-privilege ruolo DB) resta **rinviato**; [D-024](../architecture/deferred.md) invariato.

## 3. Decisioni di riferimento (rubrica [ADR-0002](../architecture/decisions/0002-decision-rubric.md))

| Tema | Decisione | ADR |
|---|---|---|
| Strategia auth | **JWT stateless** (no sessione, no refresh nell'MVP); `@nestjs/jwt` + **guard custom** (no passport: meno dipendenze, controllo diretto su `req.tenantId`); claim `sub/stabilimentoId/ruolo/exp` | **0024** |
| Hashing password | **argon2id** (raccomandazione OWASP, memory-hard; pacchetto `argon2` con prebuilds) | **0025** |
| Identità & RLS | `Utente` è tabella d'identità: **niente policy `tenant_isolation`**, accesso **solo** via `IdentitaService`; `stabilimentoId` nullable (null = superuser) | **0026** |
| Unicità email | `email` **unica globale**: login = `{email, password}`, tenant dedotto dal record | 0024 |

## 4. Modello dati — `Utente`

```prisma
enum Ruolo {
  admin
  staff
  superuser
}

model Utente {
  id             String        @id @default(uuid()) @db.Uuid
  stabilimentoId String?       @db.Uuid     // null = superuser di piattaforma (cross-tenant)
  email          String        @unique      // unica globale: identifica l'utente al login
  passwordHash   String                      // argon2id; mai esposto nei DTO
  ruolo          Ruolo
  stabilimento   Stabilimento? @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```

`Stabilimento` riceve `utenti Utente[]` (additivo). L'enum `Ruolo` lato DB mappa 1:1 i valori
dell'enum `Ruolo` dei contracts (`admin|staff|superuser`).

### Trattamento RLS (ADR-0026 — il nodo critico)

Il login interroga `Utente` **prima** di conoscere il tenant. La policy `tenant_isolation`
standard del Plan 1 nega ogni riga quando la GUC `app.current_tenant` non è impostata: applicata a
`Utente` renderebbe il login impossibile. Inoltre `stabilimentoId` è **nullable** (superuser), che
la policy a uguaglianza non gestisce.

**Decisione:** `Utente` **non** abilita la policy `tenant_isolation`. È una tabella d'**identità**,
non un dato di dominio interrogato dai moduli tenant-scoped; l'**unico** accessore è
`IdentitaService`, che filtra sempre per `email` (unica). È un'**eccezione esplicita e motivata**
alla regola "ogni tabella tenant-scoped → stessa policy RLS" del Plan 1.

Scartata l'alternativa "policy che permette quando nessun tenant è impostato": farebbe trapelare
**tutti** gli utenti di tutti i tenant a qualunque query non scoped — l'opposto della rete di
sicurezza. La protezione di `Utente` resta al **livello applicativo** (choke point unico + email
unica); l'irrobustimento con un percorso privilegiato è tracciato nei deferred (§11).

## 5. Architettura auth

Modulo `identita` con: `PasswordHasher`, `TokenService` (wrapper su `@nestjs/jwt`),
`IdentitaService` (login, lookup utente), `AuthController` (`login`, `me`), `JwtAuthGuard`
(globale via `APP_GUARD`), decoratore `@Public()`.

### Flusso di login
1. `POST /api/auth/login` `{ email, password }` (rotta `@Public()`; `LoginDto` validato dal
   `ValidationPipe` globale).
2. `IdentitaService.login`: lookup `Utente` per `email` (fuori da `forTenant`); se assente →
   **401 generico**. `PasswordHasher.verify(passwordHash, password)`; se KO → **401 generico**
   (stesso messaggio: nessuna user-enumeration).
3. `TokenService.sign({ sub: utente.id, stabilimentoId: utente.stabilimentoId, ruolo: utente.ruolo })`
   → `accessToken` (HS256, segreto `JWT_SECRET`, scadenza `JWT_EXPIRES_IN`, default `8h`).
4. Risposta `{ accessToken, utente: UtenteDTO }`.

### Guard (sostituisce il middleware)
- `JwtAuthGuard` registrata **globale** (`APP_GUARD`). Per ogni richiesta non `@Public()`:
  legge `Authorization: Bearer <token>`, lo verifica; in caso di token assente/invalido/scaduto →
  **401**. In caso valido imposta:
  - `req.user = { id: sub, ruolo, stabilimentoId }`
  - `req.tenantId = stabilimentoId ?? undefined`
- **`@Public()`** salta la guard: applicato a `POST /api/auth/login` e a `GET /health`
  (la guard globale coprirebbe anche health, escluso solo dal prefix `/api`).
- **`TenantMiddleware` rimosso** (file + wiring in `app.module.ts`). **`TenantContext` e
  `PrismaService.forTenant` restano INVARIATI**: leggono/usano lo stesso `req.tenantId` che ora è
  popolato dalla guard.

### Superuser
Token con `stabilimentoId = null` → `req.tenantId` resta `undefined`. Un endpoint tenant-scoped
risponde **400** via `TenantContext.require()` (comportamento corretto: il superuser non ha tenant;
la console cross-tenant in sola lettura arriverà col modulo `audit`, ADR-0015). In questo slice il
superuser può fare login e leggere `/me`; non esistono ancora endpoint superuser-only.

## 6. Endpoint & contracts

### Contracts (additivi, riuso `Ruolo`)
```ts
export interface UtenteDTO {
  id: string;
  email: string;
  ruolo: Ruolo;
  stabilimentoId: string | null; // null = superuser
}
export interface LoginInput { email: string; password: string; }
export interface LoginResponse { accessToken: string; utente: UtenteDTO; }
```

### Endpoint
| Metodo | Rotta | Auth | Body / Out | Note |
|---|---|---|---|---|
| POST | `/api/auth/login` | `@Public()` | `LoginDto` → `LoginResponse` | 401 generico su credenziali errate |
| GET | `/api/auth/me` | protetta | → `UtenteDTO` | dal token (+ profilo); 401 senza Bearer valido |

`LoginDto`: `@IsEmail() email`, `@IsString() @IsNotEmpty() password`. `passwordHash` non compare
**mai** nei DTO (proiezione esplicita `Utente → UtenteDTO`, come `Cliente.toDTO`).

## 7. Seed

Script di seed idempotente: crea (se assenti) uno `Stabilimento` di sviluppo e un `Utente` admin
(`email`/`password` da variabili d'ambiente di dev, hashate con argon2id). Serve a far funzionare
il login in locale e a fornire un admin agli e2e. Gli e2e creano tenant+admin con un helper
privilegiato (create diretta via Prisma — `Utente` non ha RLS) e poi effettuano il login.

## 8. Sicurezza

- Password con **argon2id**; `passwordHash` mai serializzato.
- **401 generico** identico per email sconosciuta e password errata (no user-enumeration).
- `JWT_SECRET` da ambiente (mai committato); `.env.example` documenta le chiavi senza valori reali.
- HS256, scadenza breve (default `8h` = un turno); niente refresh/revoca nell'MVP (→ §11).
- Rate-limiting sul login: rimandato e **tracciato** (→ §11).

## 9. Test (TDD dove prescritto)

- **Unit (no DB):** `PasswordHasher` (hash ≠ plaintext; `verify` true/false) — **TDD**.
  `TokenService` (sign→verify round-trip; claim corretti; token scaduto/manomesso rifiutato).
- **e2e (DB di test):**
  - login OK → 200 + `accessToken` + `utente` (senza `passwordHash`);
  - login con password errata / email sconosciuta → **401** (stesso corpo);
  - `GET /api/auth/me` con Bearer valido → 200 `UtenteDTO`; senza/Bearer invalido → 401;
  - **guard ↔ tenant:** `clienti.e2e` aggiornato — admin del tenant fa login, usa `Bearer`;
    l'isolamento per tenant **continua a valere**; richiesta senza token → 401;
  - **superuser:** login → token con `stabilimentoId=null`; chiamata a un endpoint tenant-scoped → 400.
- **Lint** pulito; nessun "fatto" senza output dei test (verification-before-completion).

## 10. Cosa NON cambia

`TenantContext`, `PrismaService.forTenant`, la policy RLS di `Cliente`, il modulo `clienti`
(service/controller/DTO) e il `ValidationPipe` globale. La guard popola `req.tenantId` esattamente
come faceva il middleware: i consumatori a valle non si accorgono della sostituzione.

## 11. Nuovi deferred (da aggiungere a `deferred.md`)

- **Gestione utenti & RBAC sugli endpoint** — admin crea/elenca/disabilita staff; sblocca i campi
  `attivo`/`creatoIl` e i decoratori di ruolo. Trigger: serve provisioning utenti oltre al seed.
- **Refresh & revoca token** (es. refresh token + blacklist/rotazione) — l'MVP usa un access token
  stateless a vita breve. Trigger: sessioni lunghe o logout immediato necessario.
- **Rate-limiting / brute-force protection sul login** — Trigger: esposizione pubblica dell'endpoint.
- **Percorso privilegiato RLS per `Utente`** (irrobustire la difesa in profondità oltre il choke
  point applicativo) — Trigger: più accessori della tabella identità o requisito di hardening.

## 12. Definition of Done

- Migrazione `utente` applicata a dev e test; `Utente` **senza** policy `tenant_isolation` (per scelta).
- `POST /api/auth/login` emette un JWT valido; `GET /api/auth/me` ritorna il profilo; credenziali
  errate → 401 generico.
- `JwtAuthGuard` globale attiva; `@Public()` su login e health; **`TenantMiddleware` rimosso**;
  `TenantContext`/`forTenant`/moduli di dominio invariati.
- `req.tenantId` ricavato dal token; l'**isolamento RLS continua a isolare** i tenant (e2e verde).
- Superuser: login OK, `stabilimentoId=null`, endpoint tenant-scoped → 400.
- Seed crea Stabilimento + admin; `clienti.e2e` migrato al Bearer e verde.
- Unit + e2e verdi, lint pulito; ADR 0024/0025/0026 scritti; `deferred.md` aggiornato;
  `data-model.md`/`MEMORY.md` aggiornati. Tutto committato (commit atomici, trailer Co-Authored-By).
