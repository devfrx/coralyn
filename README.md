# Coralyn — Gestionale Lidi Balneari

> **Coralyn** è il brand del progetto (scope dei package `@coralyn/*`, identificatori
> infra `coralyn_*`). Il nome definitivo è stato adottato con
> [ADR-0029](docs/architecture/decisions/0029-brand-coralyn.md), che risolve la decisione
> rimandata D-017; in precedenza il repo usava il *codename* provvisorio **Driftly**.

Gestionale **SaaS** per la gestione di **lidi balneari** (stabilimenti balneari):
mappa ombrelloni, prenotazioni e abbonamenti, cassa, e — in prospettiva — booking
online per il cliente finale.

Stato: **design del Core MVP completato e approvato**. **Backend** — Core Foundation
(Piano 1), Incremento 1 (scheda cliente), **modulo identità & auth** (login JWT,
`JwtAuthGuard` globale, RLS Utente) e **modulo mappa** (modello + lettura) implementati:
API `/api/customers` (CRUD), `/api/auth` (login/me) e `/api/map` (lettura della struttura
ombrelloni per data) con isolamento multi-tenant RLS e migrazioni Prisma. Le 5 entità mappa
(`Settore`/`Fila`/`Ombrellone`/`Tipologia`/`Fascia`) sono tenant-scoped con RLS e una struttura
demo seedata. **Frontend** — redesign **Coralyn** completato e integrato (app-shell, ui-kit,
tutte le viste); **login reale end-to-end** (`LoginView` → `/api/auth/login`, token Bearer
persistito, reidratazione via `/me`, logout), scheda cliente e **`MappaView`** sul backend reale
(sganciata dal mock MSW). Il provisioning è **fornitore + inviti**
([ADR-0028](docs/architecture/decisions/0028-provisioning-tenant.md)):
la pagina `/registrazione` è informativa ("attivazione su invito"), non self-service.
Containerizzazione locale via Docker Compose.
Prossimo passo: **prenotazioni** (che accenderanno gli `statoPerFascia` reali sulla mappa —
oggi tutto `libero`) e **gestione utenti staff** ([D-025](docs/architecture/deferred.md)).

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
