# Rinnovo + Anzianità (A4.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development` (consigliato)
> o `superpowers:executing-plans` per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Attivare l'azione di **rinnovo** di un abbonamento (`POST /api/bookings/:id/renew`, server-autoritativo:
copia cliente/ombrellone/fascia/pacchetto dalla sorgente, riprezza sul listino della nuova stagione, valorizza
`previousBookingId`) e l'**anzianità** derivata (lunghezza catena rinnovi), con la superficie di campagna
(`GET /api/bookings/subscriptions` + vista FE **Rinnovi**).

**Architecture:** Increment sopra A4.1. **Nessuna migrazione** (`previousBookingId`, self-relation
`BookingRenewal`, enum/campi esistono già). **Engine e mappa invariati** (`resolvePrice`; `map.projection`
proietta `subscription→season`). Il rinnovo è la creazione di un `subscription` per un'altra stagione con in
più il link al precedente: **riuso** dell'infra A4.1 (`CatalogService.resolveSeasonWithin`,
`priceWithin(tx,…)`) e della logica di scrittura di `create`, **estratta** in un helper privato condiviso
(`priceAndWrite`). L'anzianità è calcolata con una **CTE ricorsiva batch**.

**Tech Stack:** NestJS + Prisma + class-validator (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
contratti condivisi `@coralyn/contracts`. Test: Jest (api unit + e2e), Vitest (web-staff).

**Spec di riferimento:** [docs/specs/2026-07-01-bookings-renewal-a4-2-design.md](../specs/2026-07-01-bookings-renewal-a4-2-design.md).
**Convenzione:** codice/DB in inglese (ADR-0030); UI/doc in italiano. `corepack pnpm` (pin 11.9.0). DB locale
porta **5433** (`coralyn_dev`/`coralyn_test`); `.env`/`.env.test` alla root. **Nessuna migrazione**;
`prisma generate` prima di `nest build` solo se il client è stale dopo cambio branch. Engine/mappa/RLS
**invariati**.

> **Nota working tree:** su questo branch sono presenti modifiche **non committate** alla fix MSW dev
> (`apps/web-staff/src/main.ts`, `mocks/handlers.ts`, `vite.config.ts`; cancellati `mocks/browser.ts` e
> `public/mockServiceWorker.js`). **Non** vanno incluse nei commit di A4.2: fare sempre `git add` dei soli
> file elencati in ciascun task.

---

## File map

- **Modifica** `packages/contracts/src/index.ts` — `+RenewBookingInput`, `+SubscriptionListItemDTO`, `BookingDTO += previousBookingId?`.
- **Modifica** `apps/api/src/bookings/booking.projection.ts` — mappa `previousBookingId`.
- **Crea** `apps/api/src/bookings/subscription.projection.ts` — `toSubscriptionListItemDTO`.
- **Crea** `apps/api/src/bookings/dto/renew-booking.dto.ts` + `renew-booking.dto.spec.ts`.
- **Modifica** `apps/api/src/bookings/bookings.service.ts` — `priceAndWrite` (estratto), `create` refactor, `renew`, `listSubscriptions`, `computeSeniority`.
- **Modifica** `apps/api/src/bookings/bookings.controller.ts` — `+ GET subscriptions`, `+ POST :id/renew`.
- **Modifica** `apps/api/test/helpers/seed-pricing.ts` — 2ª stagione 2027 (+ rate day 30 + subscription 850).
- **Modifica** `apps/api/test/bookings.e2e-spec.ts` — describe rinnovo/anzianità/validazioni/anti-overlap.
- **Modifica** `apps/web-staff/src/lib/queryKeys.ts` — `+ subscriptions`.
- **Crea** `apps/web-staff/src/features/renewals/useRenewals.ts` — `useSubscriptions`, `useRenewBooking`.
- **Crea** `apps/web-staff/src/features/renewals/RenewalsView.vue` + `RenewalsView.spec.ts`.
- **Modifica** `apps/web-staff/src/router/index.ts` — rotta `/renewals`.
- **Modifica** `apps/web-staff/src/app/Sidebar.vue` — voce "Rinnovi".
- **Modifica** `apps/web-staff/src/mocks/server.ts` — handler `subscriptions` + `renew`.
- **Modifica** `apps/api/prisma/seed.ts` — 2ª stagione 2027 (dev).
- **Modifica** `README.md`, `docs/design/data-model.md`, `docs/architecture/glossary.md`; **crea** `docs/handoff/2026-07-01-bookings-a4-2-done.md`.

---

## Task 1: Contratti — `RenewBookingInput`, `SubscriptionListItemDTO`, `BookingDTO += previousBookingId?`

**Files:** Modifica `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i nuovi tipi e il campo additivo**

In `packages/contracts/src/index.ts`, **dopo** l'interfaccia `CreateBookingInput` (in fondo al file), aggiungi:

```ts
/** Input per rinnovare un abbonamento (A4.2). L'unico input è la stagione di destinazione; tutto il
 *  resto è COPIATO dalla sorgente (server-autoritativo). Prezzo ricalcolato sul nuovo listino. */
export interface RenewBookingInput {
  startDate: string;   // ISO yyyy-mm-dd: una data DENTRO la stagione di destinazione (identifica la Season)
}

/** Voce dell'elenco abbonati di una stagione (campagna rinnovi, A4.2). */
export interface SubscriptionListItemDTO {
  id: string;
  customerId: string;
  umbrellaId: string;
  timeSlotId: string;
  packageId?: string;
  startDate: string;   // = season.startDate
  endDate: string;     // = season.endDate
  totalPrice: number;
  seniority: number;   // lunghezza catena dei rinnovi (derivata, >= 1)
  renewed: boolean;    // esiste già un rinnovo CONFERMATO di questo abbonamento
}
```

Poi, in `BookingDTO`, **dopo** la riga `packageId?: string; ...`, aggiungi il campo additivo:

```ts
  previousBookingId?: string;    // A4.2 (additivo): valorizzato per i rinnovi (link al precedente)
```

- [ ] **Step 2: Build dei contratti**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, nessun errore TS. *(L'api non compilerà finché non usa i nuovi tipi: Task 2.)*

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): RenewBookingInput + SubscriptionListItemDTO + BookingDTO.previousBookingId (A4.2)"
```

---

## Task 2: API backend — DTO (TDD), proiezioni, service, controller

**Files:** Crea `apps/api/src/bookings/dto/renew-booking.dto.ts`,
`apps/api/src/bookings/dto/renew-booking.dto.spec.ts`,
`apps/api/src/bookings/subscription.projection.ts`; Modifica
`apps/api/src/bookings/booking.projection.ts`, `apps/api/src/bookings/bookings.service.ts`,
`apps/api/src/bookings/bookings.controller.ts`

- [ ] **Step 1: Scrivi il test del DTO (fallisce: il DTO non esiste)**

Crea `apps/api/src/bookings/dto/renew-booking.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenewBookingDto } from './renew-booking.dto';

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(RenewBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('RenewBookingDto', () => {
  it('accetta uno startDate calendariale', async () => {
    expect(await errorsFor({ startDate: '2027-07-01' })).toEqual([]);
  });
  it('rifiuta startDate mancante', async () => {
    expect(await errorsFor({})).toContain('startDate');
  });
  it('rifiuta startDate non calendariale', async () => {
    expect(await errorsFor({ startDate: '2027-13-40' })).toContain('startDate');
  });
});
```

- [ ] **Step 2: Esegui il test (deve fallire)**

Run: `corepack pnpm --filter @coralyn/api test -- renew-booking.dto`
Expected: FAIL (`Cannot find module './renew-booking.dto'`).

- [ ] **Step 3: Crea il DTO**

Crea `apps/api/src/bookings/dto/renew-booking.dto.ts`:

```ts
import type { RenewBookingInput } from '@coralyn/contracts';
import { IsCalendarDate } from './is-calendar-date';

// Il client passa SOLO la stagione di destinazione: cliente/ombrellone/pacchetto/prezzo sono
// copiati/derivati dal server. ValidationPipe({ whitelist: true }) scarta ogni altro campo.
export class RenewBookingDto implements RenewBookingInput {
  @IsCalendarDate()
  startDate!: string;
}
```

- [ ] **Step 4: Esegui il test (deve passare)**

Run: `corepack pnpm --filter @coralyn/api test -- renew-booking.dto`
Expected: PASS (3 test).

- [ ] **Step 5: Mappa `previousBookingId` nella proiezione booking (test + mapping)**

a) In `apps/api/src/bookings/booking.projection.spec.ts`, **dentro** `describe('toBookingDTO', …)` (dopo il
test `packageId`), aggiungi:

