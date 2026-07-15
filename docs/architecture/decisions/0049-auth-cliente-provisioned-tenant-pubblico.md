# ADR-0049: Auth del canale cliente — accesso provisioned dal lido, tenant pubblico derivato dal token

- **Status:** Accepted
- **Data:** 2026-07-15
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0024](0024-strategia-auth.md) (**estende**: accanto all'auth staff — JWT
  stateless dal `JwtAuthGuard` globale — introduce un secondo canale auth, isolato e `@Public()` rispetto a
  quella guardia), [ADR-0026](0026-identita-rls-utente.md) (**mirror**: le due tabelle token cliente sono
  **fuori-RLS** come `User`/`CredentialSetupToken`, dato d'identità pre-tenant con accessore applicativo
  unico), [ADR-0042](0042-trasporto-email-e-consegna-credenziali.md) (**riusa** il pattern token-opaco-hashato
  e `generateRawToken`/`hashToken` della consegna credenziali staff), [ADR-0025](0025-hashing-password.md)
  (**riusa** `PasswordHasher`/argon2id per l'hash del PIN, nessun nuovo hasher),
  [ADR-0048](0048-assenze-comunicate-release-occupazione.md) (**additivo**: il provisioning dell'accesso
  cliente vive accanto al consenso "assenze comunicate"; `AbsenceRelease.source='customer'`, già predisposto,
  sarà valorizzato in S4). Spec:
  [2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md](../../superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md)
  (D-035, sotto-slice **S3** — fondazione auth; S4 = feature release `source='customer'` + app `web-customer`,
  piano separato dopo il merge-gate).

## Context

D-035 ha bisogno di un **canale rivolto al cliente del lido** (il bagnante abbonato), distinto dal gestionale
operatore: nella slice S1+S2 ([ADR-0048](0048-assenze-comunicate-release-occupazione.md)) l'assenza è
comunicata **all'operatore**, che la registra; S3+S4 danno al cliente un canale **suo** per segnalare
direttamente. S3 costruisce la **sola fondazione di autenticazione** di quel canale, senza ancora la feature
release (S4).

Il vincolo dominante è la **sicurezza** (direttiva utente): questo canale è candidato all'esposizione pubblica
(a differenza del deploy interno dell'MVP staff), quindi va progettato dall'inizio contro enumeration,
brute-force, furto di sessione e cross-tenant leakage. Insieme risolve i deferiti auth che l'MVP staff aveva
consapevolmente rimandato perché non esposto: **D-026** (refresh & revoca), **D-027** (rate-limiting),
**D-029** (anti-enumeration/timing).

Le domande da decidere: (a) **come autentica** un cliente che non ha (e non deve creare) un account con
password; (b) **come si deriva il tenant** di una richiesta cliente senza rompere il choke-point `forTenant`
/RLS costruito per lo staff (che ricava il tenant dal JWT staff); (c) **quale ciclo di vita** hanno le
credenziali (durata, rotazione, revoca) su un dispositivo del cliente non gestito.

## Decision

### (a) Accesso **provisioned dal lido**, non self-registration: token opaco one-time + PIN

Il cliente **non crea un account** e **non sceglie una password**. È l'operatore (admin) a **provisionare**
l'accesso dalla prenotazione-abbonamento: `POST /bookings/:id/customer-access` genera un **enrollment token
opaco** (32 byte CSPRNG, url-safe — riuso `generateRawToken`, [ADR-0042](0042-trasporto-email-e-consegna-credenziali.md))
consegnato in un link/QR, più un **PIN** a 6 cifre (CSPRNG) mostrato **una volta** all'operatore, che lo
comunica al cliente su un canale separato. Entrambi i segreti sono persistiti **solo come hash** (token:
`sha256`; PIN: argon2id via `PasswordHasher`, [ADR-0025](0025-hashing-password.md)) — il raw non è mai a
riposo lato server. È il modello **provisioning-by-fornitore** già scelto per i tenant
([ADR-0028](0028-provisioning-tenant.md)) e per lo staff ([ADR-0042](0042-trasporto-email-e-consegna-credenziali.md)),
esteso al cliente: coerente col rifiuto della self-registration aperta (D-002).

L'attivazione (`POST /customer/activate`, `@Public()`) consuma il token **one-time** (claim atomico
`updateMany` con `activatedAt: null` → race-safe) e richiede il PIN come **secondo fattore**; oltre
`CUSTOMER_PIN_MAX_ATTEMPTS` (default 5) tentativi errati l'enrollment è **bloccato** (`revokedAt`). Ogni
fallimento è un **401 generico** identico (token inesistente, scaduto, revocato, PIN errato): nessun oracolo
di enumeration (**D-029** risolta per costruzione, non con un `verify` civetta ma con un messaggio unico e
nessun ramo osservabile dall'esterno).

### (b) Tre strati di credenziali, tenant **derivato dal token** e denormalizzato

L'attivazione emette **due** credenziali (i tre strati della spec §4.2):

1. **Enrollment token** — one-time, nel QR/link, provisioned dal lido (strato 1, consumato all'attivazione).
2. **Refresh token** — opaco, **device-bound, rotante**, revocabile (strato 2, D-026). Vive solo sul device
   (hash a riposo). TTL lungo (`CUSTOMER_REFRESH_TTL_DAYS`, default 120).
3. **Access JWT cliente** — breve (`CUSTOMER_JWT_EXPIRES_IN`, default 30m), claim **ridotti**
   (`sub`=customerId, `establishmentId`, `kind:'customer'`) — strato 3.

Il claim `kind:'customer'` **partiziona** lo spazio dei token: un `CustomerTokenService.verify` rifiuta
qualunque token privo di `kind:'customer'` (es. un token staff), e simmetricamente la `JwtAuthGuard` staff
non accetta un token cliente. Il **tenant** di una richiesta cliente è **derivato dal token**, non da un
header o dal path: `establishmentId` è **denormalizzato** sulle tabelle token (fuori-RLS) all'atto del
provisioning, entra nell'access JWT come claim, e un **`CustomerJwtGuard` dedicato** (controller-scoped, non
globale) lo estrae e popola `req.tenantId = establishmentId` **prima** che i service tocchino il DB. Così
`forTenant`/RLS/`TenantContext` restano **invariati a valle**: il canale cliente riusa lo stesso choke-point
dello staff, cambiando **solo** la sorgente del tenant (token cliente invece di JWT staff). L'ownership è a
due livelli: RLS isola il **tenant**; il **cliente nel tenant** è vincolato dal principal (`req.customer.id`),
che i futuri endpoint cliente (S4) useranno per filtrare `customerId` — RLS da sola non separa due clienti
dello stesso lido.

### (c) Tabelle token **fuori-RLS**, sessione rotante con theft-detection e revoca operatore

Le due tabelle — `CustomerEnrollmentToken` e `CustomerSession` — sono **fuori-RLS** (nessun `ENABLE ROW LEVEL
SECURITY`, accessore applicativo unico `customer-auth`), esattamente come `CredentialSetupToken`
([ADR-0026](0026-identita-rls-utente.md)): sono **dato d'identità pre-tenant** — la richiesta di attivazione
arriva **prima** che esista un `req.tenantId`, quindi il tenant non può derivare da RLS ma è denormalizzato
(`establishmentId`) e ne diventa la **sorgente**. Il reset-dev le tratta con lo stesso carve-out di `User`
(keep-list, non wipe).

La sessione (`CustomerSession`) è un **refresh token rotante** (D-026): ogni `POST /customer/refresh` revoca
il refresh presentato e ne emette uno nuovo (`rotatedFromId` traccia la catena). Il **furto** è rilevato dal
riuso: presentare un refresh **già ruotato** (`revokedAt != null`) è un segnale di token rubato → si **revoca
l'intera catena** della sessione (`enrollmentTokenId`) e 401. La **revoca operatore** (`POST
/bookings/:id/customer-access/revoke`, admin-only) e il ri-provisioning invalidano enrollment + sessioni vive
del cliente (D-026 lato revoca). `GET /customer/me` (con `CustomerJwtGuard`) e `POST /customer/logout`
(`@Public()`, revoca la sessione dal refresh) chiudono il ciclo.

### Rate-limiting controller-scoped (D-027)

Gli endpoint pubblici `/customer/*` sono protetti da `@nestjs/throttler` applicato **solo** al
`CustomerAuthController` (`@UseGuards(ThrottlerGuard)` a livello classe), **non** come `APP_GUARD` globale: un
guard globale con keying per-IP farebbe scattare 429 spuri nell'intera suite e2e (tutte le richieste vengono
da `127.0.0.1`) e throttlerebbe anche il gestionale staff interno, che non ne ha bisogno. Il limite è
**env-driven** (`CUSTOMER_THROTTLE_LIMIT`, default 10 / 60s) così la suite funzionale lo alza e la prod resta
strict. **D-027 risolta** per il canale cliente (il login staff interno resta fuori scope: non esposto).

## Consequences

### Positive
- **Sicurezza di prima classe su un canale candidato all'esposizione**: no self-registration, no password
  cliente, segreti solo-hash, 401 generico (no enumeration), PIN come 2° fattore con lock, refresh rotante con
  theft-detection, rate-limit — D-026/D-027/D-029 risolte **insieme** e coese, non a bolt-on successivi.
- **Zero-drift sul choke-point tenant**: il `CustomerJwtGuard` popola `req.tenantId` come fa la guardia staff,
  quindi `forTenant`/RLS/`TenantContext` e ogni service a valle restano **byte-identici** — il canale cliente
  non duplica l'isolamento, lo riusa.
- **Isolamento a due assi esplicito**: RLS per il tenant, principal per il cliente-nel-tenant; i test di
  isolamento (cross-tenant + cross-customer) lo verificano end-to-end.
- **S4 additiva per costruzione**: la fondazione auth non tocca `bookings.service.ts` (release); S4 aggiunge
  solo endpoint cliente (`GET /me/subscriptions`, release `source='customer'`) e l'app `web-customer` sopra
  questo strato, senza retrofit.

### Negative / Trade-off
- **Onere operativo del provisioning manuale**: ogni accesso cliente richiede un'azione admin (genera
  link+PIN, comunica il PIN su canale separato). Accettato: è il prezzo del modello provisioned-by-lido, che
  evita la superficie d'attacco della self-registration; il PIN out-of-band è la difesa contro il furto del
  solo link.
- **`User` (staff) resta fuori-RLS senza percorso privilegiato** ([D-028](../deferred.md)): valutato in S3 e
  **confermato non-trigger** — il canale cliente introduce due nuove tabelle fuori-RLS con accessore unico
  (stesso pattern `CredentialSetupToken`), non aumenta il numero di accessori di `User`; D-028 resta tracciato
  come hardening futuro, non aperto da questa slice.
- **Nessun audit dell'attore admin** che provisiona/revoca l'accesso cliente in v1: coerente con
  `BookingSuspension`/`BookingTransfer`/`AbsenceRelease` (`createdByUserId` presente su
  `CustomerEnrollmentToken` ma nessuna tabella audit dedicata) — deferito a **D-047** insieme al resto
  dell'audit di tenant.
- **Rate-limit in-memory single-process**: lo storage default del throttler non è condiviso fra istanze;
  adeguato al deploy singolo attuale, da promuovere a storage distribuito (Redis) su scale-out.

### Neutre / Note
- `CUSTOMER_JWT_EXPIRES_IN`/`CUSTOMER_ENROLLMENT_TTL_HOURS`/`CUSTOMER_REFRESH_TTL_DAYS`/`CUSTOMER_PIN_MAX_ATTEMPTS`
  /`CUSTOMER_THROTTLE_LIMIT`/`CUSTOMER_APP_URL` sono le nuove env (default in `customer-auth`).
- Il modulo `customer-auth` registra un `JwtModule` **proprio** (stesso `JWT_SECRET`, `expiresIn` distinto):
  la firma del token cliente è separata dalla configurazione staff senza un secondo segreto da gestire.

## Alternatives considered

- **Account cliente con email + password (self-registration)** — scartata: aumenta la superficie d'attacco
  (reset-password, verifica email, enumeration sul registro) per una popolazione (bagnanti) che non vuole
  gestire l'ennesima credenziale; contraddice il modello provisioning-by-fornitore già adottato per tenant e
  staff (D-002, [ADR-0028](0028-provisioning-tenant.md)).
- **OTP via SMS/email a ogni accesso** — scartata per S3: sposta il costo e la dipendenza su un gateway
  SMS/email a ogni sessione (deliverability, costo, latenza) e non dà una sessione persistente sul device; il
  refresh device-bound rotante offre persistenza sicura senza un secondo canale ricorrente. L'OTP resta
  un'opzione additiva se emergesse la necessità di step-up.
- **Tenant nel path pubblico (`/t/:establishmentId/customer/...`)** — scartata: mette l'identità del tenant in
  un parametro spoofabile e slega il tenant dall'autenticazione (un token valido per il lido A potrebbe essere
  presentato su `/t/B/...`). Derivare il tenant **dal token** lo lega crittograficamente all'identità e
  mantiene `req.tenantId` autoritativo come per lo staff.
- **Tabelle token dentro-RLS** — scartata: l'attivazione è **pre-tenant** (nessun `req.tenantId` ancora
  stabilito), quindi una policy RLS non avrebbe un GUC tenant da cui filtrare; è lo stesso motivo per cui
  `User`/`CredentialSetupToken` sono fuori-RLS ([ADR-0026](0026-identita-rls-utente.md)). Il tenant
  denormalizzato + accessore unico è il carve-out corretto, non un'eccezione ad-hoc.
- **Refresh token statico (non rotante)** — scartata: senza rotazione, un refresh rubato resta valido fino a
  scadenza senza segnale di compromissione; la rotazione + theft-detection (riuso ⇒ revoca catena) rende il
  furto **rilevabile e contenibile** (D-026).

## Rubric check ([ADR-0002](0002-decision-rubric.md))

1. **Professionalità** — la sicurezza è trattata come vincolo dominante e risolta in modo coeso
   (provisioning-by-lido, 2° fattore + lock, 401 generico, refresh rotante + theft-detection, rate-limit
   controller-scoped), non come una somma di patch; D-026/D-027/D-029 chiuse insieme con motivazione, non
   silenziosamente.
2. **Convenzioni** — mirror esatto di `CredentialSetupToken`/[ADR-0026](0026-identita-rls-utente.md)
   (fuori-RLS, accessore unico, denormalizzazione del tenant, keep-list nel reset-dev) e di
   [ADR-0042](0042-trasporto-email-e-consegna-credenziali.md) (token opaco hashato, `generateRawToken`
   /`hashToken`); riuso di `PasswordHasher`/argon2id ([ADR-0025](0025-hashing-password.md)) per il PIN;
   `@Public()` + guard dedicato come il resto del canale; DTO `class-validator` + `ValidationPipe` come ogni
   controller.
3. **Modularità** — `customer-auth` è un modulo isolato con un solo accessore delle due tabelle; il tenant
   entra dal guard e a valle nulla cambia (`forTenant`/RLS invariati); il rate-limit è scoped al solo
   controller pubblico, senza toccare lo staff; S4 è additiva (nessun tocco a `bookings.service.ts`).
4. **Zero debito** — nessun raw token/PIN persistito; nessuno stato duplicato (il tenant vive denormalizzato
   sulle tabelle fuori-RLS **per necessità pre-tenant**, motivata); i deferiti residui sono **tracciati**
   (D-028 percorso RLS `User` valutato e confermato non-trigger; D-047 audit attore; storage throttler
   distribuito su scale-out), non silenziosi; `establishmentId` denormalizzato registra un fatto necessario,
   non machinery speculativa.
