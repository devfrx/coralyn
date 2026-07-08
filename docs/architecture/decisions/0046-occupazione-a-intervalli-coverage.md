# ADR-0046: Occupazione fisica a intervalli — `BookingCoverage`

- **Status:** Accepted
- **Data:** 2026-07-08
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0037](0037-anti-overlap-exclusion-constraint.md) (**rilloccato** da questo ADR: l'invariante
  anti-overlap si sposta dal `Booking` alla nuova `BookingCoverage`, con semantica **identica**, non indebolita),
  [ADR-0006](0006-dominio-prenotazioni-e-pricing.md)/[ADR-0013](0013-granularita-disponibilita-a-slot.md) (l'unità
  di occupazione resta (Ombrellone, data, Fascia); ora è espressa da intervalli di copertura anziché dallo span
  diretto della prenotazione). Spec: `.superpowers/sdd/task-1-brief.md` (D-013, spec 1/2).

## Context

[D-013](../deferred.md) (sospensione abbonamento) e [D-035](../deferred.md) (release per-giorno) richiedono di
poter aprire un **buco** nell'occupazione fisica di un abbonamento — un intervallo di date in cui l'ombrellone
torna disponibile pur restando l'abbonamento attivo sul resto della stagione. Oggi l'occupazione fisica coincide
1:1 con `Booking.startDate/endDate`: un solo `daterange` per riga, vincolato dall'`EXCLUDE` `booking_no_overlap`
([ADR-0037](0037-anti-overlap-exclusion-constraint.md)). Un `EXCLUDE` per-riga su un solo intervallo non può
esprimere "occupato dal 1 al 10, libero dall'11 al 15, occupato dal 16 al 30": la sospensione richiederebbe di
spezzare lo span di un abbonamento in più intervalli fisici, mantenendo però intatto lo span di **contratto**
(la stagione a cui il cliente ha diritto, la fatturazione, il rinnovo).

Serve quindi separare due concetti finora coincidenti: lo span **contrattuale** di una prenotazione (`Booking`,
invariato) e la sua occupazione **fisica** effettiva sull'ombrellone (che deve poter diventare 1..N intervalli).

## Decision

**L'occupazione fisica diventa una tabella figlia `BookingCoverage`**, con 1..N righe per `Booking` (in questo
task, sempre esattamente 1: nessuna sospensione ancora implementata — vedi "Equivalenza" sotto).

```prisma
model BookingCoverage {
  id              String        @id @default(uuid()) @db.Uuid
  bookingId       String        @db.Uuid
  establishmentId String        @db.Uuid
  umbrellaId      String        @db.Uuid
  startDate       DateTime      @db.Date
  endDate         DateTime      @db.Date
  slotStartMin    Int           @default(0)
  slotEndMin      Int           @default(0)
  status          BookingStatus
  ...
}
```

L'`EXCLUDE` constraint anti-overlap si **rilloca** dalla `Booking` alla `BookingCoverage`, con semantica
**deliberatamente identica** a `booking_no_overlap` ([ADR-0037](0037-anti-overlap-exclusion-constraint.md)):

```sql
ALTER TABLE "BookingCoverage" ADD CONSTRAINT coverage_no_overlap EXCLUDE USING gist (
  "umbrellaId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&,
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&
) WHERE (status = 'confirmed');
```

`umbrellaId`, i minuti-fascia e `status` sono **denormalizzati** sulla coverage (come già erano su `Booking`,
[ADR-0037](0037-anti-overlap-exclusion-constraint.md)) e mantenuti **DB-autoritativi** da due trigger:

- `coverage_fill_slot_minutes_trg` (`BEFORE INSERT OR UPDATE OF "bookingId"`): legge la fascia della prenotazione
  madre via `TimeSlot` e popola i minuti — stesso pattern di `booking_fill_slot_minutes_trg`.
- `booking_sync_coverage_status_trg` (`AFTER UPDATE OF "status" ON "Booking"`): propaga lo `status` del `Booking`
  a **tutte** le sue coverage, così il partial `WHERE (status = 'confirmed')` del constraint resta corretto senza
  che l'app debba scrivere lo status due volte.

`Booking.startDate/endDate` **restano lo span di contratto**, invariati nel significato. Non vengono toccati da
questo task.

### Equivalenza con 1 intervallo per prenotazione

