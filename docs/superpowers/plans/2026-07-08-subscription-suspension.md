# Subscription Suspension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin temporarily suspend a subscription — carving a hole in its physical occupancy so the freed days can be resold — and later reactivate it, without touching the contract span (price/renewal/prelazione/seniority intact).

**Architecture:** Additive on the merged `BookingCoverage` foundation (ADR-0046). A new tenant-scoped child table `BookingSuspension` records suspension history; the occupancy hole is a **carve** of `BookingCoverage` intervals inside the transaction. Two modes unified by a nullable `endDate`: **closed** `[S, R-1]` (known return) and **open** `[S, …)` then **reactivate**. Server validates bounds only; the pro-rata refund is a FE suggestion (mirror of `terminate`). Refunds aggregate onto `Booking.refundedAmount`. Endpoints are admin-only, mirroring `POST /bookings/:id/terminate`.

**Tech Stack:** NestJS + Prisma (PostgreSQL, RLS FORCE) API; `@coralyn/contracts` shared TS types; Vue 3 + Pinia + TanStack-style resource wrappers + `@coralyn/ui-kit` web-staff FE; Jest (API unit/e2e), Vitest + MSW (FE).

## Global Constraints

- **Package manager:** pnpm via corepack only — **never `npm install`** (corrupts `node_modules`). Use `corepack pnpm …`. After any install/purge, re-run `corepack pnpm -C apps/api exec prisma generate` (a purge zeroes the Prisma client).
- **Contracts rebuild:** after editing `packages/contracts/src/index.ts`, run `corepack pnpm -C packages/contracts build` (emits `dist/`, gitignored) **before** API typecheck/e2e and **before** FE typecheck — consumers import from `dist`.
- **Migrations:** apply with `prisma migrate` to **both** the dev DB and the test DB — **never `db push`**.
- **New tenant table:** must have RLS `ENABLE` + `FORCE` + a `tenant_isolation` policy (USING + WITH CHECK) on `establishmentId`, exactly like `BookingCoverage`.
- **API e2e:** ts-jest type-checks the suite → run with `--runInBand`.
- **Routes:** live under the `/api` global prefix (set in bootstrap; supertest paths use `/api/...`).
- **Domain invariant:** suspension must **never** modify `Booking.startDate/endDate` — only `BookingCoverage` and `BookingSuspension`. Prelazione/renewal/pricing read the nominal span on `Booking` and must stay green.
- **Baseline (do not regress), `main` `133cfc7`:** api unit **209** · api e2e **249** (`--runInBand`) · web-staff **316** · ui-kit **111** · web-platform **16** · typecheck clean. New tests add on top.
- **Auth for refund/dates:** the pro-rata refund formula lives **only in the FE** (no server preview endpoint). The server validates `0 ≤ refund ≤ amountCollected − refundedAmount` and the date bounds; nothing else.
- **Environment date:** operational "today" is `todayInRome()` ≈ **2026-07-08**; e2e suspension dates use the 2026 season and pick `S ≥ 2026-07-08`.

## File Structure

**Created:**
- `apps/api/prisma/migrations/<ts>_booking_suspension/migration.sql` — table + FKs + indexes + RLS.
- `apps/api/src/bookings/dto/suspend-subscription.dto.ts` — suspend input validation.
- `apps/api/src/bookings/dto/reactivate-subscription.dto.ts` — reactivate input validation.
- `apps/web-staff/src/features/customers/suspensionRefund.ts` — FE pro-rata suggestion (pure).
- `apps/web-staff/src/features/customers/suspensionRefund.spec.ts` — unit test for the above.
- `apps/web-staff/src/features/customers/SuspendSubscriptionModal.vue` — suspend modal (closed/open toggle).
- `apps/web-staff/src/features/customers/SuspendSubscriptionModal.spec.ts` — modal spec.
- `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.vue` — reactivate modal.
- `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.spec.ts` — modal spec.

**Modified:**
- `packages/contracts/src/index.ts` — add `SuspensionDTO`, `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`, `CustomerBookingDTO.suspensions?`.
- `apps/api/prisma/schema.prisma` — `model BookingSuspension` + `Booking.suspensions` + `Establishment.bookingSuspensions`.
- `apps/api/src/bookings/customer-booking.projection.ts` — `toSuspensionDTO` + map `suspensions`.
- `apps/api/src/bookings/customer-booking.projection.spec.ts` — assert `suspensions` mapping.
- `apps/api/src/bookings/bookings.service.ts` — `suspend()` + `reactivate()`; add `suspensions` include in `listByCustomer`.
- `apps/api/src/bookings/bookings.controller.ts` — `@Post(':id/suspend')` + `@Post(':id/reactivate')`.
- `apps/api/test/bookings.e2e-spec.ts` — new `sospensione abbonamento (D-013)` describe block.
- `apps/web-staff/src/features/customers/useCustomers.ts` — `useSuspendSubscription` + `useReactivateSubscription`.
- `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue` — Sospendi/Riattiva buttons + suspension rows + emits.
- `apps/web-staff/src/features/customers/CustomerDetailView.vue` — wire the two modals.
- `apps/web-staff/src/mocks/server.ts` — `suspend`/`reactivate` handlers + a suspendable seed.

---

### Task 1: Contracts — suspension types

**Files:**
- Modify: `packages/contracts/src/index.ts` (after `TerminateSubscriptionInput`, ~line 226; and `CustomerBookingDTO`, ~line 233-262)

**Interfaces:**
- Produces: `SuspensionDTO`, `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`, and `CustomerBookingDTO.suspensions?: SuspensionDTO[]` — consumed by every later task.

- [ ] **Step 1: Add the interfaces**

In `packages/contracts/src/index.ts`, immediately after the existing `TerminateSubscriptionInput` interface, add:

```typescript
/** Una sospensione registrata su un abbonamento (D-013). endDate assente = aperta (in corso). */
export interface SuspensionDTO {
  id: string;
  startDate: string;            // ISO yyyy-mm-dd — S (primo giorno sospeso)
  endDate?: string;             // ISO yyyy-mm-dd — R-1 (ultimo giorno sospeso); assente = aperta
  refundedAmount: number;       // rimborso di QUESTA sospensione
  reason?: string;
  reactivatedAt?: string;       // ISO datetime; presente = aperta poi riattivata
}

/** Sospendi un abbonamento. endDate presente = chiusa [S, R-1]; assente = aperta [S, …). */
export interface SuspendSubscriptionInput {
  startDate: string;            // S (≥ oggi)
  endDate?: string;             // R-1 per la chiusa; assente = aperta
  refundAmount?: number;        // per la chiusa; assente/0 per l'aperta
  reason?: string;
}

/** Riattiva la sospensione aperta di un abbonamento. */
export interface ReactivateSubscriptionInput {
  returnDate: string;           // R (primo giorno di rientro)
  refundAmount: number;         // ≥ 0, ≤ amountCollected − refundedAmount
  reason?: string;
}
```

- [ ] **Step 2: Extend `CustomerBookingDTO`**

Inside the `CustomerBookingDTO` interface, right after the `terminationReason?: string;` line (the last D-013 disdetta field), add:

```typescript
  suspensions?: SuspensionDTO[];  // D-013 (additivo): sempre valorizzato dal server ([] se nessuna)
```

Leave `BookingDTO` **unchanged** (map/liste non mostrano le sospensioni).

- [ ] **Step 3: Build the contracts package**

Run: `corepack pnpm -C packages/contracts build`
Expected: `tsc -p tsconfig.json` completes with no errors; `packages/contracts/dist/index.d.ts` now contains `SuspensionDTO`.

- [ ] **Step 4: Verify the emitted types**

