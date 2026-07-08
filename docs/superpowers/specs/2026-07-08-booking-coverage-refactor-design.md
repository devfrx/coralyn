# Spec — Occupazione a intervalli: `BookingCoverage` (refactor behaviour-preserving)

> Design **CONFERMATO** in brainstorming con l'utente (2026-07-08). **Spec 1 di 2** della sotto-slice
> **sospensione** di **D-013**: qui **solo** il refactor strutturale che sposta l'occupazione fisica da
> `Booking.startDate/endDate` a una tabella figlia `BookingCoverage` (1..N intervalli), rilloccando il
> vincolo anti-overlap. **Nessun cambiamento di comportamento visibile**: criterio di successo = tutti i
> test esistenti restano verdi, occupazione/mappa/report identici. La **sospensione** (buco di copertura +
> rimborso) è la **Spec 2**, additiva su questo modello. **Nuovo [ADR-0046]** (scritto in fase di
> implementazione): rilloca [ADR-0037](../../architecture/decisions/0037-anti-overlap-exclusion-constraint.md)
> senza indebolirlo. Prossima azione dopo l'ok utente sulla spec: `writing-plans` (TDD).

---

## 1. Perché (contesto e motivazione)

La prossima feature di dominio è la **sospensione temporanea di un abbonamento** (D-013, sotto-slice
2/3), con **rivendita abilitata** del posto liberato (deciso in brainstorming: la sospensione è un atto
esplicito e concordato operatore↔abbonato, coerente con l'invariante di [D-035](../../architecture/deferred.md)
"niente presunzione d'assenza"). Una sospensione `[S … R-1]` è un **buco nel mezzo** dell'intervallo di un
abbonamento: l'ombrellone+fascia torna disponibile per quei giorni e poi l'abbonamento riprende.

Il modello attuale **non sa rappresentare un buco**. L'occupazione è espressa dal singolo `daterange`
contiguo `[startDate, endDate]` della riga `Booking`, e l'invariante anti-overlap è garantita da un vincolo
Postgres `EXCLUDE USING gist` **per-riga** (`booking_no_overlap`, [ADR-0037]) su quel `daterange`. Un
`EXCLUDE` per-riga può esprimere solo un intervallo contiguo: non può "sottrarre" un buco centrale né fare
`JOIN` a una tabella figlia. Aprire alla rivendita `[S … R-1]` lasciando occupati `[start … S-1]` e
`[R … end]` è quindi **strutturalmente impossibile** finché l'occupazione vive sul singolo range di riga.

Le due alternative strutturalmente sane sono:
- **Split** dell'abbonamento in due righe contigue — riusa ADR-0037 invariato, ma frammenta l'identità
  dell'abbonamento e **non scala** a [D-035](../../architecture/deferred.md), che libera *singoli
  fascia+giorno sparsi* (15 giorni segnalati ⇒ 16 frammenti): produrrebbe un **secondo** meccanismo di
  carve-out, cioè debito (due modi per lo stesso concetto "rivendi sopra un abbonamento").
- **Intervalli di copertura** — l'occupazione fisica diventa una tabella figlia `BookingCoverage` (1..N
  intervalli per prenotazione) e il vincolo anti-overlap si **rilloca** su di essa. Sospensione (buco
  contiguo) **e** D-035 (buchi per-giorno) diventano entrambe *additive* sopra lo stesso primitivo.

Scelta confermata: **intervalli di copertura**. È la via che rimuove il difetto di modello **alla radice**
— la confusione, finora innocua, tra *span di contratto* e *occupazione fisica* — e che onora la sinergia
D-013→D-035 per cui questa sequenza è stata scelta.

## 2. Scope di questa spec

- **IN scope:** introdurre `BookingCoverage`; spostare l'occupazione fisica (letture di disponibilità,
  mappa, report, metriche) su di essa; rilloccare `booking_no_overlap` e il trigger minuti-fascia sulla
  nuova tabella **preservandone esattamente la semantica**; migrazione con backfill 1:1; ADR-0046.
