# Platform Console (superuser) — gestione lidi cross-tenant · design

- **Data:** 2026-07-05
- **Tipo:** spec di design (workflow ADR-0009: brainstorming → questa spec → piano TDD → esecuzione)
- **ADR realizzati:** [0010](../../architecture/decisions/0010-isolamento-multi-tenant.md) ·
  [0015](../../architecture/decisions/0015-osservabilita-e-console-superuser.md) ·
  [0026](../../architecture/decisions/0026-identita-rls-utente.md) ·
  [0028](../../architecture/decisions/0028-provisioning-tenant.md)
- **ADR nuovi prodotti da questa spec:** **0040** (lettura aggregata cross-tenant) · **0041** (app FE dedicata `web-platform`)
- **Deferred nuovi:** impersonation-supporto (accesso PII puntuale) · vista materializzata metriche

---

## 1. Contesto e problema

Coralyn è un gestionale B2B multi-tenant (un tenant = uno **Stabilimento**/lido). Il fornitore del
servizio (il **distributore**, ruolo `superuser`) deve poter **gestire i lidi** dal software:
crearne di nuovi, sospenderli, e avere una **panoramica aggregata** dello stato del parco clienti.

Oggi lo scheletro esiste ma è inerte: `Role.superuser` è nell'enum, `User.establishmentId` è nullable
(`null = platform superuser`, [ADR-0026](../../architecture/decisions/0026-identita-rls-utente.md)), ma
**non esiste alcun percorso cross-tenant**: un superuser fa login e non può fare nulla, perché ogni
endpoint di business chiama `TenantContext.require()` che fallisce senza tenant. Manca tutta la carne:
lista lidi, provisioning, sospensione, metriche.

Questa spec definisce il **primo sotto-progetto "Platform Console"**. È la realizzazione concreta di
due decisioni già ratificate: la Console superuser di [ADR-0015](../../architecture/decisions/0015-osservabilita-e-console-superuser.md)
e il provisioning-fornitore di [ADR-0028](../../architecture/decisions/0028-provisioning-tenant.md)
("in prospettiva via la Console superuser").

## 2. Decisioni di prodotto (dal brainstorming)

1. **Modello commerciale:** SaaS in crescita, **provisioning semi-automatico** — il distributore crea i
   lidi da una UI. Billing/self-service **fuori scope** (resta [D-002](../../architecture/deferred.md)).
2. **Architettura DB:** invariata, **pool + RLS** ([ADR-0010](../../architecture/decisions/0010-isolamento-multi-tenant.md)).
   Nessuno schema/DB-per-tenant (escape-hatch D-010 non attivato).
3. **Parete dati (GDPR):** **rigida — solo aggregati, mai PII dei bagnanti**. Il distributore è
   *responsabile del trattamento*, il lido è *titolare*; la minimizzazione è strutturale, non solo
   procedurale. L'accesso PII puntuale per supporto (impersonation con audit) è **deferred**.
