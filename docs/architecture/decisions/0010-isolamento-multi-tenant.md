# ADR-0010: Strategia di isolamento multi-tenant

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0007](0007-stile-architetturale.md), [ADR-0008](0008-stack-e-layout.md), [D-002](../deferred.md), [D-010](../deferred.md)

## Context

Il prodotto sarà venduto a più stabilimenti. ADR-0007 fissa che il modello dati è
tenant-aware (`stabilimento_id`), ma non *come* i tenant sono isolati a livello di
database e *quanto* costa mantenerli. I lidi sono molti tenant piccoli/medi; conta la
semplicità operativa (migrazioni, backup, onboarding) senza rinunciare alla sicurezza
dell'isolamento.

## Decision

**Shared database, shared schema** con **tenancy a livello di riga**:

- Ogni tabella di business ha `stabilimento_id`. Nessuna duplicazione di schema o DB.
- **Enforcement a due livelli (difesa in profondità):**
  1. **Applicativo**: un guard/interceptor NestJS risolve il tenant dalla richiesta e
     un middleware Prisma inietta `stabilimento_id` su ogni query.
  2. **Database**: **Row-Level Security (RLS)** di PostgreSQL come rete di sicurezza —
     anche con un filtro applicativo dimenticato, il DB non restituisce righe di altri
     tenant. Il contesto tenant si imposta per richiesta (`SET LOCAL` della variabile
     di sessione, dentro transazione).
- **Onboarding** di un nuovo lido: inserimento di uno `Stabilimento` + un `Utente`
  admin. Nessun provisioning di schema/DB.
- **Escape hatch (ibrido pool + silo):** poiché l'app filtra *sempre* per tenant, un
  singolo tenant grande potrà essere promosso a un database dedicato senza modifiche al
  codice ([D-010](../deferred.md)).

L'infrastruttura SaaS completa (signup self-service, billing, hardening avanzato)
resta al modulo 3 ([D-002](../deferred.md)).

## Consequences

### Positive
- **Manutenzione minima**: una sola migrazione e un solo backup per tutti i tenant.
- Onboarding immediato; ottimo per molti tenant piccoli/medi.
- Isolamento sicuro grazie alla RLS, oltre allo scoping applicativo.
- Nessun lock-in: percorso ibrido verso il silo per casi futuri.

### Negative / Trade-off
- Isolamento **logico**, non fisico (mitigato dalla RLS).
- Possibile "noisy neighbor" sotto carico elevato (gestibile con indici/limiti; per
  casi estremi vale l'escape hatch).
- **RLS + Prisma** richiede di impostare il contesto tenant per richiesta: pattern
  noto ma da **validare in fase di piano** (vedi rischi nello spec del Core).
- Export/restore del singolo tenant via dump filtrato per `stabilimento_id` (non
  nativo come nel DB-per-tenant).

## Alternatives considered

- **Schema-per-tenant** — scartata: migrazioni e tooling da ripetere su N schemi; ops
  che cresce col numero di clienti, senza benefici necessari ora.
- **Database-per-tenant** — scartata per l'MVP: isolamento fisico massimo ma ops/costi
  alti; sensata solo per pochi tenant grandi o compliance stringente → tenuta come
  escape hatch ([D-010](../deferred.md)).

## Rubric check

1. **Professionalità** — standard de facto per SaaS B2B multi-tenant a molti tenant.
2. **Convenzioni** — row-level tenancy + RLS è il pattern canonico su PostgreSQL.
3. **Modularità** — enforcement centralizzato (guard + middleware), non sparso nel codice.
4. **Zero debito** — una migrazione/backup per tutti; nessun lock-in (escape hatch
   tracciato in [D-010](../deferred.md)); l'unico punto da validare (RLS+Prisma) è
   dichiarato esplicitamente.
