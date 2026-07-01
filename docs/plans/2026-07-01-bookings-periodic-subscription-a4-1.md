# Periodiche + Abbonamenti (A4.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development` (consigliato)
> o `superpowers:executing-plans` per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Abilitare la creazione di prenotazioni `type=periodic` (intervallo esplicito) e
`type=subscription` (intervallo = la Stagione, server-autoritativo) su `POST /api/bookings` e
`GET /api/bookings/quote` (oggi daily-only), prezzando sull'intervallo reale, applicando l'anti-overlap
sugli intervalli, e portando il tipo nel modale FE e in `BookingsView`.

**Architecture:** Increment sopra A3.2. **Nessuna migrazione** (enum `BookingType`, `Booking.startDate/
endDate/type`, `previousBookingId`, campi `Rate` esistono già). **Engine e mappa invariati** (già generali:
`pricing.engine` su multi-giorno + `unit=period`; `map.projection` deriva lo stato dal `type`). Contratti
resi **espliciti**: `date`→`startDate`/`endDate?`, `type` obbligatorio (cambio breaking ammesso
pre-release, in lockstep — precedente A3.1/`totalPrice`). La derivazione dell'intervallo per tipo +
validazioni di dominio vivono in `BookingsService` (single source condivisa da create e quote); la
risoluzione stagione in `CatalogService.resolveSeasonWithin`. Rinnovo/`previousBookingId` → **A4.2**.

