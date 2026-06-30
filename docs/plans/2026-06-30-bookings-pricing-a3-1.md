# Pricing engine + auto-pricing (A3.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:executing-plans` (inline con checkpoint)
> o `superpowers:subagent-driven-development`. Gli step usano checkbox (`- [ ]`).

**Goal:** Introdurre il catalogo (`Season`/`Pricing`/`Rate`/`Package`) e un pricing engine puro a
precedenze esplicite che calcola il `totalPrice` server-side, eliminando il prezzo digitato a mano.

**Architecture:** Nuovo modulo `catalog` con un engine **puro** (`resolvePrice`, niente Nest, unit-testato
come `booking.payment`) e un `CatalogService` che carica `Rate` nel tenant e invoca l'engine. `BookingsService`
dipende da `CatalogService`: `POST /bookings` calcola il prezzo (no più `totalPrice` in input), e un nuovo
`GET /bookings/quote` lo espone come preview. Listino **seeded** (editor CRUD rinviato, D-032).

**Tech Stack:** NestJS + Prisma + class-validator (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
contratti condivisi in `@coralyn/contracts`. Test: Jest (api unit + e2e), Vitest (web-staff).

**Spec di riferimento:** [docs/specs/2026-06-30-bookings-pricing-a3-1-design.md](../specs/2026-06-30-bookings-pricing-a3-1-design.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. Comandi: `corepack pnpm ...` (pin 11.9.0).
DB locale porta **5433** (`coralyn_dev`/`coralyn_test`); `DATABASE_URL` inline ai comandi prisma;
`prisma generate` PRIMA di `nest build` e dopo il cambio schema. Precedenza engine = **ADR-0032** (Regola B
lessicografica: *periodo › fila › settore › pacchetto › fascia › tipo*).

---

## File map

- **Modifica** `packages/contracts/src/index.ts` — `PackageDTO`, `RateUnit`, `QuoteBookingInput`, `BookingQuoteDTO`; `BookingDTO += packageId?`; `CreateBookingInput -= totalPrice`.
- **Modifica** `apps/api/prisma/schema.prisma` — model `Package`/`Season`/`Pricing`/`Rate` + enum `RateUnit` + `Booking.packageId` + relazioni inverse.
- **Crea** `apps/api/prisma/migrations/<ts>_pricing/migration.sql` — generata da Prisma + **RLS** e **unique index firma** (`NULLS NOT DISTINCT`) aggiunti a mano.
- **Crea** `apps/api/src/catalog/pricing.engine.ts` — engine puro `resolvePrice` + tipi.
- **Crea** `apps/api/src/catalog/pricing.engine.spec.ts` — unit dell'engine.
- **Crea** `apps/api/src/catalog/catalog.service.ts` — `quote`/`priceWithin` (DB + engine).
- **Crea** `apps/api/src/catalog/catalog.module.ts` — provider + export `CatalogService`.
- **Modifica** `apps/api/src/bookings/booking.projection.ts` + `booking.projection.spec.ts` — mappa `packageId`.
- **Modifica** `apps/api/src/bookings/dto/create-booking.dto.ts` — rimuove `totalPrice`, **esporta** `UUID_SHAPE`.
- **Crea** `apps/api/src/bookings/dto/quote-booking.dto.ts` — query DTO del quote.
- **Modifica** `apps/api/src/bookings/bookings.service.ts` — `create` con auto-pricing + `quote`; inietta `CatalogService`.
- **Modifica** `apps/api/src/bookings/bookings.controller.ts` — `GET quote`.
- **Modifica** `apps/api/src/bookings/bookings.module.ts` — importa `CatalogModule`.
- **Modifica** `apps/api/prisma/seed.ts` — listino demo (Package/Season/Pricing/Rate).
- **Crea** `apps/api/test/helpers/seed-pricing.ts` — `seedPricingTenant`/`cleanPricingTenant`.
- **Modifica** `apps/api/test/bookings.e2e-spec.ts` — seed listino, asserzioni prezzo, precedenza, no-season, quote.
- **Crea** `apps/web-staff/src/features/bookings/useBookingQuote.ts` — composable quote.
- **Modifica** `apps/web-staff/src/features/map/MapView.vue` — toglie prezzo a mano, mostra il quote.
- **Modifica** `apps/web-staff/src/mocks/server.ts` — handler quote + POST senza `totalPrice` (test).
- **Modifica** `apps/web-staff/src/features/map/MapView.spec.ts` — allinea (modale senza campo prezzo).
- **Modifica** `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`, `docs/architecture/deferred.md`; **crea** `docs/architecture/decisions/0032-pricing-engine-precedenza.md`, `docs/handoff/2026-06-30-bookings-a3-1-done.md`.

---

## Task 1: Contratti

**Files:** Modifica `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i nuovi tipi e modifica `BookingDTO`/`CreateBookingInput`**

Dopo `export type SlotState = ...` (o vicino agli altri DTO), aggiungi:

```ts
/** Pacchetto/dotazione prenotabile (ADR-0006). */
export interface PackageDTO {
  id: string;
  name: string;
  equipment: Record<string, number>; // es. { sunbeds: 2, deckchairs: 1 }
}

/** Unità di prezzo di una Tariffa (ADR-0006). */
export type RateUnit = 'day' | 'period';

/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  date: string;          // ISO yyyy-mm-dd
  packageId?: string;    // A3.1: assente (nessun pacchetto)
  type?: BookingType;    // default 'daily'
}

/** Preventivo calcolato dall'engine. */
export interface BookingQuoteDTO {
  totalPrice: number;    // EUR, 2 decimali
}
```

Nel blocco `BookingDTO`, dopo `collectionDate?: string;`, aggiungi:

```ts
  packageId?: string;            // A3.1 (additivo): assente finché non si sceglie (A3.2)
```

In `CreateBookingInput` **rimuovi** la riga `totalPrice: number;` e il commento "prezzo digitato a mano":
il prezzo è calcolato dall'engine. Il risultato:

```ts
/** Input per creare una prenotazione giornaliera. Il prezzo è calcolato dal pricing engine (A3.1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string; // ISO yyyy-mm-dd
}
```

- [ ] **Step 2: Build dei contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): PackageDTO/RateUnit/QuoteBookingInput/BookingQuoteDTO; BookingDTO+=packageId; CreateBookingInput-=totalPrice (A3.1)"
```

---

## Task 2: Schema Prisma + migrazione

**Files:** Modifica `apps/api/prisma/schema.prisma`; crea `apps/api/prisma/migrations/<ts>_pricing/migration.sql`

- [ ] **Step 1: Aggiungi l'enum e i quattro model**

In fondo a `schema.prisma` aggiungi:

```prisma
enum RateUnit {
  day
  period
}

model Package {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  name            String
  equipment       Json          @db.JsonB
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  bookings        Booking[]
  rates           Rate[]

  @@index([establishmentId])
}

model Season {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  name            String
  startDate       DateTime      @db.Date
  endDate         DateTime      @db.Date
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  pricings        Pricing[]

  @@index([establishmentId])
}

model Pricing {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  seasonId        String        @db.Uuid
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  season          Season        @relation(fields: [seasonId], references: [id])
  rates           Rate[]

  @@unique([seasonId])
  @@index([establishmentId])
}

model Rate {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  pricingId       String        @db.Uuid
  type            BookingType?
  sectorId        String?       @db.Uuid
  rowId           String?       @db.Uuid
  packageId       String?       @db.Uuid
  timeSlotId      String?       @db.Uuid
  periodStart     DateTime?     @db.Date
  periodEnd       DateTime?     @db.Date
  price           Decimal       @db.Decimal(10, 2)
  unit            RateUnit
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  pricing         Pricing       @relation(fields: [pricingId], references: [id])
  sector          Sector?       @relation(fields: [sectorId], references: [id])
  row             Row?          @relation(fields: [rowId], references: [id])
  package         Package?      @relation(fields: [packageId], references: [id])
  timeSlot        TimeSlot?     @relation(fields: [timeSlotId], references: [id])

  @@index([establishmentId])
  @@index([pricingId])
}
```

- [ ] **Step 2: Aggiungi le relazioni inverse ai model esistenti**

In `Establishment`, dopo `bookings  Booking[]`:
```prisma
  packages  Package[]
  seasons   Season[]
  pricings  Pricing[]
  rates     Rate[]
```
In `Sector`, dopo `rows            Row[]`: `  rates           Rate[]`
In `Row`, dopo `umbrellas       Umbrella[]`: `  rates           Rate[]`
In `TimeSlot`, dopo `bookings        Booking[]`: `  rates           Rate[]`
In `Booking`, dopo `previousBookingId String?   @db.Uuid // ...`, aggiungi il campo:
```prisma
  packageId         String?        @db.Uuid // FK Package (A3.1); null finché non si sceglie (A3.2)
```
e, nella sezione relazioni di `Booking` (dopo `timeSlot  TimeSlot @relation(...)`):
```prisma
  package          Package?      @relation(fields: [packageId], references: [id])
```

- [ ] **Step 3: Genera la migrazione SENZA applicarla**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
  corepack pnpm --filter @coralyn/api prisma migrate dev --name pricing --create-only
```
Expected: crea `apps/api/prisma/migrations/<timestamp>_pricing/migration.sql` con `CREATE TYPE "RateUnit"`,
le 4 `CREATE TABLE`, gli indici (incl. `Pricing_seasonId_key`), `ALTER TABLE "Booking" ADD COLUMN "packageId"`,
le FK. **Non** applicata.

- [ ] **Step 4: Appendi RLS + unique index della firma alla migrazione generata**

In coda al file `migration.sql` appena generato, aggiungi:

```sql
-- RLS tenant_isolation (Prisma non la genera) sulle nuove tabelle tenant-scoped.
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Package"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Season" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Season" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Season"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Pricing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pricing" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Pricing"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Rate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rate"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

-- Firma unica delle dimensioni della Rate. NULLS NOT DISTINCT (Postgres 16): due regole con la
-- stessa identica firma (anche con wildcard NULL) sono duplicate → niente pareggio di specificità
-- a runtime (ADR-0032). Index raw: Prisma @@unique non emette NULLS NOT DISTINCT.
CREATE UNIQUE INDEX "Rate_signature_key" ON "Rate"
  ("pricingId", "type", "sectorId", "rowId", "packageId", "timeSlotId", "periodStart", "periodEnd")
  NULLS NOT DISTINCT;
```

- [ ] **Step 5: Applica la migrazione, rigenera il client, allinea il DB di test**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
  corepack pnpm --filter @coralyn/api prisma migrate dev
corepack pnpm --filter @coralyn/api prisma generate
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" \
  corepack pnpm --filter @coralyn/api prisma migrate deploy
```
Expected: la migrazione `pricing` risulta applicata su entrambi i DB; client Prisma rigenerato con i tipi
`Package`/`Season`/`Pricing`/`Rate`/`RateUnit` e `Booking.packageId`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): schema+migrazione catalogo (Package/Season/Pricing/Rate) + Booking.packageId + RLS + firma unica (A3.1)"
```

---

## Task 3: Pricing engine puro

**Files:** Crea `apps/api/src/catalog/pricing.engine.ts`, `apps/api/src/catalog/pricing.engine.spec.ts`

- [ ] **Step 1: Scrivi i test (falliscono)**

`apps/api/src/catalog/pricing.engine.spec.ts`:

```ts
import { resolvePrice, type PricingContext, type RateRow } from './pricing.engine';

const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  type: 'daily',
  sectorId: 'sec-1',
  rowId: 'row-1',
  packageId: null,
  timeSlotId: 'slot-am',
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  ...over,
});

const rate = (over: Partial<RateRow>): RateRow => ({
  type: null, sectorId: null, rowId: null, packageId: null, timeSlotId: null,
  periodStart: null, periodEnd: null, price: 0, unit: 'day', ...over,
});

const CATCH_ALL = rate({ price: 28 });

describe('resolvePrice', () => {
  it('nessuna rate → NO_RATE', () => {
    expect(resolvePrice(ctx(), [])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('rate esistenti ma nessuna applicabile (manca catch-all) → NO_RATE', () => {
    const only = rate({ rowId: 'row-ALTRA', price: 50 });
    expect(resolvePrice(ctx(), [only])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('solo catch-all → la sceglie (daily = 1 giorno)', () => {
    const r = resolvePrice(ctx(), [CATCH_ALL]);
    expect(r).toMatchObject({ ok: true, totalPrice: 28 });
  });

  it('precedenza: rowId batte packageId batte catch-all (esempio §3 → €45)', () => {
    const rRow = rate({ rowId: 'row-1', price: 45 });
    const rPkg = rate({ packageId: 'pkg-1', price: 50 });
    const r = resolvePrice(ctx({ packageId: 'pkg-1' }), [CATCH_ALL, rPkg, rRow]);
    expect(r).toMatchObject({ ok: true, totalPrice: 45 });
  });

  it('sectorId batte catch-all ma perde su rowId', () => {
    const rSector = rate({ sectorId: 'sec-1', price: 35 });
    const rRow = rate({ rowId: 'row-1', price: 45 });
    expect(resolvePrice(ctx(), [CATCH_ALL, rSector])).toMatchObject({ totalPrice: 35 });
    expect(resolvePrice(ctx(), [CATCH_ALL, rSector, rRow])).toMatchObject({ totalPrice: 45 });
  });

  it('periodo (sotto-periodo) batte una regola di fila (priorità 1)', () => {
    const rRow = rate({ rowId: 'row-1', price: 45 });
    const rPeriod = rate({ periodStart: '2026-08-10', periodEnd: '2026-08-20', price: 60 });
    const r = resolvePrice(ctx({ startDate: '2026-08-15', endDate: '2026-08-15' }), [rRow, rPeriod, CATCH_ALL]);
    expect(r).toMatchObject({ totalPrice: 60 });
  });

  it('matching periodo: fuori dal sotto-periodo NON applica quella rate', () => {
    const rPeriod = rate({ periodStart: '2026-08-10', periodEnd: '2026-08-20', price: 60 });
    const r = resolvePrice(ctx({ startDate: '2026-07-15', endDate: '2026-07-15' }), [CATCH_ALL, rPeriod]);
    expect(r).toMatchObject({ totalPrice: 28 }); // catch-all
  });

  it('matching fascia: una rate slot-specifica si applica solo a quello slot', () => {
    const rPm = rate({ timeSlotId: 'slot-pm', price: 40 });
    expect(resolvePrice(ctx({ timeSlotId: 'slot-pm' }), [CATCH_ALL, rPm])).toMatchObject({ totalPrice: 40 });
    expect(resolvePrice(ctx({ timeSlotId: 'slot-am' }), [CATCH_ALL, rPm])).toMatchObject({ totalPrice: 28 });
  });

  it('unit=day su più giorni → price × giorni (estremi inclusi)', () => {
    const r = resolvePrice(ctx({ startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 10, unit: 'day' })]);
    expect(r).toMatchObject({ totalPrice: 30 }); // 3 giorni
  });

  it('unit=period → forfait, indipendente dai giorni', () => {
    const r = resolvePrice(ctx({ startDate: '2026-07-15', endDate: '2026-07-20' }), [rate({ price: 200, unit: 'period' })]);
    expect(r).toMatchObject({ totalPrice: 200 });
  });

  it('centesimi: 0.1 × 3 senza errore float', () => {
    const r = resolvePrice(ctx({ startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 0.1, unit: 'day' })]);
    expect(r).toMatchObject({ totalPrice: 0.3 });
  });

  it('pareggio di firma → scelta deterministica (prima in input)', () => {
    const a = rate({ rowId: 'row-1', price: 45 });
    const b = rate({ rowId: 'row-1', price: 99 });
    expect(resolvePrice(ctx(), [a, b])).toMatchObject({ totalPrice: 45 });
  });
});
```

- [ ] **Step 2: Esegui (devono fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine`
Expected: FAIL ("Cannot find module './pricing.engine'").

- [ ] **Step 3: Implementa l'engine**

`apps/api/src/catalog/pricing.engine.ts`:

```ts
import type { BookingType, RateUnit } from '@coralyn/contracts';

/** Contesto di una prenotazione da prezzare (posizione già risolta a settore/fila). */
export interface PricingContext {
  type: BookingType;
  sectorId: string;
  rowId: string;
  packageId: string | null;
  timeSlotId: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd (daily: == startDate)
}

/** Una Rate "piatta" già caricata dal DB (Decimal→number, Date→ISO). Dimensione null = wildcard. */
export interface RateRow {
  type: BookingType | null;
  sectorId: string | null;
  rowId: string | null;
  packageId: string | null;
  timeSlotId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  price: number;
  unit: RateUnit;
}

export type PriceResult =
  | { ok: true; totalPrice: number; rate: RateRow }
  | { ok: false; reason: 'NO_RATE' };

/** La rate è applicabile se ogni dimensione specificata (non-null) combacia col contesto. */
function isApplicable(ctx: PricingContext, r: RateRow): boolean {
  if (r.type !== null && r.type !== ctx.type) return false;
  if (r.sectorId !== null && r.sectorId !== ctx.sectorId) return false;
  if (r.rowId !== null && r.rowId !== ctx.rowId) return false;
  if (r.packageId !== null && r.packageId !== ctx.packageId) return false;
  if (r.timeSlotId !== null && r.timeSlotId !== ctx.timeSlotId) return false;
  if (r.periodStart !== null) {
    if (r.periodEnd === null) return false; // periodo malformato → ignora la rate
    // confronto lessicografico = cronologico per ISO yyyy-mm-dd
    if (!(ctx.startDate >= r.periodStart && ctx.endDate <= r.periodEnd)) return false;
  }
  return true;
}

/** Vettore di specificità, dalla dimensione più dominante (ADR-0032): true (specifica) batte false (wildcard). */
function specificity(r: RateRow): boolean[] {
  return [
    r.periodStart !== null, // 1. periodo
    r.rowId !== null,       // 2. fila
    r.sectorId !== null,    // 3. settore
    r.packageId !== null,   // 4. pacchetto
    r.timeSlotId !== null,  // 5. fascia
    r.type !== null,        // 6. tipo
  ];
}

/** >0 se `a` più specifica di `b`, <0 se meno, 0 se firma di pari specificità. */
function compareSpecificity(a: RateRow, b: RateRow): number {
  const sa = specificity(a);
  const sb = specificity(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] ? 1 : -1;
  }
  return 0;
}

