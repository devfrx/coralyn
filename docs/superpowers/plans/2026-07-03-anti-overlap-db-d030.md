# Anti-overlap a livello DB (D-030) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare l'invariante anti-overlap ("nessuna sovrapposizione tra prenotazioni confermate sullo stesso ombrellone") anche a livello DB come garanzia strutturale (`EXCLUDE USING gist`), mantenendo il controllo applicativo come percorso primario.

**Architecture:** Due colonne di occupazione oraria (`slotStartMin`/`slotEndMin`, minuti-dalla-mezzanotte) denormalizzate su `Booking`, popolate **DB-autoritativamente** da un trigger `BEFORE INSERT OR UPDATE OF "timeSlotId"` (l'app non le scrive). Un `EXCLUDE USING gist` (btree_gist) su `umbrellaId =`, `daterange('[]') &&`, `int4range('[)') &&`, `WHERE status='confirmed'` specchia esattamente la semantica di `dateRangesOverlap` + `slotsOverlap`. La violazione tecnica (`SQLSTATE 23P01`) è tradotta nello stesso `409` del controllo applicativo. La validazione stagioni delle campagne rinnovo è rafforzata per rendere il constraint rinnovo-safe.

**Tech Stack:** NestJS + Prisma 5.20 (PostgreSQL 16), Jest (unit + e2e/supertest), RLS multi-tenant (`FORCE ROW LEVEL SECURITY`, ruolo `coralyn_app` `NOBYPASSRLS`).

## Global Constraints

- **Convenzione:** codice/DB in inglese; messaggi UI/commenti/doc in italiano.
- **Baseline test da NON regredire** (verificata live su `main`, 2026-07-03): **api unit 97 · api e2e 142 · web-staff 153 (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. Gli incrementi sono **additivi** (unit + e2e).
- **Backend-only:** nessun tocco al frontend, ai contracts, ai DTO o alle projection. Nessun cambio di API pubblica.
- **SQLSTATE:** una violazione di `EXCLUDE` è **`23P01`** (exclusion_violation), **NON** `23505` (unique_violation, usato da `Rate_signature_key`).
- **btree_gist:** va abilitato (`CREATE EXTENSION IF NOT EXISTS btree_gist`) per mischiare `=` (uuid) e `&&` (range) in un gist `EXCLUDE`.
- **RLS nel backfill:** `Booking` e `TimeSlot` hanno `FORCE ROW LEVEL SECURITY` e il ruolo di migrazione (`coralyn_app`) è `NOBYPASSRLS`. La lettura/scrittura del backfill va avvolta in `ALTER TABLE … NO FORCE ROW LEVEL SECURITY` (su **entrambe**) + ripristino `FORCE` dopo, altrimenti legge **zero righe** (GUC `app.current_tenant` non impostata in `migrate deploy`). Stesso pattern della migration `20260703081533`.
- **Semantica allineata all'app** (non deve divergere): date **inclusive** `[]` (= `dateRangesOverlap`), fasce **semiaperte** `[)` (= `slotsOverlap`), partial `status='confirmed'` (solo confermate bloccano).
- **Il controllo applicativo resta primario e invariato** (`bookings.service.ts:133-144`): dà il 409 gentile nel caso normale e gestisce esclusione rinnovo + prelazione. Il constraint è solo la rete per la finestra di race.
- **Migrazione:** una sola, applicata a `coralyn_dev` **e** `coralyn_test`; `prisma migrate status` pulito su entrambi. Trigger/constraint/estensione sono raw-SQL non modellati da Prisma → si aggiungono al drift atteso di `Rate_signature_key` su `migrate dev` (coerente col pattern in uso).
- **Nuovo branch da `main`** (ADR-0009). Un commit per task.
- **Comandi test** (dalla root, con `corepack pnpm`): api unit `pnpm --filter @coralyn/api test`; api e2e `pnpm --filter @coralyn/api test:e2e`; typecheck `pnpm --filter web-staff typecheck`. "worker failed to exit gracefully" di Jest = rumore di teardown pre-esistente, non un fallimento.
- **Comandi prisma sotto `--filter`:** carica `DATABASE_URL` dall'env **senza stamparlo** (il classifier blocca la materializzazione di credenziali): `set -a; . ./.env; set +a` (dev) / `set -a; . ./.env.test; set +a` (test). P1002 advisory-lock su `migrate deploy` → `pg_terminate_backend` sull'holder.
- **NON far girare `prisma db seed` in locale senza `DEV_ADMIN_PASSWORD=coralyn-admin-8473` in env** (il seed resetta la password admin al default).

---

## Decisione di piano: confini dei commit e strategia di test

La spec (§9) e l'handoff (§7 "lezione Equipment") chiedono di **valutare l'accorpamento** dei layer. Analisi:

- **Il controllo applicativo gira PRIMA, dentro la transazione** (`bookings.service.ts:133-144`). Quindi un conflitto **sequenziale** via API è sempre intercettato dall'app (409) e **non raggiunge mai il constraint DB**. Il constraint diverge dall'app solo in due punti: (a) una **race concorrente** reale (non riproducibile in modo deterministico in e2e); (b) **`renew()`**, che esclude `previousBookingId` dal check e **non** valida la sovrapposizione di date tra stagione sorgente e destinazione.
- Ne segue che i due layer sono **testabili indipendentemente** e **restano due commit separati**:
  - **Task 1 (DB):** il constraint si prova a **livello DB** con insert diretti che bypassano il check applicativo (`prisma.forTenant(tx => tx.booking.create(...))`). Deterministico, non richiede il mapping.
  - **Task 2 (backend):** il mapping `23P01 → 409` **attraverso il service** si prova con il seam deterministico (b): due stagioni **sovrapposte** + un `renew()` nella stagione sovrapposta → il check app passa (esclude la sorgente) ma il constraint scatta → deve tornare **409** (senza il mapping tornerebbe 500). Task 2 dipende dal constraint introdotto in Task 1 (ordine lineare, nessun accorpamento forzato).
- **Task 3 (doc):** ADR-0037 + rimandi. Indipendente.

**Deviazione dalla spec (§5) — decisa con l'utente (2026-07-03): la soluzione più professionale, senza debito.** La spec elenca un "helper puro `time → minuti` + unit test". Ma la conversione vive **solo in SQL** (trigger + backfill) e un helper TS **non avrebbe alcun chiamante di produzione**: aggiungerlo sarebbe **codice morto = debito** (viola YAGNI/DRY), l'opposto di ciò che si vuole. Inoltre l'app **non deve** scrivere quelle colonne (decisione approvata §8.3: DB-autoritativo via trigger), quindi non esiste un modo legittimo di rendere l'helper "vivo". Il piano quindi:
- **NON aggiunge l'helper morto.**
- **Testa la conversione dove gira davvero** (livello DB), in modo esaustivo: (a) il trigger su **INSERT** popola i minuti per Mattina/Pomeriggio/Giorno-Intero (08:00→480, 13:00→780, 19:00→1140); (b) il trigger su **`UPDATE OF "timeSlotId"`** **ricalcola** i minuti (esercita l'intera definizione del trigger, non solo il ramo INSERT); (c) il **backfill** è verificato dalla migrazione che applica pulita sul dev seedato (verifica live post-esecuzione).

*(Stessa natura della nota 400-vs-422 dell'handoff: un affinamento di forma verso maggior rigore, non un cambio di sostanza.)*

---

## File Structure

- **`apps/api/prisma/schema.prisma`** (modify) — aggiunge `slotStartMin Int` e `slotEndMin Int` al `model Booking` con commento che rimanda al trigger/constraint raw.
- **`apps/api/prisma/migrations/<timestamp>_booking_slot_minutes_anti_overlap/migration.sql`** (create) — estensione, colonne, backfill sotto RLS, `SET NOT NULL`, funzione+trigger, `EXCLUDE` constraint.
- **`apps/api/test/booking-overlap-constraint.e2e-spec.ts`** (create) — test a livello DB del constraint (Task 1): overlap → 23P01, Giorno-Intero-vs-Mattina → 23P01, contigue → ok, cancellata → ok, trigger popola i minuti.
- **`apps/api/src/bookings/booking.errors.ts`** (create) — `isBookingOverlapExclusion(e: unknown): boolean`, riconosce la violazione del constraint `booking_no_overlap` (Task 2).
- **`apps/api/src/bookings/booking.errors.spec.ts`** (create) — unit test del rilevatore su errori sintetici (Task 2).
- **`apps/api/src/bookings/bookings.service.ts`** (modify) — avvolge la `tx.booking.create` in `priceAndWrite` col mapping `23P01 → 409` (Task 2).
- **`apps/api/src/bookings/renewal-campaigns.service.ts:31`** (modify) — rafforza la validazione stagioni da `dest.startDate <= origin.startDate` a `dest.startDate <= origin.endDate` (Task 2).
- **`apps/api/test/bookings.e2e-spec.ts`** (modify) — aggiunge il caso deterministico `renew()` in stagione sovrapposta → 409 (Task 2).
- **`apps/api/test/renewal-campaigns.e2e-spec.ts`** (modify) — aggiunge il caso `open()` con destinazione che si sovrappone all'origine → 422 (Task 2).
- **`docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md`** (create) — nuovo ADR (Task 3).
- **`docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md`** + **`0034-prelazione-finestre-lazy.md`** (modify) — rimandi ad ADR-0037 (Task 3).

---

## Task 1: Schema + migrazione (colonne, trigger, EXCLUDE constraint) + test DB

Introduce le colonne di occupazione oraria, il trigger DB-autoritativo e il constraint. Il deliverable è verificabile da solo: il constraint rifiuta insert diretti sovrapposti (a livello DB, bypassando il check app) e il trigger popola i minuti.

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`model Booking`, righe ~156-187)
- Create: `apps/api/prisma/migrations/<timestamp>_booking_slot_minutes_anti_overlap/migration.sql`
- Create: `apps/api/test/booking-overlap-constraint.e2e-spec.ts`
- Modify: `apps/api/src/bookings/booking.projection.spec.ts` (fixture `row`: aggiungi i due nuovi campi del modello)

**Interfaces:**
- Produces: colonne DB `Booking.slotStartMin:Int @default(0)`, `Booking.slotEndMin:Int @default(0)`; oggetti DB `booking_fill_slot_minutes()` (funzione), `booking_fill_slot_minutes_trg` (trigger), `booking_no_overlap` (constraint), estensione `btree_gist`. Nessun simbolo TS esportato. Il tipo modello `Booking` acquista `slotStartMin`/`slotEndMin` (required `number` in lettura), opzionali nel create-input grazie a `@default`.

- [ ] **Step 1: Aggiungi le colonne al modello Prisma**

In `apps/api/prisma/schema.prisma`, nel `model Booking`, dopo `createdAt` (riga ~174) aggiungi:

```prisma
  // Occupazione oraria denormalizzata da TimeSlot (minuti-dalla-mezzanotte), DB-autoritativa via
  // trigger booking_fill_slot_minutes_trg (l'app NON le scrive). Alimenta l'EXCLUDE constraint
  // booking_no_overlap (raw SQL, non modellato qui). Vedi ADR-0037.
  // @default(0) è un segnaposto MAI osservato: il trigger BEFORE INSERT sovrascrive sempre il valore;
  // serve solo a rendere il create-input Prisma opzionale (così l'app non è costretta a scriverle).
  slotStartMin      Int   @default(0)
  slotEndMin        Int   @default(0)
```

**Nota (decisa in fase di esecuzione):** senza `@default`, Prisma genera un `BookingUncheckedCreateInput` che **richiede** le due colonne a ogni `.create()`, costringendo l'app a scriverle → contraddice la decisione DB-autoritativa (§8.3) e rompe `bookings.service.ts`. Con `@default(0)` il create-input le rende opzionali, l'app le omette, e il trigger le popola comunque: `bookings.service.ts` resta **intatto** (di competenza del Task 2).

- [ ] **Step 2: Scaffolda la migration (solo DDL colonne) e verifica il drift atteso**

Genera lo scheletro della migration senza applicarlo (poi la editiamo a mano per il backfill/trigger/constraint):

```bash
set -a; . ./.env; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate dev --create-only --name booking_slot_minutes_anti_overlap
```

Expected: crea `apps/api/prisma/migrations/<timestamp>_booking_slot_minutes_anti_overlap/migration.sql` contenente due `ALTER TABLE "Booking" ADD COLUMN ... NOT NULL`. (Se ripromppa per il drift di `Rate_signature_key`, è atteso — vedi Global Constraints; scegli di continuare.)

- [ ] **Step 3: Sostituisci il contenuto di `migration.sql` con la sequenza completa**

Rimpiazza l'intero file con (le colonne devono nascere **nullable** per il backfill, poi `SET NOT NULL`):

```sql
-- Anti-overlap a livello DB (D-030, ADR-0037).
-- Occupazione oraria denormalizzata su Booking (minuti-dalla-mezzanotte), DB-autoritativa via trigger,
-- + EXCLUDE constraint gist allineato semanticamente al controllo applicativo (booking.availability.ts).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) Colonne NOT NULL con DEFAULT 0 (segnaposto). Il DEFAULT soddisfa NOT NULL per le righe esistenti
--    (corrette subito dal backfill) e allinea il DB allo schema Prisma @default(0). Il trigger
--    sovrascrive sempre il valore ad ogni INSERT: lo 0 non è mai osservato per righe vive.
ALTER TABLE "Booking" ADD COLUMN "slotStartMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "slotEndMin" INTEGER NOT NULL DEFAULT 0;

-- 2) Backfill sotto RLS: coralyn_app è NOBYPASSRLS e possiede Booking/TimeSlot con FORCE RLS; senza
--    NO FORCE la UPDATE/SELECT leggerebbe 0 righe (GUC app.current_tenant non impostata in migrate deploy).
--    Corregge lo 0 delle prenotazioni esistenti coi minuti reali della loro fascia.
ALTER TABLE "Booking" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "TimeSlot" NO FORCE ROW LEVEL SECURITY;

UPDATE "Booking" b SET
  "slotStartMin" = EXTRACT(HOUR FROM t."startTime")::int * 60 + EXTRACT(MINUTE FROM t."startTime")::int,
  "slotEndMin"   = EXTRACT(HOUR FROM t."endTime")::int   * 60 + EXTRACT(MINUTE FROM t."endTime")::int
FROM "TimeSlot" t
WHERE t.id = b."timeSlotId";

ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TimeSlot" FORCE ROW LEVEL SECURITY;

-- 3) Trigger DB-autoritativo: popola i minuti dalla fascia referenziata a ogni INSERT o cambio timeSlotId.
--    (L'app NON scrive queste colonne: la garanzia è DB-autoritativa, indipendente da bug applicativi.)
CREATE OR REPLACE FUNCTION booking_fill_slot_minutes() RETURNS trigger AS $$
DECLARE s TIME; e TIME;
BEGIN
  SELECT "startTime", "endTime" INTO s, e FROM "TimeSlot" WHERE id = NEW."timeSlotId";
  IF s IS NULL THEN
    RAISE EXCEPTION 'TimeSlot % inesistente per la prenotazione', NEW."timeSlotId";
  END IF;
  NEW."slotStartMin" := EXTRACT(HOUR FROM s)::int * 60 + EXTRACT(MINUTE FROM s)::int;
  NEW."slotEndMin"   := EXTRACT(HOUR FROM e)::int * 60 + EXTRACT(MINUTE FROM e)::int;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_fill_slot_minutes_trg
  BEFORE INSERT OR UPDATE OF "timeSlotId" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_fill_slot_minutes();

-- 4) EXCLUDE constraint: stessa semantica del controllo applicativo (ADR-0013 / booking.availability.ts).
--    daterange '[]' = date inclusive (dateRangesOverlap); int4range '[)' = fasce semiaperte (slotsOverlap);
--    partial WHERE status='confirmed' = solo le confermate bloccano (le cancellate no).
ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap EXCLUDE USING gist (
  "umbrellaId" WITH =,
  daterange("startDate", "endDate", '[]') WITH &&,
  int4range("slotStartMin", "slotEndMin", '[)') WITH &&
) WHERE (status = 'confirmed');
```

- [ ] **Step 4: Applica la migration a dev e rigenera il client**

```bash
set -a; . ./.env; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate dev
```

Expected: la migration risulta applicata; `prisma generate` rigenera il client con i nuovi campi. (Il drift di `Rate_signature_key` può ricomparire — atteso, continua.)

- [ ] **Step 5: Applica la migration al DB di test**

```bash
set -a; . ./.env.test; set +a
corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma migrate status
```

Expected: `migrate status` → "Database schema is up to date!". (Se P1002 advisory-lock: termina l'holder con `pg_terminate_backend` e ritenta.)

- [ ] **Step 5.5: Aggiorna il fixture della projection unit test (il modello ha due campi in più)**

Il tipo `Booking` ora include `slotStartMin`/`slotEndMin` (required in lettura). Il fixture `row` in `apps/api/src/bookings/booking.projection.spec.ts` (righe 4-23) non compila senza di essi. Aggiungi dopo `createdAt: new Date(),` (riga 22):

```ts
  slotStartMin: 480,
  slotEndMin: 780,
```

L'output atteso di `toBookingDTO` (riga 28) **non cambia**: il DTO non espone i minuti (backend-only, nessun cambio di contratto). È solo un adeguamento del fixture al nuovo modello.

- [ ] **Step 6: Scrivi il test DB del constraint (la migration è già applicata; il test verifica il comportamento del constraint/trigger)**

Crea `apps/api/test/booking-overlap-constraint.e2e-spec.ts`. Il test bypassa il check applicativo inserendo prenotazioni **direttamente** via `prisma.forTenant` (il check anti-overlap vive nel service, non nel DB), così esercita il solo constraint DB:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedMapTenant, cleanMapTenant, type MapSeedIds } from './helpers/seed-map';

/**
 * Test a livello DB dell'EXCLUDE constraint booking_no_overlap (D-030, ADR-0037). Inserisce
 * prenotazioni DIRETTAMENTE (bypassando il check applicativo del service) per esercitare il solo
 * constraint: prova che la rete di sicurezza DB regge anche se l'app fosse aggirata.
 */
describe('Booking overlap EXCLUDE constraint (e2e, DB-level)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let ids: MapSeedIds;
  let customerId: string;
  let fullDaySlot: string; // Giorno Intero 08-19 (fascia diversa, orari che coprono Mattina)

  const D = new Date('2026-07-15T00:00:00Z');

  // Inserisce una prenotazione confermata bypassando il service (trigger popola i minuti).
  const insert = (over: {
    umbrellaId: string; timeSlotId: string; startDate: Date; endDate: Date; status?: 'confirmed' | 'cancelled';
  }) =>
    prisma.forTenant(s1, (tx) =>
      tx.booking.create({
        data: {
          establishmentId: s1,
          customerId,
          umbrellaId: over.umbrellaId,
          timeSlotId: over.timeSlotId,
          startDate: over.startDate,
          endDate: over.endDate,
          type: 'daily',
          status: over.status ?? 'confirmed',
          totalPrice: 10,
        },
      }),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Overlap DB' } })).id;
    ids = await seedMapTenant(prisma, s1);
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'C', lastName: 'D' } }),
      )
    ).id;
    fullDaySlot = (
      await prisma.forTenant(s1, (tx) =>
        tx.timeSlot.create({
          data: {
            establishmentId: s1,
            name: 'Giorno Intero',
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T19:00:00Z'),
            sortOrder: 9,
          },
        }),
      )
    ).id;
  });

  afterEach(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('il trigger popola slotStartMin/slotEndMin dalla fascia (Mattina 08-13 → 480/780)', async () => {
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: b.id } }));
    expect(row.slotStartMin).toBe(480);
    expect(row.slotEndMin).toBe(780);
  });

  it('il trigger converte anche Pomeriggio 13-19 → 780/1140 e Giorno Intero 08-19 → 480/1140', async () => {
    const pm = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D });
    const fd = await insert({ umbrellaId: ids.u2, timeSlotId: fullDaySlot, startDate: D, endDate: D });
    const pmRow = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: pm.id } }));
    const fdRow = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: fd.id } }));
    expect([pmRow.slotStartMin, pmRow.slotEndMin]).toEqual([780, 1140]);
    expect([fdRow.slotStartMin, fdRow.slotEndMin]).toEqual([480, 1140]);
  });

  it('il trigger RICALCOLA i minuti su UPDATE OF timeSlotId (esercita l\'intero trigger, non solo INSERT)', async () => {
    // Mattina 08-13 → 480/780; cambiando la fascia a Pomeriggio 13-19 il trigger deve ricalcolare 780/1140.
    const b = await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await prisma.forTenant(s1, (tx) =>
      tx.booking.update({ where: { id: b.id }, data: { timeSlotId: ids.slotAfternoon } }),
    );
    const row = await prisma.forTenant(s1, (tx) => tx.booking.findFirstOrThrow({ where: { id: b.id } }));
    expect([row.slotStartMin, row.slotEndMin]).toEqual([780, 1140]);
  });

  it('stessa fascia, stesso ombrellone, date sovrapposte → rifiutato (violazione 23P01 booking_no_overlap)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).rejects.toThrow(/booking_no_overlap|23P01|exclusion/i);
  });

  it('Giorno Intero (08-19) vs Mattina (08-13), stesso ombrellone/data → rifiutato (semantica oraria, non timeSlotId)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: fullDaySlot, startDate: D, endDate: D }),
    ).rejects.toThrow(/booking_no_overlap|23P01|exclusion/i);
  });

  it('fasce contigue (Mattina 08-13 + Pomeriggio 13-19), stesso ombrellone/data → accettate (semiaperto)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, startDate: D, endDate: D }),
    ).resolves.toBeDefined();
  });

  it('una prenotazione CANCELLATA non blocca una nuova sovrapposta (partial WHERE status=confirmed)', async () => {
    await insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D, status: 'cancelled' });
    await expect(
      insert({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, startDate: D, endDate: D }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 7: Esegui il test DB e verifica che passi**

```bash
corepack pnpm --filter @coralyn/api test:e2e -- booking-overlap-constraint
```

Expected: tutti i test del nuovo file **PASS** (il constraint e il trigger sono già applicati al DB di test dallo Step 5). Se un `rejects.toThrow` fallisce con "resolved instead", il constraint non è attivo → verifica lo Step 5.

- [ ] **Step 8: Esegui l'intera suite unit + e2e (nessuna regressione)**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```

Expected: unit **97 PASS** (invariati — il fix del fixture al Step 5.5 mantiene la projection spec verde, nessun test unit aggiunto in questo task); e2e **142 + 7 nuovi = 149 PASS**. Se una regressione appare in `bookings.e2e-spec.ts` (es. una create legittima ora rifiutata), significa che la semantica del constraint diverge dall'app → rivedi lo Step 3.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/booking-overlap-constraint.e2e-spec.ts apps/api/src/bookings/booking.projection.spec.ts
git commit -m "$(cat <<'EOF'
feat(bookings): EXCLUDE constraint anti-overlap a livello DB (D-030)

Occupazione oraria denormalizzata su Booking (slotStartMin/slotEndMin,
minuti-dalla-mezzanotte), DB-autoritativa via trigger; EXCLUDE USING gist
(umbrellaId =, daterange '[]', int4range '[)', WHERE status='confirmed')
allineato a dateRangesOverlap/slotsOverlap. Backfill sotto NO FORCE/FORCE (RLS).
Test DB: overlap/Giorno-Intero-vs-Mattina rifiutati, contigue/cancellate ok.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Mapping `23P01 → 409` + validazione stagioni rinnovo rafforzata

Traduce la violazione tecnica del constraint nello stesso `409` gentile del controllo applicativo, e rende il constraint rinnovo-safe rafforzando la validazione delle campagne. Include l'e2e deterministico che esercita il mapping attraverso il service.

**Files:**
- Create: `apps/api/src/bookings/booking.errors.ts`
- Create: `apps/api/src/bookings/booking.errors.spec.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts` (import + wrap in `priceAndWrite`)
- Modify: `apps/api/src/bookings/renewal-campaigns.service.ts` (riga 31)
- Modify: `apps/api/test/bookings.e2e-spec.ts` (nuovo caso renew in stagione sovrapposta)
- Modify: `apps/api/test/renewal-campaigns.e2e-spec.ts` (nuovo caso open dest⊇origin)

**Interfaces:**
- Consumes: constraint `booking_no_overlap` (Task 1); pattern SQLSTATE→409 di `rates.service.ts` (`Prisma.PrismaClientKnownRequestError`).
- Produces: `isBookingOverlapExclusion(e: unknown): boolean` (esportata da `booking.errors.ts`).

- [ ] **Step 1: Scrivi il test unit del rilevatore (deve fallire)**

Crea `apps/api/src/bookings/booking.errors.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import { isBookingOverlapExclusion } from './booking.errors';

describe('isBookingOverlapExclusion', () => {
  it('riconosce una violazione del constraint booking_no_overlap (per nome constraint nel messaggio)', () => {
    const e = new Prisma.PrismaClientUnknownRequestError(
      'raw query failed. code: `23P01`. message: `conflicting key value violates exclusion constraint "booking_no_overlap"`',
      { clientVersion: '5.20.0' },
    );
    expect(isBookingOverlapExclusion(e)).toBe(true);
  });

  it('riconosce una violazione per SQLSTATE 23P01 nel messaggio', () => {
    const e = new Prisma.PrismaClientUnknownRequestError('… code: 23P01 …', { clientVersion: '5.20.0' });
    expect(isBookingOverlapExclusion(e)).toBe(true);
  });

  it('NON scatta su una unique violation (23505 / P2002)', () => {
    const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.20.0',
    });
    expect(isBookingOverlapExclusion(e)).toBe(false);
  });

  it('NON scatta su un errore generico', () => {
    expect(isBookingOverlapExclusion(new Error('boom'))).toBe(false);
    expect(isBookingOverlapExclusion(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test unit e verifica che fallisca**

```bash
corepack pnpm --filter @coralyn/api test -- booking.errors
```

Expected: FAIL con "Cannot find module './booking.errors'".

- [ ] **Step 3: Implementa il rilevatore**

Crea `apps/api/src/bookings/booking.errors.ts`. Prisma 5 non ha un codice dedicato per le exclusion violation: una `EXCLUDE` violata su una `.create()` affiora come errore Prisma il cui **messaggio** contiene lo SQLSTATE `23P01` e/o il nome del constraint. Il rilevatore è robusto su entrambe le classi di errore Prisma e cerca il nome del constraint o lo SQLSTATE:

```ts
import { Prisma } from '@prisma/client';

/**
 * True se `e` è la violazione dell'EXCLUDE constraint anti-overlap (booking_no_overlap, SQLSTATE 23P01).
 * Prisma 5 non mappa le exclusion violation a un codice dedicato: affiorano come errore Prisma il cui
 * messaggio riporta lo SQLSTATE e/o il nome del constraint. Il caso reale è pinnato dall'e2e (renew in
 * stagione sovrapposta → 409). NB: 23P01 (exclusion), NON 23505 (unique, usato da Rate_signature_key).
 */
export function isBookingOverlapExclusion(e: unknown): boolean {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const msg = e.message ?? '';
    return msg.includes('booking_no_overlap') || msg.includes('23P01');
  }
  return false;
}
```

- [ ] **Step 4: Esegui il test unit e verifica che passi**

```bash
corepack pnpm --filter @coralyn/api test -- booking.errors
```

Expected: 4 test PASS.

- [ ] **Step 5: Avvolgi la scrittura in `priceAndWrite` col mapping 23P01 → 409**

In `apps/api/src/bookings/bookings.service.ts`:

Aggiungi l'import (dopo la riga 23, accanto agli altri import locali):

```ts
import { isBookingOverlapExclusion } from './booking.errors';
```

Sostituisci il `return tx.booking.create({...})` finale di `priceAndWrite` (righe ~204-218) con una versione avvolta. Il constraint è la rete per la sola finestra di race (il check applicativo sopra intercetta il caso normale); quando scatta, traduci nello stesso 409:

```ts
    // Scrittura. Rete di sicurezza DB (ADR-0037): sotto race concorrente il check applicativo sopra
    // può essere aggirato; l'EXCLUDE constraint booking_no_overlap scatta (SQLSTATE 23P01) e lo
    // traduciamo nello stesso 409 gentile, così client e test non distinguono chi ha bloccato.
    try {
      return await tx.booking.create({
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
    } catch (e) {
      if (isBookingOverlapExclusion(e))
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      throw e;
    }
```

- [ ] **Step 6: Rafforza la validazione stagioni nella campagna rinnovo**

In `apps/api/src/bookings/renewal-campaigns.service.ts`, riga 31-32, sostituisci:

```ts
      if (dest.startDate <= origin.startDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve seguire quella di origine');
```

con (destinazione deve iniziare **dopo la fine** dell'origine → nessuna sovrapposizione possibile → il constraint non rifiuta mai un rinnovo valido):

```ts
      if (dest.startDate <= origin.endDate)
        throw new UnprocessableEntityException('La stagione di destinazione deve iniziare dopo la fine di quella di origine');
```

- [ ] **Step 7: Aggiungi l'e2e che esercita il mapping attraverso il service (renew in stagione sovrapposta → 409)**

Questo è il seam deterministico: `renew()` esclude la sorgente dal check app (passa) ma il constraint DB la vede → 409 **solo se** il mapping funziona (senza, sarebbe 500). In `apps/api/test/bookings.e2e-spec.ts`, dentro il `describe('rinnovo e anzianità (A4.2)', …)` (prima della chiusura, dopo il test alla riga ~386), aggiungi:

```ts
    it('rinnovo verso una stagione che si SOVRAPPONE alla sorgente → 409 (backstop DB, mapping 23P01)', async () => {
      // Seam deterministico: il check applicativo esclude la sorgente (previousBookingId) e passa, ma
      // l'EXCLUDE constraint DB vede sorgente+rinnovo sovrapposti → 23P01, tradotto in 409 dal mapping.
      const u = (await mkUmbrella('96', 96)).id;
      // Stagione che si sovrappone a Estate 2026 [05-01, 09-30]: [09-01, 12-31].
      const overlapId = (
        await prisma.forTenant(s1, (tx) =>
          tx.season.create({
            data: {
              establishmentId: s1,
              name: 'Autunno 2026 (overlap)',
              startDate: new Date('2026-09-01T00:00:00Z'),
              endDate: new Date('2026-12-31T00:00:00Z'),
            },
          }),
        )
      ).id;
      // Serve un listino subscription nella stagione sovrapposta per superare il pricing.
      await prisma.forTenant(s1, async (tx) => {
        const pr = await tx.pricing.create({ data: { establishmentId: s1, seasonId: overlapId } });
        await tx.rate.create({ data: { establishmentId: s1, pricingId: pr.id, type: 'subscription', price: 900 } });
      });
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ destinationSeasonId: overlapId }).expect(409);
    });
```

- [ ] **Step 8: Aggiungi l'e2e per la validazione rafforzata (open con destinazione che si sovrappone all'origine → 422)**

Prima leggi `apps/api/test/renewal-campaigns.e2e-spec.ts` per riusare le variabili di setup (stagioni/token). Aggiungi un test che apre una campagna la cui **destinazione si sovrappone** all'origine e attende 422. Usa due stagioni sovrapposte create nel tenant (non le seed 2026/2027 che sono disgiunte). Schema del test (adatta i nomi delle variabili a quelle già presenti nel file — `app`, `prisma`, `token1`/`adminToken`, `s1`/l'establishment id, `bearer`):

```ts
  it('open con destinazione che si SOVRAPPONE all\'origine → 422 (invariante rinnovo-safe)', async () => {
    // Origine [05-01, 09-30], destinazione [09-01, 12-31]: dest.startDate <= origin.endDate → rifiutata.
    const { originId, destId } = await prisma.forTenant(ESTABLISHMENT_ID, async (tx) => {
      const origin = await tx.season.create({
        data: { establishmentId: ESTABLISHMENT_ID, name: 'Ovl origine', startDate: new Date('2029-05-01T00:00:00Z'), endDate: new Date('2029-09-30T00:00:00Z') },
      });
      const dest = await tx.season.create({
        data: { establishmentId: ESTABLISHMENT_ID, name: 'Ovl dest', startDate: new Date('2029-09-01T00:00:00Z'), endDate: new Date('2029-12-31T00:00:00Z') },
      });
      return { originId: origin.id, destId: dest.id };
    });
    await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(ADMIN_TOKEN))
      .send({ originSeasonId: originId, destinationSeasonId: destId, deadline: '2029-04-01' }).expect(422);
  });
```

*(Nota per l'implementer: sostituisci `ESTABLISHMENT_ID`, `ADMIN_TOKEN`, `bearer`, e la rotta POST con i simboli/rotta effettivi del file — verificali leggendo il file prima. Se il file non espone `prisma`/l'establishment id, aggiungi il minimo necessario seguendo il pattern di `bookings.e2e-spec.ts`.)*

- [ ] **Step 9: Esegui unit + e2e e verifica che passino**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```

Expected: unit **97 + 4 = 101** PASS; e2e **149 (da Task 1) + 2 = 151** PASS. Nessuna regressione. In particolare i test esistenti di `renewal-campaigns.e2e-spec.ts` che usano le seed 2026/2027 (disgiunte) restano verdi con la validazione rafforzata.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/bookings/booking.errors.ts apps/api/src/bookings/booking.errors.spec.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/renewal-campaigns.service.ts apps/api/test/bookings.e2e-spec.ts apps/api/test/renewal-campaigns.e2e-spec.ts
git commit -m "$(cat <<'EOF'
feat(bookings): mapping 23P01 -> 409 + validazione stagioni rinnovo rinnovo-safe (D-030)

La violazione dell'EXCLUDE constraint (SQLSTATE 23P01) è tradotta nello stesso
409 "Fascia non disponibile per questo ombrellone" del controllo applicativo
(che resta primario). Rafforzata la validazione campagne rinnovo: la stagione di
destinazione deve iniziare DOPO la fine dell'origine (dest.startDate > origin.endDate),
così un rinnovo valido non è mai rifiutato dal constraint. e2e: renew in stagione
sovrapposta -> 409 (backstop DB via service), open dest⊇origin -> 422.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ADR-0037 + rimandi

Formalizza la decisione architetturale. Nessun codice.

**Files:**
- Create: `docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md`
- Modify: `docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md`
- Modify: `docs/architecture/decisions/0034-prelazione-finestre-lazy.md`

**Interfaces:**
- Consumes: la struttura ADR esistente (leggi ADR-0036 come template di forma prima di scrivere).

- [ ] **Step 1: Leggi un ADR recente come template**

```bash
cat docs/architecture/decisions/0036-*.md
```

Expected: capisci intestazione (numero, titolo, stato, data), sezioni (Contesto, Decisione, Conseguenze, Alternative) e il "rubric check" a 4 punti in chiusura.

- [ ] **Step 2: Scrivi ADR-0037**

Crea `docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md` seguendo il template. Contenuti obbligatori (dalla spec §7):
- Invariante anti-overlap **a livello DB** via `EXCLUDE USING gist` (btree_gist) su `umbrellaId =` + `daterange('[]')` inclusivo + `int4range('[)')` semiaperto dei minuti-fascia, `WHERE status='confirmed'`.
- Occupazione oraria **denormalizzata** su `Booking` (`slotStartMin`/`slotEndMin`) e mantenuta **DB-autoritativa** da un trigger (intrinseca alla prenotazione, non un lookup vivo: modificare gli orari di una fascia non sposta retroattivamente le prenotazioni già fatte).
- Il controllo applicativo resta **primario** (constraint = backstop di race); mapping `23P01 → 409`.
- L'**invariante stagioni non-sovrapposte** di una campagna rinnovo (`dest.startDate > origin.endDate`) rende il constraint rinnovo-safe.
- Perché **non** `timeSlotId WITH =` (mancherebbe Giorno-Intero-vs-Mattina) e perché **non** colonne `GENERATED` (espressioni immutabili inline).
- **Raffina ADR-0006** (l'invariante ora ha garanzia strutturale) e **ADR-0013**.
- Chiudi col rubric check a 4 punti.

- [ ] **Step 3: Aggiungi i rimandi in ADR-0006 e ADR-0034**

In `docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md`, dove si parla dell'invariante anti-overlap, aggiungi una riga: `> Raffinato da [ADR-0037](0037-anti-overlap-exclusion-constraint.md): l'invariante è ora garantita anche a livello DB (EXCLUDE constraint).`

In `docs/architecture/decisions/0034-prelazione-finestre-lazy.md`, dove si parla della validazione stagioni delle campagne, aggiungi un rimando ad ADR-0037 (la validazione `dest.startDate > origin.endDate` rende il constraint rinnovo-safe).

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/decisions/0037-anti-overlap-exclusion-constraint.md docs/architecture/decisions/0006-dominio-prenotazioni-e-pricing.md docs/architecture/decisions/0034-prelazione-finestre-lazy.md
git commit -m "$(cat <<'EOF'
docs(adr): ADR-0037 anti-overlap EXCLUDE constraint (raffina ADR-0006/0013)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Post-esecuzione (dopo i 3 commit)

1. **Review whole-branch finale (opus)** via `superpowers:requesting-code-review`; correggi eventuali Critical/Important.
2. **Verifica live in dev** (dopo `docker compose --profile full up -d --build api web`, DB `localhost:5433`, login `admin@coralyn.dev` / `coralyn-admin-8473`):
   - due prenotazioni in conflitto reale (stessa fascia, date sovrapposte) → **409**;
   - Giorno-Intero-vs-Mattina stesso ombrellone/data → **409**;
   - fasce contigue → **201**;
   - cancellata non blocca la ricreazione → **201**;
   - rinnovo su stagione futura (disgiunta) → **201** (nessun 409 spurio).
3. **Riverifica i conteggi test dal vivo** (non regredire; incrementi additivi): api unit 97→101 · e2e 142→151 · web-staff 153 · ui-kit 55.
4. Aggiorna il registro `docs/architecture/deferred.md` (D-030 chiuso) se previsto dal pattern del repo.
5. **Presenta lo stato all'utente e attendi conferma** prima del prossimo D-0xx (candidato: D-024).

---

## Self-Review (eseguita in fase di scrittura del piano)

**Spec coverage:**
- Spec §3.1 (2 colonne) → Task 1 Step 1/3. ✅
- Spec §3.2 (trigger DB-autoritativo) → Task 1 Step 3 (funzione+trigger). ✅
- Spec §3.3 (EXCLUDE constraint, btree_gist, semantica `[]`/`[)`/partial) → Task 1 Step 3. ✅
- Spec §3.4 (migrazione con backfill sotto RLS NO FORCE/FORCE, ordine 8 passi) → Task 1 Step 3, applicata dev+test Step 4/5. ✅
- Spec §4.1 (mapping 23P01→409) → Task 2 Step 3/5. ✅
- Spec §4.2 (controllo app invariato) → non toccato (solo `tx.booking.create` avvolto; il check :133-144 resta). ✅
- Spec §4.3 (validazione stagioni rafforzata) → Task 2 Step 6. ✅
- Spec §5 (test): unit conversione → **deviazione documentata** (testata al trigger, Task 1 Step 6, invece di un helper morto); e2e casi (overlap, GI-vs-Mattina, contigue, cancellata, rinnovo futuro, open dest⊇origin) → Task 1 Step 6 + Task 2 Step 7/8; migrazione popola i seed → Task 1 Step 6. ✅ (con nota)
- Spec §7 (ADR-0037 + rimandi) → Task 3. ✅
- Spec §9 (branch, un commit per layer, no FE) → struttura commit + Global Constraints. ✅

**Placeholder scan:** l'unico punto non completamente concreto è Task 2 Step 8 (adattamento ai simboli di `renewal-campaigns.e2e-spec.ts`), esplicitamente demandato all'implementer con istruzione di leggere il file prima — accettabile perché i nomi delle variabili di setup di quel file non sono noti a priori e vanno riusati, non inventati.

**Type consistency:** `isBookingOverlapExclusion(e: unknown): boolean` usato con la stessa firma in `booking.errors.ts`, nel suo spec e in `bookings.service.ts`. Nomi DB (`slotStartMin`/`slotEndMin`, `booking_no_overlap`, `booking_fill_slot_minutes`) coerenti tra schema, migration e test. ✅
