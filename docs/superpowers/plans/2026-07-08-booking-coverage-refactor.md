# BookingCoverage Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spostare l'occupazione fisica delle prenotazioni da `Booking.startDate/endDate` (+ minuti-fascia) a una tabella figlia `BookingCoverage` (1..N intervalli), rilloccando il vincolo GiST anti-overlap, **senza alcun cambiamento di comportamento**.

**Architecture:** Refactor **parallel-change** in tre fasi verdi. **Expand** (Task 1): crea `BookingCoverage`, backfill 1:1, trigger + `coverage_no_overlap`, e fa scrivere la coverage a tutti i percorsi di scrittura — **tenendo** il vecchio `booking_no_overlap` come rete. **Migrate** (Task 2): sposta tutte le **letture** d'occupazione sulla coverage. **Contract** (Task 3): rimuove vecchio constraint/colonne/trigger e riscrive il test di parità. Task 4: suite completa + verifica LIVE + doc. `Booking.startDate/endDate` restano lo **span di contratto** (prezzo/rinnovo/prelazione/seniority): invariati.

**Tech Stack:** NestJS + Prisma 5 + Postgres (RLS FORCE tenant-scoped, `btree_gist` EXCLUDE constraint, trigger plpgsql). Test: jest (unit) + jest e2e (`--runInBand`, ts-jest type-checka). Monorepo pnpm (`corepack pnpm`).

## Global Constraints

- **pnpm, MAI npm.** Sempre `corepack pnpm` dalla root. Se chiede purge senza TTY → `CI=true corepack pnpm install`. Il purge può azzerare il Prisma client → se i test api falliscono con errori Prisma, `corepack pnpm --filter @coralyn/api exec prisma generate`.
- **Migrazioni:** `migrate deploy` (o `migrate dev` in sviluppo per generare), **MAI `db push`**. Applicare a **dev E test DB**. Prisma è cieco a trigger/constraint/RLS raw (come già per `booking_no_overlap`): vivono nella `migration.sql`, non nello schema.
- **api e2e:** `corepack pnpm --filter @coralyn/api test:e2e --runInBand` (paralleli flaky su questa macchina). Targettabile con `-- <pattern>`.
- **`@coralyn/contracts` NON cambia** in questo piano (nessun DTO/endpoint nuovo) → nessun rebuild contracts necessario.
- **RLS policy tenant** (copiare verbatim, sostituendo il nome tabella):
  ```sql
  ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "<T>" FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON "<T>"
    USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
    WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
  ```
- **Criterio di successo globale:** tutti i test esistenti restano verdi **con le stesse asserzioni di comportamento**. L'unico adeguamento test lecito è nei fixture che fabbricano occupazione con insert diretti di `Booking` (devono creare anche la coverage) e nella riscrittura del test di parità DB (Task 3).
- **Baseline da catturare all'avvio** (Step 0 di Task 1): eseguire e annotare i conteggi verdi di partenza (api unit, api e2e, web-staff, ui-kit). FE (web-staff/ui-kit) deve restare invariato a fine piano (nessun file FE toccato).

---