/** Giorni inclusivi tra due date ISO (UTC, mai metodi locali — ADR-0031). */
function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Risolve la Rate applicabile più specifica (precedenza esplicita ADR-0032) e calcola il prezzo.
 * Puro: nessuna dipendenza Nest/DB. `rates` = Rate del Pricing della stagione attiva.
 */
export function resolvePrice(ctx: PricingContext, rates: RateRow[]): PriceResult {
  const applicable = rates.filter((r) => isApplicable(ctx, r));
  if (applicable.length === 0) return { ok: false, reason: 'NO_RATE' };

  let best = applicable[0];
  for (let i = 1; i < applicable.length; i++) {
    // >0 → più specifica vince; ==0 (firma pari, prevenuta dall'unique index) → si tiene la prima.
    if (compareSpecificity(applicable[i], best) > 0) best = applicable[i];
  }

  const days = daysInclusive(ctx.startDate, ctx.endDate);
  const totalPrice = best.unit === 'day' ? round2(best.price * days) : round2(best.price);
  return { ok: true, totalPrice, rate: best };
}
```

- [ ] **Step 4: Esegui (devono passare)**

Run: `corepack pnpm --filter @coralyn/api test -- pricing.engine`
Expected: PASS (12 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/catalog/pricing.engine.ts apps/api/src/catalog/pricing.engine.spec.ts
git commit -m "feat(api): pricing engine puro resolvePrice — precedenza esplicita ADR-0032 (A3.1)"
```

