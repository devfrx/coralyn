# Architettura — vista d'insieme (documento vivo)

> Questo documento è **vivo**: va aggiornato a ogni decisione rilevante. Descrive
> *cosa* è il sistema e *com'è strutturato*; per il *perché* delle singole scelte
> rimanda agli [ADR](decisions/).

## Cos'è il prodotto

Gestionale **SaaS multi-cliente** per **lidi balneari** (stabilimenti balneari),
destinato alla vendita in abbonamento a più stabilimenti.

## Principi guida

- Tutte le decisioni passano per la [decision rubric](decisions/0002-decision-rubric.md):
  professionalità, convenzioni, modularità, zero debito.
- Decisioni tracciate come [ADR](decisions/); cambi di rotta via *supersede*, mai
  cancellazione.
- Debito solo se consapevole e registrato in [deferred.md](deferred.md).
- Linguaggio: codice EN, dominio IT, docs IT ([ADR-0003](decisions/0003-language-convention.md)).

## Stile architetturale ([ADR-0007](decisions/0007-stile-architetturale.md))

- **Monolite modulare**: un solo backend deployabile, moduli a bounded context.
- **API-first (REST)**: un'unica API serve l'app staff e (in futuro) il booking online.
- **Multi-tenant-aware** dal modello dati: ogni entità porta `stabilimento_id`;
  isolamento shared-schema + RLS ([ADR-0010](decisions/0010-isolamento-multi-tenant.md)).
- **IA come servizio separato** (futuro), consumato via API dal core.

## Stack e layout ([ADR-0008](decisions/0008-stack-e-layout.md))

- **Frontend**: Vue 3 + TypeScript + Vite + Pinia → web app + PWA ([ADR-0004](decisions/0004-form-factor-e-delivery.md)).
- **Backend**: NestJS (Node + TS).
- **DB**: PostgreSQL · **ORM**: Prisma · **API**: REST + OpenAPI.
- **Monorepo** (pnpm workspaces):
  - `apps/` → `api` (NestJS), `web-staff` (Vue), in futuro `web-booking`.
  - `packages/` → `contracts` (tipi/DTO condivisi FE/BE), comuni futuri.

## Moduli del prodotto (roadmap)

1. **Core operativo** *(MVP, in progettazione)* — Clienti, Listino/Tariffe, mappa
   Ombrelloni, Prenotazioni e Abbonamenti. Vedi
   [spec](../specs/2026-06-27-core-operativo-design.md).
2. **Cassa e pagamenti** — incassi, ricevute, chiusura giornaliera.
3. **Multi-tenancy & account** — signup stabilimenti, isolamento, ruoli, billing
   ([D-002](deferred.md)).
4. **Booking online clienti** — portale lato bagnante, riusa l'API del Core.
5. **Reportistica & extra** — statistiche, bar/ristorante, personale.

## Moduli del Core (backend NestJS)

- `mappa` — Settore, Fila, Ombrellone; **setup strutturato** ([ADR-0005](decisions/0005-modello-mappa.md), [ADR-0014](decisions/0014-setup-mappa-strutturato.md)).
- `catalogo` — Pacchetto, Stagione, **Fascia**, Listino, Tariffa + **pricing engine**
  (dimensione fascia, [ADR-0013](decisions/0013-granularita-disponibilita-a-slot.md)).
- `clienti` — anagrafica Cliente.
- `prenotazioni` — Prenotazione, disponibilità **per slot** (anti-overlap), lista
  d'attesa minima, incasso base ([ADR-0011](decisions/0011-incasso-base-nel-core.md)),
  rinnovo abbonamenti e storico ([ADR-0012](decisions/0012-gestione-abbonamenti.md)).
- `identita` — utenti staff + **superuser di piattaforma** + contesto tenant
  ([ADR-0015](decisions/0015-osservabilita-e-console-superuser.md)); RBAC granulare
  tenant → modulo 3.
- `audit` — logging strutturato, audit log e console superuser
  ([ADR-0015](decisions/0015-osservabilita-e-console-superuser.md)).
- `core` — contesto tenant, basi condivise.

Dominio prenotazioni e pricing: [ADR-0006](decisions/0006-dominio-prenotazioni-e-pricing.md).

## Modello dati

Diagramma ER e invarianti: [docs/design/data-model.md](../design/data-model.md).
Flussi principali: [docs/design/flows.md](../design/flows.md).
Termini di dominio: [glossario](glossary.md).

## Documentazione di design ([ADR-0009](decisions/0009-documentazione-di-design.md))

Diagrammi in Mermaid e mockup in [docs/design/](../design/), versionati e tenuti
aggiornati.

## Indice degli ADR

- [ADR-0001](decisions/0001-use-adrs.md) — Adottare gli ADR
- [ADR-0002](decisions/0002-decision-rubric.md) — Decision rubric (i quattro filtri)
- [ADR-0003](decisions/0003-language-convention.md) — Convenzione linguistica
- [ADR-0004](decisions/0004-form-factor-e-delivery.md) — Form factor e delivery (web + PWA)
- [ADR-0005](decisions/0005-modello-mappa.md) — Modello della mappa (settori/file)
- [ADR-0006](decisions/0006-dominio-prenotazioni-e-pricing.md) — Prenotazioni, unità e pricing
- [ADR-0007](decisions/0007-stile-architetturale.md) — Stile architetturale
- [ADR-0008](decisions/0008-stack-e-layout.md) — Stack e layout (monorepo)
- [ADR-0009](decisions/0009-documentazione-di-design.md) — Documentazione di design
- [ADR-0010](decisions/0010-isolamento-multi-tenant.md) — Isolamento multi-tenant (shared schema + RLS)
- [ADR-0011](decisions/0011-incasso-base-nel-core.md) — Registrazione incasso base nel Core
- [ADR-0012](decisions/0012-gestione-abbonamenti.md) — Gestione abbonamenti (rinnovo + storico)
- [ADR-0013](decisions/0013-granularita-disponibilita-a-slot.md) — Granularità disponibilità a slot
- [ADR-0014](decisions/0014-setup-mappa-strutturato.md) — Setup mappa strutturato per form
- [ADR-0015](decisions/0015-osservabilita-e-console-superuser.md) — Osservabilità e console superuser
