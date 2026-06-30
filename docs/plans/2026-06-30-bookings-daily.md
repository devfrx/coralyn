# Prenotazioni — Slice A1 (giornaliera + mappa accesa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre l'entità `Booking` (sola giornaliera), l'invariante anti-overlap a slot e la derivazione reale dello stato della mappa, collegando la `MapView` al backend reale.

**Architecture:** NestJS + Prisma tenant-scoped (RLS FORCE, tutto dentro `forTenant`); logica pura unit-testata (invariante + proiezioni); endpoint REST validati; FE Vue 3 + TanStack Query. Date di calendario nel fuso `Europe/Rome`, persistite/lette in UTC (ADR-0031).

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, class-validator, Jest + supertest, Vue 3, Pinia, @tanstack/vue-query, MSW.

**Spec:** [docs/specs/2026-06-30-bookings-daily-design.md](../specs/2026-06-30-bookings-daily-design.md) · **ADR-0031** (fuso/date) · **ADR-0013** (slot) · **ADR-0006/0011/0012** (dominio).

---

## Premesse operative (insidie note — leggere prima)

- **Branch:** già su `feat/bookings-daily` (creato da `main`).
- **DB locale su `5433`.** I comandi Prisma in locale vogliono `DATABASE_URL` **inline** (il root `.env` non è auto-caricato da `pnpm --filter`). Esempio (PowerShell, una riga):
  - dev: `DATABASE_URL='postgresql://coralyn_app:coralyn_app_pw@localhost:5433/coralyn_dev?schema=public'`
  - test: vedi `.env.test` (`coralyn_test`).
- **`prisma generate` PRIMA di `nest build`**, dopo ogni cambio schema.
- **RLS FORCE:** ogni scrittura/lettura su tabella tenant-scoped va dentro `prisma.forTenant(...)` o una tx con `set_config('app.current_tenant', …, true)`.
- **Vite stantio:** dopo il cambio di `@coralyn/contracts`, `rm -rf apps/web-staff/node_modules/.vite` e riavviare, altrimenti enum/tipi vecchi.
- **Sweep:** `rg -uu` ma escludendo `node_modules`.
- **Stato test da non regredire:** ui-kit 14 · web-staff 40 · api unit 9 · api e2e 22.

## File map (cosa si crea / modifica)

**Contracts**
- Modify: `packages/contracts/src/index.ts` — tipi additivi `BookingType/Status`, `PaymentStatus/Method`, `BookingDTO`, `CreateBookingInput`.

**Backend — utilità**
- Create: `apps/api/src/common/dates.ts` (+ `dates.spec.ts`) — `todayInRome`, `isValidCalendarDate`, `formatDbDate`.

**Backend — modello**
- Modify: `apps/api/prisma/schema.prisma` — model `Booking` + 4 enum + relazioni inverse.
- Create: `apps/api/prisma/migrations/<ts>_bookings/migration.sql` — tabella + enum (generata) **+ RLS grezza appesa a mano**.

**Backend — dominio prenotazioni**
- Create: `apps/api/src/bookings/booking.availability.ts` (+ `.spec.ts`) — `slotsOverlap`, `dateRangesOverlap` (puri).
- Create: `apps/api/src/bookings/booking.projection.ts` (+ `.spec.ts`) — `toBookingDTO` (puro).
- Create: `apps/api/src/bookings/dto/is-calendar-date.ts` — decoratore `@IsCalendarDate()`.
- Create: `apps/api/src/bookings/dto/create-booking.dto.ts`, `apps/api/src/bookings/dto/bookings-query.dto.ts`.
- Create: `apps/api/src/bookings/bookings.service.ts`, `bookings.controller.ts`, `bookings.module.ts`.
- Modify: `apps/api/src/app.module.ts` — importa `BookingsModule`.

**Backend — mappa slot-aware**
- Modify: `apps/api/src/map/map.projection.ts` (+ `map.projection.spec.ts`) — `MapSource.bookings`, derivazione stato, `resolveDate`→`todayInRome`.
- Modify: `apps/api/src/map/map.service.ts` — carica le prenotazioni confermate del giorno.

**Backend — e2e**
- Create: `apps/api/test/bookings.e2e-spec.ts`.

**Frontend**
- Modify: `apps/web-staff/src/lib/queryKeys.ts` — `bookings(tenantId, date)`.
- Create: `apps/web-staff/src/features/bookings/useBookings.ts`.
- Modify: `apps/web-staff/src/features/map/MapView.vue` (+ `MapView.spec.ts`).
- Modify: `apps/web-staff/src/mocks/server.ts` — handler `/api/bookings` (solo test).

**Docs**
- Modify: `README.md`, `docs/design/data-model.md`, spec status; nuovo handoff.

---

## Task 1: Contratti additivi

**Files:**
- Modify: `packages/contracts/src/index.ts` (append in fondo, dopo `LoginResponse`)

- [ ] **Step 1: Aggiungi i tipi**

In coda a `packages/contracts/src/index.ts`:

```ts
/** Tipo di prenotazione (ADR-0006). A1 usa solo `daily`. */
export type BookingType = 'daily' | 'periodic' | 'subscription';

/** Stato del ciclo di vita. A1: `confirmed` alla creazione, `cancelled` all'annullo. */
export type BookingStatus = 'confirmed' | 'cancelled';

/** Stato incasso base (ADR-0011). A1: sempre `unpaid`. */
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

/** Metodo di pagamento (ADR-0011). A1: null. */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

/** DTO di una prenotazione. Date ISO yyyy-mm-dd. */
export interface BookingDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  type: BookingType;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  amountCollected: number;
}

/** Input per creare una prenotazione giornaliera (prezzo digitato a mano in A1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  date: string; // ISO yyyy-mm-dd
  totalPrice: number;
}
```