Run: `grep -c "SuspendSubscriptionInput" packages/contracts/dist/index.d.ts`
Expected: prints `1` or more (the type is emitted).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): suspension DTOs + inputs (D-013)"
```

---

### Task 2: Prisma schema + RLS migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Booking model ~171-210; Establishment ~10-31; add new model)
- Create: `apps/api/prisma/migrations/<ts>_booking_suspension/migration.sql`

**Interfaces:**
- Consumes: nothing from Task 1 at DB level.
- Produces: Prisma model `BookingSuspension` (client type `BookingSuspension`), `Booking.suspensions` relation — consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Add the `suspensions` relation to `Booking`**

In `apps/api/prisma/schema.prisma`, inside `model Booking`, in the relations block right after the existing `coverages BookingCoverage[]` line, add:

```prisma
  suspensions     BookingSuspension[]
```

- [ ] **Step 2: Add the inverse relation to `Establishment`**

In `model Establishment`, right after the existing `bookingCoverages BookingCoverage[]` line, add:

```prisma
  bookingSuspensions BookingSuspension[]
```

- [ ] **Step 3: Add the `BookingSuspension` model**

After the `BookingCoverage` model block, add:

```prisma
// Sospensione temporanea di un abbonamento (D-013, sotto-slice 3/3). Pura storia/accountability:
// l'anti-double-booking è garantito da BookingCoverage, non da qui. Due modalità unificate da endDate
// nullable (NULL = aperta/da riattivare). Additiva su ADR-0046: NON tocca lo span di contratto su Booking.
model BookingSuspension {
  id              String    @id @default(uuid()) @db.Uuid
  bookingId       String    @db.Uuid
  establishmentId String    @db.Uuid // RLS FORCE tenant-scoped
  startDate       DateTime  @db.Date // S — primo giorno sospeso
  endDate         DateTime? @db.Date // R-1 — ultimo giorno sospeso; NULL = aperta (da riattivare)
  refundedAmount  Decimal   @default(0) @db.Decimal(10, 2) // rimborso di QUESTA sospensione
  reason          String?
  reactivatedAt   DateTime? // valorizzato quando un'aperta viene chiusa via reactivate
  createdAt       DateTime  @default(now())

  booking       Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])

  @@index([bookingId])
  @@index([establishmentId])
}
```

- [ ] **Step 4: Scaffold the migration (create-only) so we can hand-add RLS**

Run: `corepack pnpm -C apps/api exec prisma migrate dev --create-only --name booking_suspension`
Expected: creates `apps/api/prisma/migrations/<timestamp>_booking_suspension/migration.sql` containing `CREATE TABLE "BookingSuspension"`, its FKs and indexes. It does **not** yet contain RLS (Prisma never generates RLS).

- [ ] **Step 5: Append the RLS stanza to the generated `migration.sql`**

Open the just-created `migration.sql`. After the generated `CREATE TABLE` / index / FK statements, append (mirror of the `BookingCoverage` RLS, verbatim policy expression):

```sql
-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingCoverage). Nessun backfill: tabella vuota.
ALTER TABLE "BookingSuspension" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingSuspension" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingSuspension"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

Do **not** add any EXCLUDE constraint or trigger — this table is pure history (no occupancy).

- [ ] **Step 6: Apply to the dev DB**

Run: `corepack pnpm -C apps/api exec prisma migrate dev`
Expected: applies the migration; ends with "Your database is now in sync with your schema." and regenerates the Prisma client (so `PrismaClient.bookingSuspension` exists).

- [ ] **Step 7: Apply to the test DB**

