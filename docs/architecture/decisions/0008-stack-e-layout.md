# ADR-0008: Stack tecnologico e layout del progetto

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0004](0004-form-factor-e-delivery.md), [ADR-0007](0007-stile-architetturale.md)
- **Risolve:** [D-001](../deferred.md) (scelta dello stack)

## Context

Definito lo scope del Core, possiamo fissare le tecnologie. Vincoli emersi:
frontend responsive + PWA ([ADR-0004](0004-form-factor-e-delivery.md)), stile
API-first multi-tenant ([ADR-0007](0007-stile-architetturale.md)), e l'expertise
dello sviluppatore in **Vue 3 + TypeScript**. Si vuole minimizzare il drift del
contratto FE/BE e tenere aperta l'IA futura.

## Decision

**Tecnologie**
- **Frontend:** Vue 3 + TypeScript + Vite + Pinia, distribuito come web app + PWA.
- **Backend:** NestJS (Node + TypeScript).
- **Database:** PostgreSQL.
- **ORM:** Prisma (type-safe, buona DX).
- **API:** REST, con specifica **OpenAPI** generata dal backend.

**Layout — monorepo**
- `apps/` → `api` (NestJS), `web-staff` (Vue), in futuro `web-booking`.
- `packages/` → `contracts` (tipi/DTO **condivisi** FE/BE), più pacchetti comuni
  futuri (es. ui-kit).
- Gestione con **pnpm workspaces**. Ogni app si **builda e si deploya in modo
  indipendente**.

## Consequences

### Positive
- **Un solo linguaggio** (TS) su tutto lo stack; tipi condivisi → **zero drift** del
  contratto, refactor cross-boundary sicuri.
- Riusa l'expertise Vue+TS (curva quasi nulla sul frontend).
- Pronto al **multi-frontend** (staff + booking) sullo stesso contratto.
- Moduli NestJS ↔ bounded context ([ADR-0007](0007-stile-architetturale.md)).

### Negative / Trade-off
- **NestJS è nuovo per lo sviluppatore**: curva di apprendimento (circoscritta;
  concetti — moduli, DI — familiari da Vue+TS).
- Tooling del monorepo (workspaces, orchestrazione build/CI) da configurare bene.

## Alternatives considered

- **Due repo + OpenAPI codegen** — valutata e scartata: più overhead e PR coordinate;
  il monorepo dà gli stessi benefici (separazione FE/BE, deploy indipendenti) con
  meno attrito.
- **React** sul frontend — scartata: fuori dalla convenzione/expertise dello
  sviluppatore (Vue), nessun vantaggio che giustifichi la curva.
- **Backend in Python (FastAPI)** — scartata per il core: perderebbe i tipi
  condivisi; l'IA si integra meglio come **servizio separato**
  ([ADR-0007](0007-stile-architetturale.md)).
- **TypeORM / MikroORM** — non scelti: Prisma offre migliore type-safety/DX per
  l'MVP (rivedibile se emergono limiti su query complesse).

## Rubric check

1. **Professionalità** — stack moderno e ampiamente adottato per SaaS TS full-stack.
2. **Convenzioni** — TS end-to-end, monorepo con contratti condivisi, OpenAPI: tutte
   convenzioni consolidate; allineato all'expertise di chi costruisce.
3. **Modularità** — `apps/` + `packages/` separa nettamente le unità mantenendo un
   contratto unico; deploy indipendenti.
4. **Zero debito** — i tipi condivisi eliminano il drift (debito tipico del
   polyrepo); la scelta ORM è rivedibile e dichiarata tale.