**Tech Stack:** NestJS + Prisma + class-validator (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
contratti condivisi `@coralyn/contracts`. Test: Jest (api unit + e2e), Vitest (web-staff).

**Spec di riferimento:** [docs/specs/2026-07-01-bookings-periodic-subscription-a4-1-design.md](../specs/2026-07-01-bookings-periodic-subscription-a4-1-design.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. `corepack pnpm` (pin 11.9.0). DB
locale porta **5433** (`coralyn_dev`/`coralyn_test`); `.env`/`.env.test` alla root. **Nessuna migrazione**;
`prisma generate` prima di `nest build` solo se il client è stale dopo cambio branch. Engine/mappa/RLS
**invariati**.

---

## File map

- **Modifica** `packages/contracts/src/index.ts` — `CreateBookingInput`/`QuoteBookingInput`: `date`→`startDate`, `+endDate?`, `type` obbligatorio.
- **Modifica** `apps/api/src/bookings/dto/create-booking.dto.ts` — `type` (IsIn), `startDate`, `endDate?`.
- **Modifica** `apps/api/src/bookings/dto/create-booking.dto.spec.ts` — base + nuove regole.
- **Modifica** `apps/api/src/bookings/dto/quote-booking.dto.ts` — `type` obbligatorio, `startDate`, `endDate?`.
- **Modifica** `apps/api/src/catalog/catalog.service.ts` — `QuoteContext` (range+type), `resolveSeasonWithin`, `priceWithin` su range; rimuove `quote()` (superato).
- **Modifica** `apps/api/src/bookings/bookings.service.ts` — `deriveInterval` (per tipo, 422 di dominio), `create` per tipo, `quote` via `forTenant`+`priceWithin`.
- **Modifica** `apps/api/test/helpers/seed-pricing.ts` — `+ Rate { type=subscription, unit=period, 800 }`.
- **Modifica** `apps/api/test/bookings.e2e-spec.ts` — `body` (startDate+type), quote query, nuovi test periodic/subscription/validazioni/anti-overlap.
- **Modifica** `apps/web-staff/src/features/bookings/useBookingQuote.ts` — `QuoteParams` (startDate/endDate/type) + URL.
- **Modifica** `apps/web-staff/src/features/map/MapView.vue` — selettore Tipo + input Fine periodo + payload.
- **Modifica** `apps/web-staff/src/features/map/MapView.spec.ts` — re-quote al cambio tipo.
- **Modifica** `apps/web-staff/src/features/bookings/BookingsView.vue` — colonna Tipo reale + Periodo range.
- **Modifica** `apps/web-staff/src/features/bookings/BookingsView.spec.ts` — asserzioni Tipo/Periodo.
- **Modifica** `apps/web-staff/src/mocks/server.ts` — quote per tipo; POST riflette type/startDate/endDate.
- **Modifica** `apps/api/prisma/seed.ts` — `+ Rate` subscription/period (dev).
- **Modifica** `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`; **crea** `docs/handoff/2026-07-01-bookings-a4-1-done.md`.

---

## Task 1: Contratti — `startDate`/`endDate?` + `type` obbligatorio

**Files:** Modifica `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiorna `CreateBookingInput` e `QuoteBookingInput`**

Sostituisci l'intero blocco `QuoteBookingInput` (oggi con `date`/`type?`) e `CreateBookingInput` (oggi con
`date`) con:

```ts
/** Input del preventivo di prezzo (pricing engine, ADR-0006/ADR-0032). Stessa forma della create. */
export interface QuoteBookingInput {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito (A4.1): 'daily' | 'periodic' | 'subscription'
  startDate: string;   // ISO yyyy-mm-dd
  endDate?: string;    // ISO. periodic: fine · daily: omesso · subscription: derivata dalla stagione (server)
  packageId?: string;  // opzionale (nessun pacchetto = assente)
}
```

e (più in basso, dove c'è `CreateBookingInput`):

```ts
/** Input per creare una prenotazione. Prezzo e (per subscription) durata sono server-autoritativi (A4.1). */
export interface CreateBookingInput {
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;   // esplicito: daily | periodic | subscription
  startDate: string;   // ISO. daily: il giorno · periodic: inizio · subscription: data che identifica la Stagione
  endDate?: string;    // ISO. periodic: OBBLIGATORIO (≥ startDate) · daily: omesso (=startDate) · subscription: VIETATO
  packageId?: string;  // opzionale (null = tariffa base)
}
```

> `BookingDTO` espone già `startDate`/`endDate`/`type`: **non toccarlo**. `BookingType` è già definito sopra.

- [ ] **Step 2: Build dei contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS. *(L'api non compilerà finché non è aggiornata: Task 2.)*

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): booking inputs -> startDate/endDate + type obbligatorio (A4.1)"
```

---

## Task 2: API backend — DTO (TDD) + CatalogService + BookingsService

**Files:** Modifica `apps/api/src/bookings/dto/create-booking.dto.ts`,
`apps/api/src/bookings/dto/create-booking.dto.spec.ts`, `apps/api/src/bookings/dto/quote-booking.dto.ts`,
`apps/api/src/catalog/catalog.service.ts`, `apps/api/src/bookings/bookings.service.ts`

- [ ] **Step 1: Riscrivi il test del DTO (esprime le nuove regole)**

Sostituisci **interamente** `apps/api/src/bookings/dto/create-booking.dto.spec.ts` con:

```ts
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBookingDto } from './create-booking.dto';

// id sintetici ma canonici (come il seed di sviluppo): Postgres li accetta come `uuid`.
const SEED_UMBRELLA = '50000000-0000-0000-0000-000000000001';
const SEED_SLOT = '20000000-0000-0000-0000-000000000001';
const REAL_V4 = '7d9c1f2e-1a2b-4c3d-8e4f-0123456789ab';

const base = {
  customerId: REAL_V4,
  umbrellaId: SEED_UMBRELLA,
  timeSlotId: SEED_SLOT,
  type: 'daily',
  startDate: '2026-08-20',
};

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(CreateBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('CreateBookingDto', () => {
  it('accetta una daily valida (UUID canonici del seed)', async () => {
    expect(await errorsFor(base)).toEqual([]);
  });

  it('accetta una periodic con endDate', async () => {
    expect(await errorsFor({ ...base, type: 'periodic', endDate: '2026-08-25' })).toEqual([]);
  });

  it('rifiuta type mancante', async () => {
    const { type, ...noType } = base;
    void type;
    expect(await errorsFor(noType)).toContain('type');
  });

  it('rifiuta type non valido', async () => {
    expect(await errorsFor({ ...base, type: 'weekly' })).toContain('type');
  });

  it('rifiuta id non UUID-shaped (evita 500 da cast Postgres)', async () => {
    expect(await errorsFor({ ...base, umbrellaId: 'not-a-uuid' })).toContain('umbrellaId');
  });

  it('rifiuta startDate non calendariale', async () => {
    expect(await errorsFor({ ...base, startDate: '2026-13-40' })).toContain('startDate');
  });

  it('rifiuta endDate non calendariale (se presente)', async () => {
    expect(await errorsFor({ ...base, type: 'periodic', endDate: '2026-13-40' })).toContain('endDate');
  });
});
```

- [ ] **Step 2: Aggiorna `create-booking.dto.ts`**

Sostituisci **interamente** `apps/api/src/bookings/dto/create-booking.dto.ts` con:

```ts
import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingType, CreateBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

// UUID in forma canonica 8-4-4-4-12, SENZA vincolo di versione/variante RFC-4122: il seed di
// sviluppo e l'id del tenant usano UUID sintetici che Postgres accetta come `uuid` ma che @IsUUID()
// rifiuterebbe. Validiamo la *forma* e lasciamo alla FK il controllo di esistenza nel tenant (→ 422).
export const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const TYPES: BookingType[] = ['daily', 'periodic', 'subscription'];

export class CreateBookingDto implements CreateBookingInput {
  @Matches(UUID_SHAPE, { message: 'customerId must be a UUID' })
  customerId!: string;

  @Matches(UUID_SHAPE, { message: 'umbrellaId must be a UUID' })
  umbrellaId!: string;

  @Matches(UUID_SHAPE, { message: 'timeSlotId must be a UUID' })
  timeSlotId!: string;

  @IsIn(TYPES)
  type!: BookingType;

  @IsCalendarDate()
  startDate!: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;
}
```

- [ ] **Step 3: Aggiorna `quote-booking.dto.ts`**

Sostituisci **interamente** `apps/api/src/bookings/dto/quote-booking.dto.ts` con:

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

  @IsIn(TYPES)
  type!: BookingType;

  @IsCalendarDate()
  startDate!: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'packageId must be a UUID' })
  packageId?: string;
}
```

- [ ] **Step 4: `CatalogService` — `QuoteContext` su range, `resolveSeasonWithin`, `priceWithin`, rimuovi `quote()`**

In `apps/api/src/catalog/catalog.service.ts`:

a) Sostituisci l'interfaccia `QuoteContext`:

```ts
export interface QuoteContext {
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  packageId?: string | null;
  type: BookingType;
}
```

b) Aggiungi il tipo di esito stagione (sotto `QuoteOutcome`):

```ts
export type SeasonRange =
  | { ok: true; startDate: string; endDate: string }
  | { ok: false; reason: 'NO_SEASON' };
