# Incasso base (A2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:executing-plans` (esecuzione inline
> con checkpoint) o `superpowers:subagent-driven-development`. Gli step usano checkbox (`- [ ]`).

**Goal:** Registrare l'incasso base sulla prenotazione (stato di pagamento derivato) e renderlo
visibile/operabile da `BookingsView` e dal drawer della mappa, senza migrazioni di schema.

**Architecture:** Le colonne incasso esistono già su `Booking` (A1). Si aggiunge un helper di dominio
**puro** che deriva `paymentStatus` da `amountCollected`/`totalPrice`, un endpoint `PATCH
/api/bookings/:id/payment` idempotente, contratti additivi, e l'UI (modale riusabile + `BookingsView`
reale). Stato derivato server-side ⇒ nessuno stato di pagamento incoerente possibile.

**Tech Stack:** NestJS + Prisma + class-validator (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
contratti condivisi in `@coralyn/contracts`. Test: Jest (api unit + e2e), Vitest (web-staff).

**Spec di riferimento:** [docs/specs/2026-06-30-bookings-payment-design.md](../specs/2026-06-30-bookings-payment-design.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. Comandi: `corepack pnpm ...`
(pin 11.9.0). DB locale porta 5433; migrazioni **non** necessarie (schema invariato).

---

## File map

- **Modifica** `packages/contracts/src/index.ts` — `BookingDTO += paymentMethod?/collectionDate?`; nuovo `SettlePaymentInput`.
- **Crea** `apps/api/src/bookings/booking.payment.ts` — helper puro `resolvePayment`.
- **Crea** `apps/api/src/bookings/booking.payment.spec.ts` — unit del helper.
- **Modifica** `apps/api/src/bookings/booking.projection.ts` — mappa i nuovi campi.
- **Modifica** `apps/api/src/bookings/booking.projection.spec.ts` — copre i nuovi campi.
- **Crea** `apps/api/src/bookings/dto/settle-payment.dto.ts` — validazione PATCH.
- **Modifica** `apps/api/src/bookings/bookings.service.ts` — metodo `settlePayment`.
- **Modifica** `apps/api/src/bookings/bookings.controller.ts` — rotta `PATCH :id/payment`.
- **Modifica** `apps/api/test/bookings.e2e-spec.ts` — describe `PATCH .../payment`.
- **Modifica** `apps/web-staff/src/features/bookings/useBookings.ts` — `useSettlePayment`.
- **Crea** `apps/web-staff/src/features/bookings/SettlePaymentModal.vue` — modale riusabile.
- **Modifica** `apps/web-staff/src/features/bookings/BookingsView.vue` — dal mock al reale + filtro + empty-state.
- **Modifica** `apps/web-staff/src/features/map/MapView.vue` — azione "Registra incasso" nel drawer.
- **Modifica** `apps/web-staff/src/mocks/server.ts` — handler `PATCH /api/bookings/:id/payment` (test).
- **Crea** `apps/web-staff/src/features/bookings/BookingsView.spec.ts` (o estende esistente) — render reale + filtro.
- **Modifica** `README.md`, `docs/design/data-model.md`; **crea** `docs/handoff/2026-06-30-bookings-a2-done.md`.

---

## Task 1: Contratti additivi

**Files:** Modifica `packages/contracts/src/index.ts`

- [ ] **Step 1: Estendi `BookingDTO` e aggiungi `SettlePaymentInput`**

Nel blocco `BookingDTO`, dopo `amountCollected: number;`, aggiungi:

```ts
  paymentMethod?: PaymentMethod; // A2 (additivo): assente finché non si incassa
  collectionDate?: string;       // A2 (additivo): ISO yyyy-mm-dd, assente finché non si incassa
```

Dopo `CreateBookingInput`, aggiungi:

```ts
/** Input per registrare l'incasso base (ADR-0011). Lo stato è derivato server-side. */
export interface SettlePaymentInput {
  amountCollected: number;       // 0..totalPrice, max 2 decimali
  paymentMethod?: PaymentMethod; // obbligatorio se amountCollected > 0
  collectionDate?: string;       // ISO yyyy-mm-dd; default oggi Europe/Rome
}
```

- [ ] **Step 2: Build dei contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): SettlePaymentInput + BookingDTO.paymentMethod/collectionDate (A2)"
```

---

## Task 2: Helper di dominio puro `resolvePayment`

**Files:** Crea `apps/api/src/bookings/booking.payment.ts`, `apps/api/src/bookings/booking.payment.spec.ts`

- [ ] **Step 1: Scrivi i test (falliscono)**

`apps/api/src/bookings/booking.payment.spec.ts`:

```ts
import { resolvePayment } from './booking.payment';

const TODAY = '2026-07-15';

describe('resolvePayment', () => {
  it('amount 0 su totale > 0 → unpaid, method/date null', () => {
    const r = resolvePayment({ amountCollected: 0 }, 28, TODAY);
    expect(r).toEqual({ ok: true, fields: { amountCollected: 0, paymentStatus: 'unpaid', paymentMethod: null, collectionDate: null } });
  });

  it('amount = totale con metodo → paid, date = today', () => {
    const r = resolvePayment({ amountCollected: 28, paymentMethod: 'cash' }, 28, TODAY);
    expect(r).toEqual({ ok: true, fields: { amountCollected: 28, paymentStatus: 'paid', paymentMethod: 'cash', collectionDate: TODAY } });
  });

  it('0 < amount < totale con metodo → partial', () => {
    const r = resolvePayment({ amountCollected: 10, paymentMethod: 'card' }, 28, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { paymentStatus: 'partial', amountCollected: 10, paymentMethod: 'card' } });
  });

  it('amount > totale → OVER_TOTAL', () => {
    expect(resolvePayment({ amountCollected: 30, paymentMethod: 'cash' }, 28, TODAY)).toEqual({ ok: false, reason: 'OVER_TOTAL' });
  });

  it('amount > 0 senza metodo → METHOD_REQUIRED', () => {
    expect(resolvePayment({ amountCollected: 10 }, 28, TODAY)).toEqual({ ok: false, reason: 'METHOD_REQUIRED' });
  });

  it('collectionDate esplicita rispettata', () => {
    const r = resolvePayment({ amountCollected: 28, paymentMethod: 'transfer', collectionDate: '2026-07-01' }, 28, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { collectionDate: '2026-07-01' } });
  });

  it('reset (amount 0) azzera method/date anche se forniti', () => {
    const r = resolvePayment({ amountCollected: 0, paymentMethod: 'cash', collectionDate: '2026-07-01' }, 28, TODAY);
    expect(r).toEqual({ ok: true, fields: { amountCollected: 0, paymentStatus: 'unpaid', paymentMethod: null, collectionDate: null } });
  });

  it('totalPrice 0 → paid (niente da incassare)', () => {
    expect(resolvePayment({ amountCollected: 0 }, 0, TODAY)).toEqual({ ok: true, fields: { amountCollected: 0, paymentStatus: 'paid', paymentMethod: null, collectionDate: null } });
  });

  it('totalPrice 0 con amount > 0 → OVER_TOTAL', () => {
    expect(resolvePayment({ amountCollected: 5, paymentMethod: 'cash' }, 0, TODAY)).toEqual({ ok: false, reason: 'OVER_TOTAL' });
  });

  it('confronto in centesimi: 0.1 + 0.2 non rompe l’uguaglianza', () => {
    const r = resolvePayment({ amountCollected: 0.3, paymentMethod: 'cash' }, 0.3, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { paymentStatus: 'paid' } });
  });
});
```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.payment`
Expected: FAIL ("Cannot find module './booking.payment'").

