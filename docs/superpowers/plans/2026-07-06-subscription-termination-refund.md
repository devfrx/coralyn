# Disdetta anticipata abbonamento + rimborso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere all'admin di disdire anticipatamente un abbonamento (posto liberato dal giorno effettivo in poi) registrando un rimborso, preservando lo storico.

**Architecture:** Additivo sul modello `Booking` esistente. La disdetta **tronca `endDate`** (il posto si libera perché l'occupazione è già date-ranged) e marca `terminatedAt`; `status` resta `confirmed` (niente nuovo enum). Il rimborso è un suggerimento pro-rata calcolato nel FE e sovrascrivibile dall'operatore; il server valida solo gli invarianti. Nuovo endpoint `POST /bookings/:id/terminate` admin-only. UI nella Scheda cliente.

**Tech Stack:** NestJS + Prisma (RLS via `forTenant`), contracts TS condivisi, Vue 3 + Pinia + TanStack Query, Vitest + MSW (FE), Jest + supertest (api e2e con DB reale).

**Spec:** [2026-07-06-subscription-termination-refund-design.md](../specs/2026-07-06-subscription-termination-refund-design.md)

**Baseline da non regredire:** ui-kit 79 · web-staff 273 · web-platform 16 · api unit 205 · api e2e 235 (`--runInBand`) · typecheck pulito.

**Gotcha (leggere):** `pnpm` mai `npm` (`corepack pnpm`); dopo modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/e2e; `migrate deploy` a dev **e** test (mai `migrate dev`/`db push`); se dopo un build i test api falliscono con errori Prisma → `corepack pnpm --filter @coralyn/api exec prisma generate`; e2e con `--runInBand`.

---

## File Structure

- `apps/api/prisma/schema.prisma` — 3 colonne su `Booking` (modifica).
- `apps/api/prisma/migrations/20260706130000_subscription_termination/migration.sql` — DDL (create).
- `packages/contracts/src/index.ts` — 3 campi opzionali su `BookingDTO`/`CustomerBookingDTO` + `TerminateSubscriptionInput` (modifica).
- `apps/api/src/bookings/booking.projection.ts` + `customer-booking.projection.ts` — mappano i 3 campi (modifica).
- `apps/api/src/bookings/dto/terminate-subscription.dto.ts` — validazione input (create).
- `apps/api/src/bookings/bookings.service.ts` — metodo `terminate` (modifica).
- `apps/api/src/bookings/bookings.controller.ts` — endpoint admin-only (modifica).
- `apps/api/test/bookings.e2e-spec.ts` — casi e2e disdetta (modifica).
- `apps/web-staff/src/features/customers/terminationRefund.ts` (+`.spec.ts`) — helper pro-rata puro (create).
- `apps/web-staff/src/features/customers/useCustomers.ts` — hook `useTerminateSubscription` (modifica).
- `apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue` (+`.spec.ts`) — modale (create).
- `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue` (+`.spec.ts`) — bottone + stato disdetto (modifica/create).
- `apps/web-staff/src/features/customers/CustomerDetailView.vue` — wiring modale (modifica).
- `docs/architecture/deferred.md` — D-013 in corso (modifica).

---

### Task 1: Schema Prisma + migration + generate

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Booking`, dopo `createdAt`)
- Create: `apps/api/prisma/migrations/20260706130000_subscription_termination/migration.sql`

- [ ] **Step 1: Aggiungi le 3 colonne al model `Booking`**

In `apps/api/prisma/schema.prisma`, dentro `model Booking`, subito dopo la riga `createdAt DateTime @default(now())`:

```prisma
  // Disdetta anticipata abbonamento (D-013). terminatedAt marca la chiusura anticipata
  // (status resta 'confirmed'); endDate viene troncata al giorno di validità → il posto si
  // libera per le date successive senza toccare la projection. refundedAmount = rimborso reso.
  terminatedAt      DateTime?
  terminationReason String?
  refundedAmount    Decimal        @default(0) @db.Decimal(10, 2)
```

- [ ] **Step 2: Scrivi la migration SQL**

Crea `apps/api/prisma/migrations/20260706130000_subscription_termination/migration.sql`:

```sql
-- Disdetta anticipata abbonamento (D-013): chiusura anticipata + rimborso.
ALTER TABLE "Booking" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "terminationReason" TEXT;
ALTER TABLE "Booking" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Applica a dev e test, poi genera il client**

Run:
```bash
pnpm dlx dotenv-cli -e apps/api/.env      -- corepack pnpm --filter @coralyn/api exec prisma migrate deploy
pnpm dlx dotenv-cli -e apps/api/.env.test -- corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Expected: entrambe le deploy riportano la migration `20260706130000_subscription_termination` applicata; `generate` ok.

- [ ] **Step 4: Verifica che lo schema sia valido**

Run: `corepack pnpm --filter @coralyn/api exec prisma validate`
Expected: `The schema at ... is valid`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260706130000_subscription_termination
git commit -m "feat(api): schema disdetta abbonamento (terminatedAt, terminationReason, refundedAmount) — D-013"
```

---

### Task 2: Contracts — DTO fields + TerminateSubscriptionInput

**Files:**
- Modify: `packages/contracts/src/index.ts` (`BookingDTO`, `CustomerBookingDTO`, + nuova interface)

- [ ] **Step 1: Aggiungi i 3 campi opzionali a `BookingDTO`**

In `packages/contracts/src/index.ts`, dentro `interface BookingDTO`, dopo `previousBookingId?: string;`:

```ts
  refundedAmount?: number;       // D-013 (additivo): rimborso reso alla disdetta; assente/0 = nessuno
  terminatedAt?: string;         // D-013: ISO datetime della disdetta; assente = non disdetto
  terminationReason?: string;    // D-013: nota operatore; assente = nessuna
```

- [ ] **Step 2: Aggiungi gli stessi 3 campi a `CustomerBookingDTO`**

Dentro `interface CustomerBookingDTO`, dopo `previousBookingId?: string;` (prima del blocco `// — arricchimenti server-side —`):

```ts
  refundedAmount?: number;       // D-013 (additivo)
  terminatedAt?: string;         // D-013
  terminationReason?: string;    // D-013
```

- [ ] **Step 3: Aggiungi l'input della disdetta**

Dopo `interface RenewBookingInput { ... }`:

```ts
/** Input disdetta anticipata di un abbonamento (D-013, admin-only). `effectiveDate` = primo giorno
 *  in cui il posto torna libero; `refundAmount` = importo rimborsato deciso dall'operatore. */
export interface TerminateSubscriptionInput {
  effectiveDate: string;   // ISO yyyy-mm-dd
  refundAmount: number;    // ≥ 0, ≤ amountCollected
  reason?: string;
}
```

- [ ] **Step 4: Rebuild dei contracts e typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/contracts build
corepack pnpm --filter @coralyn/contracts exec tsc --noEmit -p tsconfig.json
```
Expected: build ok, nessun errore di tipo.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): campi disdetta su BookingDTO/CustomerBookingDTO + TerminateSubscriptionInput (D-013)"
```

---

### Task 3: Projection — mappa i nuovi campi (TDD, puro)

**Files:**
- Create: `apps/api/src/bookings/booking.projection.spec.ts`
- Modify: `apps/api/src/bookings/booking.projection.ts`
- Modify: `apps/api/src/bookings/customer-booking.projection.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/api/src/bookings/booking.projection.spec.ts`:

```ts
import { describe, it, expect } from '@jest/globals';
import { toBookingDTO } from './booking.projection';

const base = {
  id: 'b1', customerId: 'c1', umbrellaId: 'u1', timeSlotId: 's1',
  previousBookingId: null, packageId: null,
  startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z'),
  type: 'subscription' as const, status: 'confirmed' as const,
  totalPrice: 800, extras: null, paymentStatus: 'paid' as const,
  amountCollected: 800, paymentMethod: null, collectionDate: null,
  createdAt: new Date('2026-05-01T10:00:00Z'), slotStartMin: 0, slotEndMin: 0,
  terminatedAt: new Date('2026-06-20T09:30:00Z'), terminationReason: 'Trasloco', refundedAmount: 250,
};

describe('toBookingDTO — campi disdetta (D-013)', () => {
  it('mappa terminatedAt (ISO), terminationReason e refundedAmount (Decimal→number)', () => {
    const dto = toBookingDTO(base as never);
    expect(dto.refundedAmount).toBe(250);
    expect(dto.terminatedAt).toBe('2026-06-20T09:30:00.000Z');
    expect(dto.terminationReason).toBe('Trasloco');
  });

  it('non disdetto: terminatedAt/reason assenti, refundedAmount 0', () => {
    const dto = toBookingDTO({ ...base, terminatedAt: null, terminationReason: null, refundedAmount: 0 } as never);
    expect(dto.terminatedAt).toBeUndefined();
    expect(dto.terminationReason).toBeUndefined();
    expect(dto.refundedAmount).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `corepack pnpm --filter @coralyn/api exec jest booking.projection --runInBand`
Expected: FAIL (i campi `refundedAmount`/`terminatedAt`/`terminationReason` sono `undefined`).

- [ ] **Step 3: Mappa i campi in `toBookingDTO`**

In `apps/api/src/bookings/booking.projection.ts`, dentro l'oggetto ritornato, dopo `previousBookingId: b.previousBookingId ?? undefined,`:

```ts
    refundedAmount: Number(b.refundedAmount),
    terminatedAt: b.terminatedAt ? b.terminatedAt.toISOString() : undefined,
    terminationReason: b.terminationReason ?? undefined,
```

- [ ] **Step 4: Mappa gli stessi campi in `toCustomerBookingDTO`**

In `apps/api/src/bookings/customer-booking.projection.ts`, dentro l'oggetto ritornato, dopo `previousBookingId: b.previousBookingId ?? undefined,`:

```ts
    refundedAmount: Number(b.refundedAmount),
    terminatedAt: b.terminatedAt ? b.terminatedAt.toISOString() : undefined,
    terminationReason: b.terminationReason ?? undefined,
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `corepack pnpm --filter @coralyn/api exec jest booking.projection --runInBand`
Expected: PASS (2 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/booking.projection.ts apps/api/src/bookings/customer-booking.projection.ts apps/api/src/bookings/booking.projection.spec.ts
git commit -m "feat(api): projection mappa i campi disdetta (refundedAmount/terminatedAt/reason) — D-013"
```

---

### Task 4: DTO di validazione dell'input

**Files:**
- Create: `apps/api/src/bookings/dto/terminate-subscription.dto.ts`

- [ ] **Step 1: Scrivi la classe DTO**

Crea `apps/api/src/bookings/dto/terminate-subscription.dto.ts`:

```ts
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TerminateSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input disdetta (D-013). Gli invarianti di dominio (range data, refund ≤ incassato,
 *  tipo/stato) sono nel service: qui solo shape/bound sintattici. */
export class TerminateSubscriptionDto implements TerminateSubscriptionInput {
  @IsCalendarDate()
  effectiveDate!: string;

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

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bookings/dto/terminate-subscription.dto.ts
git commit -m "feat(api): DTO validazione disdetta abbonamento (D-013)"
```

---

### Task 5: Service `terminate` + endpoint controller (admin-only)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`

- [ ] **Step 1: Aggiungi l'import dell'input nel service**

In `apps/api/src/bookings/bookings.service.ts`, nel blocco `import type { ... } from '@coralyn/contracts';`, aggiungi `TerminateSubscriptionInput` all'elenco (ordine alfabetico, dopo `SubscriptionListItemDTO` va bene su riga separata):

```ts
  TerminateSubscriptionInput,
```

- [ ] **Step 2: Implementa `terminate` in fondo alla classe**

In `apps/api/src/bookings/bookings.service.ts`, subito prima della `}` finale della classe (dopo `settlePayment`):

```ts
  /**
   * Disdetta anticipata di un abbonamento (D-013). Tronca endDate al giorno prima della data
   * effettiva (E = primo giorno di posto libero), marca terminatedAt e registra il rimborso.
   * status resta 'confirmed'. Il posto si libera per date ≥ E (occupazione date-ranged).
   */
  async terminate(id: string, input: TerminateSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'ALREADY_TERMINATED' as const };

      const effective = toDbDate(input.effectiveDate);
      // E ∈ (startDate, endDate]: prima = "mai usato" (è un void → cancel); dopo = fuori stagione.
      if (!(effective > existing.startDate && effective <= existing.endDate)) {
        return { error: 'BAD_DATE' as const };
      }
      const collected = Number(existing.amountCollected);
      if (!(input.refundAmount >= 0 && input.refundAmount <= collected)) {
        return { error: 'BAD_REFUND' as const };
      }

      // Ultimo giorno di validità = E - 1 (UTC-safe: le date DB sono a mezzanotte UTC).
      const lastValid = new Date(effective.getTime() - 24 * 60 * 60 * 1000);
      const row = await tx.booking.update({
        where: { id },
        data: {
          endDate: lastValid,
          terminatedAt: new Date(),
          terminationReason: input.reason ?? null,
          refundedAmount: input.refundAmount,
        },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION')
        throw new UnprocessableEntityException('Solo gli abbonamenti possono essere disdetti');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'ALREADY_TERMINATED') throw new ConflictException('Abbonamento già disdetto');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di disdetta non valida');
      throw new UnprocessableEntityException('Rimborso non valido'); // BAD_REFUND
    }
    return toBookingDTO(outcome.row);
  }
```

- [ ] **Step 3: Aggiungi l'endpoint al controller**

In `apps/api/src/bookings/bookings.controller.ts`:
- Aggiungi agli import: `import { Roles } from '../identity/roles.decorator';`, `import { Role } from '@coralyn/contracts';`, `import { TerminateSubscriptionDto } from './dto/terminate-subscription.dto';`
- Dopo il metodo `cancel(...)`:

```ts
  @Post(':id/terminate')
  @Roles(Role.Admin)
  terminate(@Param('id') id: string, @Body() body: TerminateSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.terminate(id, body);
  }
```

- [ ] **Step 4: Typecheck**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit -p tsconfig.json`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.controller.ts
git commit -m "feat(api): POST /bookings/:id/terminate — disdetta abbonamento admin-only (D-013)"
```

---

### Task 6: e2e — happy path + invarianti + admin-only + isolamento

**Files:**
- Modify: `apps/api/test/bookings.e2e-spec.ts`

Nota: nel `beforeAll` esistono `token1` (admin s1), `token2` (admin s2). Serve anche uno **staff** in s1 per il test 403.

- [ ] **Step 1: Aggiungi uno staff user in s1 nel `beforeAll`**

In `apps/api/test/bookings.e2e-spec.ts`, dichiara la variabile in cima al `describe` (accanto a `token1`): `let staffToken: string;`. Poi nel `beforeAll`, dopo la creazione degli admin:

```ts
    await createUser(prisma, { email: 'staff.b1@e2e.test', password: 'pws1', role: Role.staff, establishmentId: s1 });
    staffToken = await login(app, 'staff.b1@e2e.test', 'pws1');
```
E nel `afterAll`, aggiungi l'email allo `deleteMany`:
```ts
    await prisma.user.deleteMany({ where: { email: { in: ['admin.b1@e2e.test', 'admin.b2@e2e.test', 'super.b@e2e.test', 'staff.b1@e2e.test'] } } });
```

- [ ] **Step 2: Scrivi il blocco di test della disdetta (in fondo, prima della `});` che chiude il describe root)**

```ts
  describe('disdetta abbonamento (D-013)', () => {
    // umbrella dedicata per non collidere con gli altri test di occupazione
    let uTerm: string;

    const makeSub = async (): Promise<string> => {
      const u = await prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label: 'T', logicalOrder: 50 } }),
      );
      uTerm = u.id;
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uTerm, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      return res.body.id as string; // abbonamento 2026-05-01 → 2026-09-30, prezzo 800
    };

    it('admin disdice → 200, endDate troncata, terminatedAt e refundedAmount valorizzati', async () => {
      const subId = await makeSub();
      const res = await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 400, reason: 'Trasloco' }).expect(200);
      expect(res.body.status).toBe('confirmed');
      expect(res.body.endDate).toBe('2026-06-30'); // E-1
      expect(res.body.refundedAmount).toBe(400);
      expect(typeof res.body.terminatedAt).toBe('string');
      expect(res.body.terminationReason).toBe('Trasloco');
    });

    it('libera il posto: dopo la disdetta una nuova prenotazione sulle date liberate passa', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(200);
      // prima della disdetta questa daily del 2026-07-15 darebbe 409 (occupata dall'abbonamento)
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uTerm, timeSlotId: ids.slotMorning, type: 'daily', startDate: '2026-07-15' })).expect(201);
    });

    it('staff → 403 (admin-only)', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(staffToken))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(403);
    });

    it('tenant altrui → 404', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token2))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(404);
    });

    it('data fuori range (≤ startDate) → 422', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-05-01', refundAmount: 0 }).expect(422);
    });

    it('rimborso > incassato → 422', async () => {
      const subId = await makeSub(); // non pagato: amountCollected = 0
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 50 }).expect(422);
    });

    it('già disdetto → 409', async () => {
      const subId = await makeSub();
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-07-01', refundAmount: 0 }).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${subId}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-01', refundAmount: 0 }).expect(409);
    });

    it('non-abbonamento (daily) → 422', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotAfternoon, type: 'daily', startDate: '2026-08-20' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${res.body.id}/terminate`).set(...bearer(token1))
        .send({ effectiveDate: '2026-08-20', refundAmount: 0 }).expect(422);
    });
  });