```

c) **Rimuovi** il metodo `quote(ctx)` (era usato solo da `BookingsService.quote`, ora superato dal
   `priceWithin` dentro `forTenant`). Al suo posto aggiungi `resolveSeasonWithin`:

```ts
  /** Risolve la stagione attiva per una data e ne ritorna l'intervallo (single source della risoluzione stagione). */
  async resolveSeasonWithin(tx: Prisma.TransactionClient, date: string): Promise<SeasonRange> {
    const day = toDbDate(date);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${date}: uso la prima (${seasons[0].id}).`);
    }
    return { ok: true, startDate: formatDbDate(seasons[0].startDate), endDate: formatDbDate(seasons[0].endDate) };
  }
```

d) Sostituisci il corpo di `priceWithin` per usare `startDate`/`endDate`/`type` (il resto invariato):

```ts
  async priceWithin(tx: Prisma.TransactionClient, ctx: QuoteContext): Promise<QuoteOutcome> {
    const umbrella = await tx.umbrella.findFirst({
      where: { id: ctx.umbrellaId },
      include: { row: true },
    });
    if (!umbrella) return { ok: false, reason: 'UMBRELLA_NOT_FOUND' };

    const day = toDbDate(ctx.startDate);
    const seasons = await tx.season.findMany({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      orderBy: { startDate: 'asc' },
    });
    if (seasons.length === 0) return { ok: false, reason: 'NO_SEASON' };
    if (seasons.length > 1) {
      this.logger.warn(`Stagioni sovrapposte per ${ctx.startDate}: uso la prima (${seasons[0].id}).`);
    }
    const pricing = await tx.pricing.findFirst({ where: { seasonId: seasons[0].id } });
    if (!pricing) return { ok: false, reason: 'NO_SEASON' };

    const rates = await tx.rate.findMany({ where: { pricingId: pricing.id } });
    const result = resolvePrice(
      {
        type: ctx.type,
        sectorId: umbrella.row.sectorId,
        rowId: umbrella.rowId,
        packageId: ctx.packageId ?? null,
        timeSlotId: ctx.timeSlotId,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
      },
      rates.map(toRateRow),
    );
    if (!result.ok) return { ok: false, reason: 'NO_RATE' };
    return { ok: true, totalPrice: result.totalPrice };
  }
```

> `formatDbDate` e `toDbDate` sono già importati in questo file. `Prisma`, `BookingType` sono già importati.

- [ ] **Step 5: `BookingsService` — `deriveInterval`, `create` per tipo, `quote` via `forTenant`**

In `apps/api/src/bookings/bookings.service.ts`:

a) Aggiungi l'import del tipo Prisma (in cima, insieme agli altri import):

```ts
import type { Prisma } from '@prisma/client';
```

b) Sostituisci il metodo `quote(...)` esistente con:

```ts
  /** Preventivo per il modale FE (preview). Deriva l'intervallo dal tipo come la create (single source). */
  async quote(input: QuoteBookingInput): Promise<{ totalPrice: number }> {
    const tenantId = this.tenant.require();
    const totalPrice = await this.prisma.forTenant(tenantId, async (tx) => {
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      return this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate,
          endDate,
          type: input.type,
          packageId: input.packageId ?? null,
        }),
      );
    });
    return { totalPrice };
  }

  /**
   * Deriva e valida l'intervallo [startDate, endDate] dal tipo (server-autoritativo). Le regole di dominio
   * lanciano 422. Per periodic/subscription risolve la stagione una volta (single source: resolveSeasonWithin).
   */
  private async deriveInterval(
    tx: Prisma.TransactionClient,
    input: { type: BookingType; startDate: string; endDate?: string },
  ): Promise<{ startDate: string; endDate: string }> {
    if (input.type === 'daily') {
      if (input.endDate) throw new UnprocessableEntityException('Giornaliera: non specificare la data di fine');
      return { startDate: input.startDate, endDate: input.startDate };
    }
    const season = await this.catalog.resolveSeasonWithin(tx, input.startDate);
    if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    if (input.type === 'subscription') {
      if (input.endDate)
        throw new UnprocessableEntityException('Abbonamento: la durata è la stagione, non specificare la data di fine');
      return { startDate: season.startDate, endDate: season.endDate };
    }
    // periodic
    if (!input.endDate) throw new UnprocessableEntityException('Periodica: specificare la data di fine');
    if (input.endDate < input.startDate)
      throw new UnprocessableEntityException('La data di fine precede l’inizio');
    if (input.endDate > season.endDate) throw new UnprocessableEntityException('Il periodo supera la stagione');
    return { startDate: input.startDate, endDate: input.endDate };
  }
```

