# Scheda Cliente 360° — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere reali le 3 card stub della vista dettaglio cliente (`/customers/:id`) — Storico · Abbonamento e anzianità · Pagamenti e saldo — alimentandole con un unico endpoint di lettura arricchito `GET /customers/:id/bookings`.

**Architecture:** Un solo endpoint `GET /customers/:id/bookings` → `CustomerBookingDTO[]` (route customer-centrica in `CustomersController`, logica nel dominio bookings: `BookingsService.listByCustomer`). Le 3 card sono derivazioni FE dello stesso dataset (storico = lista; anzianità = filtro subscription + `computeSeniority` + rinnovi + prelazione; saldo = aggregazione FE). La prelazione riusa lo stato-finestra della vista Rinnovi via helper condiviso `computeRenewalWindowState` (fonte unica, no drift). Read-only, nessuna migrazione, nessun nuovo ADR.

**Tech Stack:** NestJS + Prisma (RLS `forTenant`) + `@coralyn/contracts` (DTO condivisi) · Vue 3 + Vue Query + Vitest/MSW (web-staff) · Jest/supertest (api e2e).

## Global Constraints

- **Convenzione:** codice/DB in inglese; UI/doc in italiano.
- **Nessuna migrazione, nessun cambio di schema, nessun nuovo ADR** (incremento di lettura sull'architettura esistente — ADR-0006/0013/0034/0010/0009).
- **Fonte unica di verità:** anzianità riusa `computeSeniority` (`apps/api/src/bookings/seniority.ts`); la prelazione riusa lo stesso stato-finestra della vista Rinnovi via helper condiviso `computeRenewalWindowState` — mai duplicare la logica.
- **Read-only:** le card espongono, non modificano. Nessuna nuova azione di scrittura in questo slice.
- **Baseline test da NON regredire** (su `main`, post-D-030, riverificata dal vivo): **api unit 101 · api e2e 153 · web-staff 153 (globa ui-kit) · ui-kit standalone 55.** Typecheck web-staff pulito. Gli incrementi sono additivi.
- **RLS:** ogni lettura passa da `prisma.forTenant(tenantId, tx => …)`. Un cliente di un altro tenant è invisibile → lista vuota (nessun 404 dedicato).
- **Comandi test** (dal root, con `corepack pnpm`):
  - api unit: `corepack pnpm --filter @coralyn/api test`
  - api e2e: `corepack pnpm --filter @coralyn/api test:e2e`
  - web-staff: `corepack pnpm --filter web-staff test`
  - typecheck web-staff: `corepack pnpm --filter web-staff typecheck`
  - contracts build (se tocchi i DTO): `corepack pnpm --filter @coralyn/contracts build`
  - *("worker failed to exit gracefully" di Jest = rumore di teardown pre-esistente, non un fallimento.)*
- **Branch:** tutto il lavoro su un NUOVO branch da `main` (es. `feat/scheda-cliente-360`). Un commit per task.
- **Subagent-driven:** ogni implementer fa TU il lavoro, **NON** spawna/annida subagent. Se finisce a mani vuote, verificare `git log`/working-tree PRIMA di ri-dispatchare.

---

## File Structure

**Backend (`apps/api`)**
- `packages/contracts/src/index.ts` — nuovo `CustomerBookingDTO` (additivo, vicino a `BookingDTO`).
- `apps/api/src/bookings/customer-booking.projection.ts` — **nuovo**: `toCustomerBookingDTO(b, enrichment)` + `resolveSeasonName(seasons, start)` (funzioni pure).
- `apps/api/src/bookings/bookings.service.ts` — **modifica**: nuovo metodo `listByCustomer(customerId)`.
- `apps/api/src/bookings/bookings.module.ts` — **modifica**: `exports: [BookingsService]`.
- `apps/api/src/customers/customers.module.ts` — **modifica**: `imports: [BookingsModule]`.
- `apps/api/src/customers/customers.controller.ts` — **modifica**: rotta `GET :id/bookings`.
- `apps/api/src/bookings/renewal-window.projection.ts` — **modifica** (Task 3): estrai `computeRenewalWindowState`.
- `apps/api/src/bookings/renewal-campaigns.service.ts` — **modifica** (Task 3): usa l'helper (comportamento invariato).

**Test backend**
- `apps/api/src/bookings/customer-booking.projection.spec.ts` — **nuovo** (unit projection + season name).
- `apps/api/src/bookings/renewal-window.projection.spec.ts` — **nuovo** (unit helper `computeRenewalWindowState`).
- `apps/api/test/customer-bookings.e2e-spec.ts` — **nuovo** (endpoint arricchito, mix/subscription/prelazione/cancellata/vuoto/tenant).

**Frontend (`apps/web-staff`)**
- `apps/web-staff/src/lib/queryKeys.ts` — **modifica**: `customerBookings`.
- `apps/web-staff/src/features/customers/useCustomers.ts` — **modifica**: `useCustomerBookings(id)`.
- `apps/web-staff/src/features/customers/CustomerHistoryCard.vue` — **nuovo** (Storico).
- `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue` — **nuovo** (Abbonamento e anzianità).
- `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue` — **nuovo** (Pagamenti e saldo).
- `apps/web-staff/src/features/customers/CustomerDetailView.vue` — **modifica**: monta le 3 card reali al posto degli stub.
- `apps/web-staff/src/mocks/server.ts` — **modifica**: seed + handler `GET /api/customers/:id/bookings`.

**Test frontend**
- `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` — **modifica** (aggiorna i test degli stub; aggiungi render 3 card).

---

## Layering & Commit Boundaries

Segue la spec §8. Layer che condividono un confine di compilazione atterrano nello STESSO commit:

- **Task 1 (commit):** `CustomerBookingDTO` (contracts) + projection + `listByCustomer` **senza prelazione** + wiring moduli + rotta + unit projection + e2e base. *(Contracts e endpoint devono compilare insieme.)*
- **Task 2 (commit):** FE — composable + 3 card **senza prelazione** + handler MSW + test FE.
- **Task 3 (commit):** estrazione `computeRenewalWindowState` (refactor Rinnovi, comportamento invariato) + arricchimento `prelazione` nell'endpoint + unit helper + e2e prelazione + regressione rinnovi verde.
- **Task 4 (commit):** FE — nota/badge prelazione nella card Abbonamento + test FE.

*(Se in esecuzione il carico dei Task 3-4 risultasse eccessivo, diventano uno slice B: i Task 1-2 sono già uno slice completo e spedibile. La spec resta la fonte.)*

---

## Task 1: Endpoint arricchito base (`CustomerBookingDTO` + `listByCustomer` senza prelazione)

**Files:**
- Modify: `packages/contracts/src/index.ts` (dopo `BookingDTO`, ~riga 192)
- Create: `apps/api/src/bookings/customer-booking.projection.ts`
- Create: `apps/api/src/bookings/customer-booking.projection.spec.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts` (nuovo metodo `listByCustomer`)
- Modify: `apps/api/src/bookings/bookings.module.ts` (`exports`)
- Modify: `apps/api/src/customers/customers.module.ts` (`imports`)
- Modify: `apps/api/src/customers/customers.controller.ts` (rotta)
- Create: `apps/api/test/customer-bookings.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `CustomerBookingDTO` (contracts) — vedi shape sotto.
  - `toCustomerBookingDTO(b: Booking, e: CustomerBookingEnrichment): CustomerBookingDTO`
  - `resolveSeasonName(seasons: { name: string; startDate: Date; endDate: Date }[], bookingStart: Date): string | undefined`
  - `BookingsService.listByCustomer(customerId: string): Promise<CustomerBookingDTO[]>`
- Consumes: `computeSeniority` (`./seniority`), `formatDbDate` (`../common/dates`), `UUID_SHAPE` (`../common/uuid`).

---

- [ ] **Step 1: Aggiungi `CustomerBookingDTO` ai contracts**

In `packages/contracts/src/index.ts`, subito dopo l'interfaccia `BookingDTO` (che finisce ~riga 192):

```ts
/**
 * DTO arricchito di una prenotazione, per la Scheda Cliente 360°. Deriva da BookingDTO
 * (senza `customerId`, implicito nella route) + arricchimenti di sola presentazione.
 * Date ISO yyyy-mm-dd.
 */
export interface CustomerBookingDTO {
  id: string;
  umbrellaId: string;
  timeSlotId: string;
  startDate: string;
  endDate: string;
  type: BookingType;
  status: BookingStatus;
  totalPrice: number;
  paymentStatus: PaymentStatus;
  amountCollected: number;
  paymentMethod?: PaymentMethod;
  collectionDate?: string;
  packageId?: string;
  previousBookingId?: string;
  // — arricchimenti server-side —
  umbrellaLabel: string;          // join Umbrella.label (il FE non carica la mappa)
  seasonName?: string;            // Season che contiene startDate; assente se nessuna
  seniority?: number;             // SOLO subscription: lunghezza catena rinnovi (>=1)
  renewed?: boolean;              // SOLO subscription: esiste un rinnovo confermato
  prelazione?: {                  // SOLO subscription confermata con finestra APERTA. Assente altrimenti.
    destinationSeasonName: string;
    deadline: string;             // ISO yyyy-mm-dd
  };
}
```

- [ ] **Step 2: Ricompila i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, `CustomerBookingDTO` disponibile per api e web-staff.

- [ ] **Step 3: Scrivi il test della projection (fallisce)**

Create `apps/api/src/bookings/customer-booking.projection.spec.ts`:

```ts
import { toCustomerBookingDTO, resolveSeasonName } from './customer-booking.projection';
import type { Booking } from '@prisma/client';

function bookingRow(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    establishmentId: 't1',
    customerId: 'c1',
    umbrellaId: 'u1',
    timeSlotId: 's1',
    previousBookingId: null,
    packageId: null,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-01'),
    type: 'daily',
    status: 'confirmed',
    totalPrice: { toString: () => '30' } as unknown as Booking['totalPrice'],
    extras: null,
    paymentStatus: 'unpaid',
    amountCollected: { toString: () => '0' } as unknown as Booking['amountCollected'],
    paymentMethod: null,
    collectionDate: null,
    createdAt: new Date('2026-07-01'),
    slotStartMin: 0,
    slotEndMin: 0,
    ...over,
  } as Booking;
}