Apply the same migration to the e2e test database (the project's test-DB convention — the test DB URL is in `apps/api/.env.test` / the e2e env). Run:

`corepack pnpm -C apps/api exec dotenv -e .env.test -- prisma migrate deploy`

Expected: "All migrations have been successfully applied." If the repo uses a different test-DB migrate command, use that one — the requirement is that `bookings.e2e-spec.ts` runs against a DB that has `BookingSuspension`. Verify with:

`corepack pnpm -C apps/api exec dotenv -e .env.test -- prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 8: Verify the Prisma client typechecks with the new model**

Run: `corepack pnpm -C apps/api exec tsc --noEmit`
Expected: no errors (the client now exposes `bookingSuspension`; schema compiles).

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): BookingSuspension table + RLS (D-013)"
```

---

### Task 3: Projection — `toSuspensionDTO` + wire into the customer Scheda

**Files:**
- Modify: `apps/api/src/bookings/customer-booking.projection.ts`
- Modify: `apps/api/src/bookings/customer-booking.projection.spec.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts:61-119` (`listByCustomer`)

**Interfaces:**
- Consumes: `SuspensionDTO` (Task 1), Prisma `BookingSuspension` (Task 2).
- Produces: `toSuspensionDTO(s: BookingSuspension): SuspensionDTO`; `CustomerBookingEnrichment.suspensions?: SuspensionDTO[]`; `listByCustomer` now returns `suspensions` on each DTO.

- [ ] **Step 1: Write the failing projection test**

In `apps/api/src/bookings/customer-booking.projection.spec.ts`, add a test inside the `describe('toCustomerBookingDTO', …)` block:

```typescript
  it('mappa suspensions[] passate via enrichment (default [])', () => {
    expect(toCustomerBookingDTO(bookingRow(), { umbrellaLabel: 'A12' }).suspensions).toEqual([]);
    const dto = toCustomerBookingDTO(bookingRow(), {
      umbrellaLabel: 'A12',
      suspensions: [
        { id: 's1', startDate: '2026-07-20', endDate: '2026-07-26', refundedAmount: 50, reason: 'Viaggio' },
        { id: 's2', startDate: '2026-08-01', refundedAmount: 0 },
      ],
    });
    expect(dto.suspensions).toHaveLength(2);
    expect(dto.suspensions?.[1]).toMatchObject({ id: 's2', startDate: '2026-08-01', endDate: undefined });
  });
```

Also add a dedicated test for the row→DTO mapper at the bottom of the file (new `describe`):

```typescript
describe('toSuspensionDTO', () => {
  const row = (over: Partial<BookingSuspension> = {}): BookingSuspension =>
    ({
      id: 's1',
      bookingId: 'b1',
      establishmentId: 'e1',
      startDate: new Date('2026-07-20T00:00:00Z'),
      endDate: new Date('2026-07-26T00:00:00Z'),
      refundedAmount: { toString: () => '50' } as unknown as BookingSuspension['refundedAmount'],
      reason: 'Viaggio',
      reactivatedAt: null,
      createdAt: new Date('2026-07-10T09:00:00Z'),
      ...over,
    }) as BookingSuspension;

  it('chiusa: startDate/endDate ISO date, refund number, reason', () => {
    expect(toSuspensionDTO(row())).toEqual({
      id: 's1',
      startDate: '2026-07-20',
      endDate: '2026-07-26',
      refundedAmount: 50,
      reason: 'Viaggio',
      reactivatedAt: undefined,
    });
  });

  it('aperta: endDate assente, reason assente se null', () => {
    const dto = toSuspensionDTO(row({ endDate: null, reason: null }));
    expect(dto.endDate).toBeUndefined();
    expect(dto.reason).toBeUndefined();
  });

  it('riattivata: reactivatedAt ISO datetime', () => {
    const dto = toSuspensionDTO(row({ reactivatedAt: new Date('2026-07-26T08:30:00Z') }));
    expect(dto.reactivatedAt).toBe('2026-07-26T08:30:00.000Z');
  });
});
```

At the top of the spec, extend the type import: change `import type { Booking } from '@prisma/client';` to `import type { Booking, BookingSuspension } from '@prisma/client';`, and import the new function: add `toSuspensionDTO` to the existing import from `./customer-booking.projection`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm -C apps/api test customer-booking.projection`
Expected: FAIL — `toSuspensionDTO is not a function` and `dto.suspensions` is `undefined`.

- [ ] **Step 3: Implement `toSuspensionDTO` + enrichment field + mapping**

In `apps/api/src/bookings/customer-booking.projection.ts`:

Change the imports at the top to:

```typescript
import type { Booking, BookingSuspension } from '@prisma/client';
import type { CustomerBookingDTO, SuspensionDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';
```

Add `suspensions` to the enrichment interface (after `prelazione?: …`):

```typescript
  suspensions?: SuspensionDTO[];
```

In the `toCustomerBookingDTO` return object, right after `terminationReason: b.terminationReason ?? undefined,`, add:

```typescript
    suspensions: e.suspensions ?? [],
```

At the end of the file, add the row mapper:

```typescript
/** Proietta una riga BookingSuspension nel DTO della Scheda. endDate NULL = aperta (in corso). */
export function toSuspensionDTO(s: BookingSuspension): SuspensionDTO {
  return {
    id: s.id,
    startDate: formatDbDate(s.startDate),
    endDate: s.endDate ? formatDbDate(s.endDate) : undefined,
    refundedAmount: Number(s.refundedAmount),
    reason: s.reason ?? undefined,
    reactivatedAt: s.reactivatedAt ? s.reactivatedAt.toISOString() : undefined,
  };
}
```

- [ ] **Step 4: Run the projection tests to verify they pass**

Run: `corepack pnpm -C apps/api test customer-booking.projection`
Expected: PASS (all `toCustomerBookingDTO` + `toSuspensionDTO` tests green).

- [ ] **Step 5: Wire `suspensions` into `listByCustomer`**

In `apps/api/src/bookings/bookings.service.ts`, in `listByCustomer` (~line 61):

Add the import of the mapper — extend the existing line `import { toCustomerBookingDTO, resolveSeasonName } from './customer-booking.projection';` to:

```typescript
import { toCustomerBookingDTO, resolveSeasonName, toSuspensionDTO } from './customer-booking.projection';
```

In the `tx.booking.findMany({ … include: { … } })` call (~line 67-71), add `suspensions` to the include:

```typescript
        include: {
          umbrella: { include: { row: { include: { sector: true } } } },
          package: true,
          renewals: true,
          suspensions: { orderBy: { startDate: 'asc' } },
        },
```

In the final `bookings.map((b) => …)` (the `toCustomerBookingDTO(b, { … })` call, ~line 108), add to the enrichment object:

```typescript
          suspensions: b.suspensions.map(toSuspensionDTO),
```

- [ ] **Step 6: Typecheck the API**

Run: `corepack pnpm -C apps/api exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/bookings/customer-booking.projection.ts apps/api/src/bookings/customer-booking.projection.spec.ts apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): project suspensions[] onto CustomerBookingDTO (D-013)"
```

---

### Task 4: Suspend endpoint — closed mode (e2e-driven)

**Files:**
- Create: `apps/api/src/bookings/dto/suspend-subscription.dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts` (add `suspend()`; extend contracts type import)
- Modify: `apps/api/test/bookings.e2e-spec.ts` (new describe block)

**Interfaces:**
- Consumes: `SuspendSubscriptionInput` (Task 1), `BookingSuspension` model (Task 2).
- Produces: `BookingsService.suspend(id: string, input: SuspendSubscriptionInput): Promise<BookingDTO>`; `POST /api/bookings/:id/suspend` (admin-only). Consumed by Task 5 (shares the service file) and the FE.

This repo tests booking mutations through **e2e against real Postgres** (there is no `bookings.service.spec.ts`). The e2e is the failing test that drives the implementation.

- [ ] **Step 1: Write the failing e2e tests (closed mode)**

In `apps/api/test/bookings.e2e-spec.ts`, add a new describe block at the end (just before the final closing `});` of `describe('Bookings (e2e)', …)`). It reuses the existing `bearer`, `token1`/`token2`/`staffToken`, `ids`, and the `body(...)` helper (already defined in the file, used by the disdetta suite):

```typescript
  describe('sospensione abbonamento (D-013)', () => {
    let sSeq = 0;

    // Abbonamento full-season 2026-05-01 → 2026-09-30 su ombrellone dedicato (label unica).
    const makeSub = async (): Promise<{ id: string; umbrellaId: string }> => {
      const label = `S${(sSeq += 1)}`;
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: 60 } }),
      );
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u.id, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return { id: res.body.id as string, umbrellaId: u.id };
    };

    it('chiusa: 200, span di contratto invariato, buco liberato, coda riservata', async () => {
      const { id, umbrellaId } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);

      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 50, reason: 'Viaggio' }).expect(200);
      // lo span di contratto NON cambia (prelazione/rinnovo intatti)
      expect(res.body.startDate).toBe('2026-05-01');
      expect(res.body.endDate).toBe('2026-09-30');
      expect(res.body.refundedAmount).toBe(50);

      // buco [2026-07-20, 2026-07-26] libero: una daily nel buco passa (prima darebbe 409)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-22' })).expect(201);
      // coda [2026-07-27, …] ancora riservata all'abbonato: una daily lì dà 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-28' })).expect(409);
      // testa [.., 2026-07-19] ancora riservata: 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-15' })).expect(409);
    });

    it('rimborso aggregato su refundedAmount (disdetta-style netto)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 30 }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-01', endDate: '2026-08-05', refundAmount: 20 }).expect(200);
      expect(res.body.refundedAmount).toBe(50); // 30 + 20 aggregati
    });

    it('staff → 403 (admin-only)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(staffToken))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26' }).expect(403);
    });

    it('tenant altrui → 404', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token2))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26' }).expect(404);
    });

    it('inizio nel passato (< oggi) → 422', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-05-10', endDate: '2026-05-20' }).expect(422);
    });

    it('ritorno a fine stagione (R-1 = endDate) → 422 (usa la disdetta)', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-01', endDate: '2026-09-30' }).expect(422);
    });

    it('rimborso > residuo incassato → 422', async () => {
      const { id } = await makeSub(); // non pagato: amountCollected = 0
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 10 }).expect(422);
    });

    it('non-abbonamento (daily) → 422', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-20' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${res.body.id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-20', endDate: '2026-08-21' }).expect(422);
    });
  });
