# ADR-0007: Stile architetturale

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0008](0008-stack-e-layout.md), [D-002](../deferred.md)

## Context

Il prodotto è un SaaS multi-tenant che crescerà per moduli (Core, Cassa,
Multi-tenancy, Booking online, Report). Serve uno stile architetturale che dia
confini netti senza pagare da subito il costo operativo di un sistema distribuito,
e che tenga aperta l'integrazione futura dell'IA.

## Decision

- **Monolite modulare.** Un solo backend deployabile, suddiviso in **moduli a
  bounded context** (`mappa`, `catalogo`, `clienti`, `prenotazioni`, `identita`,
  più un `core` condiviso) con confini espliciti e basso accoppiamento.
- **API-first (REST).** Il backend espone un'API consumata da più frontend: l'app
  staff oggi, il booking online domani. Il dominio non si riscrive per il secondo
  client.
- **Multi-tenant-aware dal modello dati.** Ogni entità di business porta
  `stabilimento_id`; lo scoping per tenant è applicato a livello applicativo fin
  dall'MVP. L'infrastruttura SaaS completa (signup, isolamento avanzato, billing) è
  il modulo 3 ([D-002](../deferred.md)).
- **IA come servizio separato.** Eventuali funzioni IA vivranno in un servizio
  dedicato (es. Python) consumato via API dal core, non dentro il core.

## Consequences

### Positive
- Confini chiari e testabilità per modulo, senza l'overhead operativo dei microservizi.
- Pronto al multi-frontend e all'IA senza riscritture.
- La multi-tenancy futura è un'evoluzione, non una riscrittura (modello già tenant-aware).

### Negative / Trade-off
- Il rispetto dei confini tra moduli va presidiato con disciplina e regole di lint
  (un monolite può degradare in "big ball of mud" se i confini non si rispettano).

## Alternatives considered

- **Microservizi** — scartata: over-engineering e debito operativo (deploy, rete,
  osservabilità) prematuri; i moduli si potranno estrarre dopo, se mai servisse.
- **Monolite non modulare** — scartata: accoppiamento crescente, viola la rubrica.
- **Multi-tenancy aggiunta dopo** — scartata: senza `stabilimento_id` da subito
  sarebbe una riscrittura costosa.

## Rubric check

1. **Professionalità** — il monolite modulare è la scelta raccomandata per un
   prodotto a questo stadio.
2. **Convenzioni** — API-first e multi-tenant-aware sono standard SaaS consolidati.
3. **Modularità** — è il principio centrale di questa decisione (bounded context).
4. **Zero debito** — evita sia il debito dei microservizi prematuri sia quello della
   multi-tenancy retrofittata; il rinvio dell'infra SaaS è tracciato ([D-002](../deferred.md)).