- [ ] **Step 3: Implementa l'helper**

`apps/api/src/bookings/booking.payment.ts`:

```ts
import type { PaymentMethod, PaymentStatus, SettlePaymentInput } from '@coralyn/contracts';

export type ResolvePaymentResult =
  | {
      ok: true;
      fields: {
        amountCollected: number;
        paymentStatus: PaymentStatus;
        paymentMethod: PaymentMethod | null;
        collectionDate: string | null;
      };
    }
  | { ok: false; reason: 'OVER_TOTAL' | 'METHOD_REQUIRED' };

/** Confronto in centesimi interi: evita imprecisioni di virgola mobile. */
const cents = (n: number): number => Math.round(n * 100);

/**
 * Normalizza l'incasso e deriva `paymentStatus` da `amountCollected` vs `totalPrice` (ADR-0011).
 * Puro: nessuna dipendenza Nest. `today` = data ISO da iniettare (Europe/Rome, ADR-0031).
 */
export function resolvePayment(
  input: SettlePaymentInput,
  totalPrice: number,
  today: string,
): ResolvePaymentResult {
  const amount = input.amountCollected;
  if (cents(amount) > cents(totalPrice)) return { ok: false, reason: 'OVER_TOTAL' };

  // Reset / non pagato (o totale 0 = niente da incassare).
  if (cents(amount) === 0) {
    const paymentStatus: PaymentStatus = cents(totalPrice) === 0 ? 'paid' : 'unpaid';
    return { ok: true, fields: { amountCollected: 0, paymentStatus, paymentMethod: null, collectionDate: null } };
  }

  // Qui 0 < amount <= totale: serve il metodo.
  if (!input.paymentMethod) return { ok: false, reason: 'METHOD_REQUIRED' };

  const paymentStatus: PaymentStatus = cents(amount) === cents(totalPrice) ? 'paid' : 'partial';
  return {
    ok: true,
    fields: {
      amountCollected: amount,
      paymentStatus,
      paymentMethod: input.paymentMethod,
      collectionDate: input.collectionDate ?? today,
    },
  };
}
```