```

- [ ] **Step 3: Esegui i test e2e delle prenotazioni**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings --runInBand`
Expected: PASS (tutti, inclusi gli 8 nuovi). Se falliscono con errori Prisma → `corepack pnpm --filter @coralyn/api exec prisma generate` e rilancia.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e disdetta abbonamento — happy/invarianti/admin-only/isolamento (D-013)"
```

---

### Task 7: FE — helper pro-rata puro (TDD)

**Files:**
- Create: `apps/web-staff/src/features/customers/terminationRefund.ts`
- Create: `apps/web-staff/src/features/customers/terminationRefund.spec.ts`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `apps/web-staff/src/features/customers/terminationRefund.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestedRefund } from './terminationRefund';

// Stagione 2026: 2026-05-01 → 2026-09-30 (153 giorni inclusivi), abbonamento pagato per intero.
const paid = { startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, amountCollected: 800 };

describe('suggestedRefund', () => {
  it('metà stagione: rende ~la quota non goduta', () => {
    // servedDays(05-01→07-01)=61; earned=800*61/153=318.95; suggested=481.05
    expect(suggestedRefund(paid, '2026-07-01')).toBeCloseTo(481.05, 2);
  });

  it('disdetta subito dopo l\'inizio: rimborso quasi pieno', () => {
    // servedDays=1; earned=800/153=5.23; suggested=794.77
    expect(suggestedRefund(paid, '2026-05-02')).toBeCloseTo(794.77, 2);
  });

  it('disdetta all\'ultimo giorno: rimborso minimo', () => {
    // servedDays=152; earned=794.77; suggested=5.23
    expect(suggestedRefund(paid, '2026-09-30')).toBeCloseTo(5.23, 2);
  });

  it('non pagato: nessun rimborso (clamp a 0)', () => {
    expect(suggestedRefund({ ...paid, amountCollected: 0 }, '2026-07-01')).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `corepack pnpm --filter @coralyn/web-staff test -- terminationRefund`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementa l'helper**

Crea `apps/web-staff/src/features/customers/terminationRefund.ts`:

```ts
import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO per una disdetta anticipata (D-013). NON autoritativo: è una
 * convenienza UI che l'operatore sovrascrive (policy del lido). `effectiveDate` = primo giorno
 * di posto libero. suggested = clamp(amountCollected − totalPrice × giorniGoduti/giorniPianificati).
 */
export function suggestedRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected'>,
  effectiveDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const servedDays = dayDiff(b.startDate, effectiveDate);
  const frac = clamp(servedDays / plannedDays, 0, 1);
  const earned = round2(b.totalPrice * frac);
  return clamp(round2(b.amountCollected - earned), 0, b.amountCollected);
}
```

- [ ] **Step 4: Esegui e verifica il passaggio**

Run: `corepack pnpm --filter @coralyn/web-staff test -- terminationRefund`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/terminationRefund.ts apps/web-staff/src/features/customers/terminationRefund.spec.ts
git commit -m "feat(web-staff): helper rimborso pro-rata suggerito per disdetta (D-013)"
```

---

### Task 8: FE — hook `useTerminateSubscription`

**Files:**
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`

- [ ] **Step 1: Aggiungi l'hook di mutazione**

In `apps/web-staff/src/features/customers/useCustomers.ts`:
- Estendi l'import da `@coralyn/contracts` con `BookingDTO, TerminateSubscriptionInput`.
- In fondo al file:

```ts
/** Disdetta anticipata di un abbonamento (D-013, admin-only). Invalida lo storico della Scheda
 *  cliente così la card riflette lo stato disdetto. `quiet`: il modale mostra l'errore inline. */
export function useTerminateSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TerminateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/terminate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/features/customers/useCustomers.ts
git commit -m "feat(web-staff): hook useTerminateSubscription (invalida storico cliente) — D-013"
```

---

### Task 9: FE — modale di disdetta (TDD)

**Files:**
- Create: `apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue`
- Create: `apps/web-staff/src/features/customers/TerminateSubscriptionModal.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/web-staff/src/features/customers/TerminateSubscriptionModal.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import TerminateSubscriptionModal from './TerminateSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};

function mount() {
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-07-01';
  return mountApp(TerminateSubscriptionModal, { props: { booking: sub, customerId: 'c-1', open: true } });
}

describe('TerminateSubscriptionModal', () => {
  it('invia effectiveDate, refundAmount e reason al backend', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/terminate', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ...sub, terminatedAt: '2026-07-01T10:00:00.000Z', refundedAmount: 481.05 });
      }),
    );
    const w = mount();
    await flushPromises();
    // il rimborso suggerito (481.05) è pre-compilato
    const refundInput = w.find('input[data-testid="refund-amount"]').element as HTMLInputElement;
    expect(Number(refundInput.value)).toBeCloseTo(481.05, 2);
    // conferma
    await w.find('[data-testid="terminate-confirm"]').trigger('click');
    await flushPromises();
    expect(captured).toMatchObject({ effectiveDate: '2026-07-01', refundAmount: 481.05 });
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `corepack pnpm --filter @coralyn/web-staff test -- TerminateSubscriptionModal`
Expected: FAIL (componente inesistente).

- [ ] **Step 3: Implementa il modale**

Crea `apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, ModalFooter, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { addDays, todayIso } from '@/lib/dates';
import { suggestedRefund } from './terminationRefund';
import { useTerminateSubscription } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const terminate = useTerminateSubscription(props.customerId);

const effectiveDate = ref('');
const refundAmount = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => (props.booking ? addDays(props.booking.startDate, 1) : ''));
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const suggested = computed(() => (props.booking ? suggestedRefund(props.booking, effectiveDate.value) : 0));

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    const def = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    effectiveDate.value = def;
    refundAmount.value = suggestedRefund(props.booking, def);
    reason.value = '';
    error.value = '';
  }
});