describe('toCustomerBookingDTO', () => {
  it('mappa i campi base + arricchimenti, omette customerId', () => {
    const dto = toCustomerBookingDTO(bookingRow(), {
      umbrellaLabel: 'A12',
      seasonName: 'Estate 2026',
    });
    expect(dto).toMatchObject({
      id: 'b1',
      umbrellaId: 'u1',
      type: 'daily',
      totalPrice: 30,
      amountCollected: 0,
      umbrellaLabel: 'A12',
      seasonName: 'Estate 2026',
    });
    expect('customerId' in dto).toBe(false);
    expect(dto.seniority).toBeUndefined();
    expect(dto.renewed).toBeUndefined();
    expect(dto.prelazione).toBeUndefined();
  });

  it('valorizza seniority/renewed per una subscription', () => {
    const dto = toCustomerBookingDTO(bookingRow({ type: 'subscription' }), {
      umbrellaLabel: 'A12',
      seniority: 3,
      renewed: true,
    });
    expect(dto.type).toBe('subscription');
    expect(dto.seniority).toBe(3);
    expect(dto.renewed).toBe(true);
  });
});

describe('resolveSeasonName', () => {
  const seasons = [
    { name: 'Estate 2026', startDate: new Date('2026-06-01'), endDate: new Date('2026-09-15') },
    { name: 'Estate 2027', startDate: new Date('2027-05-01'), endDate: new Date('2027-09-30') },
  ];
  it('ritorna la stagione che contiene la data', () => {
    expect(resolveSeasonName(seasons, new Date('2026-07-10'))).toBe('Estate 2026');
  });
  it('ritorna undefined fuori stagione', () => {
    expect(resolveSeasonName(seasons, new Date('2026-01-01'))).toBeUndefined();
  });
  it('su stagioni sovrapposte sceglie quella con startDate più recente', () => {
    const overlap = [
      { name: 'Vecchia', startDate: new Date('2026-06-01'), endDate: new Date('2026-09-30') },
      { name: 'Nuova', startDate: new Date('2026-07-01'), endDate: new Date('2026-08-31') },
    ];
    expect(resolveSeasonName(overlap, new Date('2026-07-15'))).toBe('Nuova');
  });
});
```

- [ ] **Step 4: Esegui il test per vederlo fallire**

Run: `corepack pnpm --filter @coralyn/api test customer-booking.projection`
Expected: FAIL con "Cannot find module './customer-booking.projection'".

- [ ] **Step 5: Implementa la projection**

Create `apps/api/src/bookings/customer-booking.projection.ts`:

```ts
import type { Booking } from '@prisma/client';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

export interface CustomerBookingEnrichment {
  umbrellaLabel: string;
  seasonName?: string;
  seniority?: number;
  renewed?: boolean;
  prelazione?: { destinationSeasonName: string; deadline: string };
}

