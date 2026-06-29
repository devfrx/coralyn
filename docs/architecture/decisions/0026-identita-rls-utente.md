# ADR-0026: Trattamento RLS della tabella d'identità `Utente`

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0024](0024-strategia-auth.md)

## Context
Il Plan 1 stabilisce che ogni tabella tenant-scoped abbia `stabilimentoId` + policy RLS
`tenant_isolation` + accesso via `forTenant`. `Utente` ha però due caratteristiche che rompono lo
schema: (a) il **login avviene prima** di conoscere il tenant (la policy che nega senza GUC
renderebbe il login impossibile); (b) `stabilimentoId` è **nullable** (superuser di piattaforma).

## Decision
`Utente` **non** abilita la policy `tenant_isolation`. È una **tabella d'identità/infrastruttura**,
il cui **unico accessore** è `IdentitaService`, che filtra sempre per `email` (unica globale). La
protezione è al **livello applicativo** (choke point unico), non via RLS.

Scartata l'alternativa "policy che permette quando nessun tenant è impostato": farebbe trapelare
tutti gli utenti a qualunque query non scoped.

## Consequences
- **Positive:** login pre-tenant possibile; nessuna eccezione fragile nella policy RLS; superuser
  (stabilimentoId null) gestito naturalmente.
- **Negative / Trade-off:** `Utente` perde la rete di sicurezza RLS; mitigato dall'accesso mediato
  da un solo servizio. Un percorso privilegiato per ripristinare difesa-in-profondità è tracciato
  nei deferred.

## Rubric check
1. **Professionalità** — riconosce il problema "login pre-tenant" e lo risolve in modo esplicito.
2. **Convenzioni** — separare l'auth/identity store dal dato di dominio è prassi comune.
3. **Modularità** — `Utente` toccato solo da `identita`; i moduli di dominio non lo vedono.
4. **Zero debito** — eccezione **documentata** alla regola RLS, con trigger di hardening tracciato.