async function confirm(): Promise<void> {
  if (!props.booking) return;
  error.value = '';
  submitting.value = true;
  try {
    await terminate.mutateAsync({
      id: props.booking.id,
      input: { effectiveDate: effectiveDate.value, refundAmount: refundAmount.value, reason: reason.value || undefined },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Abbonamento già disdetto.' : status === 422 ? 'Dati non validi.' : 'Errore durante la disdetta.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Disdici abbonamento" eyebrow="Disdetta">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Data effettiva (primo giorno di posto libero)">
        <input v-model="effectiveDate" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>

      <Field label="Rimborso (€)">
        <input v-model.number="refundAmount" data-testid="refund-amount" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
        <span>Suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
        <Button type="button" variant="ghost" @click="refundAmount = suggested">Usa suggerito</Button>
      </div>

      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <ModalFooter class="pt-2" submit-label="Conferma disdetta" :submit-disabled="submitting" @cancel="open = false" @submit="confirm">
        <template #submit>
          <Button data-testid="terminate-confirm" variant="danger" :disabled="submitting" @click="confirm">Conferma disdetta</Button>
        </template>
      </ModalFooter>
    </div>
  </Modal>
</template>
```

Nota: se `ModalFooter` non espone uno slot `#submit`, sostituisci il blocco `<ModalFooter>…</ModalFooter>` con un footer esplicito:
```vue
      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="terminate-confirm" variant="danger" :disabled="submitting" @click="confirm">Conferma disdetta</Button>
      </div>
```
Verifica l'interfaccia di `ModalFooter` in `packages/ui-kit/src/components/` prima di scegliere; il test richiede solo il bottone `[data-testid="terminate-confirm"]`.

- [ ] **Step 4: Esegui e verifica il passaggio**

Run: `corepack pnpm --filter @coralyn/web-staff test -- TerminateSubscriptionModal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue apps/web-staff/src/features/customers/TerminateSubscriptionModal.spec.ts
git commit -m "feat(web-staff): TerminateSubscriptionModal — disdetta con rimborso suggerito (D-013)"
```

---

### Task 10: FE — card: bottone «Disdici» + stato disdetto (TDD)

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Create: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';

const activeSub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2030-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12', seasonName: 'Estate', seniority: 2,
};
const terminatedSub: CustomerBookingDTO = {
  ...activeSub, id: 'sub-2', endDate: '2026-06-30', terminatedAt: '2026-06-20T09:00:00.000Z', refundedAmount: 250, terminationReason: 'Trasloco',
};

describe('CustomerSubscriptionsCard — disdetta (D-013)', () => {
  it('admin + abbonamento attivo → mostra «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).toContain('Disdici');
  });

  it('non-admin → nessun «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: false } });
    expect(w.text()).not.toContain('Disdici');
  });

  it('abbonamento disdetto → riga stato con rimborso, nessun «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [terminatedSub], isAdmin: true } });
    expect(w.text()).toContain('Disdetto');
    expect(w.text()).toContain('250');
    expect(w.text()).not.toContain('Disdici');
  });

  it('emette «terminate» col booking al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    await w.find('[data-testid="terminate-sub-1"]').trigger('click');
    expect(w.emitted('terminate')?.[0]?.[0]).toMatchObject({ id: 'sub-1' });
  });
});
```

- [ ] **Step 2: Esegui e verifica il fallimento**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerSubscriptionsCard`
Expected: FAIL (prop `isAdmin`/bottone/stato assenti).