```ts
  it('mappa previousBookingId quando valorizzato e null → undefined', () => {
    expect(toBookingDTO({ ...row, previousBookingId: 'prev-1' }).previousBookingId).toBe('prev-1');
    expect(toBookingDTO(row).previousBookingId).toBeUndefined();
  });
```

> Il test `toEqual` esistente **non** si rompe: `row.previousBookingId` è `null` → il DTO ha
> `previousBookingId: undefined`, e Jest `toEqual` ignora le proprietà `undefined`.

b) In `apps/api/src/bookings/booking.projection.ts`, **dopo** la riga `packageId: b.packageId ?? undefined,`,
aggiungi:

```ts
    previousBookingId: b.previousBookingId ?? undefined,
```

- [ ] **Step 6: Crea la proiezione dell'elenco abbonati**

Crea `apps/api/src/bookings/subscription.projection.ts`:

```ts
import type { Booking } from '@prisma/client';
import type { SubscriptionListItemDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta un abbonamento nell'elemento dell'elenco campagna (con anzianità e flag rinnovato). */
export function toSubscriptionListItemDTO(
  b: Booking,
  seniority: number,
  renewed: boolean,
): SubscriptionListItemDTO {
  return {
    id: b.id,
    customerId: b.customerId,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    packageId: b.packageId ?? undefined,
    startDate: formatDbDate(b.startDate),
    endDate: formatDbDate(b.endDate),
    totalPrice: Number(b.totalPrice),
    seniority,
    renewed,
  };
}
```

- [ ] **Step 7: Aggiorna gli import di `bookings.service.ts`**

In `apps/api/src/bookings/bookings.service.ts`, sostituisci il blocco import in cima con:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Booking, TimeSlot } from '@prisma/client';
import type {
  BookingDTO,
  BookingType,
  CreateBookingInput,
  QuoteBookingInput,
  RenewBookingInput,
  SettlePaymentInput,
  SubscriptionListItemDTO,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService, type QuoteOutcome } from '../catalog/catalog.service';