- [ ] **Step 4: Esegui i test (devono passare)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.payment`
Expected: PASS (10 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking.payment.ts apps/api/src/bookings/booking.payment.spec.ts
git commit -m "feat(api): resolvePayment — stato incasso derivato puro (A2)"
```

---

## Task 3: Proiezione DTO con i campi incasso

**Files:** Modifica `apps/api/src/bookings/booking.projection.ts`, `booking.projection.spec.ts`

- [ ] **Step 1: Aggiungi/aggiorna i test della proiezione**

In `booking.projection.spec.ts`, aggiungi un caso che parte da una riga `Booking` con
`paymentMethod`/`collectionDate` valorizzati e uno con `null` (allinea il fixture a quello già
presente nel file). Asserzioni:

```ts
it('mappa paymentMethod/collectionDate e null→undefined', () => {
  const base = makeBookingRow(); // helper/fixture già usato nel file
  const paid = toBookingDTO({ ...base, paymentStatus: 'paid', amountCollected: 28 as never,
    paymentMethod: 'cash', collectionDate: new Date('2026-07-15T00:00:00Z') });
  expect(paid.paymentMethod).toBe('cash');
  expect(paid.collectionDate).toBe('2026-07-15');

  const unpaid = toBookingDTO({ ...base, paymentMethod: null, collectionDate: null });
  expect(unpaid.paymentMethod).toBeUndefined();
  expect(unpaid.collectionDate).toBeUndefined();
});
```

> Se il file non ha un `makeBookingRow`, costruisci la riga inline copiando il fixture del primo
> test del file (stessi campi obbligatori di `Booking`).

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.projection`
Expected: FAIL (paymentMethod undefined / proprietà assente).

- [ ] **Step 3: Aggiorna la proiezione**

In `booking.projection.ts`, dentro l'oggetto ritornato da `toBookingDTO`, dopo
`amountCollected: Number(b.amountCollected),` aggiungi:

```ts
    paymentMethod: b.paymentMethod ?? undefined,
    collectionDate: b.collectionDate ? formatDbDate(b.collectionDate) : undefined,
```

(`formatDbDate` è già importato.)

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/api test -- booking.projection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking.projection.ts apps/api/src/bookings/booking.projection.spec.ts
git commit -m "feat(api): proietta paymentMethod/collectionDate in BookingDTO (A2)"
```

---

## Task 4: DTO di validazione `SettlePaymentDto`

**Files:** Crea `apps/api/src/bookings/dto/settle-payment.dto.ts`, `dto/settle-payment.dto.spec.ts`

- [ ] **Step 1: Scrivi i test (falliscono)**

`apps/api/src/bookings/dto/settle-payment.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SettlePaymentDto } from './settle-payment.dto';

const errs = (o: unknown) => validateSync(plainToInstance(SettlePaymentDto, o), { whitelist: true });

describe('SettlePaymentDto', () => {
  it('valido: amount + metodo', () => {
    expect(errs({ amountCollected: 28, paymentMethod: 'cash' })).toHaveLength(0);
  });
  it('valido: solo amount 0 (reset)', () => {
    expect(errs({ amountCollected: 0 })).toHaveLength(0);
  });
  it('valido: collectionDate ISO', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'card', collectionDate: '2026-07-15' })).toHaveLength(0);
  });
  it('invalido: amount negativo', () => {
    expect(errs({ amountCollected: -1 }).length).toBeGreaterThan(0);
  });
  it('invalido: amount con 3 decimali', () => {
    expect(errs({ amountCollected: 10.123, paymentMethod: 'cash' }).length).toBeGreaterThan(0);
  });
  it('invalido: metodo fuori enum', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'bitcoin' }).length).toBeGreaterThan(0);
  });
  it('invalido: collectionDate non calendariale', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'cash', collectionDate: '2026-13-40' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- settle-payment.dto`