---

## Task 4: Proiezione DTO con `packageId`

**Files:** Modifica `apps/api/src/bookings/booking.projection.ts`, `booking.projection.spec.ts`

- [ ] **Step 1: Aggiorna i test della proiezione**

In `booking.projection.spec.ts`, nel fixture `row` aggiungi `packageId: null,` (dopo `previousBookingId: null,`).
Poi aggiungi un test:

```ts
  it('mappa packageId quando valorizzato e null → undefined', () => {
    expect(toBookingDTO({ ...row, packageId: 'pkg-1' }).packageId).toBe('pkg-1');
    expect(toBookingDTO(row).packageId).toBeUndefined();
  });
```

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.projection`
Expected: FAIL (`packageId` non mappato / proprietà assente).

- [ ] **Step 3: Aggiorna la proiezione**

In `booking.projection.ts`, dentro l'oggetto ritornato da `toBookingDTO`, dopo
`collectionDate: b.collectionDate ? formatDbDate(b.collectionDate) : undefined,` aggiungi:

```ts
    packageId: b.packageId ?? undefined,
```

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.projection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking.projection.ts apps/api/src/bookings/booking.projection.spec.ts
git commit -m "feat(api): proietta Booking.packageId in BookingDTO (A3.1)"
```

---

## Task 5: `CatalogService` + `CatalogModule`