/** Proietta una riga Booking nel DTO arricchito della Scheda Cliente (customerId omesso: implicito nella route). */
export function toCustomerBookingDTO(b: Booking, e: CustomerBookingEnrichment): CustomerBookingDTO {
  return {
    id: b.id,
    umbrellaId: b.umbrellaId,
    timeSlotId: b.timeSlotId,
    startDate: formatDbDate(b.startDate),
    endDate: formatDbDate(b.endDate),
    type: b.type,
    status: b.status,
    totalPrice: Number(b.totalPrice),
    paymentStatus: b.paymentStatus,
    amountCollected: Number(b.amountCollected),
    paymentMethod: b.paymentMethod ?? undefined,
    collectionDate: b.collectionDate ? formatDbDate(b.collectionDate) : undefined,
    packageId: b.packageId ?? undefined,
    previousBookingId: b.previousBookingId ?? undefined,
    umbrellaLabel: e.umbrellaLabel,
    seasonName: e.seasonName,
    seniority: e.seniority,
    renewed: e.renewed,
    prelazione: e.prelazione,
  };
}

/**
 * Nome della stagione che contiene bookingStart (etichetta di raggruppamento, non semantica di dominio).
 * Tie-break deterministico su stagioni sovrapposte (possibile post-D-030): la più specifica = startDate più recente.
 */
export function resolveSeasonName(
  seasons: { name: string; startDate: Date; endDate: Date }[],
  bookingStart: Date,
): string | undefined {
  const containing = seasons.filter((s) => s.startDate <= bookingStart && bookingStart <= s.endDate);
  if (containing.length === 0) return undefined;
  return containing.reduce((a, b) => (b.startDate > a.startDate ? b : a)).name;
}
```

- [ ] **Step 6: Esegui il test — deve passare**

Run: `corepack pnpm --filter @coralyn/api test customer-booking.projection`
Expected: PASS (5 test).

- [ ] **Step 7: Implementa `listByCustomer` nel service (senza prelazione)**

In `apps/api/src/bookings/bookings.service.ts`:
1. Aggiungi agli import (in cima):

```ts
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { toCustomerBookingDTO, resolveSeasonName } from './customer-booking.projection';
import { UUID_SHAPE } from '../common/uuid';
```

2. Aggiungi il metodo dentro la classe `BookingsService` (es. dopo `listByDate`):

```ts
  /**
   * Tutte le prenotazioni di un cliente, arricchite per la Scheda Cliente 360° (ordine startDate desc).
   * Nessun filtro su status: le cancellate servono allo storico (il FE le distingue). Read-only.
   * La prelazione viene aggiunta in un layer successivo (helper condiviso computeRenewalWindowState).
   */
  async listByCustomer(customerId: string): Promise<CustomerBookingDTO[]> {
    const tenantId = this.tenant.require();
    if (!UUID_SHAPE.test(customerId)) return []; // id malformato → invisibile, come un altro tenant
    return this.prisma.forTenant(tenantId, async (tx) => {
      const bookings = await tx.booking.findMany({
        where: { customerId },
        include: { umbrella: true, renewals: true },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      });
      if (bookings.length === 0) return [];
      const seasons = await tx.season.findMany({});
      const subIds = bookings.filter((b) => b.type === 'subscription').map((b) => b.id);
      const seniorityById = await computeSeniority(tx, subIds);
      return bookings.map((b) => {
        const isSub = b.type === 'subscription';
        return toCustomerBookingDTO(b, {
          umbrellaLabel: b.umbrella.label,
          seasonName: resolveSeasonName(seasons, b.startDate),
          seniority: isSub ? (seniorityById.get(b.id) ?? 1) : undefined,
          renewed: isSub ? b.renewals.some((r) => r.status === 'confirmed') : undefined,
        });
      });
    });
  }
