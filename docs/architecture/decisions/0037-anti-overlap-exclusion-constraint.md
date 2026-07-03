# ADR-0037: Invariante anti-overlap garantita a livello DB con EXCLUDE constraint

- **Status:** Accepted
- **Data:** 2026-07-03
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (**raffinato** da questo ADR: l'invariante
  anti-overlap, finora solo applicativa, ora ha anche una garanzia strutturale nel DB), [ADR-0013](0013-granularita-disponibilita-a-slot.md)
  (**raffinato**: la granularità a fascia è ora anche espressa da un constraint DB, non solo dal controllo applicativo),
  [ADR-0034](0034-prelazione-finestre-lazy.md) (validazione stagioni della campagna rinnovo, rafforzata per restare
  rinnovo-safe rispetto al nuovo constraint), [D-030](../deferred.md) (origine dello slice). Spec:
  `docs/specs/2026-07-03-anti-overlap-db-d030-design.md`.

## Context

[ADR-0006](0006-dominio-prenotazioni-e-pricing.md) definisce l'invariante anti-overlap — "nessuna sovrapposizione tra
prenotazioni confermate sullo stesso Ombrellone" — come "la correttezza al cuore del prodotto". [ADR-0013](0013-granularita-disponibilita-a-slot.md)
la generalizza alla fascia: l'unità di disponibilità è (Ombrellone, data, Fascia), e due prenotazioni confliggono se le
fasce si sovrappongono per **orario**, non per identità di `Fascia` (Giorno-Intero e Mattina sono fasce diverse ma i
loro orari si sovrappongono).

Fino a questo slice, l'invariante era garantita **solo a livello applicativo**: dentro la transazione di
`BookingsService.create`, una query (`tx.booking.findMany` + filtro `dateRangesOverlap && slotsOverlap` in JS) verifica
l'assenza di conflitti prima di scrivere. Due `create` concorrenti sullo stesso ombrellone+fascia possono entrambe
superare il controllo (finestra di *race*) e produrre un doppione — un bug di correttezza dei dati, non solo di UX,
sull'invariante più importante del prodotto.

Serve una garanzia **strutturale**, indipendente dall'applicazione: regge anche a SQL diretto, a un bug applicativo, o
a un secondo percorso di scrittura che dimentichi il controllo.

## Decision

**L'invariante anti-overlap è ora garantita anche a livello DB**, con un `EXCLUDE` constraint Postgres su `Booking`,
mantenendo il controllo applicativo come percorso primario.