**Files:** Crea `apps/api/src/catalog/catalog.service.ts`, `apps/api/src/catalog/catalog.module.ts`

- [ ] **Step 1: Implementa il service**

`apps/api/src/catalog/catalog.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Rate } from '@prisma/client';
import type { BookingType } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { formatDbDate, toDbDate } from '../common/dates';
import { resolvePrice, type RateRow } from './pricing.engine';

export interface QuoteContext {
  umbrellaId: string;
  timeSlotId: string;
  date: string;
  packageId?: string | null;
  type?: BookingType;
}

export type QuoteOutcome =
  | { ok: true; totalPrice: number }
  | { ok: false; reason: 'UMBRELLA_NOT_FOUND' | 'NO_SEASON' | 'NO_RATE' };

function toRateRow(r: Rate): RateRow {
  return {
    type: r.type,
    sectorId: r.sectorId,
    rowId: r.rowId,
    packageId: r.packageId,
    timeSlotId: r.timeSlotId,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : null,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : null,
    price: Number(r.price),
    unit: r.unit,
  };
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Preventivo standalone (endpoint GET /bookings/quote): apre la propria transazione tenant. */
  async quote(ctx: QuoteContext): Promise<QuoteOutcome> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, (tx) => this.priceWithin(tx, ctx));
  }

  /**
   * Calcola il prezzo dentro una transazione esistente (usato da BookingsService.create:
   * niente transazione annidata). Risolve posizione + stagione + engine.
   */
  async priceWithin(tx: Prisma.TransactionClient, ctx: QuoteContext): Promise<QuoteOutcome> {
    const umbrella = await tx.umbrella.findFirst({
      where: { id: ctx.umbrellaId },
      include: { row: true },
    });
    if (!umbrella) return { ok: false, reason: 'UMBRELLA_NOT_FOUND' };

    const day = toDbDate(ctx.date);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${ctx.date}: uso la prima (${seasons[0].id}).`);
    }
    const pricing = await tx.pricing.findFirst({ where: { seasonId: seasons[0].id } });
    if (!pricing) return { ok: false, reason: 'NO_SEASON' };

    const rates = await tx.rate.findMany({ where: { pricingId: pricing.id } });
    const result = resolvePrice(
      {
        type: ctx.type ?? 'daily',
        sectorId: umbrella.row.sectorId,
        rowId: umbrella.rowId,
        packageId: ctx.packageId ?? null,
        timeSlotId: ctx.timeSlotId,
        startDate: ctx.date,
        endDate: ctx.date,
      },
      rates.map(toRateRow),
    );
    if (!result.ok) return { ok: false, reason: 'NO_RATE' };
    return { ok: true, totalPrice: result.totalPrice };
  }
}
```

- [ ] **Step 2: Implementa il module**

`apps/api/src/catalog/catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Module({
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
```

> `PrismaService` è `@Global` (vedi `prisma.module.ts`); `TenantContext` è fornito da `TenantModule`
> (già importato in `AppModule`). `CatalogModule` non deve re-importarli.

- [ ] **Step 3: Build dell'api**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/catalog/catalog.service.ts apps/api/src/catalog/catalog.module.ts
git commit -m "feat(api): CatalogService.quote/priceWithin (risoluzione stagione + engine) (A3.1)"
```

---

## Task 6: Auto-pricing su `POST /bookings` + endpoint `quote`

**Files:** Modifica `bookings.service.ts`, `bookings.controller.ts`, `bookings.module.ts`,
`dto/create-booking.dto.ts`; crea `dto/quote-booking.dto.ts`

- [ ] **Step 1: Rimuovi `totalPrice` dal DTO ed esporta `UUID_SHAPE`**

In `dto/create-booking.dto.ts`: cambia `const UUID_SHAPE` in `export const UUID_SHAPE`; rimuovi gli import
`IsNumber, Max, Min` (restano `Matches`); rimuovi il blocco:
```ts
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  totalPrice!: number;
```

- [ ] **Step 2: Crea il DTO del quote**

`apps/api/src/bookings/dto/quote-booking.dto.ts`:

```ts
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, QuoteBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';
import { UUID_SHAPE } from './create-booking.dto';

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

export class QuoteBookingDto implements QuoteBookingInput {
  @Matches(UUID_SHAPE, { message: 'umbrellaId must be a UUID' })
  umbrellaId!: string;

  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId!: string;

  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: BookingType;
}
```

- [ ] **Step 3: Aggiorna `BookingsService` (inietta CatalogService; create con auto-pricing; quote)**

In `bookings.service.ts`:
- aggiorna gli import dei tipi: `import type { BookingDTO, CreateBookingInput, QuoteBookingInput, SettlePaymentInput } from '@coralyn/contracts';`
- aggiungi: `import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';`
- inietta nel costruttore:
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}
```
- aggiungi un mapper privato (sopra `create`):
```ts
  /** Mappa l'esito del pricing → prezzo, oppure lancia l'eccezione 422 col messaggio IT. */
  private priceOrThrow(outcome: QuoteOutcome): number {
    if (outcome.ok) return outcome.totalPrice;
    if (outcome.reason === 'UMBRELLA_NOT_FOUND')
      throw new UnprocessableEntityException('Ombrellone non valido');
    if (outcome.reason === 'NO_SEASON')
      throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    throw new UnprocessableEntityException('Nessuna tariffa applicabile: configurare il listino'); // NO_RATE
  }

  /** Preventivo per il modale FE (preview). */
  async quote(input: QuoteBookingInput): Promise<{ totalPrice: number }> {
    const totalPrice = this.priceOrThrow(await this.catalog.quote(input));
    return { totalPrice };
  }
```
- nel metodo `create`, **rimuovi** `const day = toDbDate(input.date);` dalla riga sotto (resta usato nel
  blocco; verifica: `day` serve all'overlap e alla create). Dentro la transazione, **dopo** il controllo
  anti-overlap e **prima** di `tx.booking.create`, aggiungi il calcolo del prezzo e usalo nella create:

```ts
      // Auto-pricing (A3.1): il prezzo è calcolato dall'engine nello stesso tenant/tx, mai dal client.
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          date: input.date,
        }),
      );

      return tx.booking.create({
        data: {
          establishmentId: tenantId,
          customerId: input.customerId,
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate: day,
          endDate: day,
          type: 'daily',
          status: 'confirmed',
          totalPrice,
        },
      });
