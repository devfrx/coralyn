# ADR-0006: Dominio delle prenotazioni, unità prenotabile e pricing

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0005](0005-modello-mappa.md), [glossario](../glossary.md), [D-006](../deferred.md)

## Context

Il Core deve gestire prenotazioni giornaliere, periodiche e abbonamenti stagionali,
vendere l'ombrellone con la sua dotazione, e calcolare prezzi che dipendono da più
fattori (posizione, tipo/durata, periodo dell'anno, pacchetto). Serve un modello di
dominio che copra questi casi senza duplicazioni.

## Decision

**Prenotazione unificata a intervallo.** Una sola entità `Prenotazione` con
`data_inizio`/`data_fine` e un campo `tipo` ∈ {`giornaliera`, `periodica`,
`abbonamento`}. Un modello, tre comportamenti: giornaliera = un giorno; periodica =
intervallo; abbonamento = intervallo lungo (la Stagione) con tariffa dedicata.

**Unità prenotabile = Ombrellone-pacchetto.** L'`Ombrellone` è la risorsa; un
`Pacchetto` (template **personalizzabile** dallo Stabilimento: Standard, Famiglia,
Premium…) ne definisce la dotazione (n. lettini/sdraio). Sono ammessi extra sulla
singola prenotazione.

**Pricing a regole.** Un `Listino` per `Stagione` contiene `Tariffe`. Ogni `Tariffa`
è una regola multi-dimensione su {tipo prenotazione, ambito di posizione
(Settore/Fila), Pacchetto, periodo} → (prezzo, unità: giorno|periodo). Un
**pricing engine** risolve il prezzo di una prenotazione con **precedenze esplicite**
(dalla regola più specifica alla più generica).

**Invariante di disponibilità.** Nessuna sovrapposizione tra `Prenotazione`
confermate sullo stesso `Ombrellone` nello stesso intervallo.

**Lista d'attesa minima.** Coda di richieste su risorsa/periodo pieno, con
**promozione manuale** a prenotazione da parte dello staff. Hold automatici con
scadenza e notifiche al cliente sono rimandati ([D-006](../deferred.md)).

## Consequences

### Positive
- Tre tipi di prenotazione senza codice duplicato.
- Pricing flessibile senza numeri incollati nel codice; nuove tariffe = dati.
- L'invariante anti-overlap protegge la correttezza al cuore del prodotto.

### Negative / Trade-off
- Il pricing engine con precedenze va progettato e testato con cura (è la parte di
  dominio più delicata).
- La lista d'attesa minima richiede un intervento manuale finché non arriva [D-006](../deferred.md).

## Alternatives considered

- **Entità separate per giornaliera/periodica/abbonamento** — scartata: duplica
  logica e disponibilità.
- **Posti (lettini/sdraio) come risorse indipendenti** — scartata per l'MVP:
  raro e più complesso; coperto dal Pacchetto personalizzabile.
- **Prezzi hard-coded / per singola fila** — scartata: non copre le 4 dimensioni e
  genera debito a ogni variazione di listino.

## Rubric check

1. **Professionalità** — modello di dominio coeso; pricing a regole è prassi
   consolidata per i gestionali.
2. **Convenzioni** — usa l'ubiquitous language del [glossario](../glossary.md).
3. **Modularità** — pricing engine isolato; disponibilità come invariante esplicita;
   lista d'attesa come capability separata.
4. **Zero debito** — un solo modello prenotazione; le parti rinviate (posti separati,
   hold/notifiche) sono tracciate, non improvvisate.