- **FUORI scope (Spec 2 — sospensione):** l'endpoint/UI di sospensione, il buco di copertura, il
  rimborso/credito. Questa spec **non aggiunge alcuna capacità utente**: alla fine, ogni prenotazione ha
  **esattamente un** intervallo di copertura `[startDate, endDate]` come oggi.
- **FUORI scope (futuro):** i release per-fascia+giorno di [D-035](../../architecture/deferred.md); la
  ridefinizione dell'occupancy% ([D-036](../../architecture/deferred.md)).

**Criterio di successo:** il refactor è "riuscito" se **non si nota**. Comportamento identico; tutti i
test esistenti verdi senza modifiche di asserzione (salvo l'adeguamento dei fixture che oggi scrivono
`startDate/endDate` per simulare occupazione — vedi §8).

## 3. Il modello

### 3.1 Due concetti finora coincidenti, ora separati

| Concetto | Significato | Dove vive |
|---|---|---|
| **Span nominale** (contratto) | Il periodo che il cliente ha comprato: guida prezzo (`prezzo × giorni`), rinnovo, prelazione, seniority, stagione | `Booking.startDate/endDate` — **INVARIATO** |
| **Copertura effettiva** (occupazione fisica) | Quali intervalli di date l'ombrellone+fascia è *davvero* occupato: guida disponibilità, mappa, report | Nuova `BookingCoverage` (1..N intervalli) |

Finché non esiste la sospensione i due coincidono, quindi oggi la loro fusione è innocua. Con la
sospensione divergono realmente: un abbonato sospeso ha **ancora il contratto** sull'intera stagione (e
i suoi diritti di rinnovo/prelazione), ma **non occupa** il buco. Tenerli separati è modellazione
corretta, non duplicazione.

### 3.2 `BookingCoverage` (bozza schema)

```prisma
model BookingCoverage {
  id              String   @id @default(uuid()) @db.Uuid
  bookingId       String   @db.Uuid
  establishmentId String   @db.Uuid   // denormalizzato per RLS FORCE tenant-scoped
  umbrellaId      String   @db.Uuid   // denormalizzato: il constraint GiST è per-riga, non fa JOIN
  startDate       DateTime @db.Date
  endDate         DateTime @db.Date
  // Occupazione oraria denormalizzata dalla fascia (minuti), DB-autoritativa via trigger (come ADR-0037).
  slotStartMin    Int      @default(0)
  slotEndMin      Int      @default(0)
  // Stato denormalizzato dal Booking: il partial WHERE del constraint ('confirmed') vive per-riga qui.
  status          BookingStatus

  booking      Booking      @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  @@index([bookingId])
  @@index([establishmentId, startDate, endDate])
  @@index([umbrellaId])
}
```

Note di modello:
- `umbrellaId`, `slotStartMin/slotEndMin`, `status` sono **denormalizzati** perché il vincolo `EXCLUDE`
  è per-riga e non può leggerli via `JOIN` — stessa filosofia "denormalizza ciò che serve al constraint,
  mantenuto DB-autoritativo da trigger" già adottata da [ADR-0037] per i minuti-fascia. La fascia
  (`timeSlotId`) **non** serve sulla coverage: una prenotazione è di **una** fascia, costante su tutti i
  suoi intervalli, quindi resta su `Booking`; alla coverage servono solo i **minuti** materializzati per
  il constraint.
- `ON DELETE Cascade`: cancellare/eliminare un `Booking` rimuove le sue coverage.
- **RLS FORCE** tenant-scoped su `establishmentId`, come le altre tabelle di dominio.

### 3.3 Trigger (DB-autoritativi, spostati/aggiunti)

1. **Riempimento minuti** — `BEFORE INSERT OR UPDATE ON "BookingCoverage"`: legge la fascia della
   prenotazione madre (`Booking.timeSlotId → TimeSlot.startTime/endTime`) e scrive `slotStartMin/slotEndMin`
   in minuti. È il gemello, spostato sulla coverage, dell'attuale `booking_fill_slot_minutes_trg`. L'app
   **non** scrive mai questi due campi (i `@default(0)` sono segnaposto mai osservati).