Expected: FAIL ("Cannot find module './settle-payment.dto'").

- [ ] **Step 3: Implementa il DTO**

`apps/api/src/bookings/dto/settle-payment.dto.ts`:

```ts
import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { PaymentMethod, SettlePaymentInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export class SettlePaymentDto implements SettlePaymentInput {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  amountCollected!: number;

  @IsOptional()
  @IsIn(METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsCalendarDate()
  collectionDate?: string;
}
```

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/api test -- settle-payment.dto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/dto/settle-payment.dto.ts apps/api/src/bookings/dto/settle-payment.dto.spec.ts
git commit -m "feat(api): SettlePaymentDto (validazione PATCH incasso, A2)"
```

---

## Task 5: Service `settlePayment` + rotta controller

**Files:** Modifica `bookings.service.ts`, `bookings.controller.ts`

- [ ] **Step 1: Aggiungi il metodo al service**

In `bookings.service.ts`: aggiorna gli import in cima —
`import { toDbDate, todayInRome } from '../common/dates';` (il file importa già `toDbDate`; aggiungi
`todayInRome`) e `import { resolvePayment } from './booking.payment';`. Aggiungi il metodo dopo `cancel`:

```ts
  /** Registra l'incasso base (ADR-0011). Stato derivato; idempotente. */
  async settlePayment(id: string, input: SettlePaymentInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.status === 'cancelled') return { error: 'CANCELLED' as const };
      const res = resolvePayment(input, Number(existing.totalPrice), todayInRome());
      if (!res.ok) return { error: res.reason };
      const row = await tx.booking.update({
        where: { id },
        data: {
          amountCollected: res.fields.amountCollected,
          paymentStatus: res.fields.paymentStatus,
          paymentMethod: res.fields.paymentMethod,
          collectionDate: res.fields.collectionDate ? toDbDate(res.fields.collectionDate) : null,
        },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'CANCELLED') throw new ConflictException('Impossibile incassare una prenotazione annullata');
      if (e === 'OVER_TOTAL') throw new UnprocessableEntityException('Importo superiore al totale');
      throw new UnprocessableEntityException('Metodo di pagamento richiesto'); // METHOD_REQUIRED
    }
    return toBookingDTO(outcome.row);
  }
```

> Aggiorna anche l'import dei tipi: `import type { BookingDTO, CreateBookingInput, SettlePaymentInput } from '@coralyn/contracts';`.

- [ ] **Step 2: Aggiungi la rotta al controller**

In `bookings.controller.ts`: aggiungi `Patch` agli import da `@nestjs/common`, importa il DTO
(`import { SettlePaymentDto } from './dto/settle-payment.dto';`), e aggiungi:

```ts
  @Patch(':id/payment')
  settle(@Param('id') id: string, @Body() body: SettlePaymentDto): Promise<BookingDTO> {
    return this.bookings.settlePayment(id, body);
  }
```

- [ ] **Step 3: Build dell'api**

Run: `corepack pnpm --filter @coralyn/api build`
Expected: build OK (nessun errore TS; il modulo importa già il service).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.controller.ts
git commit -m "feat(api): PATCH /bookings/:id/payment — registra incasso (A2)"
```

---

## Task 6: e2e del PATCH incasso