```
(Rimuovi la vecchia `tx.booking.create` che usava `totalPrice: input.totalPrice`.)

- [ ] **Step 4: Aggiungi la rotta quote al controller**

In `bookings.controller.ts`: importa il DTO (`import { QuoteBookingDto } from './dto/quote-booking.dto';`)
e il tipo (`import type { BookingDTO, BookingQuoteDTO } from '@coralyn/contracts';`). Aggiungi, sopra `@Get()`:

```ts
  @Get('quote')
  quote(@Query() query: QuoteBookingDto): Promise<BookingQuoteDTO> {
    return this.bookings.quote(query);
  }
```

- [ ] **Step 5: Importa CatalogModule in BookingsModule**

In `bookings.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 6: Build**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: build OK (nessun riferimento residuo a `input.totalPrice`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.module.ts apps/api/src/bookings/dto/create-booking.dto.ts apps/api/src/bookings/dto/quote-booking.dto.ts
git commit -m "feat(api): auto-pricing su POST /bookings + GET /bookings/quote (A3.1)"
```

---

## Task 7: Seed del listino demo

**Files:** Modifica `apps/api/prisma/seed.ts`

- [ ] **Step 1: Aggiungi il listino demo dentro la transazione del seed**

In `seed.ts`, dentro `prisma.$transaction(async (tx) => { ... })` (dopo il blocco `umbrellas`, prima della
chiusura della callback), aggiungi:

```ts
    // --- Listino demo (A3.1): Package + Season + Pricing + Rate (catch-all + pomeriggio). ---
    const PKG_STANDARD = u(6, 1);
    await tx.package.upsert({
      where: { id: PKG_STANDARD },
      update: { name: 'Standard', equipment: { sunbeds: 2, deckchairs: 1 } },
      create: { id: PKG_STANDARD, establishmentId: EID, name: 'Standard', equipment: { sunbeds: 2, deckchairs: 1 } },
    });

    const SEASON = u(7, 1);
    await tx.season.upsert({
      where: { id: SEASON },
      update: { name: 'Estate 2026', startDate: t2('2026-05-01'), endDate: t2('2026-09-30') },
      create: { id: SEASON, establishmentId: EID, name: 'Estate 2026', startDate: t2('2026-05-01'), endDate: t2('2026-09-30') },
    });

    const PRICING = u(8, 1);
    await tx.pricing.upsert({
      where: { id: PRICING },
      update: { seasonId: SEASON },
      create: { id: PRICING, establishmentId: EID, seasonId: SEASON },
    });

    // Catch-all (tutte le dimensioni null): rete del listino, prezzo base giornaliero.
    const RATE_BASE = u(9, 1);
    await tx.rate.upsert({
      where: { id: RATE_BASE },
      update: { price: 28, unit: 'day' },
      create: { id: RATE_BASE, establishmentId: EID, pricingId: PRICING, price: 28, unit: 'day' },
    });
    // Pomeriggio (fascia u(2,2)) più caro: dimostra la precedenza per fascia.
    const RATE_PM = u(9, 2);
    await tx.rate.upsert({
      where: { id: RATE_PM },
      update: { timeSlotId: u(2, 2), price: 40, unit: 'day' },
      create: { id: RATE_PM, establishmentId: EID, pricingId: PRICING, timeSlotId: u(2, 2), price: 40, unit: 'day' },
    });
```

In cima al `main` (vicino a `const t = (hhmm: string)...`), aggiungi l'helper per le date di calendario:

```ts
  const t2 = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
```

> `RateUnit` accetta il literal `'day'` nei dati Prisma. UUID sintetici col solito helper `u(prefix, n)`
> (forma valida per Postgres, coerente col resto del seed).

- [ ] **Step 2: Esegui il seed sul DB dev (verifica idempotenza)**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
  corepack pnpm --filter @coralyn/api exec ts-node prisma/seed.ts
```
Expected: nessun errore; ri-eseguibile (upsert). *(Se lo script di seed ha un comando dedicato nel
`package.json` dell'api, usa quello con lo stesso `DATABASE_URL`.)*

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(api): seed listino demo — Package/Season/Pricing/Rate (A3.1)"
```

---

## Task 8: e2e — helper listino + adattamento `bookings.e2e`

**Files:** Crea `apps/api/test/helpers/seed-pricing.ts`; modifica `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Crea l'helper di seed listino**

`apps/api/test/helpers/seed-pricing.ts`:

```ts
import { RateUnit } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

export interface PricingSeedIds {
  seasonId: string;
  pricingId: string;
  packageId: string;
}

/** Listino minimo per `establishmentId`: catch-all (28/giorno) + pomeriggio specifico (40/giorno). */
export async function seedPricingTenant(
  prisma: PrismaService,
  establishmentId: string,
  opts: { afternoonSlotId: string },
): Promise<PricingSeedIds> {
  return prisma.forTenant(establishmentId, async (tx) => {
    const pkg = await tx.package.create({
      data: { establishmentId, name: 'Standard', equipment: { sunbeds: 2 } },
    });
    const season = await tx.season.create({
      data: {
        establishmentId,
        name: 'Estate 2026',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-09-30T00:00:00Z'),
      },
    });
    const pricing = await tx.pricing.create({ data: { establishmentId, seasonId: season.id } });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing.id, price: 28, unit: RateUnit.day },
    });
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        timeSlotId: opts.afternoonSlotId,
        price: 40,
        unit: RateUnit.day,
      },
    });
    return { seasonId: season.id, pricingId: pricing.id, packageId: pkg.id };
  });
}

/** Pulisce il listino di un tenant (ordine FK: rate → pricing → season; package). */
export async function cleanPricingTenant(prisma: PrismaService, establishmentId: string): Promise<void> {
  await prisma.forTenant(establishmentId, async (tx) => {
    await tx.rate.deleteMany({});
    await tx.pricing.deleteMany({});
    await tx.season.deleteMany({});
    await tx.package.deleteMany({});
  });
}
```

- [ ] **Step 2: Aggancia il seed listino e la pulizia in `bookings.e2e-spec.ts`**

In testa, aggiungi l'import:
```ts
import { seedPricingTenant, cleanPricingTenant } from './helpers/seed-pricing';
```
Nel `beforeAll`, **dopo** `ids = await seedMapTenant(prisma, s1);`, aggiungi:
```ts
    await seedPricingTenant(prisma, s1, { afternoonSlotId: ids.slotAfternoon });
```
Nel `afterAll`, **dopo** `await cleanMapTenant(prisma, s1);` (e prima del cleanup di s2), aggiungi:
```ts
    await cleanPricingTenant(prisma, s1);
```

- [ ] **Step 3: Aggiorna `body()` e le asserzioni di prezzo**

Sostituisci l'helper `body`:
```ts
  const body = (over: Partial<Record<string, unknown>> = {}) => ({
    customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, date: D, ...over,
  });
```
(rimosso `totalPrice: 28`).

Nel test "crea una giornaliera → 201 …", la riga `expect(res.body.totalPrice).toBe(28);` resta valida
(catch-all = 28). Va bene così.

Sostituisci il test "validazione: data calendariale impossibile → 400; prezzo negativo → 400" con
(il prezzo non è più input → niente caso 400 sul prezzo):
```ts
  it('validazione: data calendariale impossibile → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ date: '2026-13-40' })).expect(400);
  });

  it('prezzo calcolato dal listino: pomeriggio usa la tariffa specifica (40)', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, timeSlotId: ids.slotAfternoon, date: '2026-07-20' })).expect(201);
    expect(res.body.totalPrice).toBe(40);
  });

  it('data fuori stagione → 422 (nessuna stagione)', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
      .send(body({ umbrellaId: ids.u2, date: '2027-01-10' })).expect(422);
  });

  describe('GET /bookings/quote', () => {
    it('senza token → 401', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&date=${D}`).expect(401);
    });
    it('mattina → 28 (catch-all)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&date=${D}`).set(...bearer(token1)).expect(200);
      expect(res.body.totalPrice).toBe(28);
    });
    it('pomeriggio → 40 (precedenza fascia)', async () => {
      const res = await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotAfternoon}&date=${D}`).set(...bearer(token1)).expect(200);
      expect(res.body.totalPrice).toBe(40);
    });
    it('fuori stagione → 422', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&date=2027-01-10`).set(...bearer(token1)).expect(422);
    });
    it('isolamento: s2 quota un ombrellone di s1 → 422', async () => {
      await request(app.getHttpServer()).get(`/api/bookings/quote?umbrellaId=${ids.u1}&timeSlotId=${ids.slotMorning}&date=${D}`).set(...bearer(token2)).expect(422);
    });
  });