import { toBookingDTO } from './booking.projection';
import { toSubscriptionListItemDTO } from './subscription.projection';
import { slotsOverlap, dateRangesOverlap } from './booking.availability';
import { resolvePayment } from './booking.payment';
import { toDbDate, formatDbDate, todayInRome } from '../common/dates';
```

> Cambi: `+ Prisma, Booking, TimeSlot` (tipi — l'anzianità usa la query API Prisma, niente SQL raw, quindi
> `import type` basta); `+ RenewBookingInput, SubscriptionListItemDTO` (contratti); `+ formatDbDate`;
> `+ toSubscriptionListItemDTO`.

- [ ] **Step 8: Estrai l'helper `priceAndWrite` e refattorizza `create`**

In `apps/api/src/bookings/bookings.service.ts`, sostituisci **interamente** il metodo `create(...)` con
l'helper condiviso **più** il nuovo `create`:

```ts
  /**
   * Anti-overlap su intervallo + prezzo server-autoritativo + scrittura. Condiviso da create e renew
   * (riuso, non duplicazione). Gli input sono già validati/copiati dal chiamante; `slot` è la fascia
   * già caricata nel tenant.
   */
  private async priceAndWrite(
    tx: Prisma.TransactionClient,
    p: {
      tenantId: string;
      customerId: string;
      umbrellaId: string;
      slot: TimeSlot;
      packageId: string | null;
      type: BookingType;
      startDate: string;
      endDate: string;
      previousBookingId: string | null;
    },
  ): Promise<Booking> {
    const dbStart = toDbDate(p.startDate);
    const dbEnd = toDbDate(p.endDate);

    // Anti-overlap su intervallo (ADR-0013): stesso ombrellone, date intersecanti, fascia sovrapposta.
    const sameUmbrella = await tx.booking.findMany({
      where: { umbrellaId: p.umbrellaId, status: 'confirmed' },
      include: { timeSlot: true },
    });
    const conflict = sameUmbrella.some(
      (b) => dateRangesOverlap(b.startDate, b.endDate, dbStart, dbEnd) && slotsOverlap(b.timeSlot, p.slot),
    );
    if (conflict) throw new ConflictException('Fascia non disponibile per questo ombrellone');

    // Prezzo (server-autoritativo, mai dal client).
    const totalPrice = this.priceOrThrow(
      await this.catalog.priceWithin(tx, {
        umbrellaId: p.umbrellaId,
        timeSlotId: p.slot.id,
        startDate: p.startDate,
        endDate: p.endDate,
        type: p.type,
        packageId: p.packageId,
      }),
    );

    return tx.booking.create({
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
  }

  /** Crea una prenotazione (daily / periodic / subscription; status=confirmed). Prezzo/durata server-autoritativi. */
  async create(input: CreateBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();

    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Intervallo dal tipo (422 di dominio dentro deriveInterval).
      const { startDate, endDate } = await this.deriveInterval(tx, input);

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

      // 3) Anti-overlap + prezzo + scrittura (helper condiviso; non è un rinnovo).
      return this.priceAndWrite(tx, {
        tenantId,
        customerId: input.customerId,
        umbrellaId: input.umbrellaId,
        slot,
        packageId: input.packageId ?? null,
        type: input.type,
        startDate,
        endDate,
        previousBookingId: null,
      });
    });
    return toBookingDTO(created);
  }