- [ ] **Step 3: Aggiorna la card**

Sostituisci il contenuto di `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { SectionCard, Callout, Badge, Button, Icon, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { todayIso } from '@/lib/dates';

const props = defineProps<{ bookings: CustomerBookingDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ terminate: [CustomerBookingDTO] }>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));

const canTerminate = (b: CustomerBookingDTO): boolean =>
  b.status === 'confirmed' && !b.terminatedAt && b.endDate >= todayIso();
const terminatedDay = (iso: string): string => iso.slice(0, 10);
</script>
<template>
  <SectionCard title="Abbonamento e anzianità" icon="star">
    <p v-if="subs.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessun abbonamento.</p>
    <ul v-else class="flex flex-col gap-3">
      <li v-for="b in subs" :key="b.id" class="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3.5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--color-text-2nd)]">{{ b.sectorName ?? '—' }} · {{ b.umbrellaLabel }}</span>
              <Badge v-if="b.packageName" tone="brand">{{ b.packageName }}</Badge>
              <Badge v-if="b.renewed" tone="success">Rinnovato</Badge>
            </div>
            <div class="mt-1.5 text-[13px] font-semibold text-[var(--color-text)]">{{ b.seasonName ?? '—' }} · posto riservato</div>
            <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Abbonato da {{ b.seniority ?? 1 }} {{ (b.seniority ?? 1) === 1 ? 'stagione' : 'stagioni consecutive' }}</div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-2">
            <div class="text-right">
              <div class="text-[26px] font-bold leading-none tabular-nums text-[var(--color-text)]">{{ b.seniority ?? 1 }}</div>
              <div class="mt-1 text-[10px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ (b.seniority ?? 1) === 1 ? 'STAGIONE' : 'STAGIONI' }}</div>
            </div>
            <Button v-if="isAdmin && canTerminate(b)" variant="secondary" :data-testid="`terminate-${b.id}`" @click="emit('terminate', b)"><Icon name="x-circle" :size="15" />Disdici</Button>
          </div>
        </div>
        <Callout v-if="b.prelazione" tone="warm" class="mt-3">
          <template #icon><Icon name="clock" :size="15" /></template>
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </Callout>
        <div v-if="b.terminatedAt" class="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
          Disdetto il {{ terminatedDay(b.terminatedAt) }} · rimborso {{ formatEuro(b.refundedAmount ?? 0) }}<span v-if="b.terminationReason"> · {{ b.terminationReason }}</span>
        </div>
      </li>
    </ul>
  </SectionCard>
</template>
```