```

- [ ] **Step 4: Allinea il prezzo nel sub-suite `PATCH .../payment`**

Il booking creato in quel `beforeAll` ora costa **28** (catch-all, fascia mattina), non 50. Aggiorna:
- nel `beforeAll` del describe payment, la `send(body({ ... totalPrice: 50 }))` → rimuovi `totalPrice: 50`
  (resta `send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, date: settle }))`).
- test "salda tutto → paid": `send({ amountCollected: 50, paymentMethod: 'cash' })` → `amountCollected: 28`;
  l'asserzione `amountCollected: 50` → `28`.
- gli altri (`parziale` 20, `reset` 0, `amount > totale` 60, `senza metodo` 10, `cancelled` 30,
  `isolamento` 0) restano validi rispetto a un totale di 28 (60 e 30 restano > 28 dove serve il 422/409).

> Nota: `cancelled → 409` scatta **prima** del controllo over-total (il service verifica `cancelled`
> prima di `resolvePayment`), quindi `amountCollected: 30` va bene anche se 30 > 28.

- [ ] **Step 5: Applica le migrazioni a `coralyn_test` (già fatto in Task 2) ed esegui gli e2e**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" \
  corepack pnpm --filter @coralyn/api test:e2e -- bookings
```
Expected: PASS (tutti i bookings e2e, inclusi precedenza/quote/no-season). Se l'ambiente e2e carica
`.env.test`, il `DATABASE_URL` è già impostato e basta `test:e2e -- bookings`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/helpers/seed-pricing.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e pricing — auto-prezzo, precedenza fascia, no-season, quote, isolamento (A3.1)"
```

---

## Task 9: Frontend — quote nel modale, via il prezzo a mano

**Files:** Crea `apps/web-staff/src/features/bookings/useBookingQuote.ts`; modifica
`apps/web-staff/src/features/map/MapView.vue`, `apps/web-staff/src/mocks/server.ts`,
`apps/web-staff/src/features/map/MapView.spec.ts`

- [ ] **Step 1: Composable `useBookingQuote`**

`apps/web-staff/src/features/bookings/useBookingQuote.ts`:

```ts
import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { BookingQuoteDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { useSessionStore } from '@/stores/session';

export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  date: string;
}

