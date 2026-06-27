# ADR-0015: Osservabilità — logging strutturato, audit log e console superuser

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0007](0007-stile-architetturale.md), [ADR-0010](0010-isolamento-multi-tenant.md), [D-002](../deferred.md), [D-016](../deferred.md)

## Context

L'operatore della piattaforma (il **superuser** — chi vende e mantiene il SaaS) deve
poter consultare eventi e diagnosticare problemi **direttamente nel software**, anche
per supportare i primi clienti. Serve definire ambito e sicurezza, distinguendo i log
*tecnici* dall'audit di *dominio* ed evitando di esporre dati sensibili.

## Decision

Tre livelli:

- **Baseline (prassi, non una feature):** logging **strutturato** nel backend (pino +
  NestJS, con request/correlation id) e integrazione **error tracking** (es. Sentry).
- **Audit log:** entità **`AuditLog`** persistita con gli eventi di dominio
  (chi/cosa/quando, taggati per tenant): create/update/delete di prenotazioni,
  abbonamenti, listino, login, ecc.
- **Console superuser** in-app: vista **sola lettura** per sfogliare audit log ed
  errori recenti, **cross-tenant**, con eventi **strutturati e sanificati** (nessun
  segreto/PII grezzo, nessuno stack raw a ruoli non-super).

Inoltre:
- **Ruolo "superuser di piattaforma":** nuovo ruolo **sopra i tenant**, distinto dai
  ruoli tenant (admin/staff) e **messo in sicurezza** (l'accesso cross-tenant è una
  superficie sensibile). Il RBAC completo dei tenant resta rimandato ([D-002](../deferred.md)).
- **Streaming live di log tecnici grezzi** in-app → rimandato ([D-016](../deferred.md)):
  più rischioso (PII/sicurezza) e costoso.

## Consequences

### Positive
- Osservabilità e capacità di supporto fin dall'MVP; accountability via audit log.
- Logging strutturato abilita error tracking e futura analisi.

### Negative / Trade-off
- Introduce un **ruolo cross-tenant** da proteggere con cura (autorizzazione, audit
  degli accessi superuser).
- L'audit log aggiunge scritture e volume dati (gestibile; eventualmente con retention).

## Alternatives considered

- **Solo logging backend, senza console** — scartata: non soddisfa la richiesta di
  consultazione *nel software*.
- **Console con log tecnici live** — scartata per l'MVP: rischio PII/sicurezza e costo;
  rimandata a [D-016](../deferred.md).

## Rubric check

1. **Professionalità** — logging strutturato + error tracking + audit sono prassi senior;
   la sanificazione e il ruolo dedicato sono scelte di sicurezza corrette.
2. **Convenzioni** — pino/Sentry/audit log sono standard del settore.
3. **Modularità** — un modulo `audit`/osservabilità isolato; il superuser è un ruolo a
   parte, non intreccia i ruoli tenant.
4. **Zero debito** — niente esposizione rischiosa di log grezzi ora; il live è tracciato
   ([D-016](../deferred.md)); il ruolo cross-tenant è esplicito e circoscritto.
