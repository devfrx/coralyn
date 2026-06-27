# ADR-0013: Granularità della disponibilità a slot (fasce)

- **Status:** Accepted
- **Data:** 2026-06-27
- **Decisori:** Team di progetto
- **ADR correlati:** estende [ADR-0006](0006-dominio-prenotazioni-e-pricing.md); [D-015](../deferred.md)

## Context

ADR-0006 modella disponibilità e prezzo *per giorno*. Alcuni lidi vendono però turni a
**mezza giornata** (mattina/pomeriggio). Introdurre le fasce in un secondo momento
sarebbe una migrazione costosa di tutta la logica di disponibilità, di prezzo e degli
stati sulla mappa. Va deciso il livello di granularità ora.

## Decision

Modelliamo la disponibilità a **slot generalizzati**:

- Entità **`Fascia`** per Stabilimento (es. *Giornata intera*; oppure *Mattina* e
  *Pomeriggio*), **configurabile**. Default: una sola `Fascia` "Giornata intera", così
  il caso per-giorno è semplicemente il sottocaso a una fascia.
- La `Prenotazione` referenzia una `Fascia`. L'unità di disponibilità è
  **(Ombrellone, data, Fascia)**.
- **Invariante anti-overlap generalizzato**: nessuna prenotazione confermata
  sovrapposta su *stesso Ombrellone* + *intervallo di date intersecante* + *fascia
  uguale o sovrapposta*. Mattina e pomeriggio sullo stesso ombrellone/giorno **non**
  si sovrappongono.
- La **`Tariffa`** acquisisce la dimensione **fascia**: il prezzo può variare per slot.
- **Orari arbitrari** (fasce libere, es. 10–13) → rimandati ([D-015](../deferred.md)):
  atipici per gli ombrelloni e costosi.

## Consequences

### Positive
- Copre giornata intera **e** mezza giornata senza debito di migrazione futura.
- Il per-giorno resta semplice (una sola fascia di default).
- Il modello a `Fascia` è generalizzabile a fasce più fini in futuro senza riscrittura.

### Negative / Trade-off
- Disponibilità, pricing e stati della mappa diventano **slot-aware**: complessità
  reale ma contenuta, concentrata nei moduli `prenotazioni` e `catalogo`.

## Alternatives considered

- **Solo per-giorno** — scartata: migrazione futura costosa se servono le fasce.
- **Orari arbitrari subito** — scartata (YAGNI): atipico per ombrelloni, costo alto;
  rimandato a [D-015](../deferred.md).

## Rubric check

1. **Professionalità** — generalizzare la disponibilità è la scelta che evita riscritture.
2. **Convenzioni** — slot/fascia è il modo canonico di modellare disponibilità a turni.
3. **Modularità** — la fascia è un concetto isolato, usato da disponibilità e prezzo.
4. **Zero debito** — per-giorno = caso a una fascia; niente migrazione futura; l'orario
   arbitrario è tracciato in [D-015](../deferred.md).
