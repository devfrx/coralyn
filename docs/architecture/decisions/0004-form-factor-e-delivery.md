# ADR-0004: Form factor e modello di distribuzione

- **Status:** Accepted
- **Aggiornamento (2026-07-21):** la posizione sullo smartphone («resta per consultazioni rapide»)
  è **emendata da [ADR-0051](0051-responsive-drawer-e-telefono-graceful.md)**: il telefono è ora un
  **target graceful** — il layout compatto (`< lg`) funziona anche sotto 768px, senza debiti —
  mentre desktop e tablet restano i contesti primari. Il resto della decisione (web + PWA,
  Electron rimandato) è invariato.
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0007](0007-stile-architetturale.md), [ADR-0008](0008-stack-e-layout.md)

## Context

L'app dello staff viene usata in due contesti: alla **cassa** (postazione fissa,
desktop) e **in spiaggia** (in movimento, tablet). Il prodotto è un SaaS
multi-tenant e, in prospettiva, dovrà servire anche un booking online lato cliente.
Va deciso su quali dispositivi gira e come la distribuiamo.

## Decision

- **Applicazione web responsive**, un unico prodotto che si adatta a **desktop e
  tablet** (lo smartphone resta per consultazioni rapide).
- Distribuzione come **web app + PWA** (installabile, con offline-light: shell e
  consultazione in cache).
- **Electron rimandato** ([D-007](../deferred.md)): se servirà un client desktop
  nativo, sarà un *wrapper additivo* sulla stessa web app, non una seconda codebase.

## Consequences

### Positive
- Copre entrambi gli usi (cassa + spiaggia) con una sola codebase.
- La stessa web app/PWA è servita dall'API che alimenterà anche il booking online.
- Nessun costo di packaging/distribuzione nativa ora.

### Negative / Trade-off
- L'offline della PWA è limitato; un offline-sync completo è rimandato
  ([D-008](../deferred.md)) ed è rilevante per la connettività in spiaggia.

## Alternatives considered

- **Electron come delivery primaria** — scartata: non gira su tablet iPad/Android e
  aggiunge distribuzione/auto-update; copre solo la cassa.
- **App native mobili (iOS/Android)** — scartata: overkill e fuori convenzione per
  un gestionale SaaS; la PWA copre il caso d'uso.

## Rubric check

1. **Professionalità** — web+PWA è il modello standard per un SaaS responsive.
2. **Convenzioni** — segue la convenzione SaaS; riusa l'expertise Vue+TS dello
   sviluppatore (vedi [ADR-0008](0008-stack-e-layout.md)).
3. **Modularità** — una sola app per più contesti; l'eventuale Electron è additivo.
4. **Zero debito** — niente seconda codebase desktop; l'unico compromesso (offline)
   è tracciato in [D-008](../deferred.md).