/** Preventivo di prezzo per il modale (abilitato solo quando i parametri sono completi). */
export function useBookingQuote(params: Ref<QuoteParams | null>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => [
      'quote',
      session.establishmentId,
      params.value?.umbrellaId ?? '',
      params.value?.timeSlotId ?? '',
      params.value?.date ?? '',
    ]),
    queryFn: () => {
      const p = params.value!;
      return apiFetch<BookingQuoteDTO>(
        `/bookings/quote?umbrellaId=${p.umbrellaId}&timeSlotId=${p.timeSlotId}&date=${p.date}`,
      );
    },
    enabled: computed(
      () => !!params.value?.umbrellaId && !!params.value?.timeSlotId && !!params.value?.date,
    ),
  });
}
```

- [ ] **Step 2: `MapView.vue` — togli il prezzo a mano, mostra il quote**

Nel `<script setup>`:
- import: `import { useBookingQuote } from '@/features/bookings/useBookingQuote';`
- **rimuovi** `const price = ref<number>(0);`
- in `openModal()` rimuovi `price.value = 0;`
- in `confirmBooking()` rimuovi `totalPrice: price.value,` dal payload di `createBooking.mutateAsync`
  (restano `customerId/umbrellaId/timeSlotId/date`).
- aggiungi (dopo `const modalBooking = ref(false);`):
```ts
const quoteParams = computed(() =>
  modalBooking.value && sel.value && selectedSlotId.value
    ? { umbrellaId: sel.value.u.id, timeSlotId: selectedSlotId.value, date: activeDate.value }
    : null,
);
const { data: quote, isError: quoteError, isFetching: quoteLoading } = useBookingQuote(quoteParams);
```

Nel `<template>`, sostituisci il blocco del prezzo a mano
(`<div><label ...>Prezzo (€)</label><input .../></div>`) con la riga di prezzo calcolato:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Prezzo</label>
          <p v-if="quoteLoading" class="text-[13.5px] text-[var(--color-text-muted)]">Calcolo…</p>
          <p v-else-if="quoteError" class="text-[13.5px] text-[var(--color-danger)]">Prezzo non disponibile: listino non configurato.</p>
          <p v-else class="text-lg font-bold tabular-nums text-[var(--color-text)]">€ {{ (quote?.totalPrice ?? 0).toFixed(2) }}</p>
        </div>
```

- [ ] **Step 3: MSW — handler quote + POST senza `totalPrice`**

In `apps/web-staff/src/mocks/server.ts`:
- nel handler `http.post('/api/bookings', ...)`, il body non ha più `totalPrice`. Sostituisci con:
```ts
  http.post('/api/bookings', async ({ request }) => {
    const b = (await request.json()) as { customerId: string; umbrellaId: string; timeSlotId: string; date: string };
    return HttpResponse.json(
      { id: 'bk-1', ...b, startDate: b.date, endDate: b.date, type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0 },
      { status: 201 },
    );
  }),
```
- aggiungi (es. subito prima di `http.post('/api/bookings', ...)`):
```ts
  http.get('/api/bookings/quote', () => HttpResponse.json({ totalPrice: 28 })),
```

- [ ] **Step 4: Allinea `MapView.spec.ts`**

Il test esistente apre il modale e verifica "Conferma prenotazione": resta valido (il campo prezzo a mano
è sparito ma il bottone c'è). Aggiungi, in coda al secondo test (dopo l'assert su "Conferma prenotazione",
prima di `w.unmount()`), la verifica del prezzo calcolato dal quote (MSW = 28):
```ts
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('28');
```