**Files:** Modifica `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Aggiungi il describe in coda (prima della chiusura del describe esterno)**

```ts
  describe('PATCH /bookings/:id/payment', () => {
    let bId: string;
    const settle = '2026-08-01';

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u1, timeSlotId: ids.slotMorning, date: settle, totalPrice: 50 })).expect(201);
      bId = res.body.id;
    });

    it('senza token → 401', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).send({ amountCollected: 50, paymentMethod: 'cash' }).expect(401);
    });

    it('salda tutto → paid e GET riflette', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 50, paymentMethod: 'cash' }).expect(200);
      expect(res.body).toMatchObject({ paymentStatus: 'paid', amountCollected: 50, paymentMethod: 'cash' });
      expect(res.body.collectionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const get = await request(app.getHttpServer()).get(`/api/bookings?date=${settle}`).set(...bearer(token1)).expect(200);
      expect(get.body.find((b: { id: string }) => b.id === bId).paymentStatus).toBe('paid');
    });

    it('parziale → partial', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 20, paymentMethod: 'card' }).expect(200);
      expect(res.body).toMatchObject({ paymentStatus: 'partial', amountCollected: 20, paymentMethod: 'card' });
    });

    it('reset (amount 0) → unpaid, method/date assenti', async () => {
      const res = await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 0 }).expect(200);
      expect(res.body.paymentStatus).toBe('unpaid');
      expect(res.body.paymentMethod).toBeUndefined();
      expect(res.body.collectionDate).toBeUndefined();
    });

    it('amount > totale → 422', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 60, paymentMethod: 'cash' }).expect(422);
    });

    it('amount > 0 senza metodo → 422', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token1))
        .send({ amountCollected: 10 }).expect(422);
    });

    it('id inesistente → 404', async () => {
      await request(app.getHttpServer()).patch('/api/bookings/99999999-9999-9999-9999-999999999999/payment').set(...bearer(token1))
        .send({ amountCollected: 0 }).expect(404);
    });

    it('prenotazione annullata → 409', async () => {
      const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u2, date: '2026-08-02', totalPrice: 30 })).expect(201);
      await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).patch(`/api/bookings/${created.body.id}/payment`).set(...bearer(token1))
        .send({ amountCollected: 30, paymentMethod: 'cash' }).expect(409);
    });

    it('isolamento: s2 non incassa una prenotazione di s1 → 404', async () => {
      await request(app.getHttpServer()).patch(`/api/bookings/${bId}/payment`).set(...bearer(token2))
        .send({ amountCollected: 0 }).expect(404);
    });
  });
```

- [ ] **Step 2: Applica le migrazioni a `coralyn_test` (schema invariato, ma assicura il DB) ed esegui gli e2e**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm --filter @coralyn/api prisma migrate deploy
corepack pnpm --filter @coralyn/api test:e2e -- bookings
```
Expected: PASS (tutti i bookings e2e, inclusi i 9 nuovi). Se l'ambiente e2e carica `.env.test`
(jest-setup-env), il `DATABASE_URL` è già impostato; in tal caso basta `test:e2e`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e PATCH incasso — paid/partial/reset/422/409/404/isolamento (A2)"
```

---

## Task 7: Composable `useSettlePayment`

**Files:** Modifica `apps/web-staff/src/features/bookings/useBookings.ts`

- [ ] **Step 1: Aggiungi import e mutation**

Aggiorna l'import dei tipi: `import type { BookingDTO, CreateBookingInput, SettlePaymentInput } from '@coralyn/contracts';`.
In coda al file:

```ts
export function useSettlePayment() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SettlePaymentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/payment`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore (potrebbe servire `corepack pnpm install` se i contratti non sono linkati;
e pulire `apps/web-staff/node_modules/.vite`).

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/features/bookings/useBookings.ts
git commit -m "feat(web-staff): useSettlePayment (mutation PATCH incasso, A2)"
```

---

## Task 8: Modale "Registra incasso" (componente riusabile)

**Files:** Crea `apps/web-staff/src/features/bookings/SettlePaymentModal.vue`

- [ ] **Step 1: Implementa il componente**

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Input, Button } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentMethod } from '@coralyn/contracts';
import { useSettlePayment } from './useBookings';

const props = defineProps<{ modelValue: boolean; booking: BookingDTO | null }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; settled: [] }>();

const settle = useSettlePayment();
const amount = ref(0);
const method = ref<PaymentMethod>('cash');
const date = ref('');
const error = ref('');

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Contanti' }, { value: 'card', label: 'Carta' },
  { value: 'transfer', label: 'Bonifico' }, { value: 'other', label: 'Altro' },
];
const todayRome = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const total = computed(() => props.booking?.totalPrice ?? 0);

watch(() => props.modelValue, (open) => {
  if (open && props.booking) {
    amount.value = props.booking.totalPrice;
    method.value = props.booking.paymentMethod ?? 'cash';
    date.value = props.booking.collectionDate ?? todayRome();
    error.value = '';
  }
});

function close() { emit('update:modelValue', false); }
async function confirm() {
  if (!props.booking) return;
  error.value = '';
  try {
    await settle.mutateAsync({
      id: props.booking.id,
      input: {
        amountCollected: amount.value,
        paymentMethod: amount.value > 0 ? method.value : undefined,
        collectionDate: amount.value > 0 ? date.value : undefined,
      },
    });
    emit('settled');
    close();
  } catch (e) {
    const status = (e as { status?: number }).status;
    error.value = status === 422 ? 'Importo o metodo non validi.' : status === 409 ? 'Prenotazione annullata.' : 'Errore durante la registrazione.';
  }
}
</script>