```

- [ ] **Step 8: Esporta `BookingsService` dal modulo**

In `apps/api/src/bookings/bookings.module.ts`, aggiungi `exports`:

```ts
@Module({
  imports: [CatalogModule],
  controllers: [BookingsController, RenewalCampaignsController],
  providers: [BookingsService, RenewalCampaignsService],
  exports: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 9: Importa `BookingsModule` in `CustomersModule`**

In `apps/api/src/customers/customers.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [BookingsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
```

- [ ] **Step 10: Aggiungi la rotta nel controller clienti**

In `apps/api/src/customers/customers.controller.ts`:
1. Import DTO + service:

```ts
import { CustomerDTO, CustomerBookingDTO } from '@coralyn/contracts';
import { BookingsService } from '../bookings/bookings.service';
```

2. Inietta il service nel costruttore e aggiungi la rotta. **La rotta `:id/bookings` va dichiarata prima o insieme a `:id` — Nest le distingue per path; è comunque un percorso distinto:**

```ts
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly bookings: BookingsService,
  ) {}

  // …list / getById / create / update invariati…

  @Get(':id/bookings')
  listBookings(@Param('id') id: string): Promise<CustomerBookingDTO[]> {
    return this.bookings.listByCustomer(id);
  }
}
```

- [ ] **Step 11: Scrivi l'e2e dell'endpoint (fallisce)**

Create `apps/api/test/customer-bookings.e2e-spec.ts`. Segue il pattern di `customers.e2e-spec.ts` (auth, tenant, cleanup). Semina lato DB via `prisma.forTenant`. **Nota: crea le prenotazioni tramite l'API (`POST /api/bookings`) per rispettare pricing/anti-overlap, dopo aver seminato catalogo minimo (stagione+pricing+rate, ombrellone, fascia, cliente) via `prisma.forTenant`.** Copre: mix daily+subscription ordinati desc con `umbrellaLabel`/`seasonName`; subscription rinnovata → `seniority`/`renewed`; cancellata presente; cliente vuoto → `[]`; isolamento tenant → `[]`.

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Customer bookings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let t1: string;
  let t2: string;
  let customerId: string;
  let umbrellaId: string;
  let timeSlotId: string;
  let seasonAId: string; // 2026
  let seasonBId: string; // 2027 (per il rinnovo)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'CB A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'CB B' } })).id;
    await createUser(prisma, { email: 'cb.s1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'cb.s2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    t1 = await login(app, 'cb.s1@e2e.test', 'pw1');
    t2 = await login(app, 'cb.s2@e2e.test', 'pw2');

    // Catalogo minimo per s1 (dentro RLS forTenant).
    await prisma.forTenant(s1, async (tx) => {
      const seasonA = await tx.season.create({ data: { establishmentId: s1, name: 'Estate 2026', startDate: new Date('2026-06-01'), endDate: new Date('2026-09-15') } });
      const seasonB = await tx.season.create({ data: { establishmentId: s1, name: 'Estate 2027', startDate: new Date('2027-06-01'), endDate: new Date('2027-09-15') } });
      seasonAId = seasonA.id; seasonBId = seasonB.id;
      const pricingA = await tx.pricing.create({ data: { establishmentId: s1, seasonId: seasonA.id } });
      const pricingB = await tx.pricing.create({ data: { establishmentId: s1, seasonId: seasonB.id } });
      // Tariffe base (wildcard) per daily e subscription in entrambe le stagioni.
      await tx.rate.createMany({ data: [
        { establishmentId: s1, pricingId: pricingA.id, type: 'daily', price: 30 },
        { establishmentId: s1, pricingId: pricingA.id, type: 'subscription', price: 300 },
        { establishmentId: s1, pricingId: pricingB.id, type: 'subscription', price: 320 },
      ] });
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'A' } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, name: '1' } });
      const umb = await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'A12' } });
      umbrellaId = umb.id;
      const slot = await tx.timeSlot.create({ data: { establishmentId: s1, name: 'Giornata', startMin: 480, endMin: 1200 } });
      timeSlotId = slot.id;
      const cust = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } });
      customerId = cust.id;
    });
  });

  afterAll(async () => {
    for (const s of [s1, s2]) {
      await prisma.forTenant(s, async (tx) => {
        await tx.booking.deleteMany({});
        await tx.renewalCampaign.deleteMany({});
        await tx.rate.deleteMany({});
        await tx.pricing.deleteMany({});
        await tx.umbrella.deleteMany({});
        await tx.row.deleteMany({});
        await tx.sector.deleteMany({});
        await tx.timeSlot.deleteMany({});
        await tx.season.deleteMany({});
        await tx.customer.deleteMany({});
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: ['cb.s1@e2e.test', 'cb.s2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('ritorna [] per un cliente senza prenotazioni', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`)
      .set(...bearer(t1))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('ritorna il mix arricchito (umbrellaLabel/seasonName), ordinato desc; la subscription ha seniority/renewed', async () => {
    // daily nel 2026
    await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId, timeSlotId, type: 'daily', startDate: '2026-07-10' }).expect(201);
    // subscription nel 2026 (durata = stagione)
    const sub = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId, timeSlotId, type: 'subscription', startDate: '2026-06-15' }).expect(201);
    // rinnovo nel 2027 → seniority 2, renewed=true sull'origine
    await request(app.getHttpServer()).post(`/api/bookings/${sub.body.id}/renew`).set(...bearer(t1))
      .send({ destinationSeasonId: seasonBId }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`)
      .set(...bearer(t1))
      .expect(200);
    expect(res.body).toHaveLength(3);
    // ordinati per startDate desc: rinnovo 2027 → sub 2026 → daily 2026-07-10 (o daily/sub 2026 in ordine di data)
    expect(res.body[0].startDate >= res.body[1].startDate).toBe(true);
    expect(res.body[1].startDate >= res.body[2].startDate).toBe(true);
    for (const b of res.body) expect(b.umbrellaLabel).toBe('A12');
    const origin = res.body.find((b: { id: string }) => b.id === sub.body.id);
    expect(origin.seasonName).toBe('Estate 2026');
    expect(origin.type).toBe('subscription');
    expect(origin.seniority).toBe(1);
    expect(origin.renewed).toBe(true);
    const renewal = res.body.find((b: { previousBookingId?: string }) => b.previousBookingId === sub.body.id);
    expect(renewal.seniority).toBe(2);
    expect(renewal.renewed).toBe(false);
    // il daily non ha campi da subscription
    const daily = res.body.find((b: { type: string }) => b.type === 'daily');
    expect(daily.seniority).toBeUndefined();
    expect(daily.renewed).toBeUndefined();
  });

  it('mostra anche una prenotazione cancellata', async () => {
    const daily = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId, umbrellaId, timeSlotId, type: 'daily', startDate: '2026-08-01' }).expect(201);
    await request(app.getHttpServer()).delete(`/api/bookings/${daily.body.id}`).set(...bearer(t1)).expect(200);
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`).set(...bearer(t1)).expect(200);
    const cancelled = res.body.find((b: { id: string }) => b.id === daily.body.id);
    expect(cancelled).toBeDefined();
    expect(cancelled.status).toBe('cancelled');
  });

  it('isolamento tenant: il cliente di s1 è invisibile a s2 → []', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/bookings`).set(...bearer(t2)).expect(200);
    expect(res.body).toEqual([]);
  });
});
```

> **NB implementer:** verifica i nomi dei campi di `TimeSlot`/`Sector`/`Row` nello schema (`apps/api/prisma/schema.prisma`) prima di seminare — usa i nomi reali (es. `startMin`/`endMin` per `TimeSlot`). Se un helper di seed esiste già in `apps/api/test/helpers/`, riusalo invece di scrivere il seed a mano. NON spawnare subagent: apri lo schema e leggilo.

- [ ] **Step 12: Esegui l'e2e per vederlo fallire, poi passare**

Run: `corepack pnpm --filter @coralyn/api test:e2e customer-bookings`
Expected: prima FAIL (rotta 404/shape), poi — dopo che Step 7-10 sono in piedi — PASS.
Poi la suite completa: `corepack pnpm --filter @coralyn/api test:e2e` → **verde, conteggio ≥ 153 + i nuovi** (non regredire i 153 esistenti).

- [ ] **Step 13: Verifica unit api non regredita**

Run: `corepack pnpm --filter @coralyn/api test`
Expected: **101 esistenti + 5 nuovi (projection)**, tutti verdi.

- [ ] **Step 14: Commit**

```bash
git add packages/contracts apps/api/src/bookings apps/api/src/customers apps/api/test/customer-bookings.e2e-spec.ts
git commit -m "feat(customers): endpoint GET /customers/:id/bookings arricchito (senza prelazione) — Scheda Cliente 360°"
```

---

## Task 2: Frontend — 3 card reali (senza prelazione)

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`
- Create: `apps/web-staff/src/features/customers/CustomerHistoryCard.vue`
- Create: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Create: `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`

**Interfaces:**
- Consumes: `CustomerBookingDTO` (Task 1), `TYPE_LABEL`/`PAY_LABEL`/`PAY_TONE` (`@/lib/statusMaps`), componenti `Card`/`Badge` (`@coralyn/ui-kit`).
- Produces: `useCustomerBookings(id: string)`; 3 componenti card che accettano `defineProps<{ bookings: CustomerBookingDTO[] }>()`.

---

- [ ] **Step 1: Aggiungi la query key**

In `apps/web-staff/src/lib/queryKeys.ts`, dentro l'oggetto `queryKeys`:

```ts
  customerBookings: (tenantId: string, id: string) => ['customer', tenantId, id, 'bookings'] as const,
```

- [ ] **Step 2: Aggiungi il composable**

In `apps/web-staff/src/features/customers/useCustomers.ts`:
1. Estendi l'import dei tipi:

```ts
import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, CustomerBookingDTO } from '@coralyn/contracts';
```

2. Aggiungi il composable:

```ts
export function useCustomerBookings(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customerBookings(session.establishmentId, id),
    queryFn: () => apiFetch<CustomerBookingDTO[]>(`/customers/${id}/bookings`),
  });
}
```

- [ ] **Step 3: Aggiungi seed + handler MSW per l'endpoint**

In `apps/web-staff/src/mocks/server.ts`:
1. Import del tipo (estendi la riga di import esistente da `@coralyn/contracts`): aggiungi `CustomerBookingDTO`.
2. Dopo il blocco `resetCampaignSeed`, aggiungi:

```ts
// --- Scheda Cliente 360°: prenotazioni per cliente, stato in-memory per i test ---
const INITIAL_CUSTOMER_BOOKINGS: Record<string, CustomerBookingDTO[]> = {
  'c-1': [
    { id: 'cb-1', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2027-06-15', endDate: '2027-09-15',
      type: 'subscription', status: 'confirmed', totalPrice: 320, paymentStatus: 'paid', amountCollected: 320,
      umbrellaLabel: 'A12', seasonName: 'Estate 2027', seniority: 2, renewed: false },
    { id: 'cb-2', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-06-15', endDate: '2026-09-15',
      type: 'subscription', status: 'confirmed', totalPrice: 300, paymentStatus: 'paid', amountCollected: 300,
      umbrellaLabel: 'A12', seasonName: 'Estate 2026', seniority: 1, renewed: true },
    { id: 'cb-3', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-07-10', endDate: '2026-07-10',
      type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0,
      umbrellaLabel: 'A12', seasonName: 'Estate 2026' },
    { id: 'cb-4', umbrellaId: 'u-1', timeSlotId: 'ts-1', startDate: '2026-08-01', endDate: '2026-08-01',
      type: 'daily', status: 'cancelled', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0,
      umbrellaLabel: 'A12', seasonName: 'Estate 2026' },
  ],
};
let customerBookings: Record<string, CustomerBookingDTO[]> = structuredClone(INITIAL_CUSTOMER_BOOKINGS);
export function resetCustomerBookingsSeed() { customerBookings = structuredClone(INITIAL_CUSTOMER_BOOKINGS); }
```

3. Dentro `setupServer(...)`, accanto agli altri handler `customers`, aggiungi:

```ts
  http.get('/api/customers/:id/bookings', ({ params }) =>
    HttpResponse.json(customerBookings[params.id as string] ?? [])),
