# ADR-0042: Trasporto email e consegna credenziali (link set-password)

- **Status:** Accepted
- **Data:** 2026-07-05
- **ADR correlati:** [0024](0024-strategia-auth.md), [0025](0025-hashing-password.md), [0026](0026-identita-rls-utente.md), [0028](0028-provisioning-tenant.md), [0015](0015-osservabilita-e-console-superuser.md)
- **Spec:** [2026-07-05-credential-invite-email-design.md](../../superpowers/specs/2026-07-05-credential-invite-email-design.md)

## Context

Finora la consegna delle credenziali del primo admin di un lido avveniva con una **password
temporanea mostrata una volta** nella Platform Console: una password in chiaro esisteva
comunque, e transitava per la UI del distributore prima di raggiungere il titolare del lido.
Non esisteva alcun trasporto email nel sistema. Serviva un meccanismo **unico** che coprisse tre
casi — provisioning di un nuovo lido, reset della password di un admin, e (in futuro) l'invito
dello staff — senza che una password in chiaro debba mai esistere o viaggiare.

## Decision

**1. Trasporto.** Una porta astratta `MailerService`, con adapter SMTP `SmtpMailerService`
(nodemailer) configurato via env (`MAIL_HOST`/`MAIL_PORT`/`MAIL_SECURE`/`MAIL_USER`/`MAIL_PASS`/
`MAIL_FROM`). In dev/test il "catcher" è **Mailpit** (SMTP su `1025`, UI di ispezione su
`8025`): l'adapter resta provider-agnostico, uno swap a Postmark/SES/altro SMTP reale in
produzione è **solo configurazione**, nessun codice da toccare. L'invio è **best-effort**:
si applica la sequenza persist-then-send — l'operazione di dominio (creazione lido, reset
password) si committa comunque, l'email è un side-effect che logga un **WARN** in caso di
fallimento; il recupero resta possibile tramite il flusso di reset-admin-password. Nessuna
`500` deve mai scaturire da un invio che segue una scrittura già avvenuta.

**2. Consegna delle credenziali.** Il link contiene un **token opaco a 256 bit**; in DB si
persiste solo `sha256(raw)`, mai il valore grezzo. Il record porta `expiresAt` (TTL
configurabile, default 72h) e `consumedAt` (uso singolo, claim atomico e race-safe in scrittura
per evitare doppio consumo concorrente). Un solo token è vivo per utente alla volta: l'emissione
di uno nuovo invalida i precedenti. Il modello `CredentialSetupToken` è, come `User` e
`PlatformAuditLog`, **fuori RLS**: non appartiene a un tenant, appartiene al livello identità.

**3. Redeem.** Una pagina pubblica `/imposta-password` in `web-staff` (fuori dalla guardia di
autenticazione) invoca gli endpoint pubblici `GET`/`POST /auth/credential-setup`. Dopo
l'impostazione della password l'utente viene **reindirizzato al login** — non si fa auto-login:
si impone di riautenticarsi con la password appena scelta, a dimostrazione che funziona. In
nessun punto del flusso una password in chiaro esiste su un canale diverso dalla testa
dell'utente che la digita: il distributore non vede mai la credenziale del lido.

## Alternatives considered

- **Provider SDK dedicato (Postmark/SES) fin da subito** — introduce vendor-lock e test più
  complessi (mock del SDK, non solo del trasporto SMTP), prematuro per un MVP a singolo
  distributore. La porta `MailerService` rende lo swap un cambio additivo quando servirà.
  Scartata per ora.
- **Token JWT firmato + blocklist di revoca** — per garantire il **monouso** serve comunque
  stato lato server (la blocklist), quindi si paga il costo dello stato senza guadagnare il
  vantaggio "stateless" del JWT, e in più un JWT non è revocabile prima della scadenza senza
  quello stesso stato. Il token opaco hashato in tabella dedicata è più semplice e altrettanto
  sicuro. Scartata.
- **Auto-login dopo il set-password invece del redirect a `/login`** — amplia la superficie
  d'uso del token (diventerebbe anche un meccanismo di sessione) e accoppia la pagina pubblica
  alla gestione della sessione autenticata. Il redirect-then-authenticate è più pulito
  architetturalmente e verifica esplicitamente che la nuova password sia valida. Scartata.
- **Password in chiaro nell'email** — violerebbe la minimizzazione che questo stesso ADR esiste
  per garantire: farebbe esistere e viaggiare una credenziale in chiaro su un canale (la casella
  di posta) fuori dal controllo applicativo. Scartata categoricamente.

## Consequences

### Positive

- Un solo meccanismo **DRY** copre provisioning, reset-admin e (in futuro) invito staff, invece
  di tre percorsi paralleli.
- **Zero password in chiaro** in nessun momento del flusso, in nessun canale.
- Il trasporto è **provider-swappable** senza toccare il dominio applicativo.
- Il reset-password di un admin, prima assente, è ora possibile dalla Platform Console: chiude
  un buco operativo reale.

### Negative / Trade-off

- Introduce un **sottosistema email** da gestire: Mailpit in dev/test, un provider SMTP reale in
  produzione, con relativa configurazione e superficie di failure aggiuntiva.
- Un nuovo modello (`CredentialSetupToken`) da manutenere (scadenze, pulizia, invarianti di
  unicità).
- La **deliverability** dell'invito non è ancora visibile in console: un fallimento sistematico
  di invio si vede solo nei log server, non come segnale nella UI (tracciato in
  [D-046](../deferred.md)).
- **Rate-limiting** e **timing** sugli endpoint pubblici di `credential-setup` restano deferiti
  ([D-027](../deferred.md), [D-029](../deferred.md)); mitigati dal fatto che il token è a 256 bit
  hashato e non enumerabile in pratica.

## Rubric check

1. **Professionalità** — token opaco hashato monouso per un flusso set-password è un pattern
   standard e collaudato (lo stesso schema usato da reset-password di provider consolidati);
   nascondere il trasporto SMTP dietro una porta è la scelta portabile, non over-engineering.
2. **Convenzioni** — riusa `@Public`, `ConfigService`, il `PasswordHasher` esistente
   ([ADR-0025](0025-hashing-password.md)) e il pattern "fuori RLS" già stabilito per `User`
   ([ADR-0026](0026-identita-rls-utente.md)); nodemailer + Mailpit sono strumenti standard di
   settore per SMTP in sviluppo.
3. **Modularità** — `MailerService` è una porta con un solo adapter oggi, sostituibile; la
   logica token vive in un service dedicato; la pagina pubblica è isolata dalla guardia di auth;
   gli endpoint sono app-agnostici (servono sia `web-staff` sia scenari futuri).
4. **Zero debito** — questo meccanismo **sostituisce**, non affianca, lo show-once della password
   temporanea, e chiude il buco del reset-admin che prima non esisteva affatto. I residui
   (visibilità deliverability, rate-limiting) sono esplicitamente tracciati in deferred.md, non
   silenziosi.