Nota: `x-circle` deve esistere nell'icon-registry di ui-kit; se assente usa un'icona presente (es. `trash-2` o `slash`) verificando in `packages/ui-kit/src/**` (registry ADR-0020).

- [ ] **Step 4: Esegui e verifica il passaggio**

Run: `corepack pnpm --filter @coralyn/web-staff test -- CustomerSubscriptionsCard`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts
git commit -m "feat(web-staff): card abbonamenti — «Disdici» (admin) + stato disdetto (D-013)"
```

---

### Task 11: FE — wiring nella Scheda cliente

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`

- [ ] **Step 1: Importa il modale e i tipi**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`, negli import dei componenti:
```ts
import TerminateSubscriptionModal from './TerminateSubscriptionModal.vue';
import type { CustomerBookingDTO } from '@coralyn/contracts';
```

- [ ] **Step 2: Aggiungi lo stato del modale nello `<script setup>`**

Dopo `const editOpen = ref(false);`:
```ts
const terminateOpen = ref(false);
const terminateTarget = ref<CustomerBookingDTO | null>(null);
function onTerminate(b: CustomerBookingDTO) {
  terminateTarget.value = b;
  terminateOpen.value = true;
}
```

- [ ] **Step 3: Passa `isAdmin`/`@terminate` alla card e monta il modale**

Sostituisci `<CustomerSubscriptionsCard :bookings="bookings ?? []" />` con:
```vue
        <CustomerSubscriptionsCard :bookings="bookings ?? []" :is-admin="isAdmin" @terminate="onTerminate" />
