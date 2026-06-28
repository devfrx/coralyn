# ADR-0005: Modello della mappa degli ombrelloni

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md), [D-005](../deferred.md), [ADR-0016](0016-tipologia-ombrellone.md) (estende)

## Context

La mappa degli ombrelloni è il cuore operativo del prodotto e ne determina modello
dati, flessibilità tra lidi diversi e complessità. I lidi reali sono spesso
**irregolari**: file di lunghezze diverse, settori, cabine, spazi, aree speciali.
Una griglia rigida non li rappresenta.

## Decision

Adottiamo un **modello logico a tre livelli**: **Settore → Fila → Ombrellone**.

- Le **File** hanno lunghezza variabile; **Settore/Fila** sono l'ambito naturale del
  prezzo (es. prima fila più cara).
- Ogni `Ombrellone` ha una **posizione logica** (ordine in fila) **separata** dalla
  **posizione di presentazione** (coordinate visive). La presentazione è un layer
  distinto sopra il modello logico.
- L'**editor planimetria a coordinate libere** (drag&drop su foto/planimetria) è
  rimandato come funzione *additiva* ([D-005](../deferred.md)): grazie alla
  separazione logica/presentazione, sarà un'aggiunta, non una riscrittura.

## Consequences

### Positive
- Rappresenta la realtà della quasi totalità dei lidi.
- Dati strutturati e interrogabili (disponibilità per fila/settore, prezzi per fila).
- Porta aperta alla planimetria fedele senza toccare il dominio.

### Negative / Trade-off
- Non riproduce la planimetria reale al pixel nell'MVP (mitigato dal layer di
  presentazione e da [D-005](../deferred.md)).

## Alternatives considered

- **Griglia regolare** (file tutte uguali) — scartata: rigida, non copre i lidi
  irregolari.
- **Editor planimetria libero subito** — scartata per l'MVP: editor, coordinate e
  rendering aggiungono complessità non necessaria ora (over-engineering); rimandata
  a [D-005](../deferred.md), non cestinata.

## Rubric check

1. **Professionalità** — modello di dominio strutturato, non un disegno libero
   difficile da interrogare.
2. **Convenzioni** — riflette l'organizzazione reale degli stabilimenti (settori/file).
3. **Modularità** — separa posizione logica da presentazione: due responsabilità,
   due layer.
4. **Zero debito** — l'evoluzione verso la planimetria è additiva; il rinvio è
   tracciato in [D-005](../deferred.md).
