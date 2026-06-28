# ADR-0014: UX di configurazione della mappa — strutturata per form

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0005](0005-modello-mappa.md); [D-005](../deferred.md); [ADR-0016](0016-tipologia-ombrellone.md) (raffina)

## Context

L'admin di uno Stabilimento deve creare la struttura della spiaggia (Settori, File,
Ombrelloni). ADR-0005 fissa il modello **logico** (settori/file) con la posizione di
presentazione come layer separato. Va deciso *come* l'admin costruisce questa struttura
nell'MVP.

## Decision

Configurazione **strutturata per form**:

- L'admin crea i **Settori**, poi le **File**, e per ogni fila **genera N Ombrelloni**
  con **numerazione automatica** (schemi configurabili: es. A1…A10).
- La mappa si **renderizza automaticamente** dalla struttura logica con un layout di
  default (file impilate verso il mare).
- Il **disegno libero su planimetria** (drag & drop, coordinate, sfondo foto) resta
  l'editor **rimandato** ([D-005](../deferred.md)).

## Consequences

### Positive
- Setup veloce e robusto; dati strutturati e coerenti con il modello logico.
- Nessun canvas da costruire ora: meno superficie UI da mantenere.

### Negative / Trade-off
- Niente posizionamento visivo fine nell'MVP (mitigato dal layer di presentazione e
  da [D-005](../deferred.md)).

## Alternatives considered

- **Grid builder visivo** (righe × posti con layout) — non ora: più lavoro UI, via di
  mezzo verso la planimetria; rivedibile.
- **Editor planimetria libero** — è [D-005](../deferred.md), fuori MVP.

## Rubric check

1. **Professionalità** — setup dichiarativo affidabile, niente complessità inutile.
2. **Convenzioni** — generazione + numerazione automatica è prassi per layout regolari.
3. **Modularità** — il setup vive nel modulo `mappa`; la presentazione resta separata.
4. **Zero debito** — coerente con ADR-0005; l'editor visivo è additivo ([D-005](../deferred.md)).