```
E dopo `<EditCustomerModal :customer="customer" v-model:open="editOpen" />`:
```vue
      <TerminateSubscriptionModal :booking="terminateTarget" :customer-id="id" v-model:open="terminateOpen" />
```

- [ ] **Step 4: Esegui l'intera suite web-staff + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: tutti verdi (273 baseline + nuovi test di questa slice); typecheck pulito.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue
git commit -m "feat(web-staff): Scheda cliente monta il modale di disdetta abbonamento (D-013)"
```

---

### Task 12: Docs — registra D-013 in corso

**Files:**
- Modify: `docs/architecture/deferred.md`

- [ ] **Step 1: Aggiorna la riga D-013**

Nella tabella dei deferiti, sostituisci la riga `D-013` per annotare che la **sotto-slice 1/3 (disdetta+rimborso) è implementata**, con link a spec e piano, mantenendo deferite cessione e sospensione. Esempio di testo (adatta alle colonne esistenti):

```
| D-013 | Sospensione / cessione / disdetta dell'abbonamento — **disdetta+rimborso IMPLEMENTATA** (spec `2026-07-06-subscription-termination-refund-design.md`, piano omonimo): `POST /bookings/:id/terminate` admin-only, tronca `endDate` + `terminatedAt` + `refundedAmount`, rimborso pro-rata suggerito FE. **Restano deferite** cessione/subentro e sospensione temporanea (quest'ultima in sinergia con D-035). | subentri, rimborsi | — |
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/deferred.md
git commit -m "docs(deferred): D-013 sotto-slice disdetta+rimborso implementata"
```