```

4. In `apps/web-staff/src/test/setup.ts`, aggiungi il reset al `beforeEach`:

```ts
import { server, resetCustomersSeed, resetPricingSeed, resetCampaignSeed, resetCustomerBookingsSeed } from '@/mocks/server';
// …
beforeEach(() => { resetCustomersSeed(); resetPricingSeed(); resetCampaignSeed(); resetCustomerBookingsSeed(); clearToasts(); });
```

- [ ] **Step 4: Scrivi/aggiorna i test FE (falliscono)**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`:
- **Rimuovi/aggiorna** il test "mostra i placeholder delle sezioni in arrivo" (gli stub non esistono più): sostituiscilo con i render reali. Mantieni i due test esistenti su header/anagrafica/modifica.

```ts
  it('mostra lo storico raggruppato per stagione, con la cancellata attenuata', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Estate 2026');
    expect(w.text()).toContain('Estate 2027');
    expect(w.text()).toContain('A12');
    expect(w.text()).toContain('Giornaliera');
    expect(w.text()).toContain('Abbonamento');
    // la cancellata è marcata (badge "Annullata")
    expect(w.text()).toContain('Annullata');
  });

  it('mostra anzianità e badge Rinnovato nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Rinnovato');
    // seniority renderizzata (es. "2ª stagione" o "2 stagioni")
    expect(w.text()).toMatch(/2\D*stagion/i);
  });

  it('mostra saldo e incassato nella card pagamenti', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    // saldo aperto = solo il daily non pagato non-cancellato (30). Le due subscription sono saldate.
    expect(w.text()).toContain('Saldo');
    expect(w.text()).toContain('30');
    // incassato totale = 320 + 300 = 620
    expect(w.text()).toContain('620');
  });
```

- [ ] **Step 5: Esegui i test per vederli fallire**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: FAIL (le stringhe non compaiono; le card sono ancora stub).

- [ ] **Step 6: Implementa la card Storico**

Create `apps/web-staff/src/features/customers/CustomerHistoryCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { TYPE_LABEL, PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();

// Raggruppa per stagione (già ordinati desc dal server); gruppi ordinati dal più recente.
const groups = computed(() => {
  const map = new Map<string, CustomerBookingDTO[]>();
  for (const b of props.bookings) {
    const key = b.seasonName ?? 'Senza stagione';
    (map.get(key) ?? map.set(key, []).get(key)!).push(b);
  }
  return [...map.entries()];
});
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Storico prenotazioni</div>
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <div v-for="[season, rows] in groups" :key="season" class="mb-4">
      <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">{{ season }}</div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in rows" :key="b.id"
            :class="['flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[13px]', b.status === 'cancelled' ? 'opacity-50' : '']">
          <span class="tabular-nums text-[var(--color-text-2nd)]">{{ b.startDate }}<template v-if="b.endDate !== b.startDate"> → {{ b.endDate }}</template></span>
          <span class="flex items-center gap-2">
            <Badge tone="neutral">{{ TYPE_LABEL[b.type] }}</Badge>
            <span class="text-[var(--color-text-muted)]">{{ b.umbrellaLabel }}</span>
            <span class="tabular-nums font-semibold">{{ b.totalPrice.toFixed(2) }} €</span>
            <Badge v-if="b.status === 'cancelled'" tone="danger">Annullata</Badge>
            <Badge v-else :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge>
          </span>
        </li>
      </ul>
    </div>
  </Card>
</template>
```

- [ ] **Step 7: Implementa la card Abbonamento e anzianità (senza prelazione)**

Create `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const subs = computed(() => props.bookings.filter((b) => b.type === 'subscription'));

function seniorityLabel(n?: number): string {
  if (!n) return '';
  return n === 1 ? '1ª stagione' : `${n}ª stagione (abbonato da ${n} stagioni)`;
}
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Abbonamento e anzianità</div>
    <p v-if="subs.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessun abbonamento.</p>
    <ul v-else class="flex flex-col gap-2">
      <li v-for="b in subs" :key="b.id" class="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2.5">
        <div class="flex items-center justify-between">
          <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ b.seasonName ?? '—' }} · {{ b.umbrellaLabel }}</span>
          <Badge v-if="b.renewed" tone="success">Rinnovato</Badge>
        </div>
        <div class="mt-1 text-xs text-[var(--color-text-muted)]">{{ seniorityLabel(b.seniority) }}</div>
      </li>
    </ul>
  </Card>
</template>
```