> Aggiungi `BookingType` all'import dei tipi contratti in cima al file:
> `import type { BookingDTO, BookingType, CreateBookingInput, QuoteBookingInput, SettlePaymentInput } from '@coralyn/contracts';`

c) Sostituisci **interamente** il metodo `create(...)` con:

```ts
  /** Crea una prenotazione (daily / periodic / subscription; status=confirmed). Prezzo e durata server-autoritativi. */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Intervallo dal tipo (422 di dominio dentro deriveInterval).
      const { startDate, endDate } = await this.deriveInterval(tx, input);
      const dbStart = toDbDate(startDate);
      const dbEnd = toDbDate(endDate);

      // 2) FK nel tenant (RLS: fuori tenant → null → 422).
      const slot = await tx.timeSlot.findFirst({ where: { id: input.timeSlotId } });
      const umbrella = await tx.umbrella.findFirst({ where: { id: input.umbrellaId } });
      const customer = await tx.customer.findFirst({ where: { id: input.customerId } });
      if (!slot || !umbrella || !customer) {
        throw new UnprocessableEntityException('Cliente, ombrellone o fascia non validi');
      }
      if (input.packageId) {
        const pkg = await tx.package.findFirst({ where: { id: input.packageId } });
        if (!pkg) throw new UnprocessableEntityException('Pacchetto non valido');
      }

      // 3) Anti-overlap su intervallo (ADR-0013): stesso ombrellone, date intersecanti, fascia sovrapposta.
      const sameUmbrella = await tx.booking.findMany({
        where: { umbrellaId: input.umbrellaId, status: 'confirmed' },
        include: { timeSlot: true },
      });
      const conflict = sameUmbrella.some(
        (b) => dateRangesOverlap(b.startDate, b.endDate, dbStart, dbEnd) && slotsOverlap(b.timeSlot, slot),
      );
      if (conflict) {
        throw new ConflictException('Fascia non disponibile per questo ombrellone');
      }

      // 4) Prezzo (server-autoritativo, mai dal client).
      const totalPrice = this.priceOrThrow(
        await this.catalog.priceWithin(tx, {
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate,
          endDate,
          type: input.type,
          packageId: input.packageId ?? null,
        }),
      );

      // 5) Scrittura.
      return tx.booking.create({
        data: {
          establishmentId: tenantId,
          customerId: input.customerId,
          umbrellaId: input.umbrellaId,
          timeSlotId: input.timeSlotId,
          startDate: dbStart,
          endDate: dbEnd,
          type: input.type,
          status: 'confirmed',
          totalPrice,
          packageId: input.packageId ?? null,
        },
      });
    });
    return toBookingDTO(created);
  }
```

- [ ] **Step 6: `prisma generate` (se necessario) + build + unit test del DTO**

Run:
```bash
corepack pnpm --filter @coralyn/api exec prisma generate
corepack pnpm --filter @coralyn/api build
corepack pnpm --filter @coralyn/api test -- create-booking.dto
```
Expected: build OK; DTO spec PASS (7 test).

- [ ] **Step 7: Esegui tutti gli unit dell'api**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: PASS (engine/proiezioni invariati + DTO aggiornato).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bookings/dto/create-booking.dto.ts apps/api/src/bookings/dto/create-booking.dto.spec.ts apps/api/src/bookings/dto/quote-booking.dto.ts apps/api/src/catalog/catalog.service.ts apps/api/src/bookings/bookings.service.ts
git commit -m "feat(api): create/quote periodic+subscription (deriveInterval, priceWithin su range) (A4.1)"
```

---

## Task 3: e2e — periodic, subscription, validazioni, anti-overlap su intervalli

**Files:** Modifica `apps/api/test/helpers/seed-pricing.ts`, `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Aggiungi al seed e2e una `Rate` subscription/period (forfait 800)**

In `apps/api/test/helpers/seed-pricing.ts`, **dopo** la rate pacchetto (price 60) e **prima** del `return`,
aggiungi:

```ts
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        type: 'subscription',
        price: 800,
        unit: RateUnit.period,
      },
    });
```

> Non matcha i contesti `daily`/`periodic` (dimensione `type`); esercita il path `unit=period` per gli
> abbonamenti (precedenza tipo, ADR-0032). I test esistenti restano a 28/40/60.

- [ ] **Step 2: Rinomina `date`→`startDate` e aggiungi `type` nel `body` helper e nelle quote query**

In `apps/api/test/bookings.e2e-spec.ts`:

a) **Find & replace** ` date:` → ` startDate:` (con lo **spazio** iniziale: colpisce il `body` helper e
   tutti gli override; NON tocca i `?date=` delle GET né `collectionDate`).

b) **Find & replace** `&date=` → `&type=daily&startDate=` (le 5 query string di `GET /bookings/quote`).

c) Nel `body` helper aggiungi `type: 'daily',`. Il risultato dev'essere:

```ts
  const body = (over: Partial<Record<string, unknown>> = {}) => ({
    customerId, umbrellaId: ids.u1, timeSlotId: ids.slotMorning, type: 'daily', startDate: D, ...over,
  });
```