```

- [ ] **Step 2: Run the e2e block to verify it fails**

Run: `corepack pnpm -C apps/api test:e2e --runInBand -t "sospensione abbonamento"`
Expected: FAIL — `POST /api/bookings/:id/suspend` returns 404 (route not defined), so the 200-expecting tests fail.

- [ ] **Step 3: Create the suspend DTO**

Create `apps/api/src/bookings/dto/suspend-subscription.dto.ts`:

```typescript
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { SuspendSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input sospensione (D-013). Gli invarianti di dominio (S ≥ oggi, ritorno entro stagione,
 *  copertura, refund ≤ residuo) sono nel service: qui solo shape/bound sintattici. */
export class SuspendSubscriptionDto implements SuspendSubscriptionInput {
  @IsCalendarDate()
  startDate!: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/bookings/bookings.controller.ts`, add the import (next to the other DTO imports):

```typescript
import { SuspendSubscriptionDto } from './dto/suspend-subscription.dto';
```

Add the handler after the `terminate` handler:

```typescript
  @Post(':id/suspend')
  @HttpCode(200)
  @Roles(Role.Admin)
  suspend(@Param('id') id: string, @Body() body: SuspendSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.suspend(id, body);
  }
```

- [ ] **Step 5: Implement `suspend()` in the service**

In `apps/api/src/bookings/bookings.service.ts`, extend the contracts type import list to include the new inputs (add to the existing `import type { … } from '@coralyn/contracts';`):

```typescript
  SuspendSubscriptionInput,
  ReactivateSubscriptionInput,
```

Add the method right after `terminate()` (before the final class-closing `}`):

```typescript
  /**
   * Sospensione temporanea di un abbonamento (D-013). Scava un buco nell'occupazione (BookingCoverage)
   * SENZA toccare lo span di contratto (Booking.startDate/endDate): un sospeso conserva prezzo, rinnovo,
   * prelazione e seniority. Chiusa [S, R-1] (ritorno noto) o aperta [S, …) (poi reactivate). admin-only.
   */
  async suspend(id: string, input: SuspendSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = 24 * 60 * 60 * 1000;
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id }, include: { suspensions: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      // Una sola sospensione aperta per abbonamento: non si impila una nuova mentre una è in corso.
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_EXISTS' as const };

      const today = toDbDate(todayInRome());
      const S = toDbDate(input.startDate);
      if (S < today || S > existing.endDate) return { error: 'BAD_START' as const }; // S ≥ oggi e dentro lo span

      const closed = input.endDate != null;
      const collected = Number(existing.amountCollected);
      const residual = collected - Number(existing.refundedAmount);
      const refund = closed ? (input.refundAmount ?? 0) : 0; // l'aperta rimborsa alla reactivate
      if (!(refund >= 0 && refund <= residual)) return { error: 'BAD_REFUND' as const };

      const coverages = await tx.bookingCoverage.findMany({ where: { bookingId: id, status: 'confirmed' } });

      if (closed) {
        const Rminus1 = toDbDate(input.endDate!);
        if (Rminus1 < S) return { error: 'BAD_RANGE' as const }; // S ≤ R-1
        if (!(Rminus1 < existing.endDate)) return { error: 'RETURN_OUT' as const }; // ritorno ENTRO la stagione
        const C = coverages.find((c) => c.startDate <= S && Rminus1 <= c.endDate);
        if (!C) return { error: 'NO_COVERAGE' as const }; // buco a cavallo o già libero
        await tx.bookingCoverage.delete({ where: { id: C.id } });
        if (S > C.startDate) {
          await tx.bookingCoverage.create({
            data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
              startDate: C.startDate, endDate: new Date(S.getTime() - day), status: 'confirmed' },
          });
        }
        // coda [R, C.end] sempre non vuota (Rminus1 < endDate = C.end ⇒ R ≤ C.end)
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
            startDate: new Date(Rminus1.getTime() + day), endDate: C.endDate, status: 'confirmed' },
        });
        await tx.bookingSuspension.create({
          data: { bookingId: id, establishmentId: tenantId, startDate: S, endDate: Rminus1,
            refundedAmount: refund, reason: input.reason ?? null },
        });
      } else {
        const C = coverages.find((c) => c.startDate <= S && S <= c.endDate);
        if (!C) return { error: 'NO_COVERAGE' as const };
        // Tronca da S in poi: elimina i frammenti interamente ≥ S (inclusa C se S = C.start)…
        await tx.bookingCoverage.deleteMany({ where: { bookingId: id, startDate: { gte: S } } });
        // …e, se C inizia prima di S (non colpita sopra), sostituiscila con la sola testa [C.start, S-1].
        if (S > C.startDate) {
          await tx.bookingCoverage.delete({ where: { id: C.id } });
          await tx.bookingCoverage.create({
            data: { bookingId: id, establishmentId: tenantId, umbrellaId: C.umbrellaId,
              startDate: C.startDate, endDate: new Date(S.getTime() - day), status: 'confirmed' },
          });
        }
        await tx.bookingSuspension.create({
          data: { bookingId: id, establishmentId: tenantId, startDate: S, endDate: null,
            refundedAmount: 0, reason: input.reason ?? null },
        });
      }

      const row = refund > 0
        ? await tx.booking.update({ where: { id }, data: { refundedAmount: { increment: refund } } })
        : existing;
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti possono essere sospesi');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto: non sospendibile');
      if (e === 'OPEN_EXISTS') throw new ConflictException('Esiste già una sospensione aperta');
      if (e === 'BAD_START') throw new UnprocessableEntityException('Data di inizio sospensione non valida');
      if (e === 'BAD_RANGE') throw new UnprocessableEntityException('Intervallo di sospensione non valido');
      if (e === 'RETURN_OUT') throw new UnprocessableEntityException('Il ritorno cade a fine stagione: usa la disdetta');
      if (e === 'NO_COVERAGE') throw new UnprocessableEntityException('Periodo non coperto (o già libero)');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }
```

- [ ] **Step 6: Rebuild contracts (the service imports the new input types) and run the e2e block**

Run: `corepack pnpm -C packages/contracts build && corepack pnpm -C apps/api test:e2e --runInBand -t "sospensione abbonamento"`
Expected: PASS — all closed-mode suspension e2e tests green.

- [ ] **Step 7: Run the full API e2e to confirm no regression**

Run: `corepack pnpm -C apps/api test:e2e --runInBand`
Expected: PASS — previous 249 + the new closed-mode tests, all green.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bookings/dto/suspend-subscription.dto.ts apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.service.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "feat(api): POST /bookings/:id/suspend closed mode + carve (D-013)"
```

---

### Task 5: Open-mode suspend + reactivate endpoint (e2e-driven)

**Files:**
- Create: `apps/api/src/bookings/dto/reactivate-subscription.dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts` (add `reactivate()`)
- Modify: `apps/api/test/bookings.e2e-spec.ts` (extend the describe block)

**Interfaces:**
- Consumes: `ReactivateSubscriptionInput` (Task 1), `suspend()` open branch (Task 4 — already implemented), `slotsOverlap`/`dateRangesOverlap`/`isBookingOverlapExclusion` (already imported in the service).
- Produces: `BookingsService.reactivate(id, input): Promise<BookingDTO>`; `POST /api/bookings/:id/reactivate` (admin-only).

- [ ] **Step 1: Write the failing e2e tests (open + reactivate)**

In `apps/api/test/bookings.e2e-spec.ts`, inside the same `sospensione abbonamento (D-013)` describe block, add:

```typescript
    it('aperta poi reactivate: buco [S, R-1], coda [R, end] ricoperta', async () => {
      const { id, umbrellaId } = await makeSub();
      // apertura: nessun endDate → coda da S libera a tempo indeterminato
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20', reason: 'Rientro incerto' }).expect(200);
      // durante l'apertura una daily dopo S passa (posto libero)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-08-15' })).expect(201);

      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(200);
      expect(res.body.endDate).toBe('2026-09-30'); // span invariato

      // dopo il rientro, coda [2026-09-01, …] riservata: una daily lì dà 409
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-09-05' })).expect(409);
      // il buco [2026-07-20, 2026-08-31] resta libero
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-20' })).expect(201);
    });

    it('reactivate in conflitto con walk-in nella coda → 409', async () => {
      const { id, umbrellaId } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      // walk-in venduto nella futura coda di rientro
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-09-05' })).expect(201);
      // reactivate a R=2026-09-01 richiederebbe [2026-09-01, 2026-09-30], che contiene il walk-in → 409
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(409);
    });

    it('una sola sospensione aperta: seconda apertura → 409', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-08-10' }).expect(409);
    });

    it('reactivate senza sospensione aperta → 409', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-09-01', refundAmount: 0 }).expect(409);
    });

    it('reactivate con R fuori (≤ S o > endDate) → 422', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-07-20', refundAmount: 0 }).expect(422); // R = S
    });

    it('reactivate: rimborso sui giorni reali aggregato su refundedAmount', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).patch(`/api/bookings/${id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 800, paymentMethod: 'cash' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      const res = await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(token1))
        .send({ returnDate: '2026-08-01', refundAmount: 40 }).expect(200);
      expect(res.body.refundedAmount).toBe(40);
    });

    it('reactivate: staff → 403', async () => {
      const { id } = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${id}/suspend`).set(...bearer(token1))
        .send({ startDate: '2026-07-20' }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${id}/reactivate`).set(...bearer(staffToken))
        .send({ returnDate: '2026-08-01', refundAmount: 0 }).expect(403);
    });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `corepack pnpm -C apps/api test:e2e --runInBand -t "reactivate"`
Expected: FAIL — `POST /api/bookings/:id/reactivate` returns 404 (route not defined).

- [ ] **Step 3: Create the reactivate DTO**

Create `apps/api/src/bookings/dto/reactivate-subscription.dto.ts`:

```typescript
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ReactivateSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input riattivazione (D-013). Gli invarianti (aperta esistente, S < R ≤ endDate,
 *  coda libera, refund ≤ residuo) sono nel service. */
export class ReactivateSubscriptionDto implements ReactivateSubscriptionInput {
  @IsCalendarDate()
  returnDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/bookings/bookings.controller.ts`, add the import:

