# ADR-0031: Fuso orario e date operative (calendario nel fuso dello Stabilimento)

- **Status:** Accepted
- **Data:** 2026-06-30
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0013](0013-granularita-disponibilita-a-slot.md) (disponibilità a slot),
  [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (prenotazione a intervallo),
  [D-003](../deferred.md) (i18n), [D-031](../deferred.md) (fuso per-tenant)

## Context

La giornata operativa di un lido (la mappa di un giorno, l'intervallo di una prenotazione)
è una **data di calendario**, non un istante: "27 giugno" è un giorno intero, non
`2026-06-27T00:00:00Z`. Il modulo mappa calcola però il "giorno corrente" di default con
`new Date().toISOString().slice(0,10)`, cioè in **UTC**. Per un utente italiano (CET/CEST,
UTC+1/+2) negli orari a cavallo della mezzanotte questo produce un **off-by-one**: all'1:00
del 1 luglio ora locale il backend calcola "oggi = 30 giugno". Con le prenotazioni il
problema si amplifica: `startDate`/`endDate` (`@db.Date`) e gli orari delle fasce
(`@db.Time`) vanno serializzati con cura, perché una `Date` JS letta da una colonna `date`
torna a **mezzanotte UTC** e, riformattata con metodi *locali*, slitta di un giorno. Serve
una regola unica, decisa ora perché tocca già mappa e prenotazioni (e domani la reportistica
e il pricing per stagione).

## Decision

1. **Le date operative sono date di calendario nel fuso dello Stabilimento.** Una
   `Booking`/una mappa si riferiscono a un *giorno*, senza componente oraria significativa.
2. **MVP mono-mercato: fuso fisso `Europe/Rome`.** Il "giorno corrente" di default lato
   backend (`resolveDate` e analoghi) si calcola in `Europe/Rome`, **non** in UTC. Il fuso
   configurabile per-tenant è rinviato ([D-031](../deferred.md)), coerente con i18n
   ([D-003](../deferred.md)).
3. **Round-trip in UTC per i tipi `@db.Date`/`@db.Time`.** Si scrive e si legge sempre con
   rappresentazione UTC (`toISOString().slice(0,10)` per le date; `new Date('1970-01-01Thh:mm:ssZ')`
   per gli orari, come già fa il seed delle fasce). **Vietati** i metodi locali
   (`getDate()`/`getHours()`) sui valori `@db.Date`/`@db.Time`: introducono off-by-one.
4. **Il frontend invia sempre la `activeDate` esplicita** (formato ISO `YYYY-MM-DD`); il
   default lato backend resta solo come rete di sicurezza.
5. Le fasce (`TimeSlot`) restano **orari "da parete"** (08:00–13:00) senza fuso proprio: sono
   interpretati nel fuso dello Stabilimento. Gli intervalli sono **semiaperti** `[start, end)`,
   così fasce contigue (Mattina 08–13 / Pomeriggio 13–19) non si sovrappongono al bordo.

## Consequences

### Positive
- Niente off-by-one a cavallo della mezzanotte: lo staff vede sempre il giorno giusto.
- Regola unica e testabile per mappa, prenotazioni e futura reportistica.
- Il modello a date di calendario è il più semplice e corretto per un dominio per-giorno.

### Negative / Trade-off
- `Europe/Rome` è **hardcoded** nell'MVP: un lido in altro fuso richiederà il fuso per-tenant
  ([D-031](../deferred.md)). Compromesso tracciato, non silenzioso.
- Richiede disciplina: ogni nuovo punto che tocca `@db.Date`/`@db.Time` deve usare UTC.

### Neutre / Note
- Il modulo mappa esistente va allineato (il suo `resolveDate` oggi usa UTC): l'aggiornamento
  fa parte dello slice prenotazioni A1.

## Alternatives considered

- **Tutto in UTC** — scartata: semplice da scrivere ma sbagliata per l'utente, che vedrebbe il
  giorno cambiare alle 22:00/23:00 ora locale.
- **Timestamp con ora invece di date** — scartata (YAGNI e fuorviante): la prenotazione è per
  *giorno*+fascia, non per istante; introdurrebbe conversioni di fuso ovunque.
- **Fuso per-tenant subito** — scartata per l'MVP mono-mercato: valore nullo ora, costo non
  banale; rinviata a [D-031](../deferred.md) (additiva: una colonna `timezone` sullo
  `Establishment`).

## Rubric check

1. **Professionalità** — separare "data di calendario" da "istante UTC" è prassi corretta per
   domini per-giorno; l'off-by-one a mezzanotte è un classico evitato.
2. **Convenzioni** — date ISO `YYYY-MM-DD`, persistenza UTC, presentazione nel fuso locale.
3. **Modularità** — la regola è concentrata nelle utility di data (un punto), non sparsa.
4. **Zero debito** — il fuso per-tenant è additivo e tracciato ([D-031](../deferred.md)); nessun
   dato di produzione esistente (pre-release), nessuna migrazione retroattiva.
