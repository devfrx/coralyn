# Driftly — Gestionale Lidi Balneari

> **Driftly** è il *codename* provvisorio del progetto (etichetta interna per repo e
> package `@driftly/*`). Il brand pubblico e il dominio sono una decisione rimandata
> ([D-017](docs/architecture/deferred.md)).

Gestionale **SaaS** per la gestione di **lidi balneari** (stabilimenti balneari):
mappa ombrelloni, prenotazioni e abbonamenti, cassa, e — in prospettiva — booking
online per il cliente finale.

Stato: **design del Core MVP completato e approvato**. **Backend** — Core Foundation
(Piano 1), Incremento 1 (scheda cliente) e **modulo identità & auth** (login JWT,
`JwtAuthGuard` globale, RLS Utente) implementati: API `/api/clienti` (CRUD) e
`/api/auth` (login/me) con isolamento multi-tenant RLS e migrazioni Prisma.
**Frontend** — redesign **Coralyn** completato e integrato (app-shell, ui-kit, tutte
le viste); **login reale end-to-end** (`LoginView` → `/api/auth/login`, token Bearer
persistito, reidratazione via `/me`, logout) e scheda cliente sul backend reale. Il
provisioning è **fornitore + inviti** ([ADR-0028](docs/architecture/decisions/0028-provisioning-tenant.md)):
la pagina `/registrazione` è informativa ("attivazione su invito"), non self-service.
Containerizzazione locale via Docker Compose.
Prossimo passo: endpoint reali della **mappa** e **gestione utenti staff** ([D-025](docs/architecture/deferred.md)).

## Documentazione

- [Architettura (vista d'insieme)](docs/architecture/README.md)
- [Decisioni architetturali (ADR)](docs/architecture/decisions/)
- [Decisioni rimandate](docs/architecture/deferred.md)
- [Glossario del dominio](docs/architecture/glossary.md)
- [Spec di progettazione](docs/specs/)
- [Design (modello dati, flussi, mockup)](docs/design/)
- [Piani di implementazione](docs/plans/)
- [Handoff di sessione](docs/handoff/)

## Come lavoriamo

Ogni decisione rilevante è tracciata come ADR e pesata secondo la
[decision rubric](docs/architecture/decisions/0002-decision-rubric.md):
professionalità, convenzioni, modularità, zero debito.
