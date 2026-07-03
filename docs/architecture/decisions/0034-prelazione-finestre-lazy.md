# ADR-0034: Prelazione — finestre derivate a valutazione lazy, campagna come unico stato persistito

- **Status:** Accepted
- **Data:** 2026-07-02
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0012](0012-gestione-abbonamenti.md) (gestione abbonamenti — D-011 era il
  "fuori MVP" rimandato lì, ora realizzata da questo ADR), [ADR-0006](0006-dominio-prenotazioni-e-pricing.md)
  (invariante anti-overlap), [ADR-0013](0013-granularita-disponibilita-a-slot.md) (disponibilità
  slot-aware), [ADR-0031](0031-fuso-orario-e-date-operative.md) (date di calendario Europe/Rome,
  round-trip UTC), [D-030](../deferred.md) (anti-overlap applicativo, non vincolo DB — stessa
  filosofia della prelazione lazy), [D-013](../deferred.md) (sospensione/cessione/disdetta — vicina
  alla rinuncia esplicita, fuori scope qui), [ADR-0037](0037-anti-overlap-exclusion-constraint.md)
  (l'anti-overlap D-030 è ora anche un EXCLUDE constraint DB; la validazione stagioni qui sotto è
  stata rafforzata per restarne rinnovo-safe)

## Context

[ADR-0012](0012-gestione-abbonamenti.md) copre il rinnovo abbonamenti in un clic e lo storico/anzianità
(`previousBookingId`), ma lascia esplicitamente fuori MVP la **prelazione automatica**
([D-011](../deferred.md)): finestre di rinnovo con scadenza, rilascio automatico del posto se non
rinnovato, priorità per anzianità. Oggi (A4.2) "il posto" di un abbonato nella stagione entrante
**non è occupato** da nessuna `Booking` finché non esiste un rinnovo confermato: finché non si
rinnova, l'anti-overlap ([ADR-0006](0006-dominio-prenotazioni-e-pricing.md),
[ADR-0013](0013-granularita-disponibilita-a-slot.md)) non blocca nessuno, e **chiunque** può
prenotare quell'ombrellone per la nuova stagione. Serve un meccanismo che **riservi** il posto
dell'abbonato uscente per una finestra di tempo e lo **liberi** automaticamente alla scadenza, con
priorità ordinata per anzianità.