<template>
  <Modal :open="modelValue" title="Registra incasso" @close="close">
    <div v-if="booking" class="flex flex-col gap-3">
      <p class="text-sm text-[var(--color-text-2nd)]">Totale dovuto: <span class="font-semibold tabular-nums text-[var(--color-text)]">€ {{ total.toFixed(2) }}</span></p>
      <Field label="Importo incassato">
        <Input v-model.number="amount" type="number" min="0" step="0.01" />
      </Field>
      <div class="flex gap-2">
        <Button type="button" variant="secondary" @click="amount = total">Salda tutto</Button>
        <Button type="button" variant="ghost" @click="amount = 0">Segna non pagato</Button>
      </div>
      <Field v-if="amount > 0" label="Metodo">
        <select v-model="method" class="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </Field>
      <Field v-if="amount > 0" label="Data incasso">
        <Input v-model="date" type="date" />
      </Field>
      <p v-if="error" class="text-sm text-[var(--color-danger)]">{{ error }}</p>
      <div class="mt-1 flex justify-end gap-2">
        <Button type="button" variant="secondary" @click="close">Annulla</Button>
        <Button type="button" :disabled="settle.isPending.value" @click="confirm">Conferma</Button>
      </div>
    </div>
  </Modal>
</template>
```

> Verifica la prop del `Modal` del ui-kit (`open`/`title`/`@close`) leggendo `MapView.vue` (già lo usa)
> e `packages/ui-kit/src/components/Modal.vue`; allinea i nomi se differiscono.

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/features/bookings/SettlePaymentModal.vue
git commit -m "feat(web-staff): SettlePaymentModal riusabile (A2)"
```

---

## Task 9: `BookingsView` reale + filtro + empty-state

**Files:** Modifica `apps/web-staff/src/features/bookings/BookingsView.vue`; crea `BookingsView.spec.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

`apps/web-staff/src/features/bookings/BookingsView.spec.ts` — monta la vista con un `QueryClient`
e MSW (pattern dei test esistenti, es. `MapView.spec`/`ClienteDettaglioView.spec`): con MSW che
ritorna una prenotazione `paid` per la data attiva, asserisce che la riga mostra lo stato "Saldato";
con lista vuota mostra l'empty-state. *(Copia lo scaffolding di mount + plugin Pinia/Query da un
`.spec` esistente nel feature folder; non reinventare il setup.)*

```ts
import { describe, it, expect } from 'vitest';
// import { mountView } from '<helper esistente o scaffolding locale>';
// import BookingsView from './BookingsView.vue';

it.todo('mostra le prenotazioni del giorno con stato pagamento e filtra per stato');
it.todo('mostra empty-state quando non ci sono prenotazioni');
```

> Sostituisci gli `it.todo` con i test reali una volta ricalcato lo scaffolding del primo `.spec`
> del progetto che monta una view con TanStack Query + MSW (`server` da `mocks/server.ts`).

- [ ] **Step 2: Riscrivi `BookingsView.vue` con dati reali**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { SegmentedControl, Button, Badge, Avatar, DataTable, Icon } from '@coralyn/ui-kit';
import type { BookingDTO, PaymentStatus } from '@coralyn/contracts';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useDayBookings } from './useBookings';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import SettlePaymentModal from './SettlePaymentModal.vue';

const router = useRouter();
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
const { data: customers } = useCustomers();
const { data: map } = useDayMap();

const filtro = ref<'all' | PaymentStatus>('all');
const filtri = [
  { value: 'all', label: 'Tutte' }, { value: 'unpaid', label: 'Da incassare' },
  { value: 'partial', label: 'Parziali' }, { value: 'paid', label: 'Saldate' },
];

const PAY_LABEL: Record<PaymentStatus, string> = { unpaid: 'Da incassare', partial: 'Parziale', paid: 'Saldato' };
const PAY_TONE: Record<PaymentStatus, 'success' | 'warning' | 'neutral'> = { paid: 'success', partial: 'warning', unpaid: 'neutral' };

const customerName = (id: string) => {
  const c = (customers.value ?? []).find((x) => x.id === id);
  return c ? `${c.firstName} ${c.lastName}` : id;
};
const umbrellaLabel = computed(() => {
  const m = new Map<string, string>();
  for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
  return m;
});
const initials = (name: string) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

const cols = [
  { key: 'cliente', label: 'Cliente' }, { key: 'ombrellone', label: 'Ombrellone' },
  { key: 'tipo', label: 'Tipo' }, { key: 'periodo', label: 'Periodo' },
  { key: 'stato', label: 'Stato' }, { key: 'incasso', label: 'Incasso', align: 'right' as const },
];

const rows = computed<BookingDTO[]>(() => {
  const list = bookings.value ?? [];
  return filtro.value === 'all' ? list : list.filter((b) => b.paymentStatus === filtro.value);
});

const modalOpen = ref(false);
const selected = ref<BookingDTO | null>(null);
function openSettle(b: BookingDTO) { selected.value = b; modalOpen.value = true; }
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <SegmentedControl v-model="filtro" :options="filtri" />
      <div class="flex-1"></div>
      <Button variant="secondary" @click="router.push('/map')"><Icon name="map" :size="15" />Vai alla mappa</Button>
      <Button @click="router.push('/map')"><Icon name="plus" :size="16" />Nuova prenotazione</Button>
    </div>

    <DataTable v-if="rows.length" :columns="cols">
      <tr v-for="b in rows" :key="b.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5"><Avatar :initials="initials(customerName(b.customerId))" size="sm" />
            <span class="font-semibold text-[var(--color-text)]">{{ customerName(b.customerId) }}</span></div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(b.umbrellaId) ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">Giornaliero</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ b.startDate }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5"><Badge :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge></td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <button type="button" class="font-semibold tabular-nums text-[var(--color-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            @click="openSettle(b)">€ {{ b.amountCollected.toFixed(2) }} / € {{ b.totalPrice.toFixed(2) }}</button>
        </td>
      </tr>
    </DataTable>
    <p v-else class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]">
      Nessuna prenotazione per questa data.
    </p>

    <SettlePaymentModal v-model="modalOpen" :booking="selected" />
  </section>
</template>
```