```

- [ ] **Step 9: Aggiungi `renew`, `listSubscriptions`, `computeSeniority`**

In `apps/api/src/bookings/bookings.service.ts`, **dopo** il metodo `create` appena scritto (e prima di
`cancel`), aggiungi:

```ts
  /** Rinnova un abbonamento nella stagione di destinazione (server-autoritativo: copia dalla sorgente). */
  async renew(id: string, input: RenewBookingInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      // 1) Sorgente valida (nel tenant, abbonamento, confermato).
      const source = await tx.booking.findFirst({ where: { id }, include: { timeSlot: true } });
      if (!source) throw new NotFoundException('Prenotazione non trovata');
      if (source.type !== 'subscription')
        throw new UnprocessableEntityException('Si rinnovano solo gli abbonamenti');
      if (source.status !== 'confirmed')
        throw new UnprocessableEntityException('Impossibile rinnovare un abbonamento annullato');

      // 2) No doppio rinnovo.
      const already = await tx.booking.findFirst({ where: { previousBookingId: id, status: 'confirmed' } });
      if (already) throw new ConflictException('Abbonamento già rinnovato');

      // 3) Nuova stagione (semantica subscription), diversa da quella della sorgente.
      const season = await this.catalog.resolveSeasonWithin(tx, input.startDate);
      if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      if (season.startDate === formatDbDate(source.startDate))
        throw new UnprocessableEntityException('Il rinnovo deve puntare a una stagione diversa');

      // 4) Copia FK dalla sorgente + 5) anti-overlap/prezzo/scrittura (helper condiviso).
      return this.priceAndWrite(tx, {
        tenantId,
        customerId: source.customerId,
        umbrellaId: source.umbrellaId,
        slot: source.timeSlot,
        packageId: source.packageId,
        type: 'subscription',
        startDate: season.startDate,
        endDate: season.endDate,
        previousBookingId: id,
      });
    });
    return toBookingDTO(created);
  }

  /** Elenco abbonati confermati della stagione che contiene `date`, con anzianità e flag rinnovato. */
  async listSubscriptions(date: string): Promise<SubscriptionListItemDTO[]> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const season = await this.catalog.resolveSeasonWithin(tx, date);
      if (!season.ok) return [];
      const s = toDbDate(season.startDate);
      const e = toDbDate(season.endDate);
      const subs = await tx.booking.findMany({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: e }, endDate: { gte: s } },
        orderBy: { createdAt: 'asc' },
      });
      if (subs.length === 0) return [];
      const ids = subs.map((b) => b.id);
      const seniorityById = await this.computeSeniority(tx, ids);
      const renewedIds = new Set(
        (
          await tx.booking.findMany({
            where: { previousBookingId: { in: ids }, status: 'confirmed' },
            select: { previousBookingId: true },
          })
        ).map((r) => r.previousBookingId as string),
      );
      return subs.map((b) =>
        toSubscriptionListItemDTO(b, seniorityById.get(b.id) ?? 1, renewedIds.has(b.id)),
      );
    });
  }

  /**
   * Anzianità = lunghezza catena `previousBookingId`. Risalita iterativa per generazioni con la query
   * API Prisma (RLS via forTenant, niente SQL raw — coerente col resto del codebase). Query bounded dalla
   * profondità della catena (piccola: 1 per stagione), non dal numero di abbonati.
   */
  private async computeSeniority(
    tx: Prisma.TransactionClient,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const parentOf = new Map<string, string | null>();
    let toLoad = ids;
    while (toLoad.length > 0) {
      const gen = await tx.booking.findMany({
        where: { id: { in: toLoad } },
        select: { id: true, previousBookingId: true },
      });
      for (const r of gen) parentOf.set(r.id, r.previousBookingId);
      toLoad = gen
        .map((r) => r.previousBookingId)
        .filter((x): x is string => x !== null && !parentOf.has(x));
    }
    // Risali da ogni id contando gli antenati (guardia anti-ciclo difensiva: i cicli sono impossibili
    // per costruzione — ogni rinnovo linka un booking preesistente).
    const seniority = new Map<string, number>();
    for (const id of ids) {
      let depth = 1;
      let cur = parentOf.get(id) ?? null;
      const seen = new Set<string>([id]);
      while (cur !== null && parentOf.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        depth += 1;
        cur = parentOf.get(cur) ?? null;
      }
      seniority.set(id, depth);
    }
    return seniority;
  }