- [ ] **Step 3: Esegui gli e2e bookings (regressione verde col rename)**

Run:
```bash
corepack pnpm --filter @coralyn/api test:e2e -- bookings
```
Expected: PASS (i test esistenti passano con `startDate`/`type=daily`). *(Se non carica `.env.test`, anteponi
`DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public"`.)*

- [ ] **Step 4: Aggiungi il describe periodiche/abbonamenti**

In `apps/api/test/bookings.e2e-spec.ts`, **dopo** il `describe('GET /packages', ...)` e **prima** del test
`DELETE annulla ...`, aggiungi:

```ts
  describe('periodiche e abbonamenti (A4.1)', () => {
    let uPer: string; // ombrellone dedicato per le periodiche
    let uSub: string; // ombrellone dedicato per l'abbonamento (copre l'intera stagione)

    beforeAll(async () => {
      const mk = (label: string, order: number) =>
        prisma.forTenant(s1, (tx) =>
          tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: order } }),
        );
      uPer = (await mk('90', 90)).id;
      uSub = (await mk('91', 91)).id;
    });

    it('periodic multi-giorno → 201, prezzo = base × giorni, mappa "booked" nei giorni interni', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-24', endDate: '2026-07-26' })).expect(201);
      expect(res.body.type).toBe('periodic');
      expect(res.body.startDate).toBe('2026-07-24');
      expect(res.body.endDate).toBe('2026-07-26');
      expect(res.body.totalPrice).toBe(84); // 28 × 3 giorni (estremi inclusi)

      const map = await request(app.getHttpServer()).get('/api/map?date=2026-07-25').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uPer);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('booked');
    });

    it('anti-overlap su intervalli: periodo intersecante → 409; disgiunto → 201', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-25', endDate: '2026-07-27' })).expect(409);
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-07-28', endDate: '2026-07-29' })).expect(201);
    });

    it('subscription → 201, durata = stagione, prezzo forfait (800), mappa "season"', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      expect(res.body.type).toBe('subscription');
      expect(res.body.startDate).toBe('2026-05-01'); // season.startDate
      expect(res.body.endDate).toBe('2026-09-30');   // season.endDate
      expect(res.body.totalPrice).toBe(800);

      const map = await request(app.getHttpServer()).get('/api/map?date=2026-06-15').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uSub);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
    });

    it('daily con endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, startDate: '2026-08-10', endDate: '2026-08-11' })).expect(422);
    });

    it('periodic senza endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-08-10' })).expect(422);
    });

    it('periodic con endDate < startDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-08-10', endDate: '2026-08-05' })).expect(422);
    });

    it('periodic che supera la stagione → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uPer, type: 'periodic', startDate: '2026-09-28', endDate: '2026-10-15' })).expect(422);
    });

    it('subscription con endDate → 422', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2026-07-01', endDate: '2026-09-30' })).expect(422);
    });

    it('subscription fuori stagione → 422 (nessuna stagione)', async () => {
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uSub, type: 'subscription', startDate: '2027-01-10' })).expect(422);
    });

    it('quote periodic → prezzo = base × giorni; quote subscription → forfait', async () => {
      const per = await request(app.getHttpServer())
        .get(`/api/bookings/quote?umbrellaId=${uPer}&timeSlotId=${ids.slotMorning}&type=periodic&startDate=2026-08-01&endDate=2026-08-05`)
        .set(...bearer(token1)).expect(200);
      expect(per.body.totalPrice).toBe(140); // 28 × 5

      const sub = await request(app.getHttpServer())
        .get(`/api/bookings/quote?umbrellaId=${uSub}&timeSlotId=${ids.slotMorning}&type=subscription&startDate=2026-07-01`)
        .set(...bearer(token1)).expect(200);
      expect(sub.body.totalPrice).toBe(800);
    });
  });
```

- [ ] **Step 5: Esegui gli e2e bookings (con i nuovi)**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings`
Expected: PASS (inclusi periodic/subscription/validazioni/anti-overlap/quote).

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/helpers/seed-pricing.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e periodic+subscription (prezzo, mappa, anti-overlap range, validazioni) (A4.1)"
```

---

## Task 4: FE — quote/create con tipo + selettore nel modale

**Files:** Modifica `apps/web-staff/src/features/bookings/useBookingQuote.ts`,
`apps/web-staff/src/features/map/MapView.vue`, `apps/web-staff/src/mocks/server.ts`,
`apps/web-staff/src/features/map/MapView.spec.ts`

- [ ] **Step 1: `useBookingQuote` — `QuoteParams` su range/type**

Sostituisci **interamente** `apps/web-staff/src/features/bookings/useBookingQuote.ts` con:

