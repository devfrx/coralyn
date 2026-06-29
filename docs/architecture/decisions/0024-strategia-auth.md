# ADR-0024: Strategia di autenticazione (JWT stateless + guard)

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0015](0015-osservabilita-e-console-superuser.md), [0025](0025-hashing-password.md), [0026](0026-identita-rls-utente.md)

## Context
Il Core deve autenticare lo staff e ricavare il tenant (e il ruolo) per ogni richiesta,
sostituendo l'header provvisorio `X-Stabilimento-Id` del Plan 1 senza toccare i moduli di dominio.

## Decision
- **JWT stateless** (niente sessione server), un solo **access token** a vita breve
  (`JWT_EXPIRES_IN`, default `8h`); claim: `sub` (id utente), `stabilimentoId` (null = superuser),
  `ruolo`. Firma HS256 con `JWT_SECRET` da ambiente.
- Libreria **`@nestjs/jwt`** + **`JwtAuthGuard` custom** registrata come `APP_GUARD` globale
  (no passport: meno dipendenze, controllo diretto su `req.tenantId`). Decoratore `@Public()`
  per `POST /api/auth/login` e `/health`.
- La guard popola `req.user` e `req.tenantId = stabilimentoId ?? undefined`: `TenantContext` e
  `forTenant` restano invariati. Login → 401 generico su credenziali errate (no user-enumeration).

## Consequences
- **Positive:** auth conforme alle convenzioni NestJS; sostituzione trasparente del middleware;
  superficie minima.
- **Negative / Trade-off:** un access token stateless non è revocabile prima della scadenza;
  refresh/revoca e rate-limiting sono rimandati (vedi deferred).

## Alternatives considered
- **Sessioni server + cookie:** scartata (stato server, meno adatta ad API-first/PWA).
- **passport-jwt:** valida ma aggiunge dipendenze e indirezione non necessarie per il nostro caso.

## Rubric check
1. **Professionalità** — JWT stateless + guard globale è prassi senior per API-first.
2. **Convenzioni** — `@nestjs/jwt`, `APP_GUARD`, `@Public()` sono pattern NestJS standard.
3. **Modularità** — modulo `identita` isolato; `TenantContext`/dominio invariati.
4. **Zero debito** — i limiti (revoca, rate-limit) sono tracciati nei deferred, non silenziosi.