```typescript
import { ReactivateSubscriptionDto } from './dto/reactivate-subscription.dto';
```

Add the handler after `suspend`:

```typescript
  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles(Role.Admin)
  reactivate(@Param('id') id: string, @Body() body: ReactivateSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.reactivate(id, body);
  }
```

- [ ] **Step 5: Implement `reactivate()` in the service**

In `apps/api/src/bookings/bookings.service.ts`, add after `suspend()`:

```typescript
  /**
   * Riattiva la sospensione APERTA di un abbonamento (D-013). Fissa R, chiude la sospensione a R-1,
   * ricopre [R, endDate] e registra il rimborso sui giorni realmente sospesi. Se la coda contiene
   * walk-in venduti durante l'apertura → 409 (anti-double-booking, mirror priceAndWrite). admin-only.
   */
  async reactivate(id: string, input: ReactivateSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = 24 * 60 * 60 * 1000;
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({
        where: { id },
        include: { timeSlot: true, suspensions: true },
      });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      const open = existing.suspensions.find((s) => s.endDate === null);
      if (!open) return { error: 'NO_OPEN' as const };

      const R = toDbDate(input.returnDate);
      if (!(R > open.startDate && R <= existing.endDate)) return { error: 'BAD_DATE' as const }; // S < R ≤ endDate

      const residual = Number(existing.amountCollected) - Number(existing.refundedAmount);
      if (!(input.refundAmount >= 0 && input.refundAmount <= residual)) return { error: 'BAD_REFUND' as const };

      // Pre-check anti-overlap su [R, endDate] contro le coperture di ALTRE prenotazioni sullo stesso
      // ombrellone+fascia (mirror priceAndWrite; esclude la PROPRIA via bookingId).
      const others = await tx.bookingCoverage.findMany({
        where: { umbrellaId: existing.umbrellaId, status: 'confirmed', bookingId: { not: id } },
        include: { booking: { include: { timeSlot: true } } },
      });
      const conflict = others.some(
        (c) => dateRangesOverlap(c.startDate, c.endDate, R, existing.endDate) && slotsOverlap(c.booking.timeSlot, existing.timeSlot),
      );
      if (conflict) return { error: 'CONFLICT' as const };

      // Ricopre [R, endDate]. Il constraint coverage_no_overlap resta backstop di sola race.
      try {
        await tx.bookingCoverage.create({
          data: { bookingId: id, establishmentId: tenantId, umbrellaId: existing.umbrellaId,
            startDate: R, endDate: existing.endDate, status: 'confirmed' },
        });
      } catch (e) {
        if (isBookingOverlapExclusion(e)) throw new ConflictException('Il posto è occupato nel periodo di ritorno');
        throw e;
      }

      await tx.bookingSuspension.update({
        where: { id: open.id },
        data: {
          endDate: new Date(R.getTime() - day), // R-1 = ultimo giorno sospeso
          refundedAmount: input.refundAmount,
          reactivatedAt: new Date(),
          reason: input.reason ?? open.reason,
        },
      });

      const row = input.refundAmount > 0
        ? await tx.booking.update({ where: { id }, data: { refundedAmount: { increment: input.refundAmount } } })
        : existing;
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti hanno sospensioni');
      if (e === 'NO_OPEN') throw new ConflictException('Nessuna sospensione aperta da riattivare');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di ritorno non valida');
      if (e === 'CONFLICT') throw new ConflictException('Il posto è occupato nel periodo di ritorno');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }
```

- [ ] **Step 6: Run the reactivate e2e block to verify it passes**

Run: `corepack pnpm -C apps/api test:e2e --runInBand -t "sospensione abbonamento"`
Expected: PASS — closed + open + reactivate + conflict + invariants all green.

- [ ] **Step 7: Run the full API suite (unit + e2e) to confirm no regression**

Run: `corepack pnpm -C apps/api test && corepack pnpm -C apps/api test:e2e --runInBand`
Expected: PASS — unit ≥ 209 (+ the projection tests), e2e ≥ 249 (+ suspension tests), all green; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bookings/dto/reactivate-subscription.dto.ts apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.service.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "feat(api): open-mode suspend + POST /bookings/:id/reactivate (D-013)"
```

---

### Task 6: FE — pro-rata suspension refund (pure helper)

**Files:**
- Create: `apps/web-staff/src/features/customers/suspensionRefund.ts`
- Create: `apps/web-staff/src/features/customers/suspensionRefund.spec.ts`

**Interfaces:**
- Consumes: `CustomerBookingDTO` (Task 1).
- Produces: `suggestedSuspensionRefund(b, startDate, returnDate): number` — consumed by both modals (Tasks 8, 9).

- [ ] **Step 1: Write the failing test**

Create `apps/web-staff/src/features/customers/suspensionRefund.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { suggestedSuspensionRefund } from './suspensionRefund';

const sub = (over: Partial<CustomerBookingDTO> = {}): CustomerBookingDTO => ({
  id: 's1', umbrellaId: 'u1', timeSlotId: 't1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12', ...over,
});