- [ ] **Step 5: Esegui i test FE + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- MapView
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: PASS; nessun errore TS. *(Se i tipi dei contratti non risultano aggiornati, pulisci
`apps/web-staff/node_modules/.vite` e ri-esegui.)*

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/bookings/useBookingQuote.ts apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): modale prenotazione mostra il prezzo calcolato (quote); via il prezzo a mano (A3.1)"
```

---

## Task 10: Documentazione + ADR-0032 + verifica finale

**Files:** Modifica `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`,
`docs/architecture/deferred.md`; crea `docs/architecture/decisions/0032-pricing-engine-precedenza.md`,
`docs/handoff/2026-06-30-bookings-a3-1-done.md`

- [ ] **Step 1: Scrivi ADR-0032 (engine: dimensioni + precedenza)**

`docs/architecture/decisions/0032-pricing-engine-precedenza.md` — Status Accepted; Context (più regole
possono calzare; serve un esito unico); Decision (dimensioni della `Rate` = {tipo, settore/fila, pacchetto,
fascia, periodo}, nullable=wildcard; **precedenza lessicografica** *periodo › fila › settore › pacchetto ›
fascia › tipo*; firma unica `NULLS NOT DISTINCT`; no-match/no-season → 422; `UmbrellaType` esclusa, D-018;
`unit` day×giorni / period forfait); Consequences; Alternatives (punteggio di specificità — scartata: meno
prevedibile, richiede tie-break); Rubric check. Aggiungilo all'**indice ADR** in `docs/architecture/README.md`.

- [ ] **Step 2: Aggiorna deferred, glossary, data-model, README**

- `deferred.md`: aggiungi **D-032** (editor CRUD del listino — Season/Pricing/Rate/Package via form — rinviato;
  trigger: admin gestisce il listino dall'app; impatto: basso, additivo su modello già presente; gemello di B/ADR-0014).
- `glossary.md`: togli "(futuro)" da `Tariffa`/`Rate`, `Listino`/`Pricing`, `Stagione`/`Season`; aggiungi
  `Pacchetto`/`Package` (se manca come implementato) e la nota su `RateUnit` (giorno/periodo).
- `data-model.md`: nota che `Package`/`Season`/`Pricing`/`Rate` sono **implementate**; `Rate.period` (json) →
  colonne tipizzate `periodStart`/`periodEnd` e `scope "sector/row"` → FK `sectorId`/`rowId`; `Booking.packageId`
  ora presente; pricing engine attivo (ADR-0032). Aggiorna la nota su `packageId` (non più "rinviato ad A3").
- `README.md`: stato — **A3.1 pricing engine implementato** (catalogo + auto-pricing + quote; listino seeded,
  editor CRUD rinviato D-032).

- [ ] **Step 3: Scrivi l'handoff A3.1**

`docs/handoff/2026-06-30-bookings-a3-1-done.md`: cosa ha consegnato A3.1 (catalogo + engine + auto-pricing +
quote + FE), confini (create daily-only, listino seeded, no CRUD listino, no extra a prezzo, UmbrellaType
fuori pricing), conteggi test aggiornati, gotcha riconfermati (migrazione + `prisma generate`, porta 5433,
rebuild api Docker), **prossimo slice A3.2** (selettore Pacchetto + ricalcolo nel modale + colonna Pacchetto).

- [ ] **Step 4: Verifica DoD completa**

Run:
```bash
corepack pnpm -r build
corepack pnpm eslint .
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/api test
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm --filter @coralyn/api test:e2e
```
Expected: tutto verde. Conteggi attesi: ui-kit 14 (invariato) · web-staff ≥43 (+eventuale) · api unit ≥46
(+12 engine +1 projection) · api e2e ≥40 (+precedenza/quote/no-season, −1 prezzo-negativo rimosso).

- [ ] **Step 5: Verifica live (Docker) — raccomandata**

```bash
docker compose --profile full up -d --build api
```
Login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`); crea una giornaliera **senza prezzo** →
verifica `totalPrice` calcolato dal listino seed (28 mattina / 40 pomeriggio); `GET /bookings/quote` con
Bearer → prezzo atteso; data fuori stagione → 422. *(Rebuild dell'immagine api dopo il cambio BE, altrimenti
il FE prende 404 dall'immagine vecchia — gotcha noto.)*

- [ ] **Step 6: Commit + push**

```bash
git add README.md docs/
git commit -m "docs: pricing engine A3.1 implementato (ADR-0032, data-model, glossary, deferred D-032, handoff)"
git push -u origin feat/bookings-pricing
```

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §2 modello → Task 2; §3 engine/precedenza/no-match → Task 3 (+ADR-0032 Task 10);
  §4 CatalogService/stagione → Task 5; §5 endpoint (quote + auto-pricing) → Task 6; §6 contratti → Task 1
  (+proiezione Task 4); §7 seed/FE/test → Task 7/9/8; §8 DoD → Task 10; §9 casi limite (no-season, no-rate,
  precedenza, unit, isolamento) → Task 3+8; §10 decisioni → riflesse in ADR-0032/D-032 (Task 10).
- **Placeholder:** nessuno; ogni step ha codice/comando reale. Il `<ts>` nel path migrazione è il timestamp
  generato da Prisma (Step Task 2.3), non un TODO.
- **Coerenza tipi:** `PricingContext`/`RateRow`/`PriceResult` (engine) ↔ `QuoteContext`/`QuoteOutcome`
  (service) ↔ `QuoteBookingInput`/`BookingQuoteDTO`/`RateUnit`/`PackageDTO` (contracts) allineati. Service
  inietta `CatalogService`; `priceWithin(tx,…)` evita la transazione annidata dentro `create`. `CreateBookingInput`
  senza `totalPrice` coerente tra contracts, DTO, service, FE, MSW ed e2e. `Booking.packageId` (schema) ↔
  `BookingDTO.packageId` (proiezione/contratti). Index firma raw (`NULLS NOT DISTINCT`, PG16), non `@@unique`.
```