- [ ] **Step 2: Verifica build dei contracts**

Run: `pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): DTO e tipi additivi per Booking (slice A1)"
```

---

## Task 2: Utility date (ADR-0031)

**Files:**
- Create: `apps/api/src/common/dates.ts`
- Test: `apps/api/src/common/dates.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`apps/api/src/common/dates.spec.ts`:

```ts
import { isValidCalendarDate, formatDbDate, todayInRome } from './dates';

describe('isValidCalendarDate', () => {
  it('accetta una data reale', () => {
    expect(isValidCalendarDate('2026-07-15')).toBe(true);
  });
  it('rifiuta forma sbagliata', () => {
    expect(isValidCalendarDate('15-07-2026')).toBe(false);
  });
  it('rifiuta una data calendariale impossibile', () => {
    expect(isValidCalendarDate('2026-13-40')).toBe(false);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
  });
});

describe('formatDbDate', () => {
  it('serializza una @db.Date (mezzanotte UTC) senza off-by-one', () => {
    expect(formatDbDate(new Date('2026-07-15T00:00:00Z'))).toBe('2026-07-15');
  });
});

describe('todayInRome', () => {
  it('ritorna yyyy-mm-dd', () => {
    expect(todayInRome()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `pnpm --filter @coralyn/api test -- dates.spec`
Expected: FAIL — modulo `./dates` non trovato.

- [ ] **Step 3: Implementa**

`apps/api/src/common/dates.ts`:

```ts
/** Oggi come data di calendario nel fuso dello Stabilimento (Europe/Rome). ADR-0031. */
export function todayInRome(): string {
  // 'en-CA' produce il formato ISO yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

/** True se `s` è 'yyyy-mm-dd' E una data di calendario reale (no 2026-13-40). */
export function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Serializza una colonna @db.Date (mezzanotte UTC) in 'yyyy-mm-dd'. Mai metodi locali. */
export function formatDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Costruisce il valore da scrivere in una colonna @db.Date a partire da 'yyyy-mm-dd'. */
export function toDbDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `pnpm --filter @coralyn/api test -- dates.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/dates.ts apps/api/src/common/dates.spec.ts
git commit -m "feat(api): utility date in Europe/Rome + UTC round-trip (ADR-0031)"
```

---

## Task 3: Modello Prisma `Booking` + migrazione + RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_bookings/migration.sql`

- [ ] **Step 1: Aggiungi enum e model in `schema.prisma`**

Dopo l'enum `Role`, aggiungi i 4 enum:

```prisma
enum BookingType {
  daily
  periodic
  subscription
}

enum BookingStatus {
  confirmed
  cancelled
}

enum PaymentStatus {
  unpaid
  partial
  paid
}

enum PaymentMethod {
  cash
  card
  transfer
  other
}
```

In fondo al file, il model:

```prisma
model Booking {
  id                String         @id @default(uuid()) @db.Uuid
  establishmentId   String         @db.Uuid
  customerId        String         @db.Uuid
  umbrellaId        String         @db.Uuid
  timeSlotId        String         @db.Uuid
  previousBookingId String?        @db.Uuid // rinnovo self-link (ADR-0012); null in A1
  startDate         DateTime       @db.Date
  endDate           DateTime       @db.Date
  type              BookingType
  status            BookingStatus
  totalPrice        Decimal        @db.Decimal(10, 2)
  extras            Json?          @db.JsonB
  paymentStatus     PaymentStatus  @default(unpaid)
  amountCollected   Decimal        @default(0) @db.Decimal(10, 2)
  paymentMethod     PaymentMethod?
  collectionDate    DateTime?      @db.Date
  createdAt         DateTime       @default(now())

  establishment    Establishment @relation(fields: [establishmentId], references: [id])
  customer         Customer      @relation(fields: [customerId], references: [id])
  umbrella         Umbrella      @relation(fields: [umbrellaId], references: [id])
  timeSlot         TimeSlot      @relation(fields: [timeSlotId], references: [id])
  previousBooking  Booking?      @relation("BookingRenewal", fields: [previousBookingId], references: [id])
  renewals         Booking[]     @relation("BookingRenewal")

  @@index([establishmentId])
  @@index([umbrellaId])
  @@index([establishmentId, startDate, endDate])
}
```

Aggiungi le relazioni inverse ai model esistenti:
- `Establishment`: `bookings Booking[]`
- `Customer`: `bookings Booking[]`
- `Umbrella`: `bookings Booking[]`
- `TimeSlot`: `bookings Booking[]`

- [ ] **Step 2: Genera la migrazione SENZA applicarla**

Run (PowerShell, una riga, DB dev su 5433):
```
$env:DATABASE_URL='postgresql://coralyn_app:coralyn_app_pw@localhost:5433/coralyn_dev?schema=public'; pnpm --filter @coralyn/api exec prisma migrate dev --create-only --name bookings
```
Expected: crea `prisma/migrations/<ts>_bookings/migration.sql` (CREATE TYPE enum + CREATE TABLE "Booking"), **non** applicata.

- [ ] **Step 3: Appendi la RLS grezza alla migrazione**

In coda a `apps/api/prisma/migrations/<ts>_bookings/migration.sql` (stesso pattern di `20260630104422_init`):

```sql
-- RLS tenant_isolation (Prisma non la genera) sulla nuova tabella tenant-scoped.
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Booking"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 4: Applica la migrazione e genera il client**

Run:
```
$env:DATABASE_URL='postgresql://coralyn_app:coralyn_app_pw@localhost:5433/coralyn_dev?schema=public'; pnpm --filter @coralyn/api exec prisma migrate dev; pnpm --filter @coralyn/api exec prisma generate
```
Expected: migrazione applicata, `Booking` creata con RLS; client rigenerato (tipo `Booking` disponibile).

- [ ] **Step 5: Verifica build**

Run: `pnpm --filter @coralyn/api build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): model Booking + enum + RLS tenant_isolation (migrazione bookings)"
```

---

## Task 4: Invariante di disponibilità (funzioni pure)

**Files:**
- Create: `apps/api/src/bookings/booking.availability.ts`
- Test: `apps/api/src/bookings/booking.availability.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`apps/api/src/bookings/booking.availability.spec.ts`:

```ts
import { slotsOverlap, dateRangesOverlap } from './booking.availability';

const t = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);
const morning = { startTime: t('08:00'), endTime: t('13:00') };
const afternoon = { startTime: t('13:00'), endTime: t('19:00') };
const fullDay = { startTime: t('08:00'), endTime: t('19:00') };

describe('slotsOverlap (semiaperto [start, end))', () => {
  it('fasce contigue al bordo (13:00) NON si sovrappongono', () => {
    expect(slotsOverlap(morning, afternoon)).toBe(false);
  });
  it('stessa fascia si sovrappone', () => {
    expect(slotsOverlap(morning, morning)).toBe(true);
  });
  it('giornata intera copre mattina e pomeriggio', () => {
    expect(slotsOverlap(fullDay, morning)).toBe(true);
    expect(slotsOverlap(fullDay, afternoon)).toBe(true);
  });
});

describe('dateRangesOverlap (estremi inclusi)', () => {
  const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
  it('intervalli intersecanti', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-20'), d('2026-07-15'), d('2026-07-15'))).toBe(true);
  });
  it('intervalli disgiunti', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-12'), d('2026-07-13'), d('2026-07-14'))).toBe(false);
  });
  it('estremo a contatto è incluso', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-12'), d('2026-07-12'), d('2026-07-14'))).toBe(true);
  });
});
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `pnpm --filter @coralyn/api test -- booking.availability`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

`apps/api/src/bookings/booking.availability.ts`:

```ts
/** Intervallo orario di una fascia (valori @db.Time letti come Date a 1970-01-01). */
export interface SlotInterval {
  startTime: Date;
  endTime: Date;
}

/** Due fasce si sovrappongono? Intervalli semiaperti [start, end): contigue non collidono. */
export function slotsOverlap(a: SlotInterval, b: SlotInterval): boolean {
  return a.startTime.getTime() < b.endTime.getTime() && b.startTime.getTime() < a.endTime.getTime();
}

/** Due intervalli di date si sovrappongono? Estremi inclusi. */
export function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `pnpm --filter @coralyn/api test -- booking.availability`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking.availability.ts apps/api/src/bookings/booking.availability.spec.ts
git commit -m "feat(api): invariante disponibilita a slot (funzioni pure, ADR-0013)"
```

---

## Task 5: Proiezione `Booking → BookingDTO` (pura)

**Files:**
- Create: `apps/api/src/bookings/booking.projection.ts`
- Test: `apps/api/src/bookings/booking.projection.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

`apps/api/src/bookings/booking.projection.spec.ts`:

```ts
import { Prisma } from '@prisma/client';
import { toBookingDTO } from './booking.projection';

const row = {
  id: 'b1',
  establishmentId: 'e1',
  customerId: 'c1',
  umbrellaId: 'u1',
  timeSlotId: 's1',
  previousBookingId: null,
  startDate: new Date('2026-07-15T00:00:00Z'),
  endDate: new Date('2026-07-15T00:00:00Z'),
  type: 'daily' as const,
  status: 'confirmed' as const,
  totalPrice: new Prisma.Decimal('28.00'),
  extras: null,
  paymentStatus: 'unpaid' as const,
  amountCollected: new Prisma.Decimal('0'),
  paymentMethod: null,
  collectionDate: null,
  createdAt: new Date(),
};

describe('toBookingDTO', () => {
  it('mappa date in yyyy-mm-dd e Decimal in number', () => {
    const dto = toBookingDTO(row);
    expect(dto).toEqual({
      id: 'b1', customerId: 'c1', umbrellaId: 'u1', timeSlotId: 's1',
      startDate: '2026-07-15', endDate: '2026-07-15',
      type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0,
    });
  });
});
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `pnpm --filter @coralyn/api test -- booking.projection`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa**

`apps/api/src/bookings/booking.projection.ts`:

```ts
import type { Booking } from '@prisma/client';
import type { BookingDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una riga Booking nel DTO condiviso (Decimal→number, Date→yyyy-mm-dd). */
export function toBookingDTO(b: Booking): BookingDTO {
  return {
    id: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    startDate: formatDbDate(b.startDate),
    endDate: formatDbDate(b.endDate),
    type: b.type,
    status: b.status,
    totalPrice: Number(b.totalPrice),
    paymentStatus: b.paymentStatus,
    amountCollected: Number(b.amountCollected),
  };
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `pnpm --filter @coralyn/api test -- booking.projection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking.projection.ts apps/api/src/bookings/booking.projection.spec.ts
git commit -m "feat(api): proiezione Booking -> BookingDTO (pura)"
```

---

## Task 6: Mappa slot-aware (proiezione + service)

**Files:**
- Modify: `apps/api/src/map/map.projection.ts`
- Modify: `apps/api/src/map/map.projection.spec.ts`
- Modify: `apps/api/src/map/map.service.ts`

- [ ] **Step 1: Aggiorna il test della proiezione**

In `apps/api/src/map/map.projection.spec.ts`: aggiungi `bookings: []` al `source` esistente (lo `MapSource` ora lo richiede) e correggi il test di `resolveDate` (ora usa Europe/Rome). Aggiungi i nuovi casi:

```ts
// In testa al file:
import { todayInRome } from '../common/dates';

// Nel `source`, aggiungi la proprietà:
//   bookings: [],

// Sostituisci il test 'resolveDate' con:
it('resolveDate: echoes if provided, defaults to today (Europe/Rome) if absent', () => {
  expect(resolveDate('2026-07-15')).toBe('2026-07-15');
  expect(resolveDate(undefined)).toBe(todayInRome());
});

// Nuovi test di derivazione stato:
it('una prenotazione daily accende lo slot sovrapposto, gli altri restano free', () => {
  const withBooking = {
    ...source,
    bookings: [{ umbrellaId: 'u1', timeSlotId: 's1', type: 'daily' as const }],
  };
  const dto = projectDayMap('2026-07-15', withBooking);
  const u1 = dto.sectors[0].rows[0].umbrellas[0];
  expect(u1.stateBySlot).toEqual({ s1: 'daily', s2: 'free' });
  // l'altro ombrellone resta libero
  expect(dto.sectors[0].rows[0].umbrellas[1].stateBySlot).toEqual({ s1: 'free', s2: 'free' });
});

it('due confermate sullo stesso slot: stato deterministico (prima per createdAt)', () => {
  const withBookings = {
    ...source,
    bookings: [
      { umbrellaId: 'u1', timeSlotId: 's1', type: 'daily' as const },
      { umbrellaId: 'u1', timeSlotId: 's1', type: 'subscription' as const },
    ],
  };
  const dto = projectDayMap('2026-07-15', withBookings);
  // la prima in lista (già ordinata per createdAt dal service) vince
  expect(dto.sectors[0].rows[0].umbrellas[0].stateBySlot.s1).toBe('daily');
});
```

> Nota: nel `source` di test gli `startTime`/`endTime` delle fasce sono `new Date()` uguali → per renderli coerenti col confronto a intervalli, impostali a orari distinti: `s1` 08–13, `s2` 13–19 (vedi sotto). Aggiorna le due righe `timeSlots` del `source`:
> ```ts
> { id: 's1', establishmentId: 'e', name: 'Mattina', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T13:00:00Z'), sortOrder: 1 },
> { id: 's2', establishmentId: 'e', name: 'Pomeriggio', startTime: new Date('1970-01-01T13:00:00Z'), endTime: new Date('1970-01-01T19:00:00Z'), sortOrder: 2 },
> ```

- [ ] **Step 2: Esegui i test (devono fallire)**

Run: `pnpm --filter @coralyn/api test -- map.projection`
Expected: FAIL — `bookings` non in `MapSource`, `resolveDate` ancora UTC.

- [ ] **Step 3: Implementa la proiezione slot-aware**

Sostituisci `apps/api/src/map/map.projection.ts` con:

```ts
import type { Row, Sector, TimeSlot, Umbrella, UmbrellaType } from '@prisma/client';
import type {
  BookingType,
  DayMapDTO,
  SectorDTO,
  SlotState,
  TimeSlotDTO,
  UmbrellaDTO,
  UmbrellaTypeDTO,
} from '@coralyn/contracts';
import { slotsOverlap } from '../bookings/booking.availability';
import { todayInRome } from '../common/dates';

type RowWithUmbrellas = Row & { umbrellas: Umbrella[] };
type SectorWithRows = Sector & { rows: RowWithUmbrellas[] };

/** Prenotazione confermata che copre la data, pre-filtrata e ordinata (per createdAt) dal service. */
export interface BookingForMap {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;
}

export interface MapSource {
  umbrellaTypes: UmbrellaType[];
  timeSlots: TimeSlot[];
  sectors: SectorWithRows[];
  bookings: BookingForMap[];
}

/** Effective date: requested or today (Europe/Rome). ADR-0031. */
export function resolveDate(date?: string): string {
  return date ?? todayInRome();
}

const STATE_BY_TYPE: Record<BookingType, SlotState> = {
  daily: 'daily',
  periodic: 'booked',
  subscription: 'season',
};

export function projectDayMap(date: string, source: MapSource): DayMapDTO {
  const timeSlots: TimeSlotDTO[] = source.timeSlots.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder }));
  const slotById = new Map(source.timeSlots.map((s) => [s.id, s]));
  const umbrellaTypes: UmbrellaTypeDTO[] = source.umbrellaTypes.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    icon: t.icon ?? undefined,
  }));

  // stato di (umbrella, slot): la PRIMA prenotazione la cui fascia si sovrappone vince
  // (le `bookings` arrivano già ordinate per createdAt dal service).
  const stateFor = (umbrellaId: string, slot: TimeSlot): SlotState => {
    for (const b of source.bookings) {
      if (b.umbrellaId !== umbrellaId) continue;
      const bookedSlot = slotById.get(b.timeSlotId);
      if (bookedSlot && slotsOverlap(bookedSlot, slot)) return STATE_BY_TYPE[b.type];
    }
    return 'free';
  };

  const sectors: SectorDTO[] = source.sectors.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
    rows: s.rows.map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sortOrder,
      umbrellas: r.umbrellas.map(
        (u): UmbrellaDTO => ({
          id: u.id,
          label: u.label,
          umbrellaTypeId: u.umbrellaTypeId,
          rowId: u.rowId,
          stateBySlot: Object.fromEntries(source.timeSlots.map((slot) => [slot.id, stateFor(u.id, slot)])),
        }),
      ),
    })),
  }));
  return { date, umbrellaTypes, timeSlots, sectors };
}
```

- [ ] **Step 4: Carica le prenotazioni nel service**

Sostituisci il corpo di `getDayMap` in `apps/api/src/map/map.service.ts` (aggiungi il caricamento bookings):

```ts
async getDayMap(date?: string): Promise<DayMapDTO> {
  const tenantId = this.tenant.require();
  const day = resolveDate(date);
  const source: MapSource = await this.prisma.forTenant(tenantId, async (tx) => {
    const umbrellaTypes = await tx.umbrellaType.findMany({ orderBy: { sortOrder: 'asc' } });
    const timeSlots = await tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' } });
    const sectors = await tx.sector.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        rows: {
          orderBy: { sortOrder: 'asc' },
          include: { umbrellas: { orderBy: { logicalOrder: 'asc' } } },
        },
      },
    });
    const dayDate = new Date(`${day}T00:00:00Z`);
    const bookingRows = await tx.booking.findMany({
      where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
      orderBy: { createdAt: 'asc' },
      select: { umbrellaId: true, timeSlotId: true, type: true },
    });
    return { umbrellaTypes, timeSlots, sectors, bookings: bookingRows };
  });
  return projectDayMap(day, source);
}
```

> `BookingForMap` combacia con la `select` (`umbrellaId/timeSlotId/type`). `resolveDate` è già importato.

- [ ] **Step 5: Esegui i test (devono passare)**

Run: `pnpm --filter @coralyn/api test -- map.projection`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/map/map.projection.ts apps/api/src/map/map.projection.spec.ts apps/api/src/map/map.service.ts
git commit -m "feat(api): mappa slot-aware dalle prenotazioni confermate + resolveDate Europe/Rome"
```

---

## Task 7: DTO di input (validazione, calendar-valid date)

**Files:**
- Create: `apps/api/src/bookings/dto/is-calendar-date.ts`
- Create: `apps/api/src/bookings/dto/create-booking.dto.ts`
- Create: `apps/api/src/bookings/dto/bookings-query.dto.ts`

- [ ] **Step 1: Decoratore `@IsCalendarDate()`**

`apps/api/src/bookings/dto/is-calendar-date.ts`:

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCalendarDate } from '../../common/dates';

/** Valida 'yyyy-mm-dd' come data di calendario reale (no 2026-13-40). */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: { message: 'date must be a real yyyy-mm-dd calendar date', ...options },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCalendarDate(value);
        },
      },
    });
  };
}
```

- [ ] **Step 2: `CreateBookingDto`**

`apps/api/src/bookings/dto/create-booking.dto.ts`:

```ts
import { IsNumber, IsUUID, Max, Min } from 'class-validator';
import type { CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

export class CreateBookingDto implements CreateBookingInput {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  umbrellaId!: string;

  @IsUUID()
  timeSlotId!: string;

  @IsCalendarDate()
  date!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  totalPrice!: number;
}
```

- [ ] **Step 3: `BookingsQueryDto`**

`apps/api/src/bookings/dto/bookings-query.dto.ts`:

```ts
import { IsOptional } from 'class-validator';
import { IsCalendarDate } from './is-calendar-date';

export class BookingsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
```

- [ ] **Step 4: Verifica build**

Run: `pnpm --filter @coralyn/api build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/dto
git commit -m "feat(api): DTO CreateBooking/BookingsQuery + @IsCalendarDate"
```

---

## Task 8: `BookingsService`

**Files:**
- Create: `apps/api/src/bookings/bookings.service.ts`

- [ ] **Step 1: Implementa il service**

`apps/api/src/bookings/bookings.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { BookingDTO, CreateBookingInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toBookingDTO } from './booking.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { toDbDate } from '../common/dates';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Prenotazioni confermate del giorno. */
  async listByDate(date: string): Promise<BookingDTO[]> {
    const tenantId = this.tenant.require();
    const dayDate = toDbDate(date);
    const rows = await this.prisma.forTenant(tenantId, (tx) =>
      tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: dayDate }, endDate: { gte: dayDate } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map(toBookingDTO);
  }

  /** Crea una prenotazione GIORNALIERA (type=daily, status=confirmed). */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const day = toDbDate(input.date);

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // FK nel tenant (RLS: fuori tenant → null → 422)
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }

      // Anti-overlap (ADR-0013): confermate stesso ombrellone, date intersecanti, fascia sovrapposta.
      const sameUmbrella = await tx.booking.findMany({
        where: { umbrellaId: input.umbrellaId, status: 'confirmed' },
        include: { timeSlot: true },
      });
      const conflict = sameUmbrella.some(
        (b) =>
          dateRangesOverlap(b.startDate, b.endDate, day, day) &&
          slotsOverlap(b.timeSlot, slot),
      );
      if (conflict) {
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      }

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
          totalPrice: input.totalPrice,
        },
      });
    });
    return toBookingDTO(created);
  }

  /** Annulla (soft, status=cancelled). Idempotente sul già annullato. */
  async cancel(id: string): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.status === 'cancelled') return existing;
      return tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
    });
    if (!updated) throw new NotFoundException('Prenotazione non trovata');
    return toBookingDTO(updated);
  }
}
```

- [ ] **Step 2: Verifica build**

Run: `pnpm --filter @coralyn/api build`
Expected: build OK (il service è coperto dagli e2e in Task 10).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): BookingsService (create giornaliera + anti-overlap + cancel)"
```

---

## Task 9: Controller + Module + wiring

**Files:**
- Create: `apps/api/src/bookings/bookings.controller.ts`
- Create: `apps/api/src/bookings/bookings.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Controller**

`apps/api/src/bookings/bookings.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import type { BookingDTO } from '@coralyn/contracts';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsQueryDto } from './dto/bookings-query.dto';
import { resolveDate } from '../map/map.projection';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@Query() query: BookingsQueryDto): Promise<BookingDTO[]> {
    return this.bookings.listByDate(resolveDate(query.date));
  }

  @Post()
  create(@Body() body: CreateBookingDto): Promise<BookingDTO> {
    return this.bookings.create(body);
  }

  @Delete(':id')
  cancel(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.cancel(id);
  }
}
```

- [ ] **Step 2: Module**

`apps/api/src/bookings/bookings.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 3: Importa in `AppModule`**

In `apps/api/src/app.module.ts`: importa `BookingsModule` e aggiungilo all'array `imports` (accanto a `MapModule`).

- [ ] **Step 4: Verifica build**

Run: `pnpm --filter @coralyn/api build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): endpoint bookings (POST/GET/DELETE) + wiring AppModule"
```

---

## Task 10: e2e prenotazioni

**Files:**
- Create: `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Allinea il DB di test allo schema**

Run (PowerShell, una riga; usa `.env.test` per `coralyn_test`):
```
$env:DATABASE_URL='postgresql://coralyn_app:coralyn_app_pw@localhost:5433/coralyn_test?schema=public'; pnpm --filter @coralyn/api exec prisma migrate deploy
```
Expected: migrazione `bookings` applicata a `coralyn_test`.

- [ ] **Step 2: Scrivi gli e2e**

`apps/api/test/bookings.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { cleanMapTenant, seedMapTenant, type MapSeedIds } from './helpers/seed-map';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;
  let superToken: string;
  let ids: MapSeedIds;
  let customerId: string;
  const D = '2026-07-15';

  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Book A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Book B' } })).id;
    await createUser(prisma, { email: 'admin.b1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'admin.b2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    await createUser(prisma, { email: 'super.b@e2e.test', password: 'pws', role: Role.superuser, establishmentId: null });
    token1 = await login(app, 'admin.b1@e2e.test', 'pw1');
    token2 = await login(app, 'admin.b2@e2e.test', 'pw2');
    superToken = await login(app, 'super.b@e2e.test', 'pws');
    ids = await seedMapTenant(prisma, s1);
    customerId = (
      await prisma.forTenant(s1, (tx) =>
        tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
      )
    ).id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.booking.deleteMany({}));
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.user.deleteMany({ where: { email: { in: ['admin.b1@e2e.test', 'admin.b2@e2e.test', 'super.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const body = (over: Partial<Record<string, unknown>> = {}) => ({
    customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, date: D, totalPrice: 28, ...over,
  });

  it('senza token → 401', async () => {
    await request(app.getHttpServer()).post('/api/bookings').send(body()).expect(401);
  });

  it('crea una giornaliera → 201 e la mappa mostra daily sulla fascia', async () => {
    const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body()).expect(201);
    expect(res.body.type).toBe('daily');
    expect(res.body.status).toBe('confirmed');
    expect(res.body.totalPrice).toBe(28);

    const map = await request(app.getHttpServer()).get(`/api/map?date=${D}`).set(...bearer(token1)).expect(200);
    const u1 = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === ids.u1);
    expect(u1.stateBySlot[ids.slotMorning]).toBe('daily');
    expect(u1.stateBySlot[ids.slotAfternoon]).toBe('free');
  });

  it('GET /bookings?date ritorna la confermata', async () => {
    const res = await request(app.getHttpServer()).get(`/api/bookings?date=${D}`).set(...bearer(token1)).expect(200);
    expect(res.body.some((b: { umbrellaId: string }) => b.umbrellaId === ids.u1)).toBe(true);
  });

  it('anti-overlap: stessa fascia → 409; fascia diversa → 201', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body()).expect(409);
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ timeSlotId: ids.slotAfternoon })).expect(201);
  });

  it('isolamento: s2 non vede le prenotazioni di s1', async () => {
    const res = await request(app.getHttpServer()).get(`/api/bookings?date=${D}`).set(...bearer(token2)).expect(200);
    expect(res.body).toEqual([]);
  });

  it('isolamento: s2 non può prenotare un ombrellone di s1 → 422', async () => {
    // customerId/umbrellaId sono di s1: per s2 (RLS) non esistono.
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token2)).send(body({ date: '2026-07-16' })).expect(422);
  });

  it('superuser (no tenant) → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(superToken)).send(body({ date: '2026-07-17' })).expect(400);
  });

  it('validazione: data calendariale impossibile → 400; prezzo negativo → 400', async () => {
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ date: '2026-13-40' })).expect(400);
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ totalPrice: -5, date: '2026-07-18' })).expect(400);
  });

  it('DELETE annulla → la mappa torna free e si può ricreare', async () => {
    const created = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, date: '2026-07-19' })).expect(201);
    await request(app.getHttpServer()).delete(`/api/bookings/${created.body.id}`).set(...bearer(token1)).expect(200);
    const map = await request(app.getHttpServer()).get('/api/map?date=2026-07-19').set(...bearer(token1)).expect(200);
    const u2 = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === ids.u2);
    expect(u2.stateBySlot[ids.slotMorning]).toBe('free');
    // ricreabile dopo l'annullo
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1)).send(body({ umbrellaId: ids.u2, date: '2026-07-19' })).expect(201);
  });
});
```

- [ ] **Step 3: Esegui gli e2e**

Run: `pnpm --filter @coralyn/api test:e2e -- bookings`
Expected: PASS (tutti i casi). Se "table Booking does not exist" → ripeti Step 1 (migrate deploy su `coralyn_test`).

- [ ] **Step 4: Esegui l'intera suite e2e (no regressioni)**

Run: `pnpm --filter @coralyn/api test:e2e`
Expected: PASS — i 22 preesistenti + i nuovi bookings.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e bookings (create/anti-overlap/isolamento/validazione/cancel)"
```

---

## Task 11: FE — query keys + composable `useBookings`

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Create: `apps/web-staff/src/features/bookings/useBookings.ts`

- [ ] **Step 1: Aggiungi la query key**

In `apps/web-staff/src/lib/queryKeys.ts`, aggiungi dentro l'oggetto:

```ts
  bookings: (tenantId: string, date: string) => ['bookings', tenantId, date] as const,
```

- [ ] **Step 2: Composable**

`apps/web-staff/src/features/bookings/useBookings.ts`:

```ts
import { computed, type Ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { BookingDTO, CreateBookingInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useDayBookings(date: Ref<string>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.bookings(session.establishmentId, date.value)),
    queryFn: () => apiFetch<BookingDTO[]>(`/bookings?date=${date.value}`),
  });
}

export function useCreateBooking() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch<BookingDTO>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
      qc.invalidateQueries({ queryKey: queryKeys.dayMap(session.establishmentId, session.activeDate) });
    },
  });
}