### Task 1: Expand — `BookingCoverage` + backfill + constraint + scrittura coverage (vecchio constraint mantenuto)

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_booking_coverage/migration.sql`
- Create: `docs/architecture/decisions/0046-occupazione-a-intervalli-coverage.md`
- Modify: `apps/api/prisma/schema.prisma` (aggiungi `model BookingCoverage`; aggiungi relazione `coverages` su `Booking`; **non** rimuovere ancora `slotStartMin/slotEndMin` da `Booking`)
- Modify: `apps/api/src/bookings/bookings.service.ts` (`priceAndWrite` inserisce la coverage; `terminate` tronca anche la coverage)
- Create: `apps/api/test/helpers/insert-booking-with-coverage.ts` (helper per i test che bypassano il service)
- Test: `apps/api/test/booking-coverage.e2e-spec.ts` (nuovo — backfill + constraint su coverage)

**Interfaces:**
- Produces: tabella `BookingCoverage { id, bookingId, establishmentId, umbrellaId, startDate, endDate, slotStartMin, slotEndMin, status }`; relazione Prisma `Booking.coverages: BookingCoverage[]`; constraint `coverage_no_overlap`; trigger `coverage_fill_slot_minutes_trg` (BEFORE INSERT/UPDATE OF bookingId su coverage) e `booking_sync_coverage_status_trg` (AFTER UPDATE OF status su Booking); helper `insertBookingWithCoverage(prisma, tenantId, data)`.
- Consumes: schema esistente (`Booking`, `TimeSlot`, `Establishment`, enum `BookingStatus`), pattern RLS (Global Constraints), trigger/constraint esistenti (`apps/api/prisma/migrations/20260703101757_booking_slot_minutes_anti_overlap/migration.sql`).

- [ ] **Step 0: Cattura baseline verde**

Run:
```
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e --runInBand
```
Annota i due conteggi (es. "api unit N · e2e M"). Sono il riferimento "non regredire".

- [ ] **Step 1: Scrivi l'ADR-0046**

Crea `docs/architecture/decisions/0046-occupazione-a-intervalli-coverage.md` con: **Status** Accepted, data 2026-07-08, **ADR correlati** [ADR-0037] (rilloccato: l'anti-overlap si sposta su `BookingCoverage` senza indebolire la semantica), [ADR-0006]/[ADR-0013] (l'unità d'occupazione resta (ombrellone, data, fascia), ora espressa da intervalli di copertura). **Context:** la sospensione (D-013) e i release per-giorno (D-035) richiedono un *buco* nell'occupazione di un abbonamento; un `EXCLUDE` per-riga su un solo `daterange` non lo esprime. **Decision:** l'occupazione fisica diventa `BookingCoverage` (1..N intervalli per prenotazione); il constraint anti-overlap si rilloca sulla coverage con semantica **identica** (`umbrellaId=`, `daterange '[]'`, `int4range '[)'`, `WHERE status='confirmed'`); `umbrellaId`/minuti/`status` denormalizzati sulla coverage e mantenuti DB-autoritativi da trigger; `Booking.startDate/endDate` restano lo span di **contratto**. Con 1 intervallo per prenotazione il modello è **equivalente** al precedente. **Consequences:** separazione netta contratto/occupazione; sospensione e D-035 diventano carve-out additivi; una tabella figlia + due trigger da mantenere (mitigato: DB-autoritativi). **Rubric check** (i 4 filtri, vedi spec §10). Segui la struttura degli ADR esistenti in `docs/architecture/decisions/`.

- [ ] **Step 2: Aggiorna `schema.prisma` (aggiunta, non rimozione)**

In `apps/api/prisma/schema.prisma`, dentro `model Booking` aggiungi la relazione (vicino alle altre relazioni):
```prisma
  coverages       BookingCoverage[]
```
E aggiungi il nuovo modello (dopo `model Booking`):
```prisma
model BookingCoverage {
  id              String        @id @default(uuid()) @db.Uuid
  bookingId       String        @db.Uuid
  establishmentId String        @db.Uuid
  umbrellaId      String        @db.Uuid
  startDate       DateTime      @db.Date
  endDate         DateTime      @db.Date
  // Occupazione oraria denormalizzata (minuti), DB-autoritativa via trigger coverage_fill_slot_minutes_trg.
  // @default(0) segnaposto mai osservato (il trigger sovrascrive sempre) — vedi ADR-0046/ADR-0037.
  slotStartMin    Int           @default(0)
  slotEndMin      Int           @default(0)
  // Stato denormalizzato da Booking: il partial WHERE del constraint ('confirmed') vive per-riga qui.
  status          BookingStatus

  booking         Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment   Establishment @relation(fields: [establishmentId], references: [id])

  @@index([bookingId])
  @@index([establishmentId, startDate, endDate])
  @@index([umbrellaId])
}
```
Aggiungi anche la relazione inversa in `model Establishment`:
```prisma
  bookingCoverages BookingCoverage[]
