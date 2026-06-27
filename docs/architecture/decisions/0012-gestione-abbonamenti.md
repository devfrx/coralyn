# ADR-0012: Gestione abbonamenti — rinnovo minimo e storico

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md), [D-011](../deferred.md), [D-012](../deferred.md), [D-013](../deferred.md)

## Context

L'abbonamento è il cuore economico di molti lidi. ADR-0006 lo modella già come una
`Prenotazione` con `tipo=abbonamento` (posto fisso per la stagione), che copre il
fatto essenziale e si integra con mappa e disponibilità. Restano da decidere le
*funzioni di gestione* attorno all'abbonamento — storico/anzianità, rinnovo,
prelazione, cabine, sospensioni — e quanto entra nell'MVP senza introdurre entità
pesanti o debito.

## Decision

L'abbonamento **resta una `Prenotazione`** (`tipo=abbonamento`), arricchito da due
aggiunte **minime e additive**:

- **Storico / anzianità**: self-FK `prenotazione_precedente_id` (nullable) sulla
  `Prenotazione`. La catena dei rinnovi esprime da quanti anni un cliente è abbonato
  a quel posto, senza una nuova entità.
- **Rinnovo in un clic**: dalla lista degli abbonati della stagione precedente, l'azione
  "rinnova" crea la nuova `Prenotazione` copiando cliente + ombrellone + pacchetto,
  con **prezzo ricalcolato** sul listino della nuova stagione e link al precedente;
  la disponibilità è verificata dall'invariante anti-overlap.

**Fuori MVP (rimandato):**
- **Prelazione automatica**: finestre con scadenza, rilascio automatico del posto se
  non rinnovato, priorità per anzianità → [D-011](../deferred.md).
- **Cabina e servizi accessori** (posto auto, ingressi) come risorse → [D-012](../deferred.md).
- **Sospensione / cessione / disdetta** dell'abbonamento → [D-013](../deferred.md).
- **Notifiche** di scadenza/rinnovo → dipendono dal modulo notifiche ([D-006](../deferred.md)).

## Consequences

### Positive
- Risolve un dolore concreto dei lidi (campagna rinnovi) a costo molto basso.
- Storico/anzianità nativi, utili anche alla futura prelazione.
- Nessuna entità nuova: coerente con il modello unico di disponibilità (ADR-0006).

### Negative / Trade-off
- Il rinnovo "intelligente" (prelazione con scadenze) manca finché non arriva
  [D-011](../deferred.md): nell'MVP la campagna è guidata ma manuale.

## Alternatives considered

- **Entità `Abbonamento` separata** — scartata: duplicherebbe la logica di
  disponibilità/overlap, in contrasto con [ADR-0006](0006-dominio-prenotazioni-e-pricing.md).
- **Nessun rinnovo nell'MVP** — scartata: rinuncia a un valore chiave a costo
  bassissimo (il modello è già pronto).
- **Prelazione completa subito** — scartata (YAGNI): workflow con politiche e
  automatismi, sproporzionato per l'MVP.

## Rubric check

1. **Professionalità** — affronta il vero punto dolente della gestione abbonati.
2. **Convenzioni** — rinnovo come copia col nuovo listino; storico via catena.
3. **Modularità** — solo un self-link, nessuna entità nuova; cabina/prelazione isolate
   e rimandate.
4. **Zero debito** — aggiunte additive; le parti complesse sono tracciate
   ([D-011](../deferred.md), [D-012](../deferred.md), [D-013](../deferred.md)).