2. **Propagazione stato** — `AFTER UPDATE OF "status" ON "Booking"`: replica `Booking.status` su tutte le
   sue `BookingCoverage`, così il partial `WHERE status='confirmed'` del constraint resta esatto quando una
   prenotazione passa a `cancelled`. (Alla creazione, la coverage nasce con lo `status` della madre.)

### 3.4 Il vincolo rilloccato (semantica **identica**)

```sql
ALTER TABLE "BookingCoverage" ADD CONSTRAINT coverage_no_overlap EXCLUDE USING gist (
  "umbrellaId"                                  WITH =,
  daterange("startDate", "endDate", '[]')       WITH &&,   -- inclusivo (= dateRangesOverlap)
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&    -- semiaperto (= slotsOverlap)
) WHERE (status = 'confirmed');
```

Semantica **deliberatamente identica** a `booking_no_overlap`: stessi tre assi, stessi estremi
(date inclusive, minuti semiaperti), stesso filtro `confirmed`. L'unica differenza è la **sorgente** delle
righe (intervalli di copertura invece della riga prenotazione). Con **un** intervallo per prenotazione —
lo stato dopo questo refactor — il constraint è **equivalente** a quello attuale. Il vecchio
`booking_no_overlap` e le colonne `Booking.slotStartMin/slotEndMin` + il vecchio trigger vengono
**rimossi** (niente doppia sorgente di verità).

## 4. Il cuore di correttezza: occupazione fisica vs contratto

Il rischio del refactor è classificare male un sito di lettura. **Non tutti gli overlap di date sono
occupazione.** Regola: se la lettura decide *"questo ombrellone+fascia è fisicamente occupato in queste
date?"* → **coverage**. Se decide *"a quale stagione/contratto appartiene questa prenotazione, e quali
diritti ha?"* → **span nominale (invariato)**.