describe('suggestedSuspensionRefund', () => {
  it('pro-rata sui giorni sospesi (R − S) / giorni pianificati', () => {
    // pianificati = 153 (2026-05-01..2026-09-30 incl.); sospesi = 7 (2026-07-20..2026-07-26) = R−S con R=07-27
    expect(suggestedSuspensionRefund(sub(), '2026-07-20', '2026-07-27')).toBeCloseTo(36.6, 1);
  });

  it('clampa al residuo incassato (amountCollected − refundedAmount)', () => {
    const r = suggestedSuspensionRefund(sub({ amountCollected: 20, refundedAmount: 5 }), '2026-05-01', '2026-09-30');
    expect(r).toBe(15); // residuo 15, il pro-rata pieno è ben oltre
  });

  it('ritorno ≤ inizio → 0', () => {
    expect(suggestedSuspensionRefund(sub(), '2026-07-20', '2026-07-20')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm -C apps/web-staff test suspensionRefund`
Expected: FAIL — cannot resolve `./suspensionRefund`.

- [ ] **Step 3: Implement the helper**

Create `apps/web-staff/src/features/customers/suspensionRefund.ts`:

```typescript
import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO per una sospensione (D-013). suspendedDays = R − S = |[S, R-1]|.
 * suggested = totalPrice × suspendedDays / plannedDays, clampato al residuo incassato
 * (amountCollected − refundedAmount). NON autoritativo: l'operatore sovrascrive; il server valida i bound.
 */
export function suggestedSuspensionRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected' | 'refundedAmount'>,
  startDate: string,
  returnDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const suspendedDays = dayDiff(startDate, returnDate); // R − S
  if (suspendedDays <= 0) return 0;
  const raw = round2(b.totalPrice * clamp(suspendedDays / plannedDays, 0, 1));
  const residual = b.amountCollected - (b.refundedAmount ?? 0);
  return clamp(raw, 0, Math.max(residual, 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm -C apps/web-staff test suspensionRefund`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/suspensionRefund.ts apps/web-staff/src/features/customers/suspensionRefund.spec.ts
git commit -m "feat(web-staff): suggested suspension refund (pure, D-013)"
```

---

### Task 7: FE — mutation hooks + MSW handlers + seed

**Files:**
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`
- Modify: `apps/web-staff/src/mocks/server.ts`
- Modify: `apps/web-staff/src/features/customers/useCustomers.spec.ts`

**Interfaces:**
- Consumes: `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`, `BookingDTO` (Task 1).
- Produces: `useSuspendSubscription(customerId)`, `useReactivateSubscription(customerId)` — consumed by the modals (Tasks 8, 9); MSW default handlers for `suspend`/`reactivate` + a suspendable seed for FE integration.

- [ ] **Step 1: Write the failing hook test**

In `apps/web-staff/src/features/customers/useCustomers.spec.ts`, add (mirroring the existing `useTerminateSubscription` test in that file — reuse its imports/harness):

```typescript
  it('useSuspendSubscription POSTa /bookings/:id/suspend e invalida la Scheda', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/suspend', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const hook = withSetup(() => useSuspendSubscription('c-1'));
    await hook.mutateAsync({ id: 'b1', input: { startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 5 } });
    expect(captured).toMatchObject({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 5 });
  });

  it('useReactivateSubscription POSTa /bookings/:id/reactivate', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/reactivate', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const hook = withSetup(() => useReactivateSubscription('c-1'));
    await hook.mutateAsync({ id: 'b1', input: { returnDate: '2026-08-01', refundAmount: 0 } });
    expect(captured).toMatchObject({ returnDate: '2026-08-01', refundAmount: 0 });
  });
```

> If `useCustomers.spec.ts` uses a helper other than `withSetup`/`server` for the existing terminate hook test, mirror that exact harness instead — copy the pattern already present in the file for `useTerminateSubscription`. Add `useSuspendSubscription, useReactivateSubscription` to the import from `./useCustomers`.

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm -C apps/web-staff test useCustomers`
Expected: FAIL — `useSuspendSubscription` is not exported.

- [ ] **Step 3: Add the hooks**

In `apps/web-staff/src/features/customers/useCustomers.ts`, extend the contracts import to include the two new inputs (add to the existing `import type { … } from '@coralyn/contracts';`): `SuspendSubscriptionInput`, `ReactivateSubscriptionInput`.

Add, next to `useTerminateSubscription`:

```typescript
/** Sospensione temporanea (D-013, admin-only). Invalida la Scheda cliente. Errore inline nel modale. */
export function useSuspendSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SuspendSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/suspend`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Riattivazione di una sospensione aperta (D-013, admin-only). Invalida la Scheda cliente. */
export function useReactivateSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: ReactivateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/reactivate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}
```

- [ ] **Step 4: Add default MSW handlers + a suspendable seed**

In `apps/web-staff/src/mocks/server.ts`, add default handlers after the existing `POST /api/bookings/:id/terminate` handler (mutate the in-memory `customerBookings` so integration flows refetch a changed state):

```typescript
  http.post('/api/bookings/:id/suspend', async ({ params, request }) => {
    const input = (await request.json()) as { startDate: string; endDate?: string; refundAmount?: number; reason?: string };
    for (const list of Object.values(customerBookings)) {
      const b = list.find((x) => x.id === params.id);
      if (b) {
        b.suspensions = [...(b.suspensions ?? []), { id: `sus-${(b.suspensions?.length ?? 0) + 1}`, startDate: input.startDate, endDate: input.endDate, refundedAmount: input.refundAmount ?? 0, reason: input.reason }];
        if (input.refundAmount) b.refundedAmount = (b.refundedAmount ?? 0) + input.refundAmount;
        return HttpResponse.json({ ...b });
      }
    }
    return new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/bookings/:id/reactivate', async ({ params, request }) => {
    const input = (await request.json()) as { returnDate: string; refundAmount: number; reason?: string };
    for (const list of Object.values(customerBookings)) {
      const b = list.find((x) => x.id === params.id);
      const open = b?.suspensions?.find((s) => !s.endDate);
      if (b && open) {
        open.endDate = input.returnDate; // mock: mostra concluso (semplificazione R-1 non necessaria in UI)
        open.reactivatedAt = `${input.returnDate}T08:00:00.000Z`;
        open.refundedAmount = input.refundAmount;
        b.refundedAmount = (b.refundedAmount ?? 0) + input.refundAmount;
        return HttpResponse.json({ ...b });
      }
    }
    return new HttpResponse(null, { status: 409 });
  }),
```

In `INITIAL_CUSTOMER_BOOKINGS['c-1']`, add `suspensions: []` to `cb-1` (the future 2027 subscription — suspendable) so the card can render its Sospendi button and, when acted on, the suspension rows. (Leave other entries as-is; `suspensions` is optional.)

- [ ] **Step 5: Run the hook tests + full web-staff suite**

Run: `corepack pnpm -C apps/web-staff test`
Expected: PASS — new hook tests green; previous 316 not regressed.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/useCustomers.ts apps/web-staff/src/features/customers/useCustomers.spec.ts apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): suspend/reactivate hooks + mocks (D-013)"
```

---

### Task 8: FE — `SuspendSubscriptionModal.vue` (closed/open toggle)

**Files:**
- Create: `apps/web-staff/src/features/customers/SuspendSubscriptionModal.vue`
- Create: `apps/web-staff/src/features/customers/SuspendSubscriptionModal.spec.ts`

**Interfaces:**
- Consumes: `useSuspendSubscription` (Task 7), `suggestedSuspensionRefund` (Task 6), `SegmentedControl`/`Modal`/`Field`/`Button` from `@coralyn/ui-kit`.
- Produces: `SuspendSubscriptionModal` with `v-model:open` + props `{ booking: CustomerBookingDTO | null; customerId: string }` — wired in Task 10.

- [ ] **Step 1: Write the failing spec**

Create `apps/web-staff/src/features/customers/SuspendSubscriptionModal.spec.ts` (mirror `TerminateSubscriptionModal.spec.ts` harness — portaled modal via `document.querySelector`):

```typescript
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import SuspendSubscriptionModal from './SuspendSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const w = mountApp(SuspendSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-07-20';
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('SuspendSubscriptionModal', () => {
  it('chiusa (default): invia startDate, endDate, refundAmount', async () => {
    let captured: unknown = null;
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    (document.querySelector('input[data-testid="suspend-return"]') as HTMLInputElement).value = '2026-07-27';
    (document.querySelector('input[data-testid="suspend-return"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="suspend-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured).toMatchObject({ startDate: '2026-07-20', endDate: '2026-07-27' });
    expect((captured as { refundAmount?: number }).refundAmount).toBeGreaterThan(0);
    w.unmount();
  });

  it('aperta: nessun endDate né refundAmount nel payload', async () => {
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    // passa a modalità aperta
    (document.querySelector('[data-testid="suspend-mode-open"]') as HTMLButtonElement).click();
    await tick();
    (document.querySelector('[data-testid="suspend-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured.startDate).toBe('2026-07-20');
    expect(captured.endDate).toBeUndefined();
    expect(captured.refundAmount).toBeUndefined();
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm -C apps/web-staff test SuspendSubscriptionModal`
Expected: FAIL — cannot resolve `./SuspendSubscriptionModal.vue`.

- [ ] **Step 3: Implement the modal**

Create `apps/web-staff/src/features/customers/SuspendSubscriptionModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, SegmentedControl, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedSuspensionRefund } from './suspensionRefund';
import { useSuspendSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const suspend = useSuspendSubscription(props.customerId);

const mode = ref<'closed' | 'open'>('closed');
const startDate = ref('');
const returnDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minStart = computed(() => {
  const t = todayIso();
  const s = props.booking?.startDate ?? t;
  return s > t ? s : t; // max(oggi, inizio abbonamento)
});
const maxDate = computed(() => props.booking?.endDate ?? '');
const minReturn = computed(() => (startDate.value ? addDays(startDate.value, 1) : minStart.value));
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() =>
  props.booking && returnDate.value ? suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value) : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    mode.value = 'closed';
    startDate.value = clampDate(session.activeDate || todayIso(), minStart.value, maxDate.value);
    returnDate.value = clampDate(addDays(startDate.value, 7), minReturn.value, maxDate.value);
    refundAmount.value = suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value);
    reason.value = '';
    error.value = '';
  }
});

// mantiene ritorno e rimborso coerenti quando cambiano inizio/ritorno
watch([startDate, returnDate], () => {
  if (!props.booking) return;
  if (returnDate.value && returnDate.value < minReturn.value) returnDate.value = minReturn.value;
  refundAmount.value = suggestedSuspensionRefund(props.booking, startDate.value, returnDate.value);
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    const input =
      mode.value === 'closed'
        ? { startDate: startDate.value, endDate: returnDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined }
        : { startDate: startDate.value, reason: reason.value || undefined };
    await suspend.mutateAsync({ id: props.booking.id, input });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Esiste già una sospensione aperta.' : status === 422 ? 'Dati non validi.' : 'Errore durante la sospensione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Sospendi abbonamento" eyebrow="Sospensione">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <SegmentedControl
        v-model="mode"
        :options="[{ value: 'closed', label: 'Ritorno noto' }, { value: 'open', label: 'Ritorno ignoto' }]"
      />

      <Field label="Data inizio sospensione">
        <input v-model="startDate" data-testid="suspend-start" type="date" :min="minStart" :max="maxDate" :class="inputClass" />
      </Field>

      <template v-if="mode === 'closed'">
        <Field label="Data ritorno">
          <input v-model="returnDate" data-testid="suspend-return" type="date" :min="minReturn" :max="maxDate" :class="inputClass" />
        </Field>
        <Field label="Rimborso (€)">
          <input v-model.number="refundAmount" data-testid="suspend-refund" type="number" min="0" step="0.01" :class="inputClass" />
        </Field>
        <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
          <span>Suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
          <Button type="button" variant="ghost" @click="refundAmount = suggested">Usa suggerito</Button>
        </div>
      </template>
      <p v-else class="text-[12.5px] text-[var(--color-text-2nd)]">
        Il posto resta libero da data inizio a tempo indeterminato. Il rimborso si calcola alla riattivazione.
      </p>

      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="suspend-confirm" variant="primary" :disabled="submitting" @click="confirm">Sospendi</Button>
      </div>
    </div>
  </Modal>
</template>
```

> The `SegmentedControl` renders `<button role="radio">` per option. If the spec needs stable selectors for the mode buttons, they are addressable by text; the spec's `[data-testid="suspend-mode-open"]` selector requires adding `:data-testid` — since `SegmentedControl` doesn't forward testids, change the spec to click by role/text instead: `Array.from(document.querySelectorAll('[role="radio"]')).find(el => el.textContent?.includes('Ritorno ignoto'))`. Update the spec's open-mode click accordingly in Step 1 before implementing, or (simpler) keep the spec and click the second `[role="radio"]`: `(document.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).click()`.

- [ ] **Step 4: Reconcile the spec selector and run**

Adjust the open-mode click in the spec to `(document.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).click();` (the `SegmentedControl` exposes `role="radio"` buttons, not testids). Then run:

Run: `corepack pnpm -C apps/web-staff test SuspendSubscriptionModal`
Expected: PASS — closed payload carries `endDate`+`refundAmount`; open payload omits both.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/SuspendSubscriptionModal.vue apps/web-staff/src/features/customers/SuspendSubscriptionModal.spec.ts
git commit -m "feat(web-staff): SuspendSubscriptionModal closed/open (D-013)"
```

---

### Task 9: FE — `ReactivateSubscriptionModal.vue`

**Files:**
- Create: `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.vue`
- Create: `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.spec.ts`

**Interfaces:**
- Consumes: `useReactivateSubscription` (Task 7), `suggestedSuspensionRefund` (Task 6).
- Produces: `ReactivateSubscriptionModal` with `v-model:open` + props `{ booking; suspension: SuspensionDTO | null; customerId }` — wired in Task 10.

- [ ] **Step 1: Write the failing spec**

Create `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO, type SuspensionDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import ReactivateSubscriptionModal from './ReactivateSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const openSus: SuspensionDTO = { id: 'sus-1', startDate: '2026-07-20', refundedAmount: 0 };
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const w = mountApp(ReactivateSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, suspension: openSus, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-08-01';
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('ReactivateSubscriptionModal', () => {
  it('invia returnDate e refundAmount (suggerito sui giorni reali)', async () => {
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/reactivate', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    (document.querySelector('[data-testid="reactivate-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured.returnDate).toBe('2026-08-01');
    expect(typeof captured.refundAmount).toBe('number');
    w.unmount();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm -C apps/web-staff test ReactivateSubscriptionModal`
Expected: FAIL — cannot resolve component.

- [ ] **Step 3: Implement the modal**

Create `apps/web-staff/src/features/customers/ReactivateSubscriptionModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO, SuspensionDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedSuspensionRefund } from './suspensionRefund';
import { useReactivateSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; suspension: SuspensionDTO | null; customerId: string }>();

const session = useSessionStore();
const reactivate = useReactivateSubscription(props.customerId);

const returnDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minReturn = computed(() => (props.suspension ? addDays(props.suspension.startDate, 1) : ''));
const maxReturn = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() =>
  props.booking && props.suspension && returnDate.value
    ? suggestedSuspensionRefund(props.booking, props.suspension.startDate, returnDate.value)
    : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking && props.suspension) {
    returnDate.value = clampDate(session.activeDate || todayIso(), minReturn.value, maxReturn.value);
    refundAmount.value = suggested.value;
    reason.value = '';
    error.value = '';
  }
});

watch(returnDate, () => {
  refundAmount.value = suggested.value;
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    await reactivate.mutateAsync({
      id: props.booking.id,
      input: { returnDate: returnDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Il posto è occupato nel periodo di ritorno.' : status === 422 ? 'Data non valida.' : 'Errore durante la riattivazione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Riattiva abbonamento" eyebrow="Riattivazione">
    <div v-if="booking && suspension" class="flex flex-col gap-[18px]">
      <Field label="Data ritorno">
        <input v-model="returnDate" data-testid="reactivate-return" type="date" :min="minReturn" :max="maxReturn" :class="inputClass" />
      </Field>
      <Field label="Rimborso (€)">
        <input v-model.number="refundAmount" data-testid="reactivate-refund" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
        <span>Suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
        <Button type="button" variant="ghost" @click="refundAmount = suggested">Usa suggerito</Button>
      </div>
      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>
      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="reactivate-confirm" variant="primary" :disabled="submitting" @click="confirm">Riattiva</Button>
      </div>
    </div>
  </Modal>
</template>
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm -C apps/web-staff test ReactivateSubscriptionModal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/ReactivateSubscriptionModal.vue apps/web-staff/src/features/customers/ReactivateSubscriptionModal.spec.ts
git commit -m "feat(web-staff): ReactivateSubscriptionModal (D-013)"
```

---

### Task 10: FE — card buttons/rows/emits + parent wiring

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`

**Interfaces:**
- Consumes: `CustomerBookingDTO.suspensions` (Task 1), the two modals (Tasks 8, 9).
- Produces: card emits `suspend: [CustomerBookingDTO]` and `reactivate: [{ booking: CustomerBookingDTO; suspension: SuspensionDTO }]`; parent opens the modals.

- [ ] **Step 1: Write the failing card spec**

In `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts`, add:

```typescript
  const openSuspendedSub: CustomerBookingDTO = {
    ...activeSub, id: 'sub-3',
    suspensions: [{ id: 'sus-1', startDate: '2026-07-20', refundedAmount: 0 }],
  };
  const historySub: CustomerBookingDTO = {
    ...activeSub, id: 'sub-4',
    suspensions: [{ id: 'sus-2', startDate: '2026-06-03', endDate: '2026-06-10', refundedAmount: 84, reason: 'Viaggio' }],
  };

  it('admin + abbonamento attivo senza sospensione aperta → mostra «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).toContain('Sospendi');
  });

  it('non-admin → nessun «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: false } });
    expect(w.text()).not.toContain('Sospendi');
  });

  it('sospensione aperta → riga «in corso» + «Riattiva», niente «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [openSuspendedSub], isAdmin: true } });
    expect(w.text()).toContain('in corso');
    expect(w.text()).toContain('Riattiva');
    expect(w.text()).not.toContain('Sospendi');
  });

  it('sospensione conclusa → riga storica con rimborso', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [historySub], isAdmin: true } });
    expect(w.text()).toContain('Sospeso');
    expect(w.text()).toContain('84');
  });

  it('emette «suspend» col booking al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    await w.find('[data-testid="suspend-sub-1"]').trigger('click');
    expect(w.emitted('suspend')?.[0]?.[0]).toMatchObject({ id: 'sub-1' });
  });

  it('emette «reactivate» con booking+suspension al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [openSuspendedSub], isAdmin: true } });
    await w.find('[data-testid="reactivate-sub-3"]').trigger('click');
    expect(w.emitted('reactivate')?.[0]?.[0]).toMatchObject({ booking: { id: 'sub-3' }, suspension: { id: 'sus-1' } });
  });
```

(`activeSub` already exists in the file with `id: 'sub-1'`.)

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm -C apps/web-staff test CustomerSubscriptionsCard`
Expected: FAIL — no Sospendi/Riattiva rendered, no `suspend`/`reactivate` emits.

- [ ] **Step 3: Update the card**

In `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`:

Extend the script — add `SuspensionDTO` to the contracts import and the two emits + helpers:

```typescript
import type { CustomerBookingDTO, SuspensionDTO } from '@coralyn/contracts';
```

Change the emits declaration to:

```typescript
const emit = defineEmits<{
  terminate: [CustomerBookingDTO];
  suspend: [CustomerBookingDTO];
  reactivate: [{ booking: CustomerBookingDTO; suspension: SuspensionDTO }];
}>();
```

Add helpers after `terminatedDay`:

```typescript
const openSuspension = (b: CustomerBookingDTO): SuspensionDTO | undefined =>
  (b.suspensions ?? []).find((s) => !s.endDate);
const pastSuspensions = (b: CustomerBookingDTO): SuspensionDTO[] =>
  (b.suspensions ?? []).filter((s) => s.endDate);
const canSuspend = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt && b.endDate >= todayIso() && !openSuspension(b);
const dayOf = (iso: string): string => iso.slice(0, 10);
```

In the template, add a **Sospendi** button next to **Disdici** (inside the same actions column, after the `Disdici` `<Button>`):

```vue
            <Button v-if="isAdmin && canSuspend(b)" variant="secondary" :data-testid="`suspend-${b.id}`" @click="emit('suspend', b)"><Icon name="clock" :size="15" />Sospendi</Button>
```

After the existing `terminatedAt` status row block (the `<div v-if="b.terminatedAt" …>`), add the suspension rows:

```vue
        <div v-if="openSuspension(b)" class="mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warm-100,#FBEFE7)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          <span class="flex-1">Sospeso dal {{ dayOf(openSuspension(b)!.startDate) }} (in corso)</span>
          <Button v-if="isAdmin" variant="primary" :data-testid="`reactivate-${b.id}`" @click="emit('reactivate', { booking: b, suspension: openSuspension(b)! })">Riattiva</Button>
        </div>
        <div v-for="s in pastSuspensions(b)" :key="s.id" class="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          Sospeso dal {{ dayOf(s.startDate) }} al {{ dayOf(s.endDate!) }} · rimborso {{ formatEuro(s.refundedAmount) }}<span v-if="s.reason"> · {{ s.reason }}</span>
        </div>
```

- [ ] **Step 4: Run the card spec**

Run: `corepack pnpm -C apps/web-staff test CustomerSubscriptionsCard`
Expected: PASS — buttons gated by admin + state; emits carry the right payloads; rows render.

- [ ] **Step 5: Wire the modals in the parent view**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`:

Add imports next to `TerminateSubscriptionModal`:

```typescript
import SuspendSubscriptionModal from './SuspendSubscriptionModal.vue';
import ReactivateSubscriptionModal from './ReactivateSubscriptionModal.vue';
import type { CustomerBookingDTO, SuspensionDTO } from '@coralyn/contracts';
```

(Replace the existing `import type { CustomerBookingDTO } …` line with the combined one above.)

Add state + handlers next to `onTerminate`:

```typescript
const suspendOpen = ref(false);
const suspendTarget = ref<CustomerBookingDTO | null>(null);
function onSuspend(b: CustomerBookingDTO) {
  suspendTarget.value = b;
  suspendOpen.value = true;
}
const reactivateOpen = ref(false);
const reactivateBooking = ref<CustomerBookingDTO | null>(null);
const reactivateSuspension = ref<SuspensionDTO | null>(null);
function onReactivate(p: { booking: CustomerBookingDTO; suspension: SuspensionDTO }) {
  reactivateBooking.value = p.booking;
  reactivateSuspension.value = p.suspension;
  reactivateOpen.value = true;
}
```

Bind the card events (extend the existing `<CustomerSubscriptionsCard … @terminate="onTerminate" />`):

```vue
        <CustomerSubscriptionsCard :bookings="bookings ?? []" :is-admin="isAdmin" @terminate="onTerminate" @suspend="onSuspend" @reactivate="onReactivate" />
```

Add the modals next to `<TerminateSubscriptionModal … />`:

```vue
      <SuspendSubscriptionModal :booking="suspendTarget" :customer-id="id" v-model:open="suspendOpen" />
      <ReactivateSubscriptionModal :booking="reactivateBooking" :suspension="reactivateSuspension" :customer-id="id" v-model:open="reactivateOpen" />
```

- [ ] **Step 6: Run the whole web-staff suite**

Run: `corepack pnpm -C apps/web-staff test`
Expected: PASS — new specs green; previous 316 not regressed.

- [ ] **Step 7: Typecheck the FE**

Run: `corepack pnpm -C apps/web-staff exec vue-tsc --noEmit` (or the repo's FE typecheck script if named differently, e.g. `corepack pnpm -C apps/web-staff run typecheck`)
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts apps/web-staff/src/features/customers/CustomerDetailView.vue
git commit -m "feat(web-staff): card suspend/reactivate actions + parent wiring (D-013)"
```

---

## Final verification (after all tasks)

- [ ] **API:** `corepack pnpm -C packages/contracts build && corepack pnpm -C apps/api test && corepack pnpm -C apps/api test:e2e --runInBand` → unit ≥ 209 + new, e2e ≥ 249 + new, green.
- [ ] **FE:** `corepack pnpm -C apps/web-staff test` → ≥ 316 + new, green; `vue-tsc --noEmit` clean.
- [ ] **Cross-package typecheck:** `corepack pnpm -C apps/api exec tsc --noEmit` clean (contracts `dist` rebuilt).
- [ ] **LIVE (Docker):** bring up the stack, log in, open a subscription's Scheda; suspend closed → verify the hole is sellable and the tail is reserved on the map; suspend open + reactivate → verify conflict 409 when a walk-in sits in the return tail; confirm prelazione/renewal on the suspended subscription are unchanged.
- [ ] **Docs:** `deferred.md` D-013 update is deferred to the merge step (per spec §15.4) — not part of this plan's tasks.

---

## Self-review notes (planner)

- **Spec coverage:** §4 model → Task 2; §4.1 carve (closed/open) → Task 4/5 service; §5 refund suggestion → Task 6 (FE); §6 invariants → Task 4/5 e2e (422/409 branches: BAD_START, RETURN_OUT, OPEN_EXISTS, NO_COVERAGE, BAD_REFUND, BAD_DATE, CONFLICT, NO_OPEN); §7 contracts → Task 1; §7 endpoints → Task 4/5 controller; §8 UI (toggle, bounds, reactivate) → Tasks 8/9/10; §10 "cosa non cambia" → Task 4 e2e asserts span invariato + Task 5 asserts endDate invariato; §11 verifiche → e2e + Final LIVE.
- **Known sharp edges surfaced, not hidden:** test-DB migrate command (Task 2 Step 7) and FE typecheck script name (Task 10 Step 7) may differ by repo convention — the plan says to fall back to the repo's variant. The `SegmentedControl` selector reconciliation is called out in Task 8 Step 3/4.
- **Type consistency:** `suggestedSuspensionRefund(b, startDate, returnDate)` used identically in Tasks 6/8/9; `SuspendSubscriptionInput`/`ReactivateSubscriptionInput` field names identical across contracts, DTOs, service, hooks, modals; carve always writes `umbrellaId`/`establishmentId`/`status='confirmed'` on new coverage rows.