```ts
import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { BookingQuoteDTO, BookingType } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { useSessionStore } from '@/stores/session';

export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;
  startDate: string;
  endDate?: string;   // periodic
  packageId?: string; // opzionale
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
      params.value?.type ?? '',
      params.value?.startDate ?? '',
      params.value?.endDate ?? '',
      params.value?.packageId ?? '',
    ]),
    queryFn: () => {
      const p = params.value!;
      const end = p.endDate ? `&endDate=${p.endDate}` : '';
      const pkg = p.packageId ? `&packageId=${p.packageId}` : '';
      return apiFetch<BookingQuoteDTO>(
        `/bookings/quote?umbrellaId=${p.umbrellaId}&timeSlotId=${p.timeSlotId}&type=${p.type}&startDate=${p.startDate}${end}${pkg}`,
      );
    },
    enabled: computed(
      () => !!params.value?.umbrellaId && !!params.value?.timeSlotId && !!params.value?.startDate,
    ),
  });
}
```

- [ ] **Step 2: `MapView.vue` — stato tipo/fine, quoteParams, payload**

In `apps/web-staff/src/features/map/MapView.vue`, `<script setup>`:

a) Estendi l'import dei tipi contratti:

```ts
import type { UmbrellaDTO, SlotState, BookingDTO, BookingType } from '@coralyn/contracts';
```

b) Estendi l'import di `useBookingQuote` per il tipo `QuoteParams`:

```ts
import { useBookingQuote, type QuoteParams } from '@/features/bookings/useBookingQuote';
```

c) Dopo `const packageId = ref<string>('');` (riga ~103) aggiungi:

```ts
const bookingType = ref<BookingType>('daily');
const endDate = ref<string>('');
```

d) In `openModal()`, dopo `packageId.value = '';`, aggiungi:

```ts
  bookingType.value = 'daily';
  endDate.value = '';
```

e) Sostituisci il computed `quoteParams` con:

```ts
const quoteParams = computed<QuoteParams | null>(() => {
  if (!(modalBooking.value && sel.value && selectedSlotId.value)) return null;
  if (bookingType.value === 'periodic' && !endDate.value) return null; // niente quote finché manca la fine
  return {
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    type: bookingType.value,
    startDate: activeDate.value,
    endDate: bookingType.value === 'periodic' ? endDate.value : undefined,
    packageId: packageId.value || undefined,
  };
});
```

f) Sostituisci la chiamata in `confirmBooking()` con:

```ts
  await createBooking.mutateAsync({
    customerId: customerId.value,
    umbrellaId: sel.value.u.id,
    timeSlotId: selectedSlotId.value,
    type: bookingType.value,
    startDate: activeDate.value,
    endDate: bookingType.value === 'periodic' ? endDate.value : undefined,
    packageId: packageId.value || undefined,
  });
```

Nel `<template>`, **dentro** `<div class="flex flex-col gap-[18px]">` e **prima** del blocco Cliente
(`<label ...>Cliente</label>`), inserisci il selettore Tipo:

```vue
        <div>
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Tipo</label>
          <select v-model="bookingType" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none">
            <option value="daily">Giornaliera</option>
            <option value="periodic">Periodica</option>
            <option value="subscription">Abbonamento</option>
          </select>
        </div>
```

E **dopo** il blocco Fascia (`<div v-if="freeSlotOptions.length"> ... </div>`) e **prima** del blocco
Pacchetto, inserisci l'input Fine periodo (periodica) / la nota abbonamento:

```vue
        <div v-if="bookingType === 'periodic'">
          <label class="mb-1.5 block text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Fine periodo</label>
          <input type="date" v-model="endDate" :min="activeDate" class="w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
        </div>
        <p v-else-if="bookingType === 'subscription'" class="text-[12.5px] text-[var(--color-text-muted)]">Durata: stagione intera.</p>
```

- [ ] **Step 3: MSW — quote per tipo + POST riflette type/startDate/endDate**

In `apps/web-staff/src/mocks/server.ts`:

a) Sostituisci l'handler `GET /api/bookings/quote` con:

```ts
  http.get('/api/bookings/quote', ({ request }) => {
    const p = new URL(request.url).searchParams;
    if (p.get('type') === 'subscription') return HttpResponse.json({ totalPrice: 800 });
    return HttpResponse.json({ totalPrice: p.has('packageId') ? 35 : 28 });
  }),
```

b) Sostituisci l'handler `POST /api/bookings` con:

```ts
  http.post('/api/bookings', async ({ request }) => {
    const b = (await request.json()) as { customerId: string; umbrellaId: string; timeSlotId: string; type: string; startDate: string; endDate?: string; packageId?: string };
    return HttpResponse.json(
      { id: 'bk-1', customerId: b.customerId, umbrellaId: b.umbrellaId, timeSlotId: b.timeSlotId, startDate: b.startDate, endDate: b.endDate ?? b.startDate, type: b.type, status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0, packageId: b.packageId },
      { status: 201 },
    );
  }),
```

- [ ] **Step 4: `MapView.spec.ts` — re-quote al cambio tipo**

In `apps/web-staff/src/features/map/MapView.spec.ts`, **dopo** il blocco che verifica il re-quote a `'35'`
col pacchetto (subito prima di `w.unmount();`), aggiungi la verifica del selettore Tipo:

```ts
    // Cambiando il Tipo in Abbonamento, il prezzo si ricalcola (MSW: 800 per subscription).
    const typeSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Abbonamento'),
    ) as HTMLSelectElement | undefined;
    expect(typeSelect).toBeTruthy();
    typeSelect!.value = 'subscription';
    typeSelect!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('800');
```