### 4.1 Letture di OCCUPAZIONE fisica → passano a `BookingCoverage`
- **Anti-overlap in create** — `bookings.service.ts` `priceAndWrite()` (`sameUmbrella` findMany + filtro
  `dateRangesOverlap && slotsOverlap`, righe ~205-216): l'insieme candidato diventa le **coverage** dello
  stesso ombrellone che intersecano `[dbStart, dbEnd]`; l'esclusione del rinnovo passa da `id !=
  previousBookingId` a `bookingId != previousBookingId`.
- **Query giornaliera della mappa** — `map.service.ts` (righe ~31-35): oggi filtra `Booking` per
  `startDate<=day<=endDate`; diventa una query sulle **coverage** che coprono `day` (join alla madre per
  `type`). La projection `map.projection.ts` (`BookingForMap = {umbrellaId, timeSlotId, type}`) resta di
  forma invariata — cambia solo **come** si popola la sorgente.
- **Report occupazione** — `report.projection.ts` `occupancyStates` + `reports.service.ts` (~60-62):
  seguono la mappa **automaticamente** (leggono `getDayMap`), nessun cambio proprio.
- **Metriche piattaforma — occupazione oggi** — `platform-metrics.service.ts` (~57-61): gli ombrelloni
  occupati oggi si contano dalle **coverage** che coprono oggi.
- **Lista prenotazioni del giorno** — `bookings.service.ts` `listByDate()` (~42-53): "prenotazioni attive
  in una data" è occupazione → dalle coverage che coprono la data (un abbonamento **sospeso** quel giorno
  non deve comparire — sarà la Spec 2 a sfruttarlo; qui il comportamento è identico perché 1 coverage =
  span pieno).

### 4.2 Letture di CONTRATTO/STAGIONE → restano sullo span nominale (INVARIATE)
- **Prelazione / hold di rinnovo** ([ADR-0034]) — `bookings.service.ts` `priceAndWrite()` blocco hold
  (~218-262), `renewal-campaigns.service.ts` aventi-diritto (~107-116), `renewal-window.projection.ts`:
  l'eligibilità è "il **contratto** dell'abbonato interseca la **stagione** di origine?" — concetto di
  contratto, non di occupazione. **Un abbonato sospeso conserva la prelazione.** Restano su
  `Booking.startDate/endDate`. *(Rischio classificato ma respinto: l'inventario automatico le aveva
  marcate "occupazione" — è errato sul piano di dominio.)*
- **Prelazione nella Scheda cliente** — `bookings.service.ts` `listByCustomer()/prelazioneFor()` (~87-104):
  contratto vs stagione. Invariata.
- **Prezzo** — `pricing.engine.ts` `daysInclusive` + `isApplicable` (~45-49, 76-99): durata di **contratto**
  → prezzo. Invariata.
- **Derivazione stagione / nome stagione** — `catalog.service.ts` `resolveSeasonWithin`,
  `customer-booking.projection.ts` `resolveSeasonName`: a quale stagione appartiene. Invariate.
- **Conteggi abbonamenti attivi / enrollment** — `reports.service.ts` (~47-49),
  `platform-metrics.service.ts` (~54-56), `bookings.service.ts` lista abbonati stagione (~392-417):
  contratto, non occupazione. Invariate.
- **Governance GDPR** — `customers.service.ts` (~79-86 booking attivi/futuri; ~100-114 eligibilità
  campagna): regole su contratto/diritti, non occupazione. Invariate.
- **Validazioni rinnovo** (`dest.startDate > origin.endDate`) — `renewal-campaigns.service.ts` (~25-52),
  `bookings.service.ts` `renew()` pre-flight (~365-373): regola di business. Invariate.
- **Marshalling DTO** — `booking.projection.ts`: `startDate/endDate` restano i campi di contratto nel DTO.
  Invariato.
- **Disdetta** — `bookings.service.ts` `terminate()` (~466-514): tronca lo span di **contratto**
  (l'abbonamento finisce davvero prima). Post-refactor deve troncare **anche** la coverage (l'unico
  intervallo) allo stesso `E-1`. È l'unico punto "contratto" che tocca **anche** la coverage, perché la
  disdetta accorcia entrambi. *(Additivo minimo; nessun cambio di comportamento osservabile.)*

## 5. Migrazione (raw SQL, pattern backfill sotto RLS)

Segue il pattern di [ADR-0037]/Equipment (`NO FORCE`/`FORCE` attorno alla lettura di backfill):
1. `CREATE TABLE "BookingCoverage"` (+ indici, + RLS `ENABLE`/`FORCE` con policy tenant come le altre).
2. **Backfill 1:1:** una coverage per ogni `Booking` esistente, copiando
   `establishmentId/umbrellaId/startDate/endDate/status` e i minuti dal `TimeSlot` (o lasciando che li
   riempia il trigger di `INSERT`).
3. `CREATE TRIGGER` riempimento-minuti su `BookingCoverage`; `CREATE TRIGGER` propagazione-stato su
   `Booking`.
4. `ADD CONSTRAINT coverage_no_overlap` (§3.4).
5. `DROP CONSTRAINT booking_no_overlap`; `DROP TRIGGER booking_fill_slot_minutes_trg`; `DROP COLUMN
   "Booking"."slotStartMin"`, `"slotEndMin"`.

`migrate deploy` su **dev e test** (mai `db push`). Nota gotcha: il purge pnpm può azzerare il Prisma
client → rigenerare prima dei test api.

## 6. Contracts / API

**Nessun cambiamento ai contracts.** `BookingCoverage` è interno all'api; non compare in alcun DTO
(l'occupazione è già esposta in forma proiettata da `DayMapDTO`, invariato). Nessun nuovo endpoint.
Conseguenza: `@coralyn/contracts` **non** cambia in questa spec (cambierà nella Spec 2).

## 7. Impatto per file (indicativo — dettaglio nel piano)
- **`apps/api/prisma/schema.prisma`** — `model BookingCoverage`; relazione su `Booking`; rimozione
  `slotStartMin/slotEndMin` da `Booking`.
- **`apps/api/prisma/migrations/<ts>_booking_coverage/migration.sql`** (nuova) — §5.
- **`apps/api/src/bookings/booking.availability.ts`** — invariato (le utility `slotsOverlap`/
  `dateRangesOverlap` restano; cambiano i chiamanti).
- **`apps/api/src/bookings/bookings.service.ts`** — `priceAndWrite()` legge/scrive coverage (create:
  inserisce 1 coverage; overlap check dalle coverage); `renew()` esclusione via `bookingId`; `terminate()`
  tronca anche la coverage; `listByDate()` dalle coverage. Prelazione/hold **invariati**.
- **`apps/api/src/map/map.service.ts`** — query giornaliera dalle coverage.
- **`apps/api/src/map/map.projection.ts`** — invariato (forma sorgente identica).
- **`apps/api/src/reports/*`**, **`platform-metrics.service.ts`** — occupazione dalle coverage (via mappa
  per i report; diretta per la metrica piattaforma).
- **Test:** unit di `priceAndWrite`/map/report adeguati alla nuova sorgente; **un test a livello DB** che
  pinna `coverage_no_overlap` contro l'errore reale del constraint (come fa oggi ADR-0037 per
  `booking_no_overlap`); e2e invariati nel comportamento.

## 8. Test / baseline (da non regredire)
- **Baseline da catturare all'avvio implementazione** (ultimo noto: ui-kit **111** · web-staff **316** ·
  web-platform **16**; api unit/e2e da rileggere post-disdetta D-013). Il refactor **non deve cambiare i
  conteggi di comportamento**: gli e2e di mappa/booking/report/prelazione restano verdi **con le stesse
  asserzioni**.
- **Unico adeguamento test lecito:** i fixture/seed che oggi creano occupazione scrivendo un `Booking`
  ora devono creare **anche** la sua coverage (o affidarsi al percorso `create` che la inserisce). Nessuna
  *asserzione* di comportamento cambia.
- **Nuovo test di parità DB** obbligatorio: Giorno-Intero-vs-Mattina, fasce contigue (non collidono),
  cancellate (non bloccano), rinnovo adiacente (non spurio) — gli stessi casi di [ADR-0037], ora contro
  `coverage_no_overlap`, a dimostrare parità.
- Gotcha: rebuild `@coralyn/contracts` **non** necessario (contracts invariati); `migrate deploy` a
  dev+test; e2e ts-jest **type-checka** → `--runInBand`; il purge azzera il Prisma client (rigenerare).

## 9. Verifica LIVE (Docker) prima di presentare
- Rebuild api dal branch; `migrate deploy`. Sull'ombrellone dell'utente (dati preservati): mappa, drawer,
  report **identici** a prima del refactor. Una create/renew/disdetta si comporta come prima. Il caso
  Giorno-Intero-vs-Mattina resta bloccato (409 gentile). Nessuna differenza osservabile = successo.

## 10. Rubric check ([ADR-0002](../../architecture/decisions/0002-decision-rubric.md))
1. **Professionalità** — rimuove alla radice la confusione contratto/occupazione invece di aggirarla con
   uno split che frammenta l'identità; l'invariante più critico del prodotto resta garantito a livello DB.
2. **Convenzioni** — riusa i pattern già in casa: `EXCLUDE gist` + trigger DB-autoritativo + denormalizzazione
   mirata ([ADR-0037]), backfill sotto RLS (Equipment), mapping `SQLSTATE→409` invariato.
3. **Modularità** — separa "contratto" (Booking) da "occupazione" (BookingCoverage); l'occupazione ha una
   sola sorgente di verità; il constraint vive dove vive il dato che governa.
4. **Zero debito** — è l'investimento che **evita** il debito (due meccanismi di carve-out per D-013 e
   D-035); non lascia doppia sorgente (vecchio constraint/colonne rimossi); le parti fuori scope
   (sospensione, release D-035, occupancy%) sono tracciate, non silenziose.

## 11. Prossimi passi
1. Ok utente su questa spec.
2. `writing-plans` (TDD, ordine per layer: schema+migration+trigger+constraint → riscrittura letture
   occupazione con parità → test DB parità + adeguamento fixture → verifica LIVE). **ADR-0046** scritto
   nel primo commit di dominio.
3. `subagent-driven-development` + review a due stadi per layer + whole-branch (opus).
4. Verifica LIVE (§9). Presentare e attendere conferma per il merge FF.
5. A seguire: **Spec 2 — sospensione** (buco di copertura + rimborso), additiva su questo modello.