export function useCancelBooking() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<BookingDTO>(`/bookings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
      qc.invalidateQueries({ queryKey: queryKeys.dayMap(session.establishmentId, session.activeDate) });
    },
  });
}
```

- [ ] **Step 3: Verifica typecheck**

Run: `pnpm --filter @coralyn/web-staff typecheck`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/bookings/useBookings.ts
git commit -m "feat(web-staff): composable useBookings + query key bookings"
```

---

## Task 12: FE — collega la `MapView` al backend reale

**Files:**
- Modify: `apps/web-staff/src/mocks/server.ts`
- Modify: `apps/web-staff/src/features/map/MapView.vue`
- Modify: `apps/web-staff/src/features/map/MapView.spec.ts`

- [ ] **Step 1: Handler MSW per i test (in-memory bookings)**

In `apps/web-staff/src/mocks/server.ts`, dentro `setupServer(...)`, aggiungi prima della chiusura:

```ts
  http.get('/api/bookings', () => HttpResponse.json([])),
  http.post('/api/bookings', async ({ request }) => {
    const b = (await request.json()) as { customerId: string; umbrellaId: string; timeSlotId: string; date: string; totalPrice: number };
    return HttpResponse.json(
      { id: 'bk-1', ...b, startDate: b.date, endDate: b.date, type: 'daily', status: 'confirmed', paymentStatus: 'unpaid', amountCollected: 0 },
      { status: 201 },
    );
  }),
  http.delete('/api/bookings/:id', () => new HttpResponse(null, { status: 200 })),
```

- [ ] **Step 2: Aggiorna lo script di `MapView.vue`**

In `apps/web-staff/src/features/map/MapView.vue`, nello `<script setup>`:

1. Aggiungi gli import e i composable:
```ts
import { useDayBookings, useCreateBooking, useCancelBooking } from '@/features/bookings/useBookings';
import { useCustomers } from '@/features/customers/useCustomers';
import { useSessionStore } from '@/stores/session';
import { storeToRefs } from 'pinia';
```
2. Dopo `const { data: map, isLoading } = useDayMap();`:
```ts
const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const { data: bookings } = useDayBookings(activeDate);
const { data: customers } = useCustomers();
const createBooking = useCreateBooking();
const cancelBooking = useCancelBooking();
```
3. Sostituisci il **mock seam** `booking` (righe ~54-58) con il dato reale per la fascia selezionata. La modale usa la fascia scelta; il drawer mostra la prenotazione della prima fascia occupata:
```ts
const selectedSlotId = ref<string>('');
watch(timeSlots, (list) => { if (!selectedSlotId.value && list.length) selectedSlotId.value = list[0].id; }, { immediate: true });

const currentBooking = computed<BookingDTO | null>(() => {
  if (!sel.value) return null;
  return (bookings.value ?? []).find(
    (b) => b.umbrellaId === sel.value!.u.id && b.timeSlotId === selectedSlotId.value,
  ) ?? null;
});
```
(importa il tipo: `import type { UmbrellaDTO, SlotState, BookingDTO } from '@coralyn/contracts';`)
4. Sostituisci lo stato della modale con i campi reali e l'handler di creazione:
```ts
const customerId = ref<string>('');
const price = ref<number>(0);
// pre-seleziona una fascia libera dell'ombrellone selezionato
function firstFreeSlot(): string {
  if (!sel.value) return timeSlots.value[0]?.id ?? '';
  const u = sel.value.u;
  const free = timeSlots.value.find((s) => (u.stateBySlot[s.id] ?? 'free') === 'free');
  return free?.id ?? timeSlots.value[0]?.id ?? '';
}
function openModal(): void {
  selectedSlotId.value = firstFreeSlot();
  customerId.value = '';
  price.value = 0;
  modalBooking.value = true;
}
function slotIsBusy(slotId: string): boolean {
  return sel.value ? (sel.value.u.stateBySlot[slotId] ?? 'free') !== 'free' : false;
}
async function confirmBooking(): Promise<void> {
  if (!sel.value || !customerId.value) return;
  await createBooking.mutateAsync({
    customerId: customerId.value,
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    date: activeDate.value,
    totalPrice: price.value,
  });
  modalBooking.value = false;
}
async function onCancel(): Promise<void> {
  if (currentBooking.value) await cancelBooking.mutateAsync(currentBooking.value.id);
}
```
5. **Rimuovi** le costanti mock non più usate: `packSel`, `packOpts`, `slotSel`, `slotOpts`, e il vecchio `booking` computed.

- [ ] **Step 3: Aggiorna il template di `MapView.vue`**

- Il bottone "Nuova prenotazione" del drawer: `@click="modalBooking = true"` → `@click="openModal"`.
- Il blocco `<template v-if="booking">` del drawer → `v-if="currentBooking"`, usando `currentBooking.customerId`/`totalPrice` (mostra il prezzo con `currentBooking.totalPrice`); "Annulla prenotazione" → `@click="onCancel"`.
- La **Modale** "Nuova prenotazione": sostituisci i `SegmentedControl` di Pacchetto/Fascia con:
  - **Cliente**: `<select v-model="customerId">` con `<option v-for="c in customers ?? []" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>`; se `(customers ?? []).length === 0` mostra un link a `/customers` ("Crea un cliente").
  - **Fascia**: `SegmentedControl v-model="selectedSlotId"` con opzioni da `timeSlots.map((s) => ({ value: s.id, label: s.name }))`; disabilita le occupate (`slotIsBusy(s.id)`).
  - **Prezzo**: `<input type="number" min="0" step="0.01" v-model.number="price" />`.
  - Bottone "Conferma prenotazione" → `@click="confirmBooking"`.
- Rimuovi il selettore Pacchetto (fuori A1).

- [ ] **Step 4: Aggiorna `MapView.spec.ts`**

Adegua la spec esistente: con i nuovi handler MSW `/api/bookings` che ritornano `[]`, la mappa resta tutta `free` (comportamento invariato per il test di rendering). Aggiungi un test che apre il drawer, apre la modale, seleziona un cliente (servirà un mock `/api/customers` già presente in `server.ts`), conferma e verifica che `POST /api/bookings` sia stato invocato (es. spia su `apiFetch` o verifica che la modale si chiuda). Mantieni verde la suite.

```ts
// esempio minimale: la modale si apre dal drawer e si chiude alla conferma
it('apre la modale di prenotazione dal drawer', async () => {
  // ...monta la view, attende il caricamento mappa, clicca una UmbrellaCell,
  // clicca "Nuova prenotazione", verifica che la Modal sia visibile.
});
```

- [ ] **Step 5: Pulisci Vite ed esegui i test FE**

Run (PowerShell): `Remove-Item -Recurse -Force apps/web-staff/node_modules/.vite -ErrorAction SilentlyContinue; pnpm --filter @coralyn/web-staff test`
Expected: PASS (40 preesistenti adeguati + nuovi).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): MapView collega create/cancel prenotazione al backend reale"
```

---

## Task 13: Documentazione

**Files:**
- Modify: `README.md`, `docs/design/data-model.md`, `docs/specs/2026-06-30-bookings-daily-design.md`
- Create: `docs/handoff/2026-06-30-bookings-a1-done.md`

- [ ] **Step 1: Aggiorna i doc**

- `README.md`: stato → "Prenotazioni giornaliere (A1) implementate; mappa accesa".
- `data-model.md`: nota che `Booking` è **implementata** (sola `daily` in A1); `packageId` resta **differita** finché non arriva `Package` (A3), come da spec §2.
- spec A1: header **Stato → Implementata** (link al piano).
- Nuovo handoff `2026-06-30-bookings-a1-done.md`: cosa è stato fatto, nuovi conteggi test, prossimo slice (A2 incasso), insidie incontrate.

- [ ] **Step 2: Commit**

```bash
git add README.md docs/design/data-model.md docs/specs/2026-06-30-bookings-daily-design.md docs/handoff/2026-06-30-bookings-a1-done.md
git commit -m "docs: A1 prenotazioni implementata (README/data-model/handoff)"
```

---

## Task 14: Verifica finale (DoD)

- [ ] **Step 1: Build + lint dell'intero monorepo**

Run: `pnpm -r build`
Expected: tutti i pacchetti verdi.

Run: `pnpm exec eslint .`
Expected: nessun errore.

- [ ] **Step 2: Suite test complete**

Run: `pnpm --filter @coralyn/api test` (unit) → PASS (9 preesistenti + dates/availability/projection/map).
Run: `pnpm --filter @coralyn/api test:e2e` → PASS (22 + bookings).
Run: `pnpm --filter @coralyn/web-staff test` → PASS (40 adeguati + nuovi).
Run: `pnpm --filter @coralyn/ui-kit test` → PASS (14, invariati).

- [ ] **Step 3: Smoke Docker (opzionale ma raccomandato)**

Run: `docker compose --profile full up -d --build`
Verifica: login via `:8080`, `POST /api/bookings` con Bearer → 201; `GET /api/map?date=...` mostra l'ombrellone `daily`; senza Bearer → 401.
Poi: `docker compose --profile full down`.

- [ ] **Step 4: Commit finale (se restano modifiche) e push**

```bash
git push -u origin feat/bookings-daily
```

---

## Self-review (coperto vs spec)

- **§2 modello** → Task 3. **§3 invariante** → Task 4 (puro) + Task 8 (enforcement). **§4 endpoint** → Task 7/8/9 + e2e Task 10. **§5 proiezione slot-aware** → Task 6. **§6 contracts** → Task 1. **§7 FE** → Task 11/12. **§8 seed/test** → Task 10 (e2e) + unit nei rispettivi task. **§9 DoD** → Task 14. **§10 casi limite**: fuso (Task 2/6), data calendariale (Task 2/7/10), superuser 400 (Task 10), FK fuori tenant 422 (Task 8/10), no-PATCH (per design), fasce semiaperte (Task 4), due confermate deterministiche (Task 6). **ADR-0031** → Task 2/6.
- **Note di consistenza tipi:** `BookingForMap` (Task 6) = `select` del service (`umbrellaId/timeSlotId/type`); `slotsOverlap`/`dateRangesOverlap` (Task 4) riusati in service (Task 8) e proiezione mappa (Task 6); `toBookingDTO` (Task 5) usato da service (Task 8) ed e2e; `@IsCalendarDate` (Task 7) riusa `isValidCalendarDate` (Task 2).