```

- [ ] **Step 10: Aggiungi le rotte nel controller**

In `apps/api/src/bookings/bookings.controller.ts`: estendi gli import dei tipi contratti e del DTO, e
aggiungi le due rotte.

a) Import:

```ts
import type { BookingDTO, BookingQuoteDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { RenewBookingDto } from './dto/renew-booking.dto';
```

b) **Dopo** il metodo `quote(...)` (rotta `@Get('quote')`), aggiungi:

```ts
  @Get('subscriptions')
  subscriptions(@Query() query: BookingsQueryDto): Promise<SubscriptionListItemDTO[]> {
    return this.bookings.listSubscriptions(resolveDate(query.date));
  }
```

c) **Dopo** il metodo `create(...)` (rotta `@Post()`), aggiungi:

```ts
  @Post(':id/renew')
  renew(@Param('id') id: string, @Body() body: RenewBookingDto): Promise<BookingDTO> {
    return this.bookings.renew(id, body);
  }
```

> `BookingsQueryDto`, `resolveDate`, `Get`, `Post`, `Param`, `Body`, `Query` sono già importati in questo
> file. Riuso `BookingsQueryDto` (stessa forma `date?`) per l'elenco abbonati: DRY, niente DTO gemello.

- [ ] **Step 11: `prisma generate` (se necessario) + build + tutti gli unit**

Run:
```bash
corepack pnpm --filter @coralyn/api exec prisma generate
corepack pnpm --filter @coralyn/api build
corepack pnpm --filter @coralyn/api test
```
Expected: build OK; unit PASS (DTO nuovo + proiezioni/engine invariati). Conteggio api unit **≥ 68**
(+3 DTO renew, +1 proiezione `previousBookingId`).

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/bookings/dto/renew-booking.dto.ts apps/api/src/bookings/dto/renew-booking.dto.spec.ts apps/api/src/bookings/subscription.projection.ts apps/api/src/bookings/booking.projection.ts apps/api/src/bookings/booking.projection.spec.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.controller.ts
git commit -m "feat(api): renew booking (priceAndWrite condiviso) + subscriptions + anzianità (A4.2)"
```

---

## Task 3: e2e — seed 2ª stagione + rinnovo/anzianità/validazioni/anti-overlap

**Files:** Modifica `apps/api/test/helpers/seed-pricing.ts`, `apps/api/test/bookings.e2e-spec.ts`

- [ ] **Step 1: Aggiungi al seed e2e la 2ª stagione 2027 con listino**

In `apps/api/test/helpers/seed-pricing.ts`, **dopo** la rate `subscription` (price 800) e **prima** del
`return`, aggiungi:

```ts
    // 2a stagione 2027 con proprio listino (prezzo abbonamento DIVERSO: 850) per esercitare il rinnovo.
    const season2027 = await tx.season.create({
      data: {
        establishmentId,
        name: 'Estate 2027',
        startDate: new Date('2027-05-01T00:00:00Z'),
        endDate: new Date('2027-09-30T00:00:00Z'),
      },
    });
    const pricing2027 = await tx.pricing.create({ data: { establishmentId, seasonId: season2027.id } });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing2027.id, price: 30, unit: RateUnit.day },
    });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing2027.id, type: 'subscription', price: 850, unit: RateUnit.period },
    });
```

> `cleanPricingTenant` cancella già **tutte** le rate/pricing/season del tenant (`deleteMany({})`): la 2ª
> stagione è ripulita senza modifiche all'afterAll.

- [ ] **Step 2: Aggiungi il describe rinnovo/anzianità**

In `apps/api/test/bookings.e2e-spec.ts`, **dopo** il describe `periodiche e abbonamenti (A4.1)` e **prima**
del test `DELETE annulla ...`, aggiungi:

```ts
  describe('rinnovo e anzianità (A4.2)', () => {
    let uRen: string; // ombrellone dell'abbonamento sorgente da rinnovare
    let srcId: string; // abbonamento sorgente 2026

    const mkUmbrella = (label: string, order: number) =>
      prisma.forTenant(s1, (tx) =>
        tx.umbrella.create({ data: { establishmentId: s1, rowId: ids.rowId, umbrellaTypeId: null, label, logicalOrder: order } }),
      );

    beforeAll(async () => {
      uRen = (await mkUmbrella('92', 92)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: uRen, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      srcId = src.body.id;
      expect(src.body.totalPrice).toBe(800);
    });

    it('elenco abbonati 2026: la sorgente ha seniority=1, renewed=false', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/subscriptions?date=2026-08-01').set(...bearer(token1)).expect(200);
      const row = res.body.find((b: { id: string }) => b.id === srcId);
      expect(row.seniority).toBe(1);
      expect(row.renewed).toBe(false);
    });

    it('rinnovo → 201: stagione 2027, prezzo nuovo listino (850), previousBookingId=sorgente, mappa season', async () => {
      const res = await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token1))
        .send({ startDate: '2027-07-01' }).expect(201);
      expect(res.body.type).toBe('subscription');
      expect(res.body.startDate).toBe('2027-05-01');
      expect(res.body.endDate).toBe('2027-09-30');
      expect(res.body.totalPrice).toBe(850);
      expect(res.body.previousBookingId).toBe(srcId);

      const map = await request(app.getHttpServer()).get('/api/map?date=2027-06-15').set(...bearer(token1)).expect(200);
      const cell = map.body.sectors[0].rows[0].umbrellas.find((u: { id: string }) => u.id === uRen);
      expect(cell.stateBySlot[ids.slotMorning]).toBe('season');
    });

    it('dopo il rinnovo: sorgente renewed=true; il rinnovo 2027 ha seniority=2', async () => {
      const s2026 = await request(app.getHttpServer()).get('/api/bookings/subscriptions?date=2026-08-01').set(...bearer(token1)).expect(200);
      expect(s2026.body.find((b: { id: string }) => b.id === srcId).renewed).toBe(true);
      const s2027 = await request(app.getHttpServer()).get('/api/bookings/subscriptions?date=2027-08-01').set(...bearer(token1)).expect(200);
      const renewal = s2027.body.find((b: { umbrellaId: string }) => b.umbrellaId === uRen);
      expect(renewal.seniority).toBe(2);
    });

    it('doppio rinnovo → 409', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token1))
        .send({ startDate: '2027-07-01' }).expect(409);
    });

    it('rinnovo verso la stessa stagione della sorgente → 422', async () => {
      const u = (await mkUmbrella('93', 93)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ startDate: '2026-08-01' }).expect(422);
    });

    it('rinnovo di una prenotazione non-abbonamento → 422', async () => {
      const day = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: ids.u2, startDate: '2026-06-05' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${day.body.id}/renew`).set(...bearer(token1))
        .send({ startDate: '2027-07-01' }).expect(422);
    });

    it('rinnovo di un abbonamento annullato → 422', async () => {
      const u = (await mkUmbrella('94', 94)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      await request(app.getHttpServer()).delete(`/api/bookings/${src.body.id}`).set(...bearer(token1)).expect(200);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ startDate: '2027-07-01' }).expect(422);
    });

    it('rinnovo di sorgente di un altro tenant → 404 (isolamento)', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${srcId}/renew`).set(...bearer(token2))
        .send({ startDate: '2027-07-01' }).expect(404);
    });

    it('anti-overlap sul rinnovo: ombrellone occupato in 2027 → 409', async () => {
      const u = (await mkUmbrella('95', 95)).id;
      const src = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2026-07-01' })).expect(201);
      // Occupa lo stesso ombrellone in 2027 con un abbonamento diretto.
      await request(app.getHttpServer()).post('/api/bookings').set(...bearer(token1))
        .send(body({ umbrellaId: u, type: 'subscription', startDate: '2027-07-01' })).expect(201);
      await request(app.getHttpServer()).post(`/api/bookings/${src.body.id}/renew`).set(...bearer(token1))
        .send({ startDate: '2027-07-01' }).expect(409);
    });

    it('elenco abbonati fuori stagione → [] (nessuna stagione)', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/subscriptions?date=2030-01-10').set(...bearer(token1)).expect(200);
      expect(res.body).toEqual([]);
    });
  });
```

- [ ] **Step 3: Esegui gli e2e bookings**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- bookings`
Expected: PASS (nuovi rinnovo/anzianità/validazioni/anti-overlap + esistenti). *(Se non carica `.env.test`,
anteponi `DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public"`.)*

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/helpers/seed-pricing.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): e2e rinnovo + anzianità + validazioni + anti-overlap (2a stagione 2027) (A4.2)"
```

---

## Task 4: FE — vista "Rinnovi" + composable + rotta + sidebar + MSW

**Files:** Modifica `apps/web-staff/src/lib/queryKeys.ts`, `apps/web-staff/src/router/index.ts`,
`apps/web-staff/src/app/Sidebar.vue`, `apps/web-staff/src/mocks/server.ts`; Crea
`apps/web-staff/src/features/renewals/useRenewals.ts`,
`apps/web-staff/src/features/renewals/RenewalsView.vue`,
`apps/web-staff/src/features/renewals/RenewalsView.spec.ts`

- [ ] **Step 1: Aggiungi la query key**

In `apps/web-staff/src/lib/queryKeys.ts`, **dentro** l'oggetto `queryKeys`, aggiungi:

```ts
  subscriptions: (tenantId: string, date: string) => ['subscriptions', tenantId, date] as const,