```
**Non** rimuovere `slotStartMin/slotEndMin` da `Booking` (fase contract, Task 3).

- [ ] **Step 3: Genera la migration ma sostituisci con la SQL raw**

Genera lo scheletro (crea la cartella migration senza applicare logica raw):
```
corepack pnpm --filter @coralyn/api exec prisma migrate dev --name booking_coverage --create-only
```
Poi **sostituisci** il contenuto di `apps/api/prisma/migrations/<timestamp>_booking_coverage/migration.sql` con esattamente:
```sql
-- Occupazione a intervalli (D-013 sospensione spec 1/2, ADR-0046). Fase EXPAND: crea BookingCoverage,
-- backfill 1:1 dai Booking, rillocca trigger minuti + EXCLUDE constraint sulla coverage. Il vecchio
-- booking_no_overlap e le colonne Booking.slotStartMin/slotEndMin RESTANO (rimossi in fase CONTRACT).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Tabella
CREATE TABLE "BookingCoverage" (
  "id"              UUID    NOT NULL,
  "bookingId"       UUID    NOT NULL,
  "establishmentId" UUID    NOT NULL,
  "umbrellaId"      UUID    NOT NULL,
  "startDate"       DATE    NOT NULL,
  "endDate"         DATE    NOT NULL,
  "slotStartMin"    INTEGER NOT NULL DEFAULT 0,
  "slotEndMin"      INTEGER NOT NULL DEFAULT 0,
  "status"          "BookingStatus" NOT NULL,
  CONSTRAINT "BookingCoverage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingCoverage_bookingId_idx" ON "BookingCoverage"("bookingId");
CREATE INDEX "BookingCoverage_establishmentId_startDate_endDate_idx" ON "BookingCoverage"("establishmentId","startDate","endDate");
CREATE INDEX "BookingCoverage_umbrellaId_idx" ON "BookingCoverage"("umbrellaId");
ALTER TABLE "BookingCoverage" ADD CONSTRAINT "BookingCoverage_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingCoverage" ADD CONSTRAINT "BookingCoverage_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Backfill 1:1 PRIMA di abilitare RLS sulla coverage (come pattern Equipment: gli INSERT avvengono
--    senza policy, poi si abilita). Booking NO FORCE per leggerlo (coralyn_app NOBYPASSRLS, GUC non impostata).
ALTER TABLE "Booking" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "BookingCoverage"
  ("id","bookingId","establishmentId","umbrellaId","startDate","endDate","slotStartMin","slotEndMin","status")
SELECT gen_random_uuid(), b."id", b."establishmentId", b."umbrellaId", b."startDate", b."endDate",
       b."slotStartMin", b."slotEndMin", b."status"
FROM "Booking" b;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;

-- 3) RLS tenant-isolation sulla coverage (dopo il backfill)
ALTER TABLE "BookingCoverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingCoverage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingCoverage"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

-- 4) Trigger DB-autoritativo minuti: legge la fascia della prenotazione madre a ogni INSERT/cambio bookingId.
CREATE OR REPLACE FUNCTION coverage_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME;
BEGIN
  SELECT t."startTime", t."endTime" INTO s, e
  FROM "Booking" b JOIN "TimeSlot" t ON t.id = b."timeSlotId"
  WHERE b.id = NEW."bookingId";
  IF s IS NULL THEN
    RAISE EXCEPTION 'Booking % o fascia inesistente per la coverage', NEW."bookingId";
  END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER coverage_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "bookingId" ON "BookingCoverage"
  FOR EACH ROW EXECUTE FUNCTION coverage_fill_slot_minutes();

-- 5) Trigger di propagazione stato: Booking.status → tutte le sue coverage (il partial WHERE vive qui).
CREATE OR REPLACE FUNCTION coverage_sync_status() RETURNS trigger AS $$
BEGIN
  UPDATE "BookingCoverage" SET "status" = NEW."status" WHERE "bookingId" = NEW."id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER booking_sync_coverage_status_trg
  AFTER UPDATE OF "status" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION coverage_sync_status();