- [ ] **Step 8: Implementa la card Pagamenti e saldo**

Create `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const active = computed(() => props.bookings.filter((b) => b.status !== 'cancelled'));
const balance = computed(() => active.value.reduce((s, b) => s + (b.totalPrice - b.amountCollected), 0));
const collected = computed(() => active.value.reduce((s, b) => s + b.amountCollected, 0));
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Pagamenti e saldo</div>
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <template v-else>
      <div class="mb-4 flex gap-6">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Saldo aperto</div>
          <div class="tabular-nums text-lg font-bold" :class="balance > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'">{{ balance.toFixed(2) }} €</div>
        </div>
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Incassato</div>
          <div class="tabular-nums text-lg font-bold text-[var(--color-text)]">{{ collected.toFixed(2) }} €</div>
        </div>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in active" :key="b.id"
            :class="['flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-[13px]', b.paymentStatus !== 'paid' ? 'border-[var(--color-warning)]' : 'border-[var(--color-border)]']">
          <span class="tabular-nums text-[var(--color-text-2nd)]">{{ b.startDate }}</span>
          <span class="flex items-center gap-2">
            <span class="tabular-nums">{{ b.amountCollected.toFixed(2) }} / {{ b.totalPrice.toFixed(2) }} €</span>
            <Badge :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge>
          </span>
        </li>
      </ul>
    </template>
  </Card>
</template>
```

- [ ] **Step 9: Monta le 3 card nella vista (rimpiazza gli stub)**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`:
1. Nello `<script setup>`: rimuovi l'array `upcoming` e aggiungi:

```ts
import { useCustomer, useUpdateCustomer, useCustomerBookings } from './useCustomers';
import CustomerHistoryCard from './CustomerHistoryCard.vue';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';
import CustomerPaymentsCard from './CustomerPaymentsCard.vue';
// …dopo update…
const { data: bookings } = useCustomerBookings(props.id);
```

2. Nel `<template>`, sostituisci il blocco stub (`<div class="grid grid-cols-3 …"> … </div>`, righe ~58-67) con:

```html
      <div class="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <CustomerSubscriptionsCard :bookings="bookings ?? []" />
        <CustomerHistoryCard :bookings="bookings ?? []" />
        <CustomerPaymentsCard :bookings="bookings ?? []" />
      </div>
```

*(Ordine card = spec §4: Abbonamento/anzianità, Storico, Pagamenti. Griglia 3 colonne su desktop, impilata su mobile.)*

- [ ] **Step 10: Esegui i test FE — devono passare**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: PASS (header/anagrafica/modifica + 3 nuovi render).

- [ ] **Step 11: Typecheck + suite FE completa**

Run: `corepack pnpm --filter web-staff typecheck` → pulito.
Run: `corepack pnpm --filter web-staff test` → **verde, ≥ 153 esistenti + i nuovi** (non regredire; ui-kit 55 inclusi).

- [ ] **Step 12: Commit**

```bash
git add apps/web-staff/src
git commit -m "feat(customers): 3 card reali (storico/anzianità/pagamenti) nella Scheda Cliente — senza prelazione"
```

---

## Task 3: Prelazione — helper condiviso `computeRenewalWindowState` + arricchimento endpoint

**Files:**
- Modify: `apps/api/src/bookings/renewal-window.projection.ts`
- Create: `apps/api/src/bookings/renewal-window.projection.spec.ts`
- Modify: `apps/api/src/bookings/renewal-campaigns.service.ts` (usa l'helper — comportamento invariato)
- Modify: `apps/api/src/bookings/bookings.service.ts` (`listByCustomer`: arricchimento `prelazione`)
- Modify: `apps/api/test/customer-bookings.e2e-spec.ts` (casi prelazione)

**Interfaces:**
- Produces: `computeRenewalWindowState(renewals, destStart, destEnd, deadlineIso, todayIso): RenewalWindowState`
- Consumes: `dateRangesOverlap` (`./booking.availability`), `computeRenewalWindowState`, `todayInRome`/`formatDbDate` (`../common/dates`), `BookingStatus` (`@coralyn/contracts`).

---

- [ ] **Step 1: Scrivi il test dell'helper (fallisce)**

Create `apps/api/src/bookings/renewal-window.projection.spec.ts`:

```ts
import { computeRenewalWindowState } from './renewal-window.projection';

const destStart = new Date('2027-06-01');
const destEnd = new Date('2027-09-15');