Con esattamente 1 coverage per booking (lo stato di questo task — nessun carve-out ancora possibile), il modello
è **equivalente** al precedente: la coverage è una copia 1:1 dello span del booking, il constraint ha la stessa
identica semantica, e i trigger derivano gli stessi valori che derivavano prima sul `Booking`. Il comportamento
osservabile dell'applicazione (mappa, creazione, disdetta) **non cambia**.

Il vecchio `booking_no_overlap` **resta attivo e primario** su `Booking` in questo task: non viene rimosso, né lo
sono le colonne `Booking.slotStartMin/slotEndMin`. `coverage_no_overlap` è quindi ridondante in questa fase per
costruzione (mai violabile senza che lo sia anche `booking_no_overlap`) — è la fase **EXPAND** di un parallel-change:
la rimozione del vecchio constraint/colonne è demandata a un task successivo (**CONTRACT**), dopo aver verificato in
produzione che la coverage scrive correttamente.

## Consequences

### Positive
- **Sospensione e D-035 diventano carve-out additivi**: aprire un buco significherà troncare/spezzare le righe di
  `BookingCoverage` di un abbonamento, senza toccare lo span di contratto (`Booking.startDate/endDate`), fatturazione
  o rinnovo.
- **Nessuna regressione**: con 1 coverage per booking il comportamento è identico bit-per-bit a prima; la migrazione
  è dietro le quinte (backfill 1:1 + trigger).
- **Separazione netta contratto/occupazione**: un futuro schema con 1 `Booking` e N `BookingCoverage` è già
  rappresentabile senza ulteriori migrazioni strutturali.

### Negative / Trade-off
- **Una tabella figlia + due trigger in più da mantenere** — mitigato: sono DB-autoritativi (minuti e status non
  richiedono disciplina applicativa), stesso pattern già validato da [ADR-0037](0037-anti-overlap-exclusion-constraint.md).
- **Doppio scrittura per ogni booking** (riga `Booking` + riga `BookingCoverage`) nel percorso di creazione —
  accettato: è il costo minimo per introdurre il grado di libertà necessario a D-013/D-035.
- **Fase transitoria con due constraint ridondanti** (`booking_no_overlap` + `coverage_no_overlap`) fino al task
  CONTRACT — tracciato esplicitamente, non debito silenzioso.

### Neutre / Note
- Questo task (**EXPAND**) non implementa ancora la sospensione: crea solo l'infrastruttura (tabella, backfill,
  trigger, scrittura app) mantenendo il comportamento identico. Il task **CONTRACT** (rimozione del vecchio
  constraint/colonne) e l'implementazione della sospensione vera e propria sono fuori scope qui.

## Alternatives considered

- **Aggiungere direttamente colonne "buco" su `Booking`** (es. `suspendedFrom`/`suspendedTo`) — scartata: rappresenta
  solo un singolo buco, non generalizza a N carve-out futuri (D-035 release per-giorno multipli), e mescola
  contratto e occupazione fisica nella stessa riga.
- **Migrare `booking_no_overlap` direttamente in-place senza tabella figlia** (multirange su `Booking`) — scartata:
  Postgres multirange richiede v14+ e comunque non risolve la necessità di uno span di contratto stabile separato
  dall'occupazione; la tabella figlia è più esplicita e coerente con l'ADR-0037 esistente.
- **Big-bang (creare la coverage e rimuovere subito il vecchio constraint/colonne)** — scartata: viola il principio
  di parallel-change sicuro; questo task è deliberatamente solo la fase EXPAND, per poter verificare in produzione
  prima di rimuovere la rete di sicurezza precedente.

## Rubric check

1. **Professionalità** — la garanzia strutturale sull'invariante anti-overlap (l'invariante più importante del
   prodotto, [ADR-0037](0037-anti-overlap-exclusion-constraint.md)) non viene indebolita durante la migrazione:
   resta doppiamente garantita (vecchio + nuovo constraint) finché non si verifica la correttezza del nuovo percorso.
2. **Convenzioni** — riusa esattamente il pattern trigger DB-autoritativo + `EXCLUDE` gist + backfill sotto RLS
   (`NO FORCE`/`FORCE`) di [ADR-0037](0037-anti-overlap-exclusion-constraint.md) e dello slice Equipment.
3. **Modularità** — separa nettamente contratto (`Booking`) da occupazione fisica (`BookingCoverage`); i trigger
   vivono nel DB, indipendenti dal codice applicativo.
4. **Zero debito** — la fase transitoria (due constraint ridondanti) è esplicitamente tracciata come nota, non
   lasciata ambigua; il task CONTRACT che la chiude è già pianificato.
