# ADR-0040: Lettura aggregata cross-tenant via loop `forTenant` (Platform Console)

- **Status:** Accepted
- **Data:** 2026-07-05
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0015](0015-osservabilita-e-console-superuser.md), [0026](0026-identita-rls-utente.md), [0028](0028-provisioning-tenant.md)
- **Spec:** [2026-07-05-platform-console-superuser-design.md](../../superpowers/specs/2026-07-05-platform-console-superuser-design.md)

## Context

La Platform Console del distributore (ruolo `superuser`, [ADR-0015](0015-osservabilita-e-console-superuser.md))
deve mostrare **metriche aggregate per lido** (occupazione, incasso stagione, n° ombrelloni,
abbonamenti attivi…). Questi dati vivono nelle tabelle di business, che sono **RLS FORCE**
([ADR-0010](0010-isolamento-multi-tenant.md)): ogni lettura richiede la GUC `app.current_tenant`
impostata dentro `prisma.forTenant`. Una panoramica cross-tenant, per natura, spazia su **tutti** i
tenant — in tensione con una RLS pensata per servire *un* tenant per richiesta.

Serve decidere **come** ottenere aggregati cross-tenant senza aprire falle nell'isolamento e senza
esporre PII dei bagnanti (la console ha una **parete rigida**: solo aggregati).

Nota abilitante: `Establishment` e `User` sono **fuori** RLS ([ADR-0026](0026-identita-rls-utente.md)),
quindi *elencare* i lidi e *crearli* è già una query libera; il problema riguarda **solo** gli aggregati.

## Decision

Gli aggregati cross-tenant si ottengono **iterando gli `Establishment`** ed eseguendo, per ciascuno,
query aggregate (`count`/`aggregate`) **dentro `prisma.forTenant(id, tx => …)`**, componendo il DTO
lato applicativo. Nessun bypass della RLS.

Proprietà:
- **Riuso del primitivo d'isolamento** già in uso e audit-ato (`PrismaService.forTenant`), lo stesso
  di `reports/`. Nessuna nuova superficie DB privilegiata.
- **PII-safe per costruzione:** le query selezionano solo `count`/`sum`/timestamp; nessuna colonna PII
  può entrare nel `PlatformEstablishmentDTO`.
- **Costo O(N) transazioni leggere** — accettabile a decine/centinaia di lidi per una pagina admin
  non-hot.

## Consequences

### Positive
- Isolamento preservato al 100%: ogni lettura resta scoped da RLS, difesa in profondità intatta.
- Zero nuova superficie di sicurezza da blindare; nessun ruolo `BYPASSRLS`.
- Evolvibile senza cambiare il contratto: si può passare a una vista materializzata mantenendo lo
  **stesso DTO** (tracciato [D-043](../deferred.md)).

### Negative / Trade-off
- Costo lineare nel numero di lidi (N transazioni). Mitigazione futura: vista materializzata
  ([D-043](../deferred.md)). Alla scala attuale è un non-problema.

## Alternatives considered

- **Bypass RLS in un colpo solo** (ruolo `BYPASSRLS` o GUC-sentinella + `GROUP BY establishmentId`) —
  una query sola, più veloce, ma apre una **superficie privilegiata** che scavalca l'isolamento: un bug
  lì leakerebbe cross-tenant. Ingiustificato alla scala attuale. Scartata.
- **Vista materializzata subito** — più veloce a leggere, ma aggiunge un job di refresh e possibile
  stantìo per un problema di prestazioni che oggi non esiste. Rinviata come upgrade additivo
  ([D-043](../deferred.md)). Scartata per ora.

## Rubric check

1. **Professionalità** — risolve la tensione RLS/cross-tenant riusando il choke point esistente, senza
   scorciatoie che indeboliscono l'isolamento.
2. **Convenzioni** — coerente con [ADR-0010](0010-isolamento-multi-tenant.md) e col pattern `forTenant`
   già canonico nel backend.
3. **Modularità** — la logica vive in un `PlatformMetricsService` isolato; il DTO disaccoppia la
   sorgente (loop oggi, vista domani) dal consumatore.
4. **Zero debito** — nessuna superficie RLS-bypass; PII-safe per costruzione; l'ottimizzazione a vista
   materializzata è tracciata, non un buco silenzioso.