```

- [ ] **Step 2: Crea i composable**

Crea `apps/web-staff/src/features/renewals/useRenewals.ts`:

```ts
import { computed, type Ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { BookingDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Abbonati della stagione che contiene `date` (campagna rinnovi). */
export function useSubscriptions(date: Ref<string>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.subscriptions(session.establishmentId, date.value)),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?date=${date.value}`),
    enabled: computed(() => !!date.value),
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (`startDate`). */
export function useRenewBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ startDate }) }),
    onSuccess: () => {
      // La riga diventa "Rinnovato" e il nuovo abbonamento appare nell'elenco della stagione di destinazione.
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['map'] });
    },
  });
}
```

- [ ] **Step 3: Crea la vista `RenewalsView.vue`**

Crea `apps/web-staff/src/features/renewals/RenewalsView.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Badge, DataTable, Avatar } from '@coralyn/ui-kit';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { useSubscriptions, useRenewBooking } from './useRenewals';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';

const session = useSessionStore();
const { activeDate } = storeToRefs(session);
const sourceDate = ref(activeDate.value); // una data nella stagione di ORIGINE
const targetDate = ref('');               // una data nella stagione di DESTINAZIONE

const { data: subs } = useSubscriptions(sourceDate);
const { data: customers } = useCustomers();
const { data: map } = useDayMap(); // le label ombrellone non dipendono dalla data
const renew = useRenewBooking();

const cols = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'ombrellone', label: 'Ombrellone' },
  { key: 'anzianita', label: 'Anzianità' },
  { key: 'stato', label: 'Stato' },
  { key: 'azione', label: '', align: 'right' as const },
];

const rows = computed(() => subs.value ?? []);
const customerName = (id: string): string => {
  const c = (customers.value ?? []).find((x) => x.id === id);
  return c ? `${c.firstName} ${c.lastName}` : id;
};
const umbrellaLabel = computed(() => {
  const m = new Map<string, string>();
  for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
  return m;
});
const initials = (name: string): string => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function doRenew(id: string): void {
  if (!targetDate.value) return;
  renew.mutate({ id, startDate: targetDate.value });
}
</script>

<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <div class="mb-4 flex flex-wrap items-end gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di origine</span>
        <input type="date" v-model="sourceDate" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[12.5px] font-semibold text-[var(--color-text-2nd)]">Stagione di destinazione</span>
        <input type="date" v-model="targetDate" class="rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-text)] focus:outline-none" />
      </label>
    </div>

    <DataTable v-if="rows.length" :columns="cols">
      <tr v-for="b in rows" :key="b.id" class="hover:bg-[var(--color-raised)]">
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5">
          <div class="flex items-center gap-2.5">
            <Avatar :initials="initials(customerName(b.customerId))" size="sm" />
            <span class="font-semibold text-[var(--color-text)]">{{ customerName(b.customerId) }}</span>
          </div>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ umbrellaLabel.get(b.umbrellaId) ?? '—' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5 tabular-nums text-[var(--color-text-2nd)]">{{ b.seniority }} {{ b.seniority === 1 ? 'stagione' : 'stagioni' }}</td>
        <td class="border-b border-[var(--color-border-row)] px-3.5 py-3.5">
          <Badge :tone="b.renewed ? 'success' : 'neutral'">{{ b.renewed ? 'Rinnovato' : 'Da rinnovare' }}</Badge>
        </td>
        <td class="border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right">
          <Button :disabled="b.renewed || !targetDate" @click="doRenew(b.id)">Rinnova</Button>
        </td>
      </tr>
    </DataTable>
    <p v-else class="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] px-6 py-10 text-center text-sm text-[var(--color-text-2nd)]">
      Nessun abbonato per questa stagione.
    </p>
  </section>
</template>
```

- [ ] **Step 4: Registra la rotta e la voce di sidebar**

In `apps/web-staff/src/router/index.ts`, **dopo** la rotta `/bookings`, aggiungi:

```ts
  { path: '/renewals', name: 'renewals', component: () => import('@/features/renewals/RenewalsView.vue'), meta: { title: 'Rinnovi', subtitle: 'Campagna rinnovi abbonamenti' } },
```

In `apps/web-staff/src/app/Sidebar.vue`, nell'array `nav`, **dopo** la voce Prenotazioni, aggiungi:

```ts
  { to: '/renewals', label: 'Rinnovi', icon: 'renew' },
```

- [ ] **Step 5: Handler MSW (test-only)**

In `apps/web-staff/src/mocks/server.ts`, **dentro** `setupServer(...)` (es. dopo l'handler
`http.get('/api/bookings', ...)`), aggiungi:

```ts
  http.get('/api/bookings/subscriptions', ({ request }) => {
    const date = new URL(request.url).searchParams.get('date') ?? '';
    if (date.startsWith('2027')) {
      return HttpResponse.json([
        { id: 'sub-2027', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', totalPrice: 850, seniority: 2, renewed: false },
      ]);
    }
    return HttpResponse.json([
      { id: 'sub-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, seniority: 1, renewed: false },
    ]);
  }),
  http.post('/api/bookings/:id/renew', async ({ params, request }) => {
    const b = (await request.json()) as { startDate: string };
    return HttpResponse.json(
      { id: 'bk-renew', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2027-05-01', endDate: '2027-09-30', type: 'subscription', status: 'confirmed', totalPrice: 850, paymentStatus: 'unpaid', amountCollected: 0, previousBookingId: params.id as string },
      { status: 201 },
    );
  }),
```

> **Attenzione all'ordine MSW:** registra `http.get('/api/bookings/subscriptions', …)` **prima** dell'even-
> tuale handler generico `http.get('/api/bookings', …)`? In MSW l'ordine non conta per path diversi
> (`/subscriptions` è un path distinto, non un parametro): nessun conflitto.

- [ ] **Step 6: Test della vista (TDD leggero)**

Crea `apps/web-staff/src/features/renewals/RenewalsView.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import RenewalsView from './RenewalsView.vue';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RenewalsView', () => {
  it('elenca gli abbonati con anzianità e nome cliente risolto', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Rossi');     // c-1 risolto dalla query clienti
    expect(w.text()).toContain('Anzianità');  // header colonna
    expect(w.text()).toContain('stagione');   // "1 stagione" (seniority di sub-1)
  });

  it('Rinnova è disabilitato senza data di destinazione e si abilita impostandola', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    const renewBtn = () => w.findAll('button').find((b) => b.text().includes('Rinnova'));
    expect(renewBtn()?.attributes('disabled')).toBeDefined();
    const target = w.findAll('input[type="date"]')[1]; // [0] origine, [1] destinazione
    await target.setValue('2027-07-01');
    await flushPromises();
    expect(renewBtn()?.attributes('disabled')).toBeUndefined();
  });
});
```

- [ ] **Step 7: Esegui i test FE + typecheck**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff test -- RenewalsView
corepack pnpm --filter @coralyn/web-staff typecheck
```
Expected: PASS; nessun errore TS. *(Se i tipi contratti sono stale: elimina `apps/web-staff/node_modules/.vite` e ri-esegui.)*

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/renewals/ apps/web-staff/src/router/index.ts apps/web-staff/src/app/Sidebar.vue apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): vista Rinnovi (elenco abbonati + anzianità + azione rinnova) (A4.2)"
```

---

## Task 5: Seed dev + documentazione + handoff + verifica finale (DoD)

**Files:** Modifica `apps/api/prisma/seed.ts`, `README.md`, `docs/design/data-model.md`,
`docs/architecture/glossary.md`; crea `docs/handoff/2026-07-01-bookings-a4-2-done.md`

- [ ] **Step 1: Seed dev — 2ª stagione 2027 con listino**

In `apps/api/prisma/seed.ts`, **dopo** il blocco `RATE_SUB` (price 800) e **prima** della chiusura del
`$transaction` (`});`), aggiungi:

```ts
    // 2a stagione 2027 (listino con abbonamento a prezzo diverso: 850) per esercitare il rinnovo (A4.2).
    const SEASON_2027 = u(7, 2);
    await tx.season.upsert({
      where: { id: SEASON_2027 },
      update: { name: 'Estate 2027', startDate: t2('2027-05-01'), endDate: t2('2027-09-30') },
      create: { id: SEASON_2027, establishmentId: EID, name: 'Estate 2027', startDate: t2('2027-05-01'), endDate: t2('2027-09-30') },
    });
    const PRICING_2027 = u(8, 2);
    await tx.pricing.upsert({
      where: { id: PRICING_2027 },
      update: { seasonId: SEASON_2027 },
      create: { id: PRICING_2027, establishmentId: EID, seasonId: SEASON_2027 },
    });
    const RATE_BASE_2027 = u(9, 4);
    await tx.rate.upsert({
      where: { id: RATE_BASE_2027 },
      update: { price: 30, unit: 'day' },
      create: { id: RATE_BASE_2027, establishmentId: EID, pricingId: PRICING_2027, price: 30, unit: 'day' },
    });
    const RATE_SUB_2027 = u(9, 5);
    await tx.rate.upsert({
      where: { id: RATE_SUB_2027 },
      update: { type: 'subscription', price: 850, unit: 'period' },
      create: { id: RATE_SUB_2027, establishmentId: EID, pricingId: PRICING_2027, type: 'subscription', price: 850, unit: 'period' },
    });
```

- [ ] **Step 2: Applica il seed a `coralyn_dev`**

Run:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm --filter @coralyn/api exec prisma db seed
```
Expected: seed OK (idempotente, upsert). *(Usare `prisma db seed`, non `ts-node prisma/seed.ts` — gotcha A4.1.)*

- [ ] **Step 3: Aggiorna glossary, data-model, README**

- `glossary.md`: righe **Rinnovo** e **Anzianità** — da "(futuro)"/"inutilizzato fino ad A4.2" a
  **implementati (A4.2)**: `previousBookingId` **valorizzato** dal rinnovo; anzianità = lunghezza catena,
  derivata (CTE). Riga **Abbonamento**: nota il rinnovo (`POST /bookings/:id/renew`).
- `data-model.md`: nota d'intestazione e regola "Rinnovo / anzianità" — `previousBookingId` ora
  **valorizzato** (A4.2); anzianità derivata dalla catena; prelazione/cabine restano
  [D-011]/[D-012]/[D-013].
- `README.md`: stato — **A4.2 rinnovo + anzianità implementati → increment A4 COMPLETO** (rinnovo copia+
  riprezza+link, anzianità derivata, vista Rinnovi); prossimo: editor CRUD listino ([D-032]) o prelazione
  ([D-011]).

- [ ] **Step 4: Scrivi l'handoff A4.2**

Crea `docs/handoff/2026-07-01-bookings-a4-2-done.md` sul modello di
`2026-07-01-bookings-a4-1-done.md`: stato git (branch `feat/bookings-renewal-a4-2` da `main` `36babbe`);
cosa consegna A4.2 (`POST /bookings/:id/renew` server-autoritativo con `priceAndWrite` condiviso; `GET
/bookings/subscriptions`; anzianità via CTE ricorsiva; `BookingDTO.previousBookingId`; vista FE Rinnovi;
seed 2ª stagione 2027); confini (prelazione [D-011], cabine [D-012], sospensione [D-013], notifiche
[D-006], editor listino [D-032]; direzione temporale non enforced; engine/mappa/RLS/schema invariati,
nessuna migrazione); conteggi test aggiornati; gotcha riconfermati (whitelist scarta campi non-DTO; porta
5433; `prisma db seed`; rebuild api Docker; pulizia `.vite`; **fix MSW dev nel working tree, non
committata**); **prossimo slice** (D-032 o D-011).

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
Expected: tutto verde. Conteggi attesi: ui-kit **14** (invariato) · web-staff **≥47** (+RenewalsView ×2) ·
api unit **≥68** (+3 DTO renew, +1 proiezione) · api e2e **≥73** (+10 rinnovo/anzianità/validazioni/anti-overlap/elenco).

- [ ] **Step 6: Verifica live (Docker) — raccomandata**

```bash
docker compose --profile full up -d --build api
```
Login admin dev (`admin@coralyn.dev` / `coralyn-admin-8473`). Crea un **abbonamento** 2026 dalla mappa;
apri **Rinnovi**, stagione origine 2026, imposta una data 2027, **Rinnova** → il nuovo abbonamento 2027
(prezzo 850) esiste, la riga sorgente diventa "Rinnovato"; la mappa di un giorno 2027 mostra l'ombrellone
`season`. *(Rebuild dell'immagine api dopo il cambio BE, altrimenti il FE prende 404.)*

- [ ] **Step 7: Commit + push**

```bash
git add apps/api/prisma/seed.ts README.md docs/design/data-model.md docs/architecture/glossary.md docs/handoff/2026-07-01-bookings-a4-2-done.md
git commit -m "docs: A4.2 rinnovo + anzianità implementati (seed 2027, glossary, data-model, README, handoff)"
git push -u origin feat/bookings-renewal-a4-2
```

> **Merge:** dopo il push e la revisione, merge **fast-forward** su `main` (pattern A1→A4.1). La fix MSW nel
> working tree resta fuori da questi commit: la si decide separatamente.

---

## Self-review (eseguito in fase di scrittura)

- **Copertura spec:** §3 contratti (RenewBookingInput/SubscriptionListItemDTO/previousBookingId) → Task 1;
  §4 endpoint renew + subscriptions → Task 2 (Step 10) + e2e Task 3; §5.1 helper `priceAndWrite` condiviso
  → Task 2 (Step 8); §5.2 renew (sorgente valida, no doppio rinnovo, stagione diversa, copia FK) → Task 2
  (Step 9) + e2e Task 3; §5.3 listSubscriptions + §6 anzianità (risalita iterativa) → Task 2 (Step 9) + e2e Task 3; §7 mappa
  invariata → verificata da e2e (`season` in 2027); §8 FE vista Rinnovi + composable → Task 4; §9 seed 2ª
  stagione → Task 3 (e2e) + Task 5 (dev); §10 test → Task 2/3/4/5; §11 DoD/doc → Task 5; §12 casi limite →
  e2e Task 3; §13 decisioni → riflesse in confini/handoff.
- **Placeholder:** nessuno; ogni step ha codice/comando reale.
- **Coerenza tipi:** `RenewBookingInput` (contracts) ↔ `RenewBookingDto` ↔ `BookingsService.renew` ↔ FE
  `useRenewBooking` (`{ id, startDate }`); `SubscriptionListItemDTO` (contracts) ↔ `toSubscriptionListItemDTO`
  ↔ `listSubscriptions` ↔ FE `useSubscriptions` ↔ MSW handler; `priceAndWrite` (firma unica) usato da
  `create` e `renew`; `computeSeniority` → `Map<string, number>` consumato in `listSubscriptions`;
  `previousBookingId` in `BookingDTO` ↔ `toBookingDTO`. `Prisma.sql`/`Prisma.join` richiedono l'import
  **valore** `Prisma` (Step 7). Engine/mappa non toccati.
```