- [ ] **Step 5: Esegui i test FE + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- MapView
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: PASS; nessun errore TS. *(Se i tipi contratti risultano stale, elimina `apps/web-staff/node_modules/.vite` e ri-esegui.)*

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/bookings/useBookingQuote.ts apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "feat(web-staff): selettore Tipo (periodica/abbonamento) + fine periodo + re-quote (A4.1)"
```

---

## Task 5: FE — colonna "Tipo" reale + Periodo (range) in `BookingsView`

**Files:** Modifica `apps/web-staff/src/features/bookings/BookingsView.vue`,
`apps/web-staff/src/features/bookings/BookingsView.spec.ts`

- [ ] **Step 1: Aggiungi il test della colonna Tipo/Periodo**

In `apps/web-staff/src/features/bookings/BookingsView.spec.ts`, **dopo** il test `colonna Pacchetto ...`,
aggiungi (dentro il `describe('BookingsView', ...)`):

```ts
  it('colonna Tipo: etichetta IT dal type; Periodo mostra il range per periodic/subscription', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json([
          {
            id: 'bk-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
            startDate: '2026-07-24', endDate: '2026-07-26', type: 'periodic', status: 'confirmed',
            totalPrice: 84, paymentStatus: 'unpaid', amountCollected: 0,
          },
          {
            id: 'bk-2', customerId: 'c-1', umbrellaId: 'u2', timeSlotId: 's1',
            startDate: '2026-05-01', endDate: '2026-09-30', type: 'subscription', status: 'confirmed',
            totalPrice: 800, paymentStatus: 'unpaid', amountCollected: 0,
          },
        ]),
      ),
    );
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Periodica');
    expect(w.text()).toContain('Abbonamento');
    expect(w.text()).toContain('2026-07-24 → 2026-07-26'); // range periodica
  });
```

- [ ] **Step 2: Esegui (deve fallire)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: FAIL (oggi la colonna Tipo è hard-coded "Giornaliero"; il range non è reso).

- [ ] **Step 3: Rendi Tipo e Periodo reali in `BookingsView.vue`**

In `apps/web-staff/src/features/bookings/BookingsView.vue`:

a) Estendi l'import dei tipi contratti (riga ~5):

```ts
import type { BookingDTO, BookingType, PaymentStatus } from '@coralyn/contracts';
```

b) Dopo la mappa `PAY_TONE` (riga ~35) aggiungi l'etichetta tipo:

```ts
const TYPE_LABEL: Record<BookingType, string> = { daily: 'Giornaliera', periodic: 'Periodica', subscription: 'Abbonamento' };
const periodLabel = (b: BookingDTO): string => (b.type === 'daily' ? b.startDate : `${b.startDate} → ${b.endDate}`);
```

c) Nel `<template>`, sostituisci il `<td>` del Tipo (oggi `>Giornaliero<`) con:

```vue
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 text-[var(--color-text-2nd)]">{{ TYPE_LABEL[b.type] }}</td>
```

d) Sostituisci il `<td>` del Periodo (oggi `{{ b.startDate }}`) con:

```vue
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ periodLabel(b) }}</td>
```

- [ ] **Step 4: Esegui (deve passare)**

Run: `corepack pnpm --filter @coralyn/web-staff test -- BookingsView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/bookings/BookingsView.vue apps/web-staff/src/features/bookings/BookingsView.spec.ts
git commit -m "feat(web-staff): colonna Tipo reale + Periodo range in BookingsView (A4.1)"
```

---

## Task 6: Seed dev + documentazione + handoff + verifica finale (DoD)

**Files:** Modifica `apps/api/prisma/seed.ts`, `README.md`, `docs/design/data-model.md`,
`docs/architecture/glossary.md`; crea `docs/handoff/2026-07-01-bookings-a4-1-done.md`

- [ ] **Step 1: Seed dev — `Rate` subscription/period**

In `apps/api/prisma/seed.ts`, **dopo** la rate `RATE_PM` (price 40) e **prima** della chiusura del blocco
listino (`});` che chiude il `forTenant`/upsert finale, riga ~157), aggiungi:

```ts
    // Abbonamento (type=subscription) a forfait di stagione: esercita unit=period (A4.1).
    const RATE_SUB = u(9, 3);
    await tx.rate.upsert({
      where: { id: RATE_SUB },
      update: { type: 'subscription', price: 800, unit: 'period' },
      create: { id: RATE_SUB, establishmentId: EID, pricingId: PRICING, type: 'subscription', price: 800, unit: 'period' },
    });
```

- [ ] **Step 2: Applica il seed a `coralyn_dev` (verifica che gira)**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm --filter @coralyn/api exec ts-node prisma/seed.ts
```
Expected: seed OK (idempotente, upsert). *(Se il progetto usa un altro comando di seed, usa quello; il seed
è upsert quindi ripetibile.)*

- [ ] **Step 3: Aggiorna glossary, data-model, README**

- `glossary.md`: dove `Booking`/`prenotazione` nota "A1: solo daily", aggiorna → **periodic e subscription
  attivi (A4.1)**; `previousBookingId` ancora inutilizzato (rinnovo → A4.2).
