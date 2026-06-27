# Architettura — vista d'insieme (documento vivo)

> Questo documento è **vivo**: va aggiornato a ogni decisione rilevante. Descrive
> *cosa* è il sistema e *com'è strutturato*; per il *perché* delle singole scelte
> rimanda agli [ADR](decisions/).

## Cos'è il prodotto

Gestionale **SaaS multi-cliente** per **lidi balneari** (stabilimenti balneari),
destinato alla vendita in abbonamento a più stabilimenti.

## Principi guida

- Tutte le decisioni passano per la [decision rubric](decisions/0002-decision-rubric.md):
  professionalità, convenzioni, modularità, zero debito.
- Decisioni tracciate come [ADR](decisions/); cambi di rotta via *supersede*, mai
  cancellazione.
- Debito solo se consapevole e registrato in [deferred.md](deferred.md).
- Linguaggio: codice EN, dominio IT, docs IT ([ADR-0003](decisions/0003-language-convention.md)).

## Moduli del prodotto (vista a grandi linee)

Il prodotto è scomposto in moduli costruiti in sequenza, ciascuno con il proprio
ciclo spec → piano → implementazione.

1. **Core operativo** *(MVP, in progettazione)* — anagrafica Clienti, Listino/Tariffe,
   mappa Ombrelloni interattiva, Prenotazioni e Abbonamenti. Costruito **tenant-aware**
   nel modello dati fin da subito.
2. **Cassa e pagamenti** — incassi, ricevute, chiusura giornaliera; si innesta sulle
   Prenotazioni del Core.
3. **Multi-tenancy & account** — registrazione stabilimenti, isolamento dati, ruoli e
   permessi, billing dell'abbonamento SaaS.
4. **Booking online clienti** — portale lato bagnante che riusa mappa e disponibilità
   del Core.
5. **Reportistica & extra** — statistiche di occupazione, eventuale bar/ristorante,
   gestione personale.

## Modello dati (in evoluzione)

Da definire nello spec del Core operativo. Vincolo già fissato: ogni entità di
business è legata a uno **Stabilimento** (`stabilimento_id`) per abilitare la
multi-tenancy futura senza riscritture.

Vedi il [glossario](glossary.md) per i termini di dominio.

## Stack tecnologico

Da decidere dopo l'approvazione dello spec del Core (vedi [D-001](deferred.md)).

## Indice degli ADR

- [ADR-0001](decisions/0001-use-adrs.md) — Adottare gli ADR
- [ADR-0002](decisions/0002-decision-rubric.md) — Decision rubric (i quattro filtri)
- [ADR-0003](decisions/0003-language-convention.md) — Convenzione linguistica