4. **Lettura cross-tenant:** **loop `forTenant`** (→ [ADR-0040](#8-adr-prodotti-da-questa-spec)).
5. **Provisioning:** **minimo** — crea `Establishment` + primo `User` admin (email + password
   temporanea). Il lido costruisce poi la sua struttura con l'editor «Configura» esistente. Nessuno
   scaffolding opinionato.
6. **Frontend:** **app dedicata** `apps/web-platform`, separata da `web-staff` (→ [ADR-0041](#8-adr-prodotti-da-questa-spec)).

### Non-obiettivi (esplicitamente fuori scope)

- Billing / self-registration / trial ([D-002](../../architecture/deferred.md)).
- Impersonation o qualsiasi vista che esponga PII dei bagnanti (deferred, vedi §8).
- Vista materializzata delle metriche (upgrade futuro del loop `forTenant`, vedi §8).
- Audit di **dominio** completo per-tenant (prenotazioni/listino/login) di ADR-0015: qui si realizza
  solo il sottoinsieme **platform-level** (mutazioni del superuser). Il resto resta futuro.
- Inviti staff via email ([D-025](../../architecture/deferred.md)).

## 3. Architettura

- **Nuovo modulo API `apps/api/src/platform/`**, tutti gli endpoint gated `@Roles(Role.superuser)`
  (RolesGuard globale, [ADR-0039](../../architecture/decisions/0039-rbac-role-guard.md)). Gli endpoint
  **non** invocano `TenantContext.require()`: sono cross-tenant per natura. Difesa in profondità
  preservata — un superuser (`establishmentId=null`) resta comunque respinto da ogni endpoint di
  business, perché lì `require()` fallisce.
- **Auth condivisa, frontend separato:** il login del distributore usa la stessa `POST /api/auth/login`
  (email globalmente unica, `establishmentId=null` già gestito, [ADR-0026](../../architecture/decisions/0026-identita-rls-utente.md)).
  L'app `web-platform` ha la sua `LoginView` brandizzata "Coralyn Platform".
- **Tabelle radice fuori RLS abilitano il cross-tenant senza bypass:** `Establishment` e `User` **non**
  hanno la policy `tenant_isolation`. Quindi listare i lidi e crearne (Establishment + admin) sono
  query normali; solo gli **aggregati** (tabelle RLS) passano dal loop `forTenant`.

## 4. Modello dati

### 4.1 `Establishment.suspendedAt DateTime?`
Leva di sospensione a livello tenant. Quando valorizzato, **tutti** gli utenti del lido sono respinti
al login — stesso pattern di `User.disabledAt` ([D-025](../../architecture/deferred.md)), ma tenant-wide.
È il gancio che rende additivo il futuro billing (moroso → `suspend`). Il login (`IdentityService.login`)
aggiunge il check: se l'utente ha un `establishmentId` il cui `Establishment.suspendedAt` è valorizzato →
stesso 401 generico (nessuna enumerazione). Un superuser (`establishmentId=null`) non è mai sospendibile.

### 4.2 `PlatformAuditLog` (append-only)
Realizzazione **platform-level** dell'`AuditLog` di [ADR-0015](../../architecture/decisions/0015-osservabilita-e-console-superuser.md).
Fuori RLS (è dato di piattaforma, non di tenant). Registra **solo le mutazioni** del superuser (non
serve audit di lettura: la parete è già solo-aggregati e PII-free).

```prisma
enum PlatformAction {
  create_establishment
  suspend_establishment
  reactivate_establishment
}

model PlatformAuditLog {
  id                  String         @id @default(uuid()) @db.Uuid
  actorUserId         String         @db.Uuid            // il superuser che ha agito
  action              PlatformAction
  targetEstablishmentId String?      @db.Uuid           // lido oggetto dell'azione
  metadata            Json?          @db.JsonB          // es. { name } alla creazione; mai PII bagnanti
  createdAt           DateTime       @default(now())

  @@index([targetEstablishmentId])
  @@index([createdAt])
}
```

La scrittura dell'audit avviene **nella stessa transazione** della mutazione che descrive: non può
sfuggire, non lascia buchi storici.

### 4.3 Bootstrap primo superuser
Via **seed**, env-gated (`PLATFORM_SUPERUSER_EMAIL` / `PLATFORM_SUPERUSER_PASSWORD`), `establishmentId=null`,
`role=superuser`. Nessuna UI per crearlo (il primo distributore è l'operatore stesso). Idempotente
(upsert-by-email), coerente col seed esistente.

## 5. Superficie API — `/api/platform/*` (tutti `@Roles(Role.superuser)`)

| Metodo | Endpoint | Descrizione | Note |
|---|---|---|---|
| `GET` | `/establishments` | Lista lidi + metriche aggregate | loop `forTenant`; DTO §6 |
| `GET` | `/establishments/:id` | Dettaglio singolo lido (metriche + stato) | 404 se inesistente |
| `POST` | `/establishments` | Crea lido + primo admin | ritorna password temporanea **una volta**; audit |
| `POST` | `/establishments/:id/suspend` | Valorizza `suspendedAt` | idempotente; audit; 404 se inesistente |
| `POST` | `/establishments/:id/reactivate` | Azzera `suspendedAt` | idempotente; audit |

**Create — regole:** nome lido non vuoto; email admin globalmente unica (409 se già esiste un `User`
con quella email); password temporanea generata server-side (mai scelta dal client), hash argon2id,
ritornata in chiaro **solo** nella risposta della create. Establishment + User + audit in **una
transazione**.

## 6. DTO metriche (PII-free per costruzione)

Solo `count`/`sum`/timestamp: nessuna colonna PII dei bagnanti può entrarvi.

```ts
interface PlatformEstablishmentDTO {
  id: string;
  name: string;
  createdAt: string;                 // ISO
  suspendedAt: string | null;        // ISO | null
  // capacità (struttura)
  sectors: number;
  rows: number;
  umbrellas: number;
  // vitalità / engagement
  staffUsersActive: number;
  lastActivityAt: string | null;     // max(Booking.createdAt) del lido — proxy "è vivo?" (vedi nota)
  // valore commerciale
  revenueSeasonTotal: number;        // somma incassato stagione attiva
  activeSubscriptions: number;
  bookingsThisSeason: number;
  // operatività live
  occupancyPctToday: number;         // 0..100
}
```

`lastActivityAt` e `revenueSeasonTotal` sono i due segnali di sintesi (salute + valore erogato), base
del futuro billing per fascia.

> **Nota su `lastActivityAt`:** oggi il login **non** viene tracciato (nessun `User.lastLoginAt`).
> Per non promettere un dato inesistente, la metrica usa `max(Booking.createdAt)` del lido — proxy
> affidabile di "operatività". L'arricchimento con il timestamp di login reale (colonna
> `User.lastLoginAt`, scritta sul login) è un miglioramento **additivo** tracciato come deferred, non
> parte di questa spec.

## 7. Lettura cross-tenant — `PlatformMetricsService`

`establishment.findMany()` (tabella fuori RLS → query libera) → per ciascun lido
`prisma.forTenant(id, tx => …)` con soli `count`/`aggregate`, componendo il DTO. Riusa il primitivo
d'isolamento già audit-ato ([prisma.service.ts](../../../apps/api/src/prisma/prisma.service.ts));
**strutturalmente PII-safe**. Costo O(N) transazioni leggere — accettabile a decine/centinaia di lidi
per una pagina admin non hot; ottimizzabile a vista materializzata senza cambiare il DTO (§8).

Riuso ove possibile delle proiezioni esistenti di `reports/` (occupazione, incasso) per non duplicare
la logica di calcolo.

## 8. ADR prodotti da questa spec

### ADR-0040 — Lettura aggregata cross-tenant via loop `forTenant`
- **Decisione:** gli aggregati cross-tenant della console si ottengono iterando gli `Establishment` e
  eseguendo query aggregate dentro `forTenant`, **non** bypassando la RLS.
- **Alternative scartate:** (b) ruolo `BYPASSRLS` / GUC-sentinella con `GROUP BY establishmentId` — una
  query sola ma apre una superficie privilegiata da blindare, rischio leak cross-tenant su bug; (c)
  vista materializzata subito — più veloce a leggere ma aggiunge job di refresh e possibile stantìo,
  ingiustificato alla scala attuale. Entrambe restano evolvibili senza cambiare il DTO.
- **Zero debito:** nessuna nuova superficie DB privilegiata; PII-safe per costruzione; upgrade a vista
  materializzata tracciato come deferred.

### ADR-0041 — App frontend dedicata `apps/web-platform`
- **Decisione:** la console distributore è una **SPA separata** che riusa `@coralyn/ui-kit` e
  `@coralyn/contracts`, non una sezione di route dentro `web-staff`.
- **Alternative scartate:** landing-per-ruolo dentro `web-staff` — meno lavoro ora, ma spedisce il
  codice superuser ai browser dello staff-lido (blast radius) e accoppia due audience/prodotti in un
  deploy; estrarla dopo è costoso.
- **Zero debito:** isolamento di sicurezza e di deploy dal giorno uno; auth condivisa sul BE, nessuna
  duplicazione di logica di dominio (i package sono condivisi).

### Deferred nuovi (→ `deferred.md`)
- **Impersonation / accesso PII puntuale per supporto** — con motivazione obbligatoria + audit di
  lettura, come escape-hatch controllato alla parete rigida. Non necessario finché gli aggregati bastano.
- **Vista materializzata `establishment_metrics`** — upgrade di prestazione del loop `forTenant` quando
  i lidi crescono; stesso DTO, additivo.
- **`User.lastLoginAt`** — tracciamento del login reale per arricchire `lastActivityAt` (oggi proxy su
  `Booking.createdAt`); scrittura sul percorso di login, additivo.

## 9. Frontend — `apps/web-platform`

- Scaffold Vite coerente con `web-staff` (stessa toolchain, `@coralyn/ui-kit`, `@coralyn/contracts`).
- `LoginView` propria (brand "Coralyn Platform") → stessa `POST /api/auth/login`.
- **Lista lidi:** tabella con metriche §6, badge "Sospeso", azioni sospendi/riattiva (con
  `ConfirmDialog`).
- **Crea lido:** form (nome + email admin) → mostra la password temporanea **una volta** (copiabile).
- **Dettaglio lido:** pannello aggregati. **Nessuna** schermata che mostri clienti/prenotazioni: la
  parete rigida è anche un'assenza di UI, non solo di endpoint.

## 10. Sicurezza & GDPR

- Parete rigida applicata su **due livelli**: nessun endpoint restituisce PII bagnanti, e nessuna UI la
  richiede. Il DTO metriche non ha campi PII per costruzione.
- Ogni mutazione del superuser è tracciata in `PlatformAuditLog` (accountability, [ADR-0015](../../architecture/decisions/0015-osservabilita-e-console-superuser.md)).
- **Prerequisito legale (non software):** nomina a **responsabile del trattamento / DPA (art. 28 GDPR)**
  firmata con ogni lido. Annotato qui perché condiziona l'attivazione, non il codice.

## 11. Piano di test (TDD, un commit per layer — come Configura)

- **contracts:** `PlatformEstablishmentDTO`, `CreateEstablishmentInput`, `CreateEstablishmentResponse`
  (con password temporanea), tipi azione audit.
- **api unit:** `PlatformMetricsService` (aggregati corretti via loop `forTenant`); provisioning
  (create Establishment+admin, email duplicata → 409, audit scritto in-tx); suspend/reactivate
  (idempotenti, audit); `IdentityService.login` respinge utenti di lido sospeso.
- **api e2e:** `@Roles(superuser)` → 403 per `staff`/`admin`/anon su tutti gli endpoint; create lido →
  il nuovo admin fa login e vede la sua struttura vuota; `suspend` → login degli utenti del lido negato;
  `reactivate` → login di nuovo ok; `PlatformAuditLog` popolato.
- **web-platform:** login → lista lidi; create-form mostra password una volta; suspend/reactivate
  aggiornano il badge; assenza di qualsiasi vista PII.

**Baseline test da non regredire:** ui-kit 70 · web-staff 210 · api unit 167 · api e2e 214 · typecheck pulito.

## 12. Decomposizione (2 slice, API-first)

- **Slice A — Backend `platform/`:** migrazione (`Establishment.suspendedAt` + `PlatformAuditLog` +
  enum) → contracts → api unit → api e2e → seed bootstrap superuser. Indipendentemente testabile e di
  valore (esercitabile via `fetch` autenticato senza FE).
- **Slice B — Frontend `apps/web-platform`:** scaffold + login + lista + create + dettaglio +
  suspend/reactivate.

## 13. Rubric check (professionalità · convenzioni · modularità · zero debito)

1. **Professionalità** — realizza decisioni già ratificate (0015/0028), rispetta ruoli GDPR
   titolare/responsabile con minimizzazione strutturale, audit in-transaction, provisioning B2B corretto.
2. **Convenzioni** — riusa `forTenant`, RolesGuard, pattern seed; monorepo con package condivisi; nomi
   e lingua in inglese ([ADR-0030](../../architecture/decisions/0030-codice-e-db-in-inglese.md)).
3. **Modularità** — modulo API `platform/` isolato; app FE separata; audit come entità a parte; nessun
   intreccio coi moduli di dominio o coi ruoli tenant.
4. **Zero debito** — nessuna superficie RLS-bypass; audit senza buchi storici; app separata evita
   estrazioni dolorose future; ogni rinvio (impersonation, vista materializzata, billing) è tracciato
   in `deferred.md`, non un buco silenzioso.