-- 6) EXCLUDE constraint sulla coverage: semantica IDENTICA a booking_no_overlap (ADR-0037).
ALTER TABLE "BookingCoverage" ADD CONSTRAINT coverage_no_overlap EXCLUDE USING gist (
  "umbrellaId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&,
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&
) WHERE (status = 'confirmed');
```

- [ ] **Step 4: Applica la migration (dev + test DB) e rigenera il client**

Run:
```
corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Assicura che anche il **test DB** sia migrato (stessa `migrate deploy` puntata al DB di test, secondo la convenzione del repo). Se `migrate dev` al Step 3 ha già applicato a dev, `migrate deploy` è idempotente.
Expected: migration applicata, nessun errore; `BookingCoverage` esiste con tante righe quante `Booking`.

- [ ] **Step 5: Scrivi il test di backfill + constraint su coverage (deve fallire prima dell'app-write, poi passare)**

Crea `apps/api/test/booking-coverage.e2e-spec.ts`. Usa il pattern di `booking-overlap-constraint.e2e-spec.ts` (seed map tenant, insert diretto). Casi:
```ts
// 1) Backfill/scrittura: creando una prenotazione via API, esiste 1 coverage con lo stesso span e minuti.
// 2) coverage_no_overlap: due coverage dirette sovrapposte (stesso ombrellone/fascia/date) → 23P01.
// 3) fasce contigue (Mattina 08-13 + Pomeriggio 13-19) → accettate.
// 4) Giorno Intero 08-19 vs Mattina 08-13 → rifiutato (semantica oraria).
// 5) coverage 'cancelled' non blocca (partial WHERE).
// 6) trigger status-sync: settando Booking.status='cancelled', la sua coverage diventa 'cancelled'.
```
Per i casi 2-5 inserisci la coverage tramite l'helper del Step 7 (o insert diretto `tx.bookingCoverage.create` con un `bookingId` reale). Per il caso 6, crea una prenotazione via service, poi `tx.booking.update({status:'cancelled'})` e verifica `coverage.status`.

- [ ] **Step 6: Run del nuovo test — verifica che i casi app-write falliscano finché non implementi lo Step 8**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -- booking-coverage`
Expected: i casi che dipendono dalla scrittura app (1, 6) FALLISCONO (l'app non scrive ancora coverage / non c'è helper); i casi di solo-constraint (2-5) possono già passare.

- [ ] **Step 7: Crea l'helper `insertBookingWithCoverage`**

Crea `apps/api/test/helpers/insert-booking-with-coverage.ts`:
```ts
import type { PrismaService } from '../../src/prisma/prisma.service';

/** Inserisce un Booking confermato + la sua coverage 1:1, bypassando il service (per test DB-level).
 *  I minuti della coverage li riempie il trigger; lo status della coverage = quello del booking. */
export async function insertBookingWithCoverage(
  prisma: PrismaService,
  tenantId: string,
  data: {
    establishmentId: string; customerId: string; umbrellaId: string; timeSlotId: string;
    startDate: Date; endDate: Date; status?: 'confirmed' | 'cancelled';
  },
) {
  const status = data.status ?? 'confirmed';
  return prisma.forTenant(tenantId, async (tx) => {
    const booking = await tx.booking.create({
      data: {
        establishmentId: data.establishmentId, customerId: data.customerId,
        umbrellaId: data.umbrellaId, timeSlotId: data.timeSlotId,
        startDate: data.startDate, endDate: data.endDate, type: 'daily', status, totalPrice: 10,
      },
    });
    await tx.bookingCoverage.create({
      data: {
        bookingId: booking.id, establishmentId: data.establishmentId, umbrellaId: data.umbrellaId,
        startDate: data.startDate, endDate: data.endDate, status,
      },
    });
    return booking;
  });
}
```
Usa questo helper nei casi 2-5 del test dello Step 5.

- [ ] **Step 8: Fai scrivere la coverage all'app (`priceAndWrite` + `terminate`)**

In `apps/api/src/bookings/bookings.service.ts`, dentro `priceAndWrite`, sostituisci il blocco `return await tx.booking.create({...})` (righe ~279-299) con:
```ts
    try {
      const booking = await tx.booking.create({
        data: {
          establishmentId: p.tenantId,
          customerId: p.customerId,
          umbrellaId: p.umbrellaId,
          timeSlotId: p.slot.id,
          startDate: dbStart,
          endDate: dbEnd,
          type: p.type,
          status: 'confirmed',
          totalPrice,
          packageId: p.packageId,
          previousBookingId: p.previousBookingId,
        },
      });
      // Copertura effettiva (occupazione fisica): 1 intervallo = span nominale (ADR-0046). I minuti
      // li riempie il trigger coverage_fill_slot_minutes_trg. Il coverage_no_overlap scatta qui sotto
      // race, con lo stesso 23P01 → 409 gentile.
      await tx.bookingCoverage.create({
        data: {
          bookingId: booking.id,
          establishmentId: p.tenantId,
          umbrellaId: p.umbrellaId,
          startDate: dbStart,
          endDate: dbEnd,
          status: 'confirmed',
        },
      });
      return booking;
    } catch (e) {
      if (isBookingOverlapExclusion(e))
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      throw e;
    }
```
E in `terminate`, dopo `const row = await tx.booking.update({...})` (riga ~499), prima di `return { row }`, aggiungi il troncamento della coverage (l'abbonamento ha 1 coverage):
```ts
      await tx.bookingCoverage.updateMany({
        where: { bookingId: id },
        data: { endDate: lastValid },
      });
```

- [ ] **Step 9: Run del nuovo test + suite completa — tutto verde**

Run:
```
corepack pnpm --filter @coralyn/api test:e2e --runInBand -- booking-coverage
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e --runInBand
```
Expected: `booking-coverage` PASS; unit e e2e ai conteggi baseline dello Step 0 (o +N per i nuovi test), **zero regressioni**. Il vecchio `booking_no_overlap` è ancora primario, quindi mappa/create/disdetta si comportano identici.

- [ ] **Step 10: Commit**

```
git add apps/api/prisma docs/architecture/decisions/0046-occupazione-a-intervalli-coverage.md apps/api/src/bookings/bookings.service.ts apps/api/test/helpers/insert-booking-with-coverage.ts apps/api/test/booking-coverage.e2e-spec.ts
git commit -m "feat(api): BookingCoverage (expand) — occupazione a intervalli + constraint rilloccato (ADR-0046)"
```

---

### Task 2: Migrate — sposta tutte le letture d'occupazione sulla coverage

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (`priceAndWrite` pre-check overlap; `listByDate`)
- Modify: `apps/api/src/map/map.service.ts` (query giornaliera)
- Modify: `apps/api/src/platform/platform-metrics.service.ts` (occupazione oggi)
- Modify: `apps/api/test/reports.e2e-spec.ts` (fixture con insert diretti → usa l'helper del Task 1)
- Test: suite esistente (map/reports/bookings/prelazione) — deve restare verde con le stesse asserzioni

**Interfaces:**
- Consumes: `BookingCoverage` + relazione `coverages` + helper `insertBookingWithCoverage` (Task 1).
- Produces: nessun nuovo simbolo pubblico; cambia solo la **sorgente** delle letture d'occupazione.

- [ ] **Step 1: Sposta il pre-check anti-overlap di `priceAndWrite` sulla coverage**

In `apps/api/src/bookings/bookings.service.ts`, sostituisci il blocco `sameUmbrella` (righe ~205-216) con la lettura dalla coverage (join alla madre per la fascia; riusa `slotsOverlap`):
```ts
    // Anti-overlap su intervallo (ADR-0013): confronta con le COPERTURE confermate dello stesso
    // ombrellone (occupazione fisica, ADR-0046). Il rinnovo esclude le proprie coperture via bookingId.
    const coverages = await tx.bookingCoverage.findMany({
      where: {
        umbrellaId: p.umbrellaId,
        status: 'confirmed',
        ...(p.previousBookingId ? { bookingId: { not: p.previousBookingId } } : {}),
      },
      include: { booking: { include: { timeSlot: true } } },
    });
    const conflict = coverages.some(
      (c) => dateRangesOverlap(c.startDate, c.endDate, dbStart, dbEnd) && slotsOverlap(c.booking.timeSlot, p.slot),
    );
    if (conflict) throw new ConflictException('Fascia non disponibile per questo ombrellone');
```
(Il blocco **hold di prelazione** subito sotto, righe ~218-262, resta **INVARIATO**: legge lo span nominale vs la stagione — è contratto, non occupazione.)

- [ ] **Step 2: Sposta la query della mappa sulla coverage**

In `apps/api/src/map/map.service.ts`, sostituisci il `tx.booking.findMany` (righe ~31-35) con:
```ts
      const coverages = await tx.bookingCoverage.findMany({
        where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        orderBy: { booking: { createdAt: 'asc' } },
        select: { umbrellaId: true, booking: { select: { timeSlotId: true, type: true } } },
      });
      const bookings = coverages.map((c) => ({
        umbrellaId: c.umbrellaId,
        timeSlotId: c.booking.timeSlotId,
        type: c.booking.type,
      }));
```
(`projectDayMap`/`map.projection.ts` restano invariati: la forma `BookingForMap` è identica.)

- [ ] **Step 3: Sposta `listByDate` e la metrica occupazione-oggi sulla coverage**

In `apps/api/src/bookings/bookings.service.ts` `listByDate` (righe ~42-53), sostituisci il filtro `status/startDate/endDate` con un filtro sulla relazione coverage:
```ts
      where: { coverages: { some: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } } } },
```
(mantieni il resto della query — include/orderBy/select — invariato.)

In `apps/api/src/platform/platform-metrics.service.ts` (righe ~57-61), la conta degli ombrelloni occupati oggi passa dalle coverage:
```ts
    const occupied = await tx.bookingCoverage.findMany({
      where: { status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
      distinct: ['umbrellaId'],
      select: { umbrellaId: true },
    });
```
(adatta il nome/variabile a quello locale; `occupied.length` resta l'input di `occupancyPct`.)

- [ ] **Step 4: Migra i fixture di `reports.e2e-spec.ts` all'helper**

In `apps/api/test/reports.e2e-spec.ts`, ogni punto che crea occupazione con `tx.booking.create(...)` diretto deve creare **anche** la coverage: sostituisci quelle create con `insertBookingWithCoverage(prisma, tenantId, {...})` (Task 1 Step 7). Le prenotazioni create via API/service **non** vanno toccate (già scrivono coverage dal Task 1). Non cambiare alcuna **asserzione** di report.

- [ ] **Step 5: Run suite completa — verde con le stesse asserzioni**

Run:
```
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e --runInBand
```
Expected: tutti verdi ai conteggi baseline. In particolare map/reports/prelazione/bookings invariati. Se un test di prelazione fallisse, hai spostato per errore una lettura di **contratto** sulla coverage: ripristina (solo le letture d'occupazione fisica si spostano — vedi spec §4).

- [ ] **Step 6: Commit**

```
git add apps/api/src/bookings/bookings.service.ts apps/api/src/map/map.service.ts apps/api/src/platform/platform-metrics.service.ts apps/api/test/reports.e2e-spec.ts
git commit -m "refactor(api): letture d'occupazione da BookingCoverage (migrate); prelazione/contratto invariati"
```

---

### Task 3: Contract — rimuovi il vecchio percorso e riscrivi il test di parità

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_drop_booking_no_overlap/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (rimuovi `slotStartMin/slotEndMin` da `Booking`)
- Modify: `apps/api/src/bookings/booking.errors.ts` (matcher → `coverage_no_overlap`)
- Modify: `apps/api/test/booking-overlap-constraint.e2e-spec.ts` (riscrivi su coverage) — oppure rinominalo in `coverage-overlap-constraint.e2e-spec.ts`

**Interfaces:**
- Consumes: `coverage_no_overlap`, trigger coverage (Task 1); tutte le letture già su coverage (Task 2).
- Produces: rimozione di `booking_no_overlap`, `booking_fill_slot_minutes_trg`, `Booking.slotStartMin/slotEndMin`.

- [ ] **Step 1: Aggiorna il matcher dell'errore**

In `apps/api/src/bookings/booking.errors.ts`, cambia il match da `'booking_no_overlap'` a `'coverage_no_overlap'` (riga 22) e aggiorna il commento/JSDoc: ora l'anti-overlap vive sulla coverage (ADR-0046); il nome riportato da Postgres nella violazione è `coverage_no_overlap`.

- [ ] **Step 2: Riscrivi il test di parità DB su coverage**

In `apps/api/test/booking-overlap-constraint.e2e-spec.ts`: la helper `insert` locale (che oggi fa `tx.booking.create`) va sostituita con l'inserimento **della coverage** (via `insertBookingWithCoverage` del Task 1, o `tx.bookingCoverage.create` con un `bookingId` reale). Gli assert sui minuti (`row.slotStartMin`) vanno spostati sulla **coverage** (`coverageRow.slotStartMin`). Gli assert di violazione cambiano stringa: `/coverage_no_overlap|23P01|exclusion/i`. Mantieni gli STESSI casi semantici (Mattina 480/780; Giorno-Intero 480/1140; contigue accettate; Giorno-Intero vs Mattina rifiutato; cancellata non blocca; `isBookingOverlapExclusion` sul caso reale). Il caso "UPDATE OF timeSlotId ricalcola i minuti" ora esercita il trigger **coverage** su `UPDATE OF bookingId` — adatta o rimpiazza con: cambiare `bookingId` della coverage (o re-inserire) ricalcola i minuti; l'update di colonne diverse non li tocca.

- [ ] **Step 3: Run del test riscritto — verde (usa ancora il vecchio constraint finché non droppi)**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -- overlap`
Expected: PASS contro `coverage_no_overlap` (che esiste dal Task 1). Il vecchio constraint è ancora presente ma i test ora puntano alla coverage.

- [ ] **Step 4: Scrivi la migration di contract (drop del vecchio percorso)**

Genera lo scheletro:
```
corepack pnpm --filter @coralyn/api exec prisma migrate dev --name drop_booking_no_overlap --create-only
```
Sostituisci `migration.sql` con:
```sql
-- Fase CONTRACT (ADR-0046): l'occupazione vive ora su BookingCoverage. Rimuovi il vecchio percorso su
-- Booking per non avere doppia sorgente di verità.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS booking_no_overlap;
DROP TRIGGER IF EXISTS booking_fill_slot_minutes_trg ON "Booking";
DROP FUNCTION IF EXISTS booking_fill_slot_minutes();
ALTER TABLE "Booking" DROP COLUMN "slotStartMin";
ALTER TABLE "Booking" DROP COLUMN "slotEndMin";
```
Rimuovi anche `slotStartMin`/`slotEndMin` da `model Booking` in `schema.prisma` (e i relativi commenti ADR-0037 ormai spostati sulla coverage).

- [ ] **Step 5: Applica, rigenera, run suite completa**

Run:
```
corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e --runInBand
```
Expected: tutti verdi. Ora `coverage_no_overlap` è l'unico garante; il matcher lo riconosce; il test di parità lo esercita. Nessuna colonna `slotStartMin/slotEndMin` su `Booking`.

- [ ] **Step 6: Commit**

```
git add apps/api/prisma apps/api/src/bookings/booking.errors.ts apps/api/test/booking-overlap-constraint.e2e-spec.ts
git commit -m "refactor(api): drop booking_no_overlap + colonne minuti su Booking (contract); parità su coverage_no_overlap"
```

---

### Task 4: Verifica finale — suite intera, FE invariato, LIVE Docker, doc

**Files:**
- Modify: `docs/architecture/deferred.md` (annota D-013 sospensione spec 1/2 = refactor coverage in corso/fatto sul branch)
- Modify: seed dev se crea prenotazioni dirette senza coverage (`apps/api/prisma/seed*` o equivalente) — solo se necessario per la verifica LIVE

- [ ] **Step 1: Suite completa di tutti i pacchetti**

Run:
```
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e --runInBand
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm -r typecheck
```
Expected: api verdi (≥ baseline + nuovi test coverage); web-staff **316** e ui-kit **111** **invariati** (nessun file FE toccato); typecheck pulito.

- [ ] **Step 2: Verifica seed dev + LIVE su Docker**

Se il seed di sviluppo crea prenotazioni con insert diretti, aggiorna per creare anche la coverage (o passa dal service). Poi:
```
docker compose --profile full up -d --build api web web-platform
corepack pnpm --filter @coralyn/api exec prisma migrate deploy   # sul DB del container
```
Verifica su `localhost:8080` (admin `admin@coralyn.dev`/`coralyn-admin-8473`): mappa, drawer, report **identici** a prima del refactor; una create/disdetta si comporta come prima; il caso Giorno-Intero vs Mattina resta bloccato (409 gentile). **Nessuna differenza osservabile = successo.**

- [ ] **Step 3: Aggiorna `deferred.md`**

In `docs/architecture/deferred.md`, nella voce **D-013**, annota che la **sotto-slice sospensione** è in corso e che la sua **fondazione** (refactor occupazione a intervalli `BookingCoverage`, ADR-0046) è implementata sul branch `feat/booking-coverage` (spec [2026-07-08-booking-coverage-refactor-design.md], piano omonimo). La sospensione vera e propria (buco + rimborso) è la Spec 2.

- [ ] **Step 4: Commit finale + presenta**

```
git add docs/architecture/deferred.md apps/api/prisma
git commit -m "docs+chore: deferred.md D-013 coverage foundation; seed coverage-aware"
```
Poi **presenta all'utente** (conteggi test prima/dopo, esito LIVE) e **attendi conferma** per il merge FF su `main`. **NON** mergiare senza ok esplicito.

---

## Self-Review

**Spec coverage:**
- Spec §3 (modello: Booking nominale + BookingCoverage) → Task 1 Step 2/3. ✓
- Spec §3.3 (due trigger DB-autoritativi) → Task 1 Step 3 (SQL §4/§5). ✓
- Spec §3.4 (constraint identico) → Task 1 Step 3 (SQL §6) + parità Task 3 Step 2. ✓
- Spec §4.1 (letture occupazione → coverage: create-precheck, map, report-via-map, metriche, listByDate) → Task 2 Step 1/2/3. ✓
- Spec §4.2 (contratto invariato: prelazione, prezzo, stagione, GDPR, disdetta-nominale) → esplicitamente NON toccati (Task 2 Step 1 nota; terminate tocca solo la coverage in Task 1 Step 8). ✓
- Spec §5 (migrazione backfill sotto RLS) → Task 1 Step 3 (SQL §2). ✓
- Spec §6 (contracts invariati) → nessun task li tocca. ✓
- Spec §8 (fixture adjust + parità DB) → Task 1 Step 7, Task 2 Step 4, Task 3 Step 2. ✓
- Spec §9 (LIVE) → Task 4 Step 2. ✓
- ADR-0046 → Task 1 Step 1. ✓

**Placeholder scan:** `<timestamp>` nei nomi migration = convenzione Prisma (reale al momento della generazione), non un placeholder di contenuto. Nessun TBD/TODO. Codice completo in ogni step che modifica codice. ✓

**Type consistency:** `insertBookingWithCoverage(prisma, tenantId, data)` definita in Task 1 Step 7, usata in Task 2 Step 4 e Task 3 Step 2 con la stessa firma. `coverage_no_overlap` coerente tra constraint (T1), matcher (T3 Step 1) e test (T3 Step 2). Relazione `coverages` su Booking (T1 Step 2) usata in `listByDate` (T2 Step 3). Campi coverage (`bookingId/establishmentId/umbrellaId/startDate/endDate/status`) coerenti tra schema, migration, helper e app-write. ✓

---

## Execution Handoff

Il piano copre un **solo sottosistema** (occupazione api) → un unico piano è corretto.
