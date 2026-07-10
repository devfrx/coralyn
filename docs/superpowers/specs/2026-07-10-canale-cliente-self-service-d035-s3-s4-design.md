# Spec — Canale cliente self-service: auth provisioned dal lido + tenant-routing pubblico + release "assenza" `source='customer'` (D-035, sotto-slice S3+S4 — chiude il modulo)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-10). **Seconda** e ultima parte del **modulo
> D-035**: S1+S2 (lato operatore) sono già mergiate ([ADR-0048]); qui costruiamo il **canale cliente** che
> permette all'abbonato di segnalare un'assenza **dal proprio dispositivo** (`AbsenceRelease.source='customer'`,
> già predisposto senza retrofit). **Criterio guida imposto dall'utente: la soluzione più professionale, senza
> debiti, coerente, meno pigra — e soprattutto SICURA** (la sicurezza è il vincolo dominante di questo slice).
>
> **Decomposizione implementativa in due plan sequenziali, un gate di security-review duro in mezzo:**
> - **S3** — Fondazione auth cliente + **tenant-routing pubblico** (oggi inesistente): backend security-critical.
>   Proprio `writing-plans` → whole-branch review su opus **focalizzata sicurezza** → **merge gate**.
> - **S4** — Feature release self-service + **app dedicata `apps/web-customer`** (PWA): endpoint cliente che
>   **riusano** il domain service S1/S2, sopra la fondazione già rivista. Secondo `writing-plans`.
>
> Una sola spec (coerenza del design end-to-end evita di indovinare la forma dell'API), **due merge** (la
> fondazione di sicurezza si rivede e consolida prima di costruirci la UX sopra). **NON FE-only**: schema +
> migration + contracts + api + FE nuovo. Introduce **ADR-0049** (auth cliente provisioned + tenant pubblico via
> token). Prossima azione dopo l'ok utente sulla spec: `writing-plans` (TDD) del **solo S3**.

---

## 1. Problema

D-035 S1+S2 ha costruito il primo anello: l'abbonato comunica **all'operatore** (telefono/SMS) di non esserci in
un giorno del suo abbonamento, l'operatore registra una `AbsenceRelease` (`source='operator'`) che apre la
rivendita — **solo** dietro consenso attivo (`Booking.absenceConsentAt`). L'invariante irrinunciabile regge:
**nessuna presunzione d'assenza, rivendita solo su release esplicita registrata** ([ADR-0048]).

Manca il **canale diretto**: oggi la segnalazione è mediata dall'operatore. Il dato di assenza può esistere solo
se lo fornisce **il cliente stesso**; per farlo servono due cose che **oggi non esistono nel prodotto**:

1. **Un'identità/auth del cliente.** Il `Customer` è puro anagrafico: nessuna credenziale, `email`/`phone`
   opzionali e **non unici**, nessun ruolo `customer` nell'enum `Role`. Non esiste alcun percorso per autenticare
   un cliente (`IdentityService.login` è hard-vincolato a `User`).
2. **Un tenant-routing pubblico.** Il tenant si risolve **esclusivamente** dal claim JWT dello staff
   (`JwtAuthGuard → req.tenantId → GUC app.current_tenant`, [ADR-0026]/[ADR-0010]). Una richiesta pubblica
   pre-JWT **non ha alcun modo** di impostare il tenant — confermato nel codice (nessun header/subdomain/path;
   `http.ts` di web-platform lo dichiara esplicitamente).

Questo slice porta entrambe, **in modo sicuro e senza aprire una superficie di login pubblica enumerabile**.

## 2. Modello di dominio & principio d'accesso (confermati)

**Il cliente non si auto-registra: il lido (titolare del trattamento) provisiona l'accesso.** È la simmetria
esatta di [ADR-0028] (provisioning tenant = *fornitore + inviti*, self-registration aperta rifiutata): come il
fornitore provisiona i tenant, **il lido provisiona l'accesso del proprio cliente**. Coerente con i ruoli GDPR
(il lido è titolare dei dati dei bagnanti) e con il modello commerciale.

- **L'accesso nasce insieme al consenso.** Il momento naturale di provisioning è la cattura del consenso
  "assenze comunicate" (`PATCH /bookings/:id/absence-consent`, già admin-only, [ADR-0048]): l'operatore, allo
  stesso touchpoint, genera un **link+QR** e un **PIN** da consegnare al cliente. Consenso e accesso nascono
  insieme.