A differenza degli incrementi CRUD precedenti (es. D-032, nessun ADR — riuso di un pattern già
deciso), D-011 introduce **architettura nuova**: una nuova entità di dominio e una nuova invariante
di disponibilità (l'hold). Merita quindi un ADR proprio, non solo un'estensione silenziosa di
ADR-0012.

Tre domande di design condizionano l'implementazione: (1) come modellare la finestra e il suo stato
per-abbonato; (2) come si attiva il rilascio automatico, dato che **non esiste alcuna infrastruttura
di scheduling/cron** in `apps/api` (nessun `@nestjs/schedule`, `@Cron`, `setInterval`, Bull); (3) se
serve un nuovo `BookingStatus` per rappresentare lo stato della prelazione.

## Decision

1. **La campagna (`RenewalCampaign`) è l'unico stato persistito.** Una riga per stagione di
   destinazione: `originSeasonId`, `destinationSeasonId`, `deadline`, `createdAt`. Nessuna riga
   per-abbonato.

   > Raffinamento ([ADR-0037](0037-anti-overlap-exclusion-constraint.md)): l'apertura campagna valida che la stagione
   > di destinazione segua quella di origine; questa validazione è stata rafforzata da `dest.startDate >
   > origin.startDate` a `dest.startDate > origin.endDate` (le due stagioni non devono sovrapporsi in date), così un
   > rinnovo non fa mai scattare un 409 spurio contro l'`EXCLUDE` constraint anti-overlap introdotto da quell'ADR.
2. **Le finestre per-abbonato sono derivate, non persistite.** Lo stato di ciascuna finestra
   (`open | exercised | expired`) si calcola a lettura (e a scrittura) confrontando `deadline` con
   `todayInRome()` ([ADR-0031](0031-fuso-orario-e-date-operative.md)) ed esistenza di un rinnovo
   confermato dell'abbonato nella stagione di destinazione (già derivabile via `previousBookingId`).
3. **Il rilascio è lazy: nessuno scheduler.** Non esiste un job che "chiude" le finestre scadute; la
   scadenza è semplicemente una condizione valutata ogni volta che serve (lettura campagna,
   tentativo di prenotazione). Coerente con lo stile applicativo già adottato per l'anti-overlap
   ([D-030](../deferred.md)): niente nuova infrastruttura, niente stato di background.
4. **L'hold è un'invariante applicativa nel percorso di scrittura**, accanto all'anti-overlap
   esistente, non una `Booking` fantasma. Dentro `BookingsService.priceAndWrite`
   (`apps/api/src/bookings/bookings.service.ts`), dopo l'anti-overlap e prima del pricing, si
   verifica se l'ombrellone+fascia richiesti sono riservati da una finestra ancora aperta a favore di
   un **altro** cliente; in tal caso **409**. Il rinnovo dell'avente-diritto sul proprio posto non è
   mai bloccato dal proprio hold (esclusione per `customerId`).
5. **Nessun nuovo `BookingStatus`.** Lo stato della prelazione vive sulla campagna (derivato),
   **non** sulla `Booking`: l'enum `confirmed | cancelled` resta intatto. Toccarlo propagherebbe a
   mappa, disponibilità e pagamenti per un concetto che non li riguarda.
6. **Priorità = ordinamento per anzianità.** Le finestre sono ordinate per `seniority` decrescente
   (server-autoritativo), riusando `computeSeniority`, estratto da metodo privato di
   `BookingsService` a funzione condivisa in `apps/api/src/bookings/seniority.ts` (puro refactor,
   nessun cambio di comportamento).

## Consequences

### Positive
- **Nessuna nuova infrastruttura**: niente scheduler/cron/coda, coerente con lo stile applicativo
  già scelto per l'anti-overlap ([D-030](../deferred.md)).
- **Stato sempre coerente**: derivare `open/exercised/expired` da `deadline` + rinnovo confermato
  esclude per costruzione il disallineamento fra "stato persistito" e "realtà" (nessun job che può
  fallire silenziosamente e lasciare uno stato stantio).
- **Modello minimo**: un'unica tabella additiva (`RenewalCampaign`), RLS FORCE +
  `tenant_isolation` come tutte le entità tenant-scoped; nessun campo nuovo su `Booking`.
- **`BookingStatus` intatto**: mappa, disponibilità e pagamenti non vedono alcun impatto.

### Negative / Trade-off
- **Nessun audit trail del rilascio**: non esiste un evento "finestra scaduta il giorno X" da
  consultare a posteriori, perché non c'è nulla da "rilasciare" in senso di scrittura — lo stato è
  ricomputato deterministicamente ogni volta. Accettabile: il rilascio è una funzione pura di
  `deadline` e `todayInRome()`, sempre ricostruibile, non un evento con effetti collaterali persi.
- **Race create-vs-hold**: due richieste concorrenti (una che verifica l'hold, una che scrive) sono
  esposte alla stessa classe di race condition dell'anti-overlap applicativo
  ([D-030](../deferred.md)) — nessun vincolo a livello DB (nessun exclusion constraint) copre
  l'hold. Accettabile per l'MVP a deploy mono-operatore, stessa mitigazione già accettata per
  l'anti-overlap.
- **Disciplina richiesta**: l'hold vive **solo** dentro `priceAndWrite`. Ogni futuro percorso di
  scrittura di `Booking` (oggi `create` e `renew` lo condividono già) **deve** passare da lì, o
  l'invariante viene bypassata silenziosamente. Non c'è un secondo guardiano (es. vincolo DB) a
  compensare un percorso di scrittura dimenticato.

## Alternatives considered

- **Job schedulato (`@nestjs/schedule`, `@Cron`)** che a scadenza marca/rilascia le finestre —
  scartata: introduce una **nuova dipendenza e nuova infrastruttura** (stato di background, rischio
  di job non eseguito/doppio-eseguito) sproporzionata per l'MVP, quando la valutazione lazy ottiene
  lo stesso risultato (stato sempre corretto alla lettura) senza costi aggiuntivi. Verificato che
  **nessuno scheduler esiste già** in `apps/api`: introdurne uno solo per questo sarebbe la prima
  istanza di quel pattern nel codebase.
- **Righe finestra per-abbonato** (entità `RenewalWindow`/`PreemptionWindow` con
  customer+umbrella+stato persistito) — scartata per l'MVP: modello **più pesante**
  (una riga per ogni abbonato per ogni campagna, da tenere sincronizzata), ma soprattutto
  **abiliterebbe** funzionalità esplicitamente fuori scope in questo slice — scadenze scaglionate
  per anzianità e rinuncia esplicita (stato `declined`) — quindi sarebbe gold-plating rispetto al
  bisogno attuale. Resta l'opzione naturale se/quando [D-013](../deferred.md)
  (sospensione/cessione/disdetta) richiederà uno stato esplicito per-abbonato.
- **Scadenza puramente derivata da formula** (es. `season.endDate + N giorni`, nessun campo
  `deadline` persistito) — scartata: toglie all'operatore il **controllo** della scadenza della
  campagna (varia per stagione/lido/promozione), imponendo una regola rigida al posto di una
  decisione operativa esplicita all'apertura.

## Rubric check

1. **Professionalità** — la lazy-evaluation per invarianti temporali (scadenza, disponibilità) è
   prassi consolidata quando non serve un side-effect a orario fisso; evita di introdurre
   infrastruttura di scheduling per un problema risolvibile a lettura.
2. **Convenzioni** — riusa lo stile applicativo già scelto per l'anti-overlap
   ([D-030](../deferred.md)) e le date operative Europe/Rome ([ADR-0031](0031-fuso-orario-e-date-operative.md));
   l'hold vive nello stesso `priceAndWrite` che già centralizza anti-overlap e pricing, non un
   percorso parallelo.
3. **Modularità** — un'unica tabella additiva, RLS coerente con le altre entità tenant-scoped;
   `computeSeniority` estratto in un modulo condiviso (`seniority.ts`) invece di duplicato; nessun
   cambio a `BookingStatus`, mappa o pagamenti.
4. **Zero debito** — i compromessi (nessun audit del rilascio, race create-vs-hold) sono tracciati
   esplicitamente qui, non silenziosi, e nella stessa classe di un compromesso già accettato
   ([D-030](../deferred.md)); la disciplina richiesta (ogni write passa da `priceAndWrite`) è
   documentata come vincolo esplicito, non affidata alla memoria.