- `data-model.md`: nella nota d'intestazione, `Booking` ora **crea tutti e tre i tipi** (A4.1: periodic =
  intervallo esplicito, subscription = stagione, server-autoritativa); nella regola "Rinnovo/anzianità",
  precisa che `previousBookingId` resta **non valorizzato** fino ad A4.2. Nella regola "Anti-overlap",
  nota che l'invariante è ora esercitato su **intervalli** (non solo giorno singolo).
- `README.md`: stato — **A4.1 periodiche + abbonamenti implementate** (create periodic/subscription,
  prezzo su intervallo, mappa season/booked, selettore Tipo nel modale, colonna Tipo/Periodo in
  BookingsView); prossimo: **A4.2 rinnovo + anzianità** (`previousBookingId`), editor CRUD listino (D-032).

- [ ] **Step 4: Scrivi l'handoff A4.1**

`docs/handoff/2026-07-01-bookings-a4-1-done.md`: stato git (branch `feat/bookings-periodic-subscription`
da `main` `c452914`); cosa ha consegnato A4.1 (create/quote periodic+subscription; `deriveInterval` +
`resolveSeasonWithin`; contratti espliciti startDate/endDate+type; anti-overlap su intervalli; mappa
invariata; selettore Tipo + Fine periodo nel modale; colonna Tipo/Periodo in BookingsView; seed rate
subscription/period); confini (rinnovo/`previousBookingId` → A4.2; periodica cross-stagione → 422 +
[D-033]; engine/mappa/RLS/schema invariati, nessuna migrazione; extra non prezzati; editor listino D-032);
conteggi test aggiornati; gotcha riconfermati (whitelist scarta campi non-DTO; forma-UUID; porta 5433;
rebuild api Docker; pulizia `.vite` dopo cambio contratti); **prossimo slice A4.2**.

- [ ] **Step 5: Verifica DoD completa**

Run:
```bash
corepack pnpm -r build
corepack pnpm eslint .
corepack pnpm --filter @coralyn/ui-kit test
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/api test
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm --filter @coralyn/api test:e2e
```
Expected: tutto verde. Conteggi attesi: ui-kit **14** (invariato) · web-staff **≥45** (+BookingsView Tipo) ·
api unit **≥64** (+3 casi DTO) · api e2e **≥64** (+10 periodic/subscription/validazioni/anti-overlap/quote).

- [ ] **Step 6: Verifica live (Docker) — raccomandata**

```bash
docker compose --profile full up -d --build api
```
Login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`). Nel modale "Nuova prenotazione": scegli
**Periodica** → compare "Fine periodo" → il prezzo = base × giorni; scegli **Abbonamento** → "stagione
intera" → prezzo forfait (800). Conferma → `BookingsView` mostra Tipo e Periodo corretti; la mappa accende
`booked`/`season` sui giorni dell'intervallo. *(Rebuild dell'immagine api dopo il cambio BE, altrimenti il
FE prende 404.)*

- [ ] **Step 7: Commit + push**

```bash
git add apps/api/prisma/seed.ts README.md docs/
git commit -m "docs: A4.1 periodiche+abbonamenti implementate (seed, glossary, data-model, README, handoff)"
git push -u origin feat/bookings-periodic-subscription
```

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §2 nessuna migrazione → confermato (Task 2 usa i campi esistenti, nessun `.prisma`);
  §3 contratti startDate/endDate/type → Task 1; §4 pricing su range + `resolveSeasonWithin` + season da
  `startDate` → Task 2 (Step 4); §5 create per tipo + `deriveInterval` + 422 di dominio + anti-overlap range
  → Task 2 (Step 5) + e2e Task 3; §6 endpoint quote/create + whitelist DTO → Task 2 (Step 2-3); §7 mappa
  invariata → verificata da e2e Task 3 (`booked`/`season`); §8 FE modale + colonna → Task 4/5; §9 seed
  subscription/period → Task 3 (e2e) + Task 6 (dev); §10 test → Task 2/3/4/5; §11 DoD/doc → Task 6; §12
  casi limite → e2e Task 3; §13 decisioni → riflesse in confini/handoff. **[D-033]** già in `deferred.md`.
- **Placeholder:** nessuno; ogni step ha codice/comando reale. Gli UUID sono di forma valida.
- **Coerenza tipi:** `CreateBookingInput`/`QuoteBookingInput` (contracts: `type` req, `startDate`, `endDate?`)
  ↔ `CreateBookingDto`/`QuoteBookingDto` ↔ `QuoteParams` (FE) ↔ `QuoteContext` (catalog: `startDate`/`endDate`/
  `type`) ↔ `PricingContext` (engine, invariato). `deriveInterval` (BookingsService) usa
  `CatalogService.resolveSeasonWithin` → `SeasonRange`. `BookingsService.quote` non usa più
  `CatalogService.quote` (rimosso): unico consumatore aggiornato. `toDbDate`/`formatDbDate` già importati in
  `catalog.service.ts`; `dateRangesOverlap`/`slotsOverlap` già importati in `bookings.service.ts`. Mappa
  (`STATE_BY_TYPE`) e engine **non toccati**.
```