- **L'accesso è per-`Customer`, non per-`Booking`.** Un cliente ha un solo accesso e vede **tutti** i propri
  abbonamenti sotto quel tenant (meno link, revoca unica, meno sprawl). Legame: `Booking.customerId`.
- **Zero cambi al modello anagrafico.** Nessuna `email`/`password` aggiunta a `Customer`, nessun vincolo di
  unicità nuovo → **nessuna PII nuova**, nessun retrofit sui dati esistenti.
- **L'invariante ADR-0048 è preservato per costruzione.** Il canale cliente **non** introduce nuova logica di
  dominio sulla release: **riusa** `releaseAbsence`/`cancelAbsenceRelease` esistenti (§6), cambiando solo
  `source='customer'` e aggiungendo un **vincolo di ownership** (§5.4). `Booking.amountCollected`/`refundedAmount`
  /`startDate`/`endDate` restano invariati; la rivendita resta la prenotazione giornaliera dell'operatore.

## 3. Decisioni strutturali (CONFERMATE con l'utente)

1. **Auth cliente = token opaco provisioned dal lido (non account, non OTP-per-sessione).** È l'unica delle tre
   direzioni che **non apre una superficie di login pubblica enumerabile** e che **collassa auth+tenant** in un
   singolo segreto ad alta entropia, riusando il pattern token opaco già provato ([ADR-0042], `token-hash.ts`).
   Account email+password (credenziali persistenti riusate/phishabili + email obbligatoria che i clienti spesso
   non hanno + tenant-routing ancora da risolvere a parte) e OTP/SMS (SIM-swap, contattabilità non garantita,
   tenant separato) sono **meno sicure e più debito**, non di più. Scartate.