---

## Self-Review

**Spec coverage:**
- §3.1 modello tronca endDate + terminatedAt → Task 1 (schema), Task 5 (service).
- §3.2 rimborso pro-rata FE non autoritativo → Task 7 (helper), Task 9 (modale).
- §3.3 refundedAmount/terminationReason additivi → Task 1, Task 2.
- §3.4 invarianti (422/409) → Task 5 (service), Task 6 (e2e).
- §3.5 contracts + endpoint → Task 2, Task 5.
- §3.6 admin-only → Task 5 (`@Roles(Role.Admin)`), Task 6 (403 staff).
- §3.7 UI card + modale → Task 9, Task 10, Task 11.
- §5 verifiche (liberazione posto, storico) → Task 6 (posto liberato), Task 10 (stato disdetto visibile).
- §7 fuori scope (cessione/sospensione, revenue-netting) → non implementati; Task 12 li mantiene deferiti.

**Type consistency:** `TerminateSubscriptionInput { effectiveDate; refundAmount; reason? }` coerente tra contracts (Task 2), DTO (Task 4), service (Task 5), hook/modale (Task 8/9). Campi DTO `refundedAmount?/terminatedAt?/terminationReason?` coerenti tra contracts, projection (Task 3), card (Task 10). Endpoint `POST /bookings/:id/terminate` coerente tra controller (Task 5), e2e (Task 6), hook (Task 8).

**Placeholder scan:** nessun TBD/TODO; ogni step porta codice o comando reale. Due note di adattamento esplicite (slot `ModalFooter`, icona `x-circle`) rimandano a una verifica puntuale in ui-kit con fallback indicato — non sono placeholder di logica.