### Il constraint

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- per mischiare '=' (uuid) e '&&' (range) in un gist EXCLUDE

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap EXCLUDE USING gist (
  "umbrellaId"                                  WITH =,
  daterange("startDate", "endDate", '[]')       WITH &&,   -- inclusivo: allineato a dateRangesOverlap
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&    -- semiaperto: allineato a slotsOverlap
) WHERE (status = 'confirmed');                            -- solo confermate bloccano (cancellate no)
```

La semantica è deliberatamente **identica** a quella del controllo applicativo esistente: `daterange('[]')` usa estremi
inclusivi come `dateRangesOverlap` (`aStart ≤ bEnd && bStart ≤ aEnd`); `int4range('[)')` è semiaperto come
`slotsOverlap` (fasce contigue, es. Mattina 08–13 e Pomeriggio 13–19, non collidono); il filtro parziale
`WHERE status='confirmed'` esclude le prenotazioni cancellate, come fa l'app. Se le due semantiche divergessero, il
constraint rifiuterebbe prenotazioni valide o ne ammetterebbe di invalide — la parità è la condizione di correttezza
dell'intero design.

### Occupazione oraria denormalizzata, DB-autoritativa

Un `EXCLUDE` constraint può riferire solo colonne (o espressioni immutabili) della riga stessa: non può fare un `JOIN`
a `TimeSlot` per leggerne gli orari. Confrontare per `"timeSlotId" WITH =` sarebbe **più debole** del controllo
applicativo — mancherebbe esattamente il caso Giorno-Intero-vs-Mattina, ammettendo un doppione reale (due fasce
diverse, orari sovrapposti). L'intervallo orario della fascia va quindi **materializzato sulla riga `Booking`**: due
colonne minuti-dalla-mezzanotte, `slotStartMin`/`slotEndMin` (interi, per poter costruire un `int4range` immutabile
nel constraint).

Queste colonne sono **denormalizzate** (duplicano un dato derivabile da `TimeSlot`) ma non sono un semplice lookup
vivo: sono **intrinseche alla prenotazione**, fissate al momento della scrittura da un trigger `BEFORE INSERT OR
UPDATE OF "timeSlotId"` che legge `TimeSlot.startTime`/`endTime` e converte in minuti. L'app **non** le scrive
direttamente — sarebbe una difesa più debole, delegata alla disciplina di ogni singolo percorso di scrittura. Il
trigger è **DB-autoritativo**: le colonne non possono divergere dalla fascia referenziata al momento della scrittura,
indipendentemente da un bug applicativo.

La conseguenza semantica è voluta: **modificare in seguito gli orari di una `Fascia` non sposta retroattivamente le
prenotazioni già scritte**. Non è un debito di sincronizzazione da colmare, ma la correttezza storica corretta — una
prenotazione fatta per "Mattina 08–13" resta occupante di quell'orario anche se lo Stabilimento ridefinisce in
seguito "Mattina" come 08–14.

`slotStartMin`/`slotEndMin` sono modellate in Prisma con `@default(0)` come **segnaposto**, solo per rendere
opzionale il campo nel create-input generato (l'applicazione non li scrive mai): il trigger sovrascrive
incondizionatamente il valore ad ogni `INSERT`/`UPDATE OF "timeSlotId"`, quindi il default non è mai osservabile in
una riga scritta dal percorso applicativo.

### Controllo applicativo primario, constraint come backstop

Il controllo in `BookingsService.create` **non cambia**: resta il percorso primario, perché dà un 409 con messaggio
gentile e gestisce casi che il constraint non può esprimere (esclusione della sorgente di un rinnovo tramite
`id ≠ previousBookingId`, prelazione — [ADR-0034](0034-prelazione-finestre-lazy.md)). Il constraint è la **rete di
sicurezza** per la sola finestra di race fra il controllo applicativo e la scrittura.

Quando il constraint scatta (due `create` concorrenti superano entrambe il controllo applicativo e una fallisce alla
scrittura), Postgres solleva un'*exclusion violation*, `SQLSTATE 23P01`. Questo codice è mappato, con lo stesso
pattern già in uso per `Rate_signature_key` (`23505 → 409`, [D-032](../deferred.md)), sullo **stesso messaggio** del
controllo applicativo (`ConflictException('Fascia non disponibile per questo ombrellone')`): client e test non
distinguono chi ha bloccato la scrittura.

### Invariante rinnovo-safe

Il constraint è più severo del controllo applicativo: non sa auto-escludere la sorgente di un rinnovo (l'app lo fa
con `id ≠ previousBookingId`). Scatterebbe con un **409 spurio** solo se la stagione di **destinazione** di una
campagna rinnovo si sovrapponesse in date all'**origine** (stesso ombrellone e fascia). Si chiude alla radice
rafforzando la validazione di apertura campagna in `renewal-campaigns.service.ts`, da `dest.startDate >
origin.startDate` (troppo debole: la destinazione può ancora sovrapporsi all'origine) a **`dest.startDate >
origin.endDate`** — la stagione di destinazione deve iniziare **dopo la fine** di quella di origine. Con questa
invariante, un rinnovo (per costruzione verso il futuro) non si sovrappone mai in date alla propria sorgente, quindi
il constraint non lo rifiuta mai.

## Consequences

### Positive
- **Garanzia strutturale sulla correttezza al cuore del prodotto**: la race applicativa non può più produrre un
  doppione, indipendentemente da bug futuri o accesso diretto al DB.
- **Difesa in profondità senza duplicare la UX**: il messaggio 409 resta unico; l'utente non vede differenza fra
  "bloccato dall'app" e "bloccato dal DB".
- **Semantica verificabile**: la parità fra constraint e controllo applicativo (date inclusive, fasce semiaperte,
  solo confermate) è esplicita e testabile end-to-end (Giorno-Intero-vs-Mattina, fasce contigue, cancellate,
  rinnovo).

### Negative / Trade-off
- **Due colonne denormalizzate** (`slotStartMin`/`slotEndMin`) da mantenere in sincronia — mitigato dal trigger
  DB-autoritativo, non dalla disciplina applicativa.
- **Migrazione con backfill** sotto RLS (`NO FORCE`/`FORCE` attorno alla lettura, stesso pattern dello slice
  Equipment) per le prenotazioni esistenti.
- **Irrobustimento della validazione stagioni** (`> origin.endDate` invece di `> origin.startDate`) è un vincolo più
  stretto sulle campagne rinnovo: accettabile perché semanticamente corretto (si rinnova verso il futuro), non solo
  una concessione tecnica al constraint.

### Neutre / Note
- **Non copre la prelazione**: l'hold di [ADR-0034](0034-prelazione-finestre-lazy.md) resta un'invariante
  applicativa, per scelta — il constraint non può esprimere "riservato per un altro cliente fino a una scadenza".
- **Non copre lo split periodica multi-stagione** ([D-033](../deferred.md)): il constraint lavora per riga, invariato
  rispetto a un eventuale split futuro.

## Alternatives considered

- **`"timeSlotId" WITH =`** invece delle colonne minuti-fascia — scartata: più debole del controllo applicativo
  esistente, mancherebbe il caso Giorno-Intero-vs-Mattina (due fasce diverse, orari sovrapposti) e ammetterebbe un
  doppione reale che l'app oggi rifiuta.
- **Colonne `GENERATED ALWAYS AS`** per `slotStartMin`/`slotEndMin` — scartata: una colonna generata può derivare solo
  da espressioni della stessa riga, non da un `JOIN` a `TimeSlot`; l'`EXCLUDE` usa comunque espressioni immutabili
  inline (`daterange`, `int4range`) calcolate sulle colonne memorizzate, per cui un trigger `BEFORE INSERT OR UPDATE`
  è il meccanismo corretto per popolarle da una tabella diversa.
- **Solo controllo applicativo, nessun constraint DB** (status quo pre-slice) — scartata: lascia la finestra di race
  aperta sull'invariante più importante del prodotto; non è difesa in profondità.
- **App scrive direttamente `slotStartMin`/`slotEndMin`** (nessun trigger) — scartata: sposterebbe la garanzia
  DB-autoritativa su una disciplina applicativa distribuita su ogni percorso di scrittura di `Booking`, esattamente il
  tipo di debito che questo slice vuole eliminare.

## Rubric check

1. **Professionalità** — l'invariante più importante del prodotto ottiene una garanzia strutturale (constraint DB),
   non solo una convenzione applicativa; difesa in profondità è la scelta di un gestionale serio su dati che non
   possono corrompersi.
2. **Convenzioni** — riusa il pattern raw-SQL + mapping `SQLSTATE → 409` già in uso per `Rate_signature_key`
   ([D-032](../deferred.md)); segue lo stesso schema di migrazione con backfill sotto RLS (`NO FORCE`/`FORCE`)
   introdotto dallo slice Equipment ([ADR-0036](0036-equipment-catalogo-e-composizione.md)).
3. **Modularità** — il constraint e il trigger vivono nel DB, indipendenti dal codice applicativo; il controllo
   applicativo resta il solo posto che esprime prelazione e logica di rinnovo, che il DB non può rappresentare.
4. **Zero debito** — nessun secondo percorso di scrittura può bypassare la garanzia (il trigger è DB-autoritativo);
   l'irrobustimento della validazione stagioni chiude alla radice l'unico caso di 409 spurio; le parti fuori scope
   (prelazione, split periodica) sono tracciate in ADR-0034 e D-033, non lasciate ambigue.