describe('computeRenewalWindowState', () => {
  it('open quando oggi < deadline e nessun rinnovo', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-05-01')).toBe('open');
  });
  it('open al giorno-scadenza (today == deadline è ancora aperta)', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-05-31')).toBe('open');
  });
  it('expired quando oggi > deadline e nessun rinnovo', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-06-01')).toBe('expired');
  });
  it('exercised quando esiste un rinnovo confermato che overlappa la destinazione (anche dopo la scadenza)', () => {
    const renewals = [{ status: 'confirmed' as const, startDate: new Date('2027-06-15'), endDate: new Date('2027-09-10') }];
    expect(computeRenewalWindowState(renewals, destStart, destEnd, '2027-05-31', '2027-06-01')).toBe('exercised');
  });
  it('un rinnovo cancellato non conta come exercised', () => {
    const renewals = [{ status: 'cancelled' as const, startDate: new Date('2027-06-15'), endDate: new Date('2027-09-10') }];
    expect(computeRenewalWindowState(renewals, destStart, destEnd, '2027-05-31', '2027-05-01')).toBe('open');
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `corepack pnpm --filter @coralyn/api test renewal-window.projection`
Expected: FAIL con "computeRenewalWindowState is not a function".

- [ ] **Step 3: Estrai l'helper nella projection**

In `apps/api/src/bookings/renewal-window.projection.ts`, aggiungi (mantieni `toRenewalWindowItemDTO` invariato):

```ts
import type { Booking, BookingStatus } from '@prisma/client';
import type { RenewalWindowItemDTO, RenewalWindowState } from '@coralyn/contracts';
import { dateRangesOverlap } from './booking.availability';

// …toRenewalWindowItemDTO invariato…

/**
 * Stato della finestra di prelazione di un avente-diritto (derivato lazy, ADR-0034). Fonte UNICA
 * condivisa da renewal-campaigns.service (vista Rinnovi) e dalla Scheda Cliente: le due viste non
 * possono divergere. `today == deadline` → ancora aperta (giorno-scadenza incluso).
 */
export function computeRenewalWindowState(
  renewals: { status: BookingStatus; startDate: Date; endDate: Date }[],
  destStart: Date,
  destEnd: Date,
  deadlineIso: string,
  todayIso: string,
): RenewalWindowState {
  const exercised = renewals.some(
    (r) => r.status === 'confirmed' && dateRangesOverlap(r.startDate, r.endDate, destStart, destEnd),
  );
  if (exercised) return 'exercised';
  return todayIso > deadlineIso ? 'expired' : 'open';
}
```

> **NB:** verifica l'export di `BookingStatus` da `@prisma/client` (enum). Se il progetto tipizza gli status da `@coralyn/contracts`, importa `BookingStatus` da lì per coerenza con il resto del file.

- [ ] **Step 4: Esegui il test dell'helper — deve passare**

Run: `corepack pnpm --filter @coralyn/api test renewal-window.projection`
Expected: PASS (5 test).

- [ ] **Step 5: Rifattorizza `getByDestinationSeasonId` per usare l'helper**

In `apps/api/src/bookings/renewal-campaigns.service.ts`:
1. Aggiungi all'import da `./renewal-window.projection`: `computeRenewalWindowState`.
2. Sostituisci il blocco che calcola `isExpired` + `.map((b) => { const exercised = …; const state = …; })` (righe ~78-89) con:

```ts
      const deadlineIso = formatDbDate(campaign.deadline);
      const todayIso = todayInRome();

      const windows = subs
        .map((b) => {
          const state = computeRenewalWindowState(b.renewals, destStart, destEnd, deadlineIso, todayIso);
          return toRenewalWindowItemDTO(b, seniorityById.get(b.id) ?? 1, state);
        })
        .sort((a, z) => z.seniority - a.seniority || (a.sourceBookingId < z.sourceBookingId ? -1 : 1));
```

*(Comportamento identico: `dateRangesOverlap` e la regola `today > deadline` sono le stesse, ora dentro l'helper. `dateRangesOverlap` diretto e `RenewalWindowState` possono restare importati se ancora usati altrove; rimuovi gli import divenuti inutilizzati per non far fallire il lint/typecheck.)*

- [ ] **Step 6: Regressione — gli e2e Rinnovi restano verdi**

Run: `corepack pnpm --filter @coralyn/api test:e2e renewal-campaigns`
Expected: PASS invariato (comportamento identico dopo l'estrazione).

- [ ] **Step 7: Scrivi i casi prelazione nell'e2e cliente (falliscono)**

In `apps/api/test/customer-bookings.e2e-spec.ts`, aggiungi un blocco che apre una campagna e verifica lo stato. **La subscription 2026 dell'avente-diritto (creata nel Task 1) è l'origine; la campagna punta a 2027 con deadline futura → `prelazione` presente su quella subscription; con deadline passata → assente; dopo il rinnovo (exercised) → assente.**

```ts
  it('valorizza prelazione sulla subscription con campagna APERTA; assente se scaduta/esercitata', async () => {
    // Cliente fresco per isolare gli stati (evita interferenze coi test precedenti).
    let subId = '';
    await prisma.forTenant(s1, async (tx) => {
      const c = await tx.customer.create({ data: { establishmentId: s1, firstName: 'Prela', lastName: 'Test' } });
      pcId = c.id;
    });
    const sub = await request(app.getHttpServer()).post('/api/bookings').set(...bearer(t1))
      .send({ customerId: pcId, umbrellaId: umbrellaId2, timeSlotId, type: 'subscription', startDate: '2026-06-15' }).expect(201);
    subId = sub.body.id;

    // Campagna origine 2026 → dest 2027, deadline FUTURA.
    await request(app.getHttpServer()).post('/api/renewal-campaigns').set(...bearer(t1))
      .send({ originSeasonId: seasonAId, destinationSeasonId: seasonBId, deadline: '2099-01-01' }).expect(201);

    let res = await request(app.getHttpServer()).get(`/api/customers/${pcId}/bookings`).set(...bearer(t1)).expect(200);
    let origin = res.body.find((b: { id: string }) => b.id === subId);
    expect(origin.prelazione).toBeDefined();
    expect(origin.prelazione.destinationSeasonName).toBe('Estate 2027');
    expect(origin.prelazione.deadline).toBe('2099-01-01');

    // Esercitata: dopo il rinnovo verso 2027 → prelazione assente.
    await request(app.getHttpServer()).post(`/api/bookings/${subId}/renew`).set(...bearer(t1))
      .send({ destinationSeasonId: seasonBId }).expect(201);
    res = await request(app.getHttpServer()).get(`/api/customers/${pcId}/bookings`).set(...bearer(t1)).expect(200);
    origin = res.body.find((b: { id: string }) => b.id === subId);
    expect(origin.prelazione).toBeUndefined();
  });
```

> **NB implementer:** questo caso ha bisogno di un **secondo ombrellone** (`umbrellaId2`) per non collidere con le prenotazioni del cliente Mario sull'ombrellone A12 (anti-overlap/prelazione hold). Aggiungi `umbrellaId2` al seed `beforeAll` (un secondo `umbrella.create` con `label: 'A13'` nella stessa row) e dichiara `let umbrellaId2: string; let pcId: string;`. Verifica il path della rotta campagne in `renewal-campaigns.controller.ts` (probabile `POST /api/renewal-campaigns`) e l'input (`OpenRenewalCampaignInput`). NON spawnare subagent: leggi il controller.

- [ ] **Step 8: Implementa l'arricchimento `prelazione` in `listByCustomer`**

In `apps/api/src/bookings/bookings.service.ts`:
1. Aggiungi l'import: `import { computeRenewalWindowState } from './renewal-window.projection';` (se non già presente; `dateRangesOverlap`, `todayInRome`, `formatDbDate` sono già importati).
2. Dentro `listByCustomer`, dopo aver caricato `seasons` e prima del `.map`, carica le campagne e definisci l'helper locale:

```ts
      const campaigns = await tx.renewalCampaign.findMany({
        include: { originSeason: true, destinationSeason: true },
      });
      const todayIso = todayInRome();

      const prelazioneFor = (b: (typeof bookings)[number]): { destinationSeasonName: string; deadline: string } | undefined => {
        if (b.type !== 'subscription' || b.status !== 'confirmed') return undefined;
        const open = campaigns.filter(
          (c) =>
            dateRangesOverlap(b.startDate, b.endDate, c.originSeason.startDate, c.originSeason.endDate) &&
            computeRenewalWindowState(
              b.renewals,
              c.destinationSeason.startDate,
              c.destinationSeason.endDate,
              formatDbDate(c.deadline),
              todayIso,
            ) === 'open',
        );
        if (open.length === 0) return undefined;
        // Più campagne aperte (atipico): la più imminente per deadline.
        const soonest = open.reduce((a, c) => (formatDbDate(c.deadline) < formatDbDate(a.deadline) ? c : a));
        return { destinationSeasonName: soonest.destinationSeason.name, deadline: formatDbDate(soonest.deadline) };
      };
```

3. Nel `.map`, aggiungi il campo all'enrichment:

```ts
        return toCustomerBookingDTO(b, {
          umbrellaLabel: b.umbrella.label,
          seasonName: resolveSeasonName(seasons, b.startDate),
          seniority: isSub ? (seniorityById.get(b.id) ?? 1) : undefined,
          renewed: isSub ? b.renewals.some((r) => r.status === 'confirmed') : undefined,
          prelazione: prelazioneFor(b),
        });
```

- [ ] **Step 9: Esegui l'e2e cliente — prelazione verde**

Run: `corepack pnpm --filter @coralyn/api test:e2e customer-bookings`
Expected: PASS (base Task 1 + casi prelazione).

- [ ] **Step 10: Suite api completa (unit + e2e) non regredita**

Run: `corepack pnpm --filter @coralyn/api test` → **101 + 5 (Task 1) + 5 (helper) = 111**, verde.
Run: `corepack pnpm --filter @coralyn/api test:e2e` → **153 esistenti + nuovi customer-bookings**, verde (rinnovi inclusi invariati).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/bookings apps/api/test/customer-bookings.e2e-spec.ts
git commit -m "feat(customers): prelazione via helper condiviso computeRenewalWindowState (fonte unica); arricchimento endpoint"
```

---

## Task 4: Frontend — nota prelazione nella card Abbonamento

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/mocks/server.ts` (aggiungi `prelazione` a un seed subscription)
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` (test nota prelazione)

**Interfaces:**
- Consumes: `CustomerBookingDTO.prelazione` (Task 1/3).

---

- [ ] **Step 1: Aggiungi `prelazione` al seed MSW**

In `apps/web-staff/src/mocks/server.ts`, nell'oggetto `INITIAL_CUSTOMER_BOOKINGS['c-1']`, aggiungi al record `cb-1` (subscription 2027) il campo:

```ts
      prelazione: { destinationSeasonName: 'Estate 2028', deadline: '2028-04-30' },
```

- [ ] **Step 2: Scrivi il test della nota prelazione (fallisce)**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`, aggiungi:

```ts
  it('mostra la nota di prelazione aperta nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Prelazione');
    expect(w.text()).toContain('Estate 2028');
    expect(w.text()).toContain('2028-04-30');
  });
```

- [ ] **Step 3: Esegui il test per vederlo fallire**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: FAIL (la nota non è renderizzata).

- [ ] **Step 4: Renderizza la nota nella card**

In `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`, dentro il `<li>` di ogni subscription, dopo la riga `seniorityLabel`, aggiungi:

```html
        <div v-if="b.prelazione" class="mt-1.5 inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-soft,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
          Prelazione aperta per {{ b.prelazione.destinationSeasonName }} · scade {{ b.prelazione.deadline }}
        </div>
```

*(Se `--color-accent-soft` non esiste nel tema, usa solo `text-[var(--color-accent)]` senza background — verifica in `apps/web-staff/src` i token disponibili.)*

- [ ] **Step 5: Esegui i test FE — devono passare**

Run: `corepack pnpm --filter web-staff test CustomerDetailView`
Expected: PASS (inclusa la nota prelazione).

- [ ] **Step 6: Typecheck + suite FE completa**

Run: `corepack pnpm --filter web-staff typecheck` → pulito.
Run: `corepack pnpm --filter web-staff test` → verde, non regredito.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src
git commit -m "feat(customers): nota prelazione aperta nella card Abbonamento della Scheda Cliente"
```

---

## Verifica finale (dopo tutti i task)

- [ ] **Suite complete dal vivo (riverifica i conteggi, non fidarti):**
  - `corepack pnpm --filter @coralyn/api test` → **111** (101 + 5 projection + 5 helper), verde.
  - `corepack pnpm --filter @coralyn/api test:e2e` → **153 + i nuovi customer-bookings**, verde (rinnovi invariati).
  - `corepack pnpm --filter web-staff test` → **153 + i nuovi CustomerDetailView**, verde (ui-kit 55 inclusi).
  - `corepack pnpm --filter web-staff typecheck` → pulito.
- [ ] **Review whole-branch (opus)** via `superpowers:requesting-code-review`: 0 Critical/Important attesi.
- [ ] **Smoke dev opzionale** (dopo `docker compose --profile full up -d --build api web`): apri `/customers/:id` di un cliente con prenotazioni, verifica le 3 card popolate.
- [ ] **Finishing** (`superpowers:finishing-a-development-branch`): merge/PR verso `main`; poi presenta lo stato all'utente e attendi conferma prima della pagina successiva (bottone «Abbonamento» della mappa).

---

## Self-Review (fatta in fase di scrittura)

**Spec coverage:**
- §3.1 endpoint `GET /customers/:id/bookings` + `CustomerBookingDTO` → Task 1 (contracts + rotta + service). ✅
- §3.2 arricchimento (umbrellaLabel/seasonName/seniority/renewed) → Task 1; prelazione → Task 3. ✅
- §3.3 helper condiviso `computeRenewalWindowState` + refactor Rinnovi invariato → Task 3 (con regressione e2e rinnovi). ✅
- §4.1 storico raggruppato per stagione, cancellate attenuate → Task 2 (`CustomerHistoryCard`). ✅
- §4.2 anzianità + badge rinnovato → Task 2; nota prelazione → Task 4 (`CustomerSubscriptionsCard`). ✅
- §4.3 saldo + incassato + breakdown non-pagate → Task 2 (`CustomerPaymentsCard`). ✅
- §5 piano di test (unit projection/helper, e2e endpoint/prelazione/cancellata/vuoto/tenant, FE render + empty) → coperto nei rispettivi task. ✅
- §6 confini (fonte unica, read-only, nessuna migrazione) → rispettati. ✅

**Type consistency:** `CustomerBookingDTO`, `toCustomerBookingDTO`, `resolveSeasonName`, `listByCustomer`, `computeRenewalWindowState`, `useCustomerBookings`, `queryKeys.customerBookings` usati coerentemente fra i task. ✅

**Placeholder scan:** ogni step di codice mostra il codice reale; i pochi NB (nomi campo schema/route campagne) sono istruzioni di verifica esplicite per l'implementer, non lavoro non specificato. ✅