> Verifica i nomi icona (`map`, `plus`) nel registry del ui-kit; se `map` non esiste usa un'icona
> presente (es. `umbrella`). `DataTable`/`Badge`/`Avatar` API: già usate nel mock originale.

- [ ] **Step 3: Completa i test reali e falli passare**

Sostituisci gli `it.todo` con asserzioni reali (riga con stato "Saldato"; empty-state).
Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/bookings/BookingsView.vue apps/web-staff/src/features/bookings/BookingsView.spec.ts
git commit -m "feat(web-staff): BookingsView reale — stato pagamento, filtro, incasso, empty-state (A2)"
```

---

## Task 10: Azione "Registra incasso" nel drawer della mappa

**Files:** Modifica `apps/web-staff/src/features/map/MapView.vue`

- [ ] **Step 1: Importa il modale e aggiungi lo stato**

Negli import del `<script setup>`: `import SettlePaymentModal from '@/features/bookings/SettlePaymentModal.vue';`.
Dopo `const cancelBooking = useCancelBooking();` aggiungi `const settleOpen = ref(false);`.

- [ ] **Step 2: Aggiungi il bottone + badge nel drawer e il modale**

Nel drawer, accanto al bottone "Annulla prenotazione" (vicino a `MapView.vue:231`), quando esiste
`currentBooking`, aggiungi un Badge con lo stato pagamento e un bottone:

```vue
<Badge :tone="currentBooking.paymentStatus === 'paid' ? 'success' : currentBooking.paymentStatus === 'partial' ? 'warning' : 'neutral'">
  {{ currentBooking.paymentStatus === 'paid' ? 'Saldato' : currentBooking.paymentStatus === 'partial' ? 'Parziale' : 'Da incassare' }}
</Badge>
<button type="button" @click="settleOpen = true" class="mt-2.5 self-start p-0.5 text-xs font-semibold text-[var(--color-accent)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">Registra incasso</button>
```

Prima della chiusura del `<template>` (accanto al modale "Nuova prenotazione") aggiungi:

```vue
<SettlePaymentModal v-model="settleOpen" :booking="currentBooking" />
```

> `currentBooking` è già un `computed<BookingDTO | null>` esistente. `--color-accent` esiste nei token
> Coralyn; se preferisci il teal usa `--color-accent-2nd` (verifica in `theme.css`).

- [ ] **Step 3: Aggiorna/verifica `MapView.spec` e typecheck**

Run: `corepack pnpm --filter @coralyn/web-staff test -- MapView && corepack pnpm --filter @coralyn/web-staff typecheck`
Expected: PASS, nessun errore TS. Se `MapView.spec` asserisce la struttura del drawer, aggiorna le
attese minime (presenza del bottone "Registra incasso" quando c'è una prenotazione).

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): drawer mappa — Registra incasso + badge stato pagamento (A2)"
```

---

## Task 11: Handler MSW per i test