2. **Tre strati di credenziali distinti** (§4.2): *enrollment token* (nel QR/link, one-time) → *refresh token*
   (device-bound, rotante, revocabile) → *access JWT cliente* (bearer d'esercizio, 30 min, scope release-only).
   Il tenant è **derivato dal token** (denormalizzato sulle tabelle fuori-RLS), non da subdomain/path.
3. **Binding sessione = one-time + device-bound + PIN operatore** (secondo fattore). Il link è monouso; alla
   prima attivazione lega la sessione al dispositivo; un link inoltrato dopo l'attivazione è **morto**. Il **PIN**
   (consegnato dall'operatore, hashato, verificato a tempo costante, tentativi rate-limitati → lock) aggiunge un
   fattore di **conoscenza** e chiude anche la race del link intercettato *prima* dell'attivazione. È l'opzione
   più sicura che resta **un solo percorso uniforme** (applicabile a ogni cliente, anche walk-in senza contatti):
   l'alternativa OTP-o-PIN-condizionale biforcherebbe l'auth su dati (`email`/`phone`) che il modello non
   garantisce → debito e incoerenza. Scartata.
4. **I deferiti di sicurezza che "atterrano con S3" si risolvono in-scope, non si ri-deferiscono** (il trigger
   "esposizione pubblica" è ora reale → ri-deferirli sarebbe debito silenzioso, vietato da [ADR-0002] filtro 4):
   **[D-026]** refresh/revoca (strato refresh rotante + revoca operatore + JWT breve), **[D-027]** rate-limiting
   (infra nuova, §5.5), **[D-029]** anti-enumeration/tempo-costante (lookup per hash, fallimento generico).
   **[D-028]** (RLS su `User`) resta **tracciato** (non è il trigger di questo slice: le nuove tabelle token
   seguono già il pattern "fuori-RLS, accessore unico" di [ADR-0026]; hardenare `User` ora gonfierebbe uno scope
   security già denso senza necessità — motivato, non silenzioso).
5. **App dedicata `apps/web-customer`** (non una sezione di web-staff), coerente con [ADR-0041]: audience e dominio
   di sicurezza diversi → il codice cliente **non viene mai spedito** ai browser dello staff e viceversa
   (blast-radius isolato). Scaffold dal template `web-platform` (PWA manifest+workbox già provati).
6. **[D-037] (401 FE globale) chiuso sul nuovo client**: `web-customer` nasce **con** l'interceptor 401 pulito
   (401 → logout sessione + redirect all'attivazione), e fornisce il pattern riusabile per web-staff (dove D-037
   resta applicabile ma fuori scope di questo slice).
7. **Perimetro funzionale minimo-coerente:** cliente autenticato → **vede i propri abbonamenti** (read-only, il
   contesto necessario per agire) → **segnala/annulla assenze** sui giorni che possiede → **vede l'esito**
   (`resold`). **Niente** booking/rinnovi/pagamenti (gold-plating, YAGNI). La vista abbonamenti non è extra: è il
   contesto minimo perché la release sia usabile e onesta.

## 4. Modello dati & architettura auth

### 4.1 Perché fuori-RLS (coerente con [ADR-0026])

Le tabelle token sono **dato d'identità pre-tenant**, esattamente come `User`/`CredentialSetupToken`
/`PlatformAuditLog`: la richiesta di attivazione **non ha ancora un tenant** quando presenta il token — è il
token stesso a **portare** `establishmentId`. Quindi: **niente policy RLS** su queste tabelle, **accessore unico
applicativo** (`CustomerAuthService`), `establishmentId` **denormalizzato** come sorgente del tenant. Il raw dei
token **non è mai persistito** (solo `sha256`), mirror esatto di `CredentialSetupToken`.

### 4.2 Nuove entità (fuori-RLS)

```prisma
// Enrollment token: nel QR/link consegnato dal lido. ONE-TIME (consumato alla 1ª attivazione).
// Fuori-RLS (dato d'identità pre-tenant, come CredentialSetupToken/ADR-0026). Raw mai persistito.
model CustomerEnrollmentToken {
  id              String    @id @default(uuid()) @db.Uuid
  customerId      String    @db.Uuid              // a chi appartiene l'accesso
  establishmentId String    @db.Uuid              // denorm: SORGENTE DEL TENANT (fuori-RLS)
  tokenHash       String    @unique               // sha256(raw) — raw solo nel link consegnato
  pinHash         String                          // argon2id(PIN) — secondo fattore, mai in chiaro
  pinAttempts     Int       @default(0)           // rate-limit tentativi PIN → lock
  expiresAt       DateTime                         // TTL provisioning (config, es. finestra stagione)
  activatedAt     DateTime?                        // one-time: valorizzato alla 1ª attivazione riuscita
  revokedAt       DateTime?                        // revoca operatore
  createdByUserId String    @db.Uuid              // quale admin ha provisioned (accountability minima)
  createdAt       DateTime  @default(now())

  customer      Customer      @relation(fields: [customerId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])
  @@index([customerId])
  @@index([establishmentId])
}

// Refresh token: emesso all'attivazione (post-PIN), DEVICE-BOUND, ROTANTE, revocabile. Raw solo sul device.
// Realizza D-026 (refresh/revoca). La catena rotatedFromId dà theft-detection (riuso di un token ruotato).
model CustomerSession {
  id                String    @id @default(uuid()) @db.Uuid
  customerId        String    @db.Uuid
  establishmentId   String    @db.Uuid              // denorm: tenant per la rotazione pubblica
  enrollmentTokenId String    @db.Uuid              // da quale attivazione nasce (per revoca a cascata)
  refreshTokenHash  String    @unique               // sha256(raw) — raw solo sul device
  rotatedFromId     String?   @db.Uuid              // catena di rotazione (theft-detection)
  expiresAt         DateTime
  revokedAt         DateTime?
  lastUsedAt        DateTime?
  createdAt         DateTime  @default(now())

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  @@index([customerId])
  @@index([enrollmentTokenId])
}
```

Relazioni inverse su `Customer` (`enrollmentTokens`, `sessions`) e `Establishment`. Helper `token-hash.ts`
(`generateRawToken` = `randomBytes(32).base64url`, `hashToken` = `sha256`) **riusati as-is**.

### 4.3 Access JWT cliente (claim ridotti, scope separato)

Token JWT **distinto** da quello staff (firma con lo stesso `JWT_SECRET`, ma claim e guard separati):
`{ sub: customerId, establishmentId, kind: 'customer' }`, `expiresIn` breve (es. `30m`, nuova env
`CUSTOMER_JWT_EXPIRES_IN`). Il claim `kind: 'customer'` impedisce che un token cliente passi per i `@Roles`
staff e viceversa. `establishmentId` nel claim → `req.tenantId` popolato come per lo staff → `forTenant`/RLS
**invariati a valle**.

## 5. Sicurezza (il vincolo dominante)

### 5.1 Flusso di attivazione (secondo fattore, one-time, device-bound)

`POST /api/customer/activate { enrollmentToken, pin }` (`@Public`, rate-limited):
1. `hashToken(enrollmentToken)` → lookup `CustomerEnrollmentToken` per `tokenHash` (**indice unico, tempo
   costante**). Non trovato / `activatedAt != null` / `revokedAt != null` / `expiresAt < now` → **401 generico**
   (nessuna distinzione → no enumeration, [D-029]).
2. Verifica `pin` vs `pinHash` (`argon2.verify`, tempo costante). Fallito → `pinAttempts++`; oltre soglia (es. 5)
   → `revokedAt = now` (**lock**, richiede ri-provisioning operatore) → **401**.
3. Successo: transazione → `activatedAt = now` (consuma il one-time), crea `CustomerSession` (refresh raw
   generato, salvato hashed), ritorna `{ accessJwt, refreshToken }`. Il refresh raw vive **solo sul device**.

### 5.2 Refresh rotante (D-026) + theft-detection

`POST /api/customer/refresh { refreshToken }` (`@Public`, rate-limited): lookup per hash; se valido → **ruota**
(marca la riga `revokedAt`, crea nuova riga con `rotatedFromId` = precedente), ritorna nuovo `{ accessJwt,
refreshToken }`. **Riuso di un refresh già ruotato** (`revokedAt != null` ma presente in catena) → segnale di
furto → **revoca l'intera catena** della sessione (`enrollmentTokenId`) + 401. JWT breve (30 min) ⇒ finestra di un
access token rubato limitata.

### 5.3 Revoca operatore (D-026)

`POST /api/bookings/:id/customer-access/revoke` (admin-only) → `revokedAt` sull'enrollment del cliente **e** su
tutte le `CustomerSession` collegate → il cliente è disconnesso, i refresh/attivazioni successivi falliscono.
Trigger: fine abbonamento, sospetto leak, ri-emissione.

### 5.4 Ownership rigido (RLS tenant **+** vincolo cliente)

**Punto di correttezza critico** (verificato nel codice): i domain service filtrano solo per **tenant**
(`forTenant`), prendono solo `bookingId` — RLS **non** isola il *cliente dentro il tenant*. Il canale cliente
**deve** aggiungere il vincolo di ownership: la chiamata cliente passa `actingCustomerId` (dal claim JWT) e il
service vincola `findFirst({ where: { id, customerId: actingCustomerId } })` → **404 su mismatch** (stesso codice
di "non trovato" → **nessun leak d'esistenza** di un booking altrui). Difesa-in-profondità: RLS (tenant) + guard
di ownership (cliente).

### 5.5 Rate-limiting (D-027) — infra nuova

`@nestjs/throttler` **non è presente** nel repo → si introduce (dipendenza + `ThrottlerModule`). Applicato agli
endpoint pubblici cliente (`activate`, `refresh`) con limiti stretti per-IP; il lock su `pinAttempts` è la
seconda linea per-token. (Nota: il login staff resta fuori scope qui — è ancora deploy interno; se in futuro si
espone, stesso `ThrottlerModule` copre anche quello.)

### 5.6 Scope minimo dell'access JWT cliente

Il `CustomerJwtGuard` (nuovo, su un `CustomerAuthModule` isolato) accetta **solo** token `kind:'customer'` e
protegge **solo** le rotte `/api/customer/*`. Le rotte staff restano sotto `JwtAuthGuard` esistente. Nessuna
rotta di dominio staff è raggiungibile con un token cliente.

## 6. Endpoint & riuso del domain service

### 6.1 Operatore (web-staff, admin — accoppiato al consenso)

- `POST /api/bookings/:id/customer-access` → (ri)genera enrollment token + PIN per il **`Customer`** della
  booking; ritorna `{ activationUrl, qrPayload, pin }` da consegnare (una volta sola; il raw non è più
  recuperabile). Invalida enrollment/sessioni vive precedenti (rotazione pulita).
- `POST /api/bookings/:id/customer-access/revoke` → §5.3.
- La **Scheda cliente** espone lo **stato accesso** (mai provisioned / attivo / revocato; ultima attivazione),
  senza mai mostrare segreti.

### 6.2 Pubblici (`@Public`, rate-limited, tempo costante)

- `POST /api/customer/activate` — §5.1.
- `POST /api/customer/refresh` — §5.2.
- `POST /api/customer/logout` — revoca la `CustomerSession` corrente (idempotente).

### 6.3 Cliente (access JWT, ownership-scoped)

- `GET /api/customer/me/subscriptions` → i **propri** abbonamenti (`Booking type=subscription` del proprio
  `customerId`): span, fascia, `absenceConsentAt` (per mostrare se il canale è abilitato), giorni liberabili,
  `absenceReleases[]` con `resold` derivato (riusa `CustomerBookingDTO`/projection esistente).
- `POST /api/customer/subscriptions/:bookingId/absence-releases { date, reason? }` → **riusa**
  `bookings.service.releaseAbsence`, esteso con:
  - `ReleaseAbsenceInput.source?: 'operator'|'customer'` (**default `operator`** — retro-compatibile con S1/S2;
    il canale cliente passa `'customer'`; il valore hard-coded a `bookings.service.ts:916` diventa `input.source`).
  - `actingCustomerId` (ownership §5.4).
  - Stesso dispatch errori ADR-0048: `422 NO_CONSENT/BAD_DATE/PAST_DATE/NO_COVERAGE/OPEN_SUSPENSION/NOT_*`,
    `409 ALREADY_RELEASED`.
- `POST /api/customer/subscriptions/:bookingId/absence-releases/:rid/cancel` → **riusa**
  `cancelAbsenceRelease`, con lo stesso `actingCustomerId`. **Decisione di dominio (confermata):** il cliente
  **può** annullare la **propria** release finché il giorno **non è rivenduto** (`409 RESOLD` vincolante,
  identico all'operatore) — simmetrico e coerente col "rinuncia all'uso, non al diritto".

> **Riuso senza duplicazione:** nessuna logica di carve/coverage/rimborso è riscritta nel canale cliente. Si
> estendono i **due** metodi domain esistenti con `source` + ownership; il resto (transazione tenant-scoped,
> carve giorno-singolo, dispatch errori, `resold`) è invariato. Questo è il "meno pigro / zero-debito": un solo
> punto di verità sul dominio, il canale cliente è un **adattatore d'ingresso** (auth + ownership + source).

## 7. Macchina a stati dell'accesso (per `flows.md`, [ADR-0009])

```
(nessun accesso) --provision(admin)--> ENROLLMENT_EMESSO
ENROLLMENT_EMESSO --activate(token+pin ok)--> ATTIVO(sessione device-bound)
ENROLLMENT_EMESSO --pin errato ×N--> LOCKED --provision--> ENROLLMENT_EMESSO
ENROLLMENT_EMESSO --expire--> SCADUTO --provision--> ENROLLMENT_EMESSO
ATTIVO --refresh(rotazione)--> ATTIVO
ATTIVO --riuso refresh ruotato (furto)--> REVOCATO(intera catena)
ATTIVO|ENROLLMENT_EMESSO --revoke(admin)--> REVOCATO --provision--> ENROLLMENT_EMESSO
ATTIVO --logout--> (sessione chiusa; re-attivabile solo con nuovo enrollment)
```
La **release** riusa la macchina a stati già documentata in `flows.md §7` (ADR-0048), con `source='customer'`.

## 8. Frontend `apps/web-customer` (S4)

Scaffold dal template `web-platform` ([ADR-0041]): Vite/Vue3/Pinia/vue-router/TanStack Query, **PWA**
(manifest+workbox già configurati altrove, replicati), `@coralyn/ui-kit` + `@coralyn/contracts` condivisi.
Chiave `localStorage` distinta (`coralyn.customer.*`). Viste:

- **Attivazione** — landing aperta dal link QR (token nel path/frag), form PIN → `activate`. Errori generici.
- **I miei abbonamenti** — lista read-only (span, fascia, stato canale assenze), da `GET /me/subscriptions`.
- **Segnala assenza** — modal (riusa la meccanica del mockup `absence-release-modal.html` di S2: preview del
  giorno, conferma) → `POST .../absence-releases`.
- **Storico / esito** — le proprie release con badge `resold` (giorno già rivenduto → non annullabile) o
  annullabile.

Store sessione con **refresh silenzioso** (rotazione trasparente su 401 dell'access JWT) e **interceptor 401
globale** ([D-037]) → redirect all'attivazione. Nessun segreto in log/URL persistiti.

## 9. Contracts (`@coralyn/contracts`)

Nuovi DTO/input: `CustomerActivateInput`/`CustomerAuthResponse` (`{ accessJwt, refreshToken }` — nota: mai
loggati), `CustomerRefreshInput`, `CustomerAccessStatusDTO` (per la Scheda cliente), `CustomerSubscriptionDTO`
(riusa/estende `CustomerBookingDTO`). Estensione **retro-compatibile** di `ReleaseAbsenceInput` con
`source?`/ownership. Nessuna rottura dei DTO S1/S2.

## 10. Testing (non regredire: api unit **232** · api e2e **330** · web-staff **375** · ui-kit **111** · web-platform **16**)

**S3 (fondazione, security-critical):**
- **api unit**: `token-hash` (già coperto), gen/verify PIN (argon2) + lock su `pinAttempts`, risoluzione tenant
  da enrollment token, rotazione refresh + theft-detection (riuso ruotato → revoca catena), `CustomerJwtGuard`
  (accetta solo `kind:'customer'`, rifiuta token staff), guard di ownership.
- **api e2e**: `activate` happy + guardie (token inesistente/riusato/scaduto/revocato → 401 generico; PIN errato
  ×N → lock; rate-limit → 429); `refresh` rotazione + riuso ruotato → 401 + catena revocata; `revoke` operatore →
  sessioni morte; **isolamento cross-customer** (cliente A non vede/non libera booking di B nello stesso tenant →
  404) e **cross-tenant** (token tenant X non tocca dati tenant Y) — **il cuore della sicurezza**.

**S4 (feature + FE):**
- **api e2e**: `POST /customer/.../absence-releases` con `source='customer'` scava il buco come l'operatore
  (mirror dei test S2, ma via canale cliente + ownership); `cancel` cliente con `409 RESOLD`; regressione: gli
  endpoint operatore S1/S2 restano `source='operator'` (default) e verdi.
- **web-customer**: component test delle 4 viste + store sessione (refresh silenzioso, 401 → attivazione).

## 11. Documentazione (DoD [ADR-0009])

- **Nuovo [ADR-0049]** — *Auth cliente provisioned dal lido + tenant-routing pubblico via token opaco*: motiva
  token-vs-account-vs-OTP (sicurezza), i tre strati, il PIN come secondo fattore, il tenant derivato dal token, e
  la risoluzione in-scope di D-026/027/029 (+ perché D-028 resta tracciato). Rubric check.
- `docs/design/data-model.md` — ER: `CustomerEnrollmentToken`, `CustomerSession`, relazioni con `Customer`.
- `docs/design/flows.md` — macchina a stati dell'accesso (§7) + nota `source='customer'` sul flusso release §7.
- `docs/design/mockups/` — schermate `web-customer` (attivazione, abbonamenti, segnala-assenza, storico).
- `deferred.md` — **D-026/D-027/D-029 → «Risolte»** (con riferimento a questo slice/ADR-0049); **D-028** resta
  con nota "valutato in D-035 S3, non-trigger, tracciato"; **D-037** nota "chiuso su web-customer, applicabile
  web-staff"; **D-035** aggiornato (S3+S4 fatte → **modulo chiuso** a fine S4).

## 12. Rubric check ([ADR-0002])

1. **Professionalità** — provisioning-by-controller (simmetria ADR-0028), token opaco a doppio strato con refresh
   rotante e theft-detection, secondo fattore: è l'auth che un team senior difende per un canale pubblico che
   espone PII e un'azione (release→rivendita) a impatto reale.
2. **Convenzioni** — riusa `token-hash.ts`/pattern `CredentialSetupToken`, `@nestjs/jwt`+guard globale, app
   dedicata per audience (ADR-0041), `@nestjs/throttler` standard, RLS/`forTenant` invariati a valle.
3. **Modularità** — `CustomerAuthModule` isolato (accessore unico delle tabelle token), canale cliente =
   adattatore d'ingresso sopra il **domain service unico** (nessuna duplicazione della logica release), FE app
   separata (blast-radius).
4. **Zero debito** — i deferiti di sicurezza attivati dal trigger reale si **risolvono** qui (non ri-deferiti);
   `source='customer'` era già predisposto (nessun retrofit); D-028 tracciato con motivazione; nessuno stato
   duplicato (buco su `BookingCoverage`, storia su `AbsenceRelease`, identità sulle tabelle token). Debito residuo
   (audit attore = D-047; sub-fascia release = ADR-0048 §14) esplicitamente tracciato.

## 13. Rischi & mitigazioni

- **Leak del link+PIN insieme** (es. foto di entrambi inoltrata prima dell'attivazione) → mitigato: PIN separato
  dal link (canale/consegna diversa possibile), one-time consuma alla prima attivazione, revoca operatore, TTL,
  e la release è annullabile finché non rivenduta.
- **Perdita del dispositivo attivato** → l'operatore revoca + ri-provisiona (nuovo enrollment). La sessione
  device-bound del vecchio device è uccisa dalla revoca a catena.
- **Cliente senza smartphone** → l'operatore resta il tramite (S1/S2 invariato, `source='operator'`); il canale
  cliente è **additivo**, non sostitutivo.
- **Complessità auth vs YAGNI** → mitigato dallo split S3/S4 con security-review gate; la fondazione non spedisce
  UX speculativa.

## 14. Esplicitamente fuori scope (deferito, tracciato)

- **Audit dell'attore admin** (chi ha provisioned/revocato l'accesso) oltre `createdByUserId` → **[D-047]**
  (audit tenant completo), coerente con quanto già deferito per consenso/release in ADR-0048.
- **Sub-fascia più fine della release** (liberare solo la mattina di un abbonamento "intera giornata") → già
  deferito ([ADR-0048] §14), invariato.
- **Booking/rinnovi/pagamenti self-service del cliente** → fuori perimetro (YAGNI); eventuale modulo futuro sopra
  questa stessa fondazione auth (additivo).
- **Refresh/revoca e rate-limiting del login STAFF** ([D-026]/[D-027] lato staff) → il `ThrottlerModule` e il
  pattern refresh introdotti qui li rendono additivi, ma lo staff resta deploy interno → non-trigger, tracciato.
- **[D-028]** RLS su `User` → §3.4, tracciato.

---

### Riferimenti

- [ADR-0048] Assenze comunicate — release senza compensazione · [ADR-0046] occupazione a intervalli (coverage)
- [ADR-0028] provisioning tenant (fornitore+inviti) · [ADR-0026] identità/RLS `User` · [ADR-0024] strategia auth
- [ADR-0042] trasporto email & consegna credenziali (token opaco) · [ADR-0041] app FE dedicata · [ADR-0010]
  isolamento multi-tenant (RLS) · [ADR-0002] rubric · [ADR-0009] design docs
- Spec S1/S2: `2026-07-09-assenze-comunicate-release-operatore-design.md`
- Deferiti risolti/toccati: [D-026] [D-027] [D-028] [D-029] [D-037] · Tracciati: [D-047]

[ADR-0002]: ../../architecture/decisions/0002-decision-rubric.md
[ADR-0009]: ../../architecture/decisions/0009-documentazione-di-design.md
[ADR-0010]: ../../architecture/decisions/0010-isolamento-multi-tenant.md
[ADR-0024]: ../../architecture/decisions/0024-strategia-auth.md
[ADR-0026]: ../../architecture/decisions/0026-identita-rls-utente.md
[ADR-0028]: ../../architecture/decisions/0028-provisioning-tenant.md
[ADR-0041]: ../../architecture/decisions/0041-app-frontend-dedicata-platform.md
[ADR-0042]: ../../architecture/decisions/0042-trasporto-email-e-consegna-credenziali.md
[ADR-0046]: ../../architecture/decisions/0046-occupazione-a-intervalli-coverage.md
[ADR-0048]: ../../architecture/decisions/0048-assenze-comunicate-release-occupazione.md
[D-026]: ../../architecture/deferred.md
[D-027]: ../../architecture/deferred.md
[D-028]: ../../architecture/deferred.md
[D-029]: ../../architecture/deferred.md
[D-037]: ../../architecture/deferred.md
[D-047]: ../../architecture/deferred.md
