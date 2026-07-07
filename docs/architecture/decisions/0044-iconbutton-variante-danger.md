# ADR-0044: Variante `danger` per `IconButton`

- **Status:** Accepted
- **Data:** 2026-07-07
- **ADR correlati:** [0002](0002-decision-rubric.md)
- **Spec:** [2026-07-07-modali-universali-e-cta-sweep-design.md](../../superpowers/specs/2026-07-07-modali-universali-e-cta-sweep-design.md)

## Context
La rubrica CTA (spec §4) richiede che le azioni distruttive usino la semantica `danger`. `IconButton`
offriva solo `ghost`/`subtle`: le ~11 azioni distruttive solo-icona (trash-2 in PricingView, azioni in
MapView) restavano `<button>` grezzi con `hover:text-[var(--color-danger)]`, fuori dal design system.

## Decision
Aggiungere a `IconButton` la variante `variant="danger"`: neutra a riposo, hover su `--color-danger`
(bg su `--color-danger-bg`, il token superficie danger già usato da `Button`). Nessun nuovo token di palette (non-obiettivo §2).
Le azioni distruttive solo-icona migrano a `IconButton variant="danger"`.

## Consequences
- **+** Rubrica pienamente applicabile alle azioni distruttive solo-icona; markup uniforme.
- **+** Zero debito: un solo punto di verità per lo stile delle icon-action distruttive.
- **−** Piccola espansione dell'API di `IconButton` (3 varianti). Accettabile e coerente con `Button` (che ha già `danger`).