**Files:** Modifica `apps/web-staff/src/mocks/server.ts`

- [ ] **Step 1: Aggiungi il PATCH handler (test-only)**

Dopo `http.delete('/api/bookings/:id', ...)`, aggiungi:

```ts
  http.patch('/api/bookings/:id/payment', async ({ params, request }) => {
    const b = (await request.json()) as { amountCollected: number; paymentMethod?: string; collectionDate?: string };
    const paid = b.amountCollected > 0;
    return HttpResponse.json({
      id: params.id, customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
      startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
      totalPrice: b.amountCollected, paymentStatus: paid ? 'paid' : 'unpaid',
      amountCollected: b.amountCollected,
      paymentMethod: paid ? (b.paymentMethod ?? 'cash') : undefined,
      collectionDate: paid ? (b.collectionDate ?? '2026-07-15') : undefined,
    }, { status: 200 });
  }),
```

> È un mock "sufficiente" per i component test (non replica la derivazione completa): serve solo a
> far risolvere la mutation. I test che asseriscono la lista usano l'handler `GET /api/bookings`
> (oggi ritorna `[]`); se un test ha bisogno di righe, sovrascrivi l'handler nel test con
> `server.use(http.get('/api/bookings', () => HttpResponse.json([...])))`.

- [ ] **Step 2: Esegui la suite FE completa**

Run: `corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS (41 esistenti + nuovi).

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/mocks/server.ts
git commit -m "test(web-staff): MSW handler PATCH incasso (A2)"
```

---

## Task 12: Documentazione + verifica finale

**Files:** Modifica `README.md`, `docs/design/data-model.md`; crea `docs/handoff/2026-06-30-bookings-a2-done.md`

- [ ] **Step 1: Aggiorna README e data-model**

- `README.md`: nello stato del progetto, aggiungi che l'**incasso base (A2)** è implementato (PATCH
  stato pagamento, `BookingsView` reale con filtro).
- `docs/design/data-model.md`: nella sezione "Incasso base", nota che il comportamento è **attivo**
  (non più "default in A1"): `paymentStatus` derivato server-side via `PATCH /bookings/:id/payment`.

- [ ] **Step 2: Scrivi l'handoff A2**

`docs/handoff/2026-06-30-bookings-a2-done.md`: cosa ha consegnato A2 (endpoint, helper puro, DTO,
FE), confini mantenuti (no edit in-place, no Cassa/fiscale, no calendario multi-giorno), conteggi
test aggiornati, gotcha riconfermati (corepack, 5433, rebuild api docker), prossimo slice A3 (pricing).

- [ ] **Step 3: Verifica DoD completa**

Run:
```bash
corepack pnpm -r build
corepack pnpm eslint .
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: tutto verde. Conteggi attesi: ui-kit 14 (invariato) · web-staff ≥41 (+nuovi) ·
api unit ≥27 (+payment +dto +projection) · api e2e ≥31 (+9 payment).

- [ ] **Step 4: Verifica live (Docker) — opzionale ma raccomandata**

```bash
docker compose --profile full up -d --build api
```
Login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`); crea una giornaliera, registra
l'incasso dal drawer, verifica `paymentStatus` in `GET /bookings` e il badge in `BookingsView`.

- [ ] **Step 5: Commit + push**

```bash
git add README.md docs/design/data-model.md docs/handoff/2026-06-30-bookings-a2-done.md
git commit -m "docs: incasso base A2 implementato (README, data-model, handoff)"
git push -u origin feat/bookings-payment
```

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §2 derivazione → Task 2; §3 endpoint/errori → Task 4+5+6; §4 contratti → Task 1+3;
  §5 FE (BookingsView/drawer/modale/composable) → Task 7–10; §5.5 MSW → Task 11; §6 test → Task 2,3,4,6,9;
  §7 DoD → Task 12; edge case §8 (totalPrice 0, reset, over-total, cancelled, isolamento) → Task 2+6.
- **Placeholder:** nessuno nei layer BE; i punti FE che richiedono di ricalcare scaffolding di test
  o nomi-prop del ui-kit sono marcati con `>` e un'azione concreta (leggere il file X), non "TODO".
- **Coerenza tipi:** `resolvePayment`/`ResolvePaymentResult`/`SettlePaymentInput`/`SettlePaymentDto`/
  `useSettlePayment({id,input})` allineati attraverso i task. `paymentMethod: PaymentMethod | null` nel
  DB-layer, `?: PaymentMethod` (undefined) nel DTO — conversione esplicita in proiezione e service.
