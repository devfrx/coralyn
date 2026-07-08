# Cessione / Subentro abbonamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere il passaggio di titolarità di un abbonamento (cessione/subentro): `POST /bookings/:id/transfer` admin-only che cambia `Booking.customerId` A→B preservando span/seniority/prelazione, riconcilia l'incasso senza debito, e registra la storia su una nuova child `BookingTransfer`; più la vista "cessioni effettuate" lato-cedente. Chiude D-013.

**Architecture:** Mirror esatto del pattern `terminate`/`suspend` (NestJS service in tx `forTenant`, invarianti → 422/409/404, `toBookingDTO`). La cessione **non tocca `BookingCoverage`** (l'occupazione è continua): agisce solo su `Booking` (titolarità + incasso) e scrive una riga storica su `BookingTransfer` (RLS FORCE, mirror `BookingSuspension`). Riconciliazione incasso = **movimento netto su `amountCollected`** (`amountCollected − refundToPrevious + collectedFromNew`), `refundedAmount` **intatto** (la cessione è un trasferimento, non una perdita).

**Tech Stack:** NestJS + Prisma (Postgres, RLS) · `@coralyn/contracts` (tipi TS condivisi) · Vue 3 + TanStack Query (web-staff) · Jest (api unit + e2e supertest) · Vitest + MSW (web-staff).

## Global Constraints

- **pnpm via corepack, mai npm.** Dopo purge/install → `corepack pnpm --filter @coralyn/api exec prisma generate`.
- **Rebuild `@coralyn/contracts`** (`corepack pnpm -C packages/contracts build`) dopo ogni modifica a `packages/contracts/src/index.ts`, **prima** di typecheck/test api e FE (i consumer importano da `dist/`, gitignored).
- **Migrazioni:** `prisma migrate` a **dev E test DB**, mai `db push`. Env alla **radice repo**: `.env` (dev), `.env.test` (test). Comando deploy: `corepack pnpm dlx dotenv-cli -e <file> -- corepack pnpm --filter @coralyn/api exec prisma migrate deploy`.
- **Nuove tabelle tenant:** `ENABLE + FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` con `nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId"` (le statement RLS vanno **aggiunte a mano** nel `migration.sql` generato: Prisma non le emette).
- **API e2e:** ts-jest **type-checka** la suite → sempre `--runInBand`. Rotte API sotto **`/api`** (prefix globale); nei test/live le date stanno nella stagione **2026**.
- **Occupazione vs contratto vs titolarità:** l'occupazione vive su `BookingCoverage` (non toccata qui); span/prelazione/seniority su `Booking` (seguono il nuovo titolare); la titolarità è `Booking.customerId`.
- **Baseline da NON regredire** (`main` locale `1fef6ff`): api unit **213** · api e2e **264** · web-staff **332** · ui-kit **111** · web-platform **16** · typecheck pulito. Ogni task solo additivo.

---

## File Structure

**API (create):**
- `apps/api/prisma/migrations/<ts>_booking_transfer/migration.sql` — tabella + RLS FORCE.
- `apps/api/src/bookings/dto/transfer-subscription.dto.ts` — validazione input.
- `apps/api/src/bookings/booking-transfer.projection.ts` — `toTransferDTO`, `toCededSubscriptionDTO`.
- `apps/api/test/subscription-cession.e2e-spec.ts` — e2e.

**API (modify):**
- `apps/api/prisma/schema.prisma` — `model BookingTransfer` + relazioni inverse.
- `apps/api/src/bookings/bookings.service.ts` — `transfer()`, `listCededByCustomer()`, `transfers[]` in `listByCustomer`.
- `apps/api/src/bookings/bookings.controller.ts` — `@Post(':id/transfer')`.
- `apps/api/src/customers/customers.controller.ts` — `@Get(':id/ceded-subscriptions')`.
- `apps/api/src/bookings/customer-booking.projection.ts` — `transfers` nell'enrichment + DTO.
- `apps/api/src/bookings/bookings.service.spec.ts` (o nuovo spec file) — unit `transfer`/`listCededByCustomer`.

**Contracts (modify):**
- `packages/contracts/src/index.ts` — `TransferDTO`, `CededSubscriptionDTO`, `TransferSubscriptionInput`, `CustomerBookingDTO.transfers`.

**FE web-staff (create):**
- `apps/web-staff/src/features/customers/cessionRefund.ts` (+ `.spec.ts`).
- `apps/web-staff/src/features/customers/TransferSubscriptionModal.vue` (+ `.spec.ts`).

**FE web-staff (modify):**
- `apps/web-staff/src/features/customers/useCustomers.ts` — `useTransferSubscription`, `useCededSubscriptions`.
- `apps/web-staff/src/lib/queryKeys.ts` — `cededSubscriptions`.
- `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue` — bottone Cedi + sezione "cessioni effettuate".
- `apps/web-staff/src/features/customers/CustomerDetailView.vue` — wiring modale + `useCededSubscriptions`.
- `apps/web-staff/src/mocks/server.ts` — handler `transfer` + `ceded-subscriptions`.

**Docs (create/modify):**
- `docs/architecture/decisions/0047-cessione-subentro-titolarita-incasso.md` (nuovo ADR).
- `docs/design/data-model.md`, `docs/design/flows.md`, `docs/design/mockups/subscription-transfer-modal.html`.

---

## Task 1: Schema + migration `BookingTransfer` (RLS FORCE)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Booking model ~172-212; Customer ~34-48; Establishment ~30-31)
- Create: `apps/api/prisma/migrations/<ts>_booking_transfer/migration.sql`

**Interfaces:**
- Produces: tabella `BookingTransfer` + relazioni `Booking.transfers`, `Customer.transfersOut`/`transfersIn`, `Establishment.bookingTransfers`. Prisma client rigenerato con `tx.bookingTransfer`.

- [ ] **Step 1: Aggiungi il model a `schema.prisma`** (dopo `model BookingSuspension`, ~riga 259):

```prisma
// Cessione/subentro di un abbonamento (D-013, ADR-0047). Pura storia/accountability: la cessione
// cambia Booking.customerId (titolarità) e riconcilia l'incasso su Booking; questa tabella registra
// chi->chi, quando, e i movimenti di cassa lordi. NON tocca l'occupazione (BookingCoverage). RLS FORCE.
model BookingTransfer {
  id                 String   @id @default(uuid()) @db.Uuid
  bookingId          String   @db.Uuid
  establishmentId    String   @db.Uuid // RLS FORCE tenant-scoped
  previousCustomerId String   @db.Uuid // cedente (A) al momento della cessione
  newCustomerId      String   @db.Uuid // subentrante (B)
  effectiveDate      DateTime @db.Date // da quando B è (informativamente) il titolare
  refundToPrevious   Decimal  @default(0) @db.Decimal(10, 2) // rimborso lordo ad A (movimento, non aggregato su Booking)
  collectedFromNew   Decimal  @default(0) @db.Decimal(10, 2) // incasso lordo da B
  reason             String?
  createdAt          DateTime @default(now())

  booking          Booking       @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  establishment    Establishment @relation(fields: [establishmentId], references: [id])
  previousCustomer Customer      @relation("BookingTransferPrevious", fields: [previousCustomerId], references: [id])
  newCustomer      Customer      @relation("BookingTransferNew", fields: [newCustomerId], references: [id])

  @@index([bookingId])
  @@index([establishmentId])
  @@index([previousCustomerId])
}
```

- [ ] **Step 2: Aggiungi le relazioni inverse.** In `model Booking` (dopo `suspensions BookingSuspension[]`, riga 207):

```prisma
  transfers       BookingTransfer[]
```

In `model Customer` (dopo `bookings Booking[]`, riga 45):

```prisma
  transfersOut  BookingTransfer[] @relation("BookingTransferPrevious")
  transfersIn   BookingTransfer[] @relation("BookingTransferNew")
```

In `model Establishment` (dopo `bookingSuspensions BookingSuspension[]`, riga 31):

```prisma
  bookingTransfers   BookingTransfer[]
```

- [ ] **Step 3: Genera la migration senza applicarla** (per poter aggiungere l'RLS a mano):

Run: `corepack pnpm dlx dotenv-cli -e .env -- corepack pnpm --filter @coralyn/api exec prisma migrate dev --create-only --name booking_transfer`
Expected: crea `apps/api/prisma/migrations/<ts>_booking_transfer/migration.sql` con `CreateTable` + indici + FK, **senza** applicarla.

- [ ] **Step 4: Aggiungi le statement RLS in coda al `migration.sql` generato** (mirror `20260708104327_booking_suspension`):

```sql
-- RLS tenant-isolation (nuova tabella tenant-scoped, come BookingSuspension). Nessun backfill: tabella vuota.
ALTER TABLE "BookingTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingTransfer"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

Verifica che le FK verso `Customer` siano **`ON DELETE RESTRICT`** (default Prisma, non Cascade — la storia non sparisce se un cliente è cancellato; con storico l'erasure GDPR anonimizza in place). La FK verso `Booking` è `ON DELETE CASCADE`.

- [ ] **Step 5: Applica a dev e test, rigenera il client:**

Run:
```bash
corepack pnpm dlx dotenv-cli -e .env      -- corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm dlx dotenv-cli -e .env.test -- corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Expected: entrambe `Database schema is up to date`; generate rigenera `@prisma/client` con `bookingTransfer`.

- [ ] **Step 6: Typecheck api** (il client rigenerato deve compilare):

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): BookingTransfer table + RLS FORCE (D-013 cessione, ADR-0047)"
```

---

## Task 2: Contracts — `TransferDTO`, `CededSubscriptionDTO`, `TransferSubscriptionInput`

**Files:**
- Modify: `packages/contracts/src/index.ts` (dopo `CustomerBookingDTO`, ~riga 288; e dentro `CustomerBookingDTO`)

**Interfaces:**
- Produces: `TransferDTO`, `CededSubscriptionDTO`, `TransferSubscriptionInput`, `CustomerBookingDTO.transfers?: TransferDTO[]`.

- [ ] **Step 1: Aggiungi `transfers` a `CustomerBookingDTO`** (dopo `suspensions?: SuspensionDTO[];`, riga 276):

```ts
  transfers?: TransferDTO[];      // D-013 cessione (additivo): sempre valorizzato dal server ([] se nessuna)
```

- [ ] **Step 2: Aggiungi le interfacce** (dopo la chiusura di `CustomerBookingDTO`, ~riga 288):

```ts
/** Una cessione registrata su un abbonamento (D-013, ADR-0047). Storia del passaggio di titolarità. */
export interface TransferDTO {
  id: string;
  effectiveDate: string;          // ISO yyyy-mm-dd
  previousCustomerId: string;
  previousCustomerName: string;   // "Nome Cognome" al momento della proiezione
  newCustomerId: string;
  newCustomerName: string;
  refundToPrevious: number;       // rimborso lordo reso al cedente
  collectedFromNew: number;       // incasso lordo dal subentrante
  reason?: string;
  createdAt: string;              // ISO datetime
}

/** Riga "cessioni effettuate" nella Scheda del CEDENTE: abbonamenti che questo cliente ha ceduto ad altri. */
export interface CededSubscriptionDTO {
  transferId: string;
  bookingId: string;
  effectiveDate: string;          // ISO yyyy-mm-dd
  newCustomerName: string;        // subentrante B
  umbrellaLabel: string;
  seasonName?: string;
  refundToPrevious: number;       // quanto ha riavuto A
  reason?: string;
  createdAt: string;              // ISO datetime
}

/** Input cessione/subentro (D-013, admin-only). Cambia il titolare A->B e riconcilia l'incasso.
 *  refundToPrevious/collectedFromNew = movimento netto su amountCollected (refundedAmount intatto). */
export interface TransferSubscriptionInput {
  newCustomerId: string;
  effectiveDate: string;          // ISO yyyy-mm-dd, ∈ [start, end]
  refundToPrevious: number;       // ≥ 0, ≤ amountCollected
  collectedFromNew: number;       // ≥ 0; con vincolo netto ≤ totalPrice
  reason?: string;
}
```

- [ ] **Step 3: Build contracts**

Run: `corepack pnpm -C packages/contracts build`
Expected: `dist/index.d.ts` aggiornato, nessun errore tsc.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): TransferDTO/CededSubscriptionDTO/TransferSubscriptionInput (D-013 cessione)"
```

---

## Task 3: DTO di validazione input

**Files:**
- Create: `apps/api/src/bookings/dto/transfer-subscription.dto.ts`
- Test: (compile-time via `implements` — verifica con typecheck)

**Interfaces:**
- Consumes: `TransferSubscriptionInput` (Task 2).
- Produces: `TransferSubscriptionDto`.

- [ ] **Step 1: Scrivi il DTO** (mirror `suspend-subscription.dto.ts`):

```ts
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { TransferSubscriptionInput } from '@coralyn/contracts';
import { IsCalendarDate } from '../../common/is-calendar-date';

/** Validazione input cessione (D-013). Gli invarianti di dominio (tipo/stato, subentrante valido,
 *  effectiveDate ∈ span, bound cassa, sospensione aperta) sono nel service: qui solo shape/bound sintattici. */
export class TransferSubscriptionDto implements TransferSubscriptionInput {
  @IsUUID()
  newCustomerId!: string;

  @IsCalendarDate()
  effectiveDate!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  refundToPrevious!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  collectedFromNew!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

- [ ] **Step 2: Typecheck** (verifica `implements` e import):

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bookings/dto/transfer-subscription.dto.ts
git commit -m "feat(api): TransferSubscriptionDto (D-013 cessione)"
```

---

## Task 4: Projection `toTransferDTO` / `toCededSubscriptionDTO`

**Files:**
- Create: `apps/api/src/bookings/booking-transfer.projection.ts`
- Test: `apps/api/src/bookings/booking-transfer.projection.spec.ts`

**Interfaces:**
- Consumes: `TransferDTO`, `CededSubscriptionDTO` (Task 2); Prisma `BookingTransfer` (Task 1).
- Produces: `toTransferDTO(t)`, `toCededSubscriptionDTO(t, e)`.

- [ ] **Step 1: Scrivi il test** `booking-transfer.projection.spec.ts`:

```ts
import { toTransferDTO, toCededSubscriptionDTO } from './booking-transfer.projection';

const base = {
  id: 't-1', bookingId: 'b-1', establishmentId: 'e-1',
  previousCustomerId: 'c-a', newCustomerId: 'c-b',
  effectiveDate: new Date('2026-07-15T00:00:00.000Z'),
  refundToPrevious: { toString: () => '250.00' } as never,
  collectedFromNew: { toString: () => '250.00' } as never,
  reason: 'subentro famiglia',
  createdAt: new Date('2026-07-10T09:30:00.000Z'),
};

describe('toTransferDTO', () => {
  it('mappa Decimal→number, Date→ISO, e i nomi dei clienti', () => {
    const dto = toTransferDTO({
      ...base,
      previousCustomer: { firstName: 'Anna', lastName: 'Rossi' } as never,
      newCustomer: { firstName: 'Bruno', lastName: 'Bianchi' } as never,
    } as never);
    expect(dto).toMatchObject({
      id: 't-1', effectiveDate: '2026-07-15',
      previousCustomerId: 'c-a', previousCustomerName: 'Anna Rossi',
      newCustomerId: 'c-b', newCustomerName: 'Bruno Bianchi',
      refundToPrevious: 250, collectedFromNew: 250, reason: 'subentro famiglia',
    });
    expect(dto.createdAt).toBe('2026-07-10T09:30:00.000Z');
  });
});

describe('toCededSubscriptionDTO', () => {
  it('proietta la riga per la Scheda del cedente', () => {
    const dto = toCededSubscriptionDTO(
      { ...base, newCustomer: { firstName: 'Bruno', lastName: 'Bianchi' } as never } as never,
      { umbrellaLabel: 'A12', seasonName: 'Estate 2026' },
    );
    expect(dto).toMatchObject({
      transferId: 't-1', bookingId: 'b-1', effectiveDate: '2026-07-15',
      newCustomerName: 'Bruno Bianchi', umbrellaLabel: 'A12', seasonName: 'Estate 2026',
      refundToPrevious: 250, reason: 'subentro famiglia',
    });
  });
});
```

- [ ] **Step 2: Esegui il test — deve fallire**

Run: `corepack pnpm --filter @coralyn/api exec jest booking-transfer.projection -- --runInBand`
Expected: FAIL — modulo `./booking-transfer.projection` non trovato.

- [ ] **Step 3: Implementa la projection:**

```ts
import type { BookingTransfer, Customer } from '@prisma/client';
import type { TransferDTO, CededSubscriptionDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

type WithCustomers = BookingTransfer & {
  previousCustomer: Pick<Customer, 'firstName' | 'lastName'>;
  newCustomer: Pick<Customer, 'firstName' | 'lastName'>;
};

const fullName = (c: Pick<Customer, 'firstName' | 'lastName'>): string => `${c.firstName} ${c.lastName}`;

/** Proietta una cessione nel DTO della Scheda (storia sul contratto). */
export function toTransferDTO(t: WithCustomers): TransferDTO {
  return {
    id: t.id,
    effectiveDate: formatDbDate(t.effectiveDate),
    previousCustomerId: t.previousCustomerId,
    previousCustomerName: fullName(t.previousCustomer),
    newCustomerId: t.newCustomerId,
    newCustomerName: fullName(t.newCustomer),
    refundToPrevious: Number(t.refundToPrevious),
    collectedFromNew: Number(t.collectedFromNew),
    reason: t.reason ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

type WithNewCustomer = BookingTransfer & { newCustomer: Pick<Customer, 'firstName' | 'lastName'> };

/** Proietta una cessione per la sezione "cessioni effettuate" della Scheda del cedente. */
export function toCededSubscriptionDTO(
  t: WithNewCustomer,
  e: { umbrellaLabel: string; seasonName?: string },
): CededSubscriptionDTO {
  return {
    transferId: t.id,
    bookingId: t.bookingId,
    effectiveDate: formatDbDate(t.effectiveDate),
    newCustomerName: fullName(t.newCustomer),
    umbrellaLabel: e.umbrellaLabel,
    seasonName: e.seasonName,
    refundToPrevious: Number(t.refundToPrevious),
    reason: t.reason ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Esegui il test — deve passare**

Run: `corepack pnpm --filter @coralyn/api exec jest booking-transfer.projection -- --runInBand`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking-transfer.projection.ts apps/api/src/bookings/booking-transfer.projection.spec.ts
git commit -m "feat(api): toTransferDTO/toCededSubscriptionDTO projections (D-013 cessione)"
```

---

## Task 5: Service `transfer()` — cuore di dominio (invarianti + movimento netto)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (import ~18-21; nuovo metodo dopo `reactivate`, ~riga 702)
- Test: `apps/api/src/bookings/bookings-transfer.service.spec.ts` (nuovo)

**Interfaces:**
- Consumes: `TransferSubscriptionInput` (Task 2); `tx.bookingTransfer` (Task 1); `resolvePayment`/`cents` pattern da `booking.payment.ts`.
- Produces: `BookingsService.transfer(id: string, input: TransferSubscriptionInput): Promise<BookingDTO>`.

> **Nota per l'implementer:** questo è il task a più alto rischio di dominio. Il modello soldi è "movimento netto": `newCollected = amountCollected − refundToPrevious + collectedFromNew`, con `paymentStatus` ricalcolato e **`refundedAmount` mai toccato**. Le unit test qui sotto sono la specifica esatta del comportamento.

- [ ] **Step 1: Scrivi lo unit test** `bookings-transfer.service.spec.ts`. Mirror lo scaffolding degli altri `*.service.spec.ts` del modulo (mock `PrismaService.forTenant` che esegue la callback con un `tx` finto, `TenantContext.require()` che ritorna un tenantId). Test da coprire:

```ts
// Pseudocodice degli assert — adatta lo scaffold del mock tx a quello già usato negli spec del modulo.
// tx.booking.findFirst -> ritorna l'abbonamento; tx.customer.findFirst -> il subentrante;
// tx.bookingTransfer.create / tx.booking.update -> spia gli argomenti.

describe('BookingsService.transfer', () => {
  const sub = {
    id: 'b-1', customerId: 'c-a', type: 'subscription', status: 'confirmed', terminatedAt: null,
    startDate: new Date('2026-06-01T00:00:00.000Z'), endDate: new Date('2026-09-30T00:00:00.000Z'),
    totalPrice: { toString: () => '1000' }, amountCollected: { toString: () => '1000' },
    refundedAmount: { toString: () => '0' }, suspensions: [],
  };
  const newCustomer = { id: 'c-b', anonymizedAt: null };

  it('lido processa (rimborso 500 ad A, incasso 500 da B): customerId->B, amountCollected invariato (1000), paid, refundedAmount 0', async () => {
    // input { newCustomerId:'c-b', effectiveDate:'2026-07-15', refundToPrevious:500, collectedFromNew:500 }
    // atteso booking.update.data = { customerId:'c-b', amountCollected:1000, paymentStatus:'paid' } — NIENTE refundedAmount
    // atteso bookingTransfer.create.data = { bookingId:'b-1', previousCustomerId:'c-a', newCustomerId:'c-b',
    //   effectiveDate: <2026-07-15>, refundToPrevious:500, collectedFromNew:500, reason:null }
  });

  it('regolamento privato (0/0): amountCollected invariato (1000), paid', async () => {
    // input refundToPrevious:0 collectedFromNew:0 -> update.data.amountCollected===1000, paymentStatus:'paid'
  });

  it('rinegoziato (rimborso 500, incasso 400): amountCollected 900, partial', async () => {
    // update.data.amountCollected===900, paymentStatus:'partial'
  });

  it('subentrante che azzera l\'incasso (rimborso 1000, incasso 0): amountCollected 0, unpaid', async () => {
    // update.data.amountCollected===0, paymentStatus:'unpaid'
  });

  it('422 se non è un abbonamento', async () => { /* type:'daily' -> UnprocessableEntityException */ });
  it('422 se non confermato', async () => { /* status:'cancelled' */ });
  it('422 se disdetto', async () => { /* terminatedAt: new Date() */ });
  it('409 se esiste una sospensione aperta', async () => { /* suspensions:[{endDate:null}] -> ConflictException */ });
  it('422 se il subentrante coincide col titolare', async () => { /* newCustomerId:'c-a' */ });
  it('422 se il subentrante non esiste nel tenant', async () => { /* customer.findFirst -> null */ });
  it('422 se il subentrante è anonimizzato', async () => { /* newCustomer.anonymizedAt: new Date() */ });
  it('422 se effectiveDate fuori da [start,end]', async () => { /* '2026-10-01' */ });
  it('422 se refundToPrevious > amountCollected', async () => { /* refundToPrevious:1500 */ });
  it('422 se il netto supera il totale (OVER_TOTAL)', async () => { /* refundToPrevious:0 collectedFromNew:1 su collected=1000,total=1000 */ });
  it('404 se la prenotazione non esiste', async () => { /* booking.findFirst -> null -> NotFoundException */ });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api exec jest bookings-transfer.service -- --runInBand`
Expected: FAIL — `transfer` non è un metodo.

- [ ] **Step 3: Aggiungi l'import del tipo** in `bookings.service.ts` (blocco import da `@coralyn/contracts`, ~riga 18-21, aggiungi):

```ts
  TransferSubscriptionInput,
  CededSubscriptionDTO,
```

E aggiungi accanto agli altri import di projection (dopo riga 27):

```ts
import { toTransferDTO, toCededSubscriptionDTO } from './booking-transfer.projection';
```

- [ ] **Step 4: Implementa `transfer()`** (dopo `reactivate`, prima della `}` finale della classe, ~riga 702):

```ts
  /**
   * Cessione/subentro di un abbonamento (D-013, ADR-0047). Cambia il titolare (customerId) A->B
   * preservando span/seniority/prelazione (NON tocca BookingCoverage: l'occupazione è continua) e
   * riconcilia l'incasso come MOVIMENTO NETTO su amountCollected (refundToPrevious in uscita,
   * collectedFromNew in entrata); refundedAmount resta INTATTO (la cessione è un trasferimento, non
   * una perdita). Registra la storia su BookingTransfer. admin-only.
   */
  async transfer(id: string, input: TransferSubscriptionInput): Promise<BookingDTO> {
    const tenantId = this.tenant.require();
    const cents = (n: number): number => Math.round(n * 100);
    const outcome = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id }, include: { suspensions: true } });
      if (!existing) return { error: 'NOT_FOUND' as const };
      if (existing.type !== 'subscription') return { error: 'NOT_SUBSCRIPTION' as const };
      if (existing.status !== 'confirmed') return { error: 'NOT_CONFIRMED' as const };
      if (existing.terminatedAt) return { error: 'TERMINATED' as const };
      if (existing.suspensions.some((s) => s.endDate === null)) return { error: 'OPEN_SUSPENSION' as const };

      if (input.newCustomerId === existing.customerId) return { error: 'SAME_HOLDER' as const };
      const newCustomer = await tx.customer.findFirst({ where: { id: input.newCustomerId } });
      if (!newCustomer) return { error: 'NEW_CUSTOMER_INVALID' as const };
      if (newCustomer.anonymizedAt) return { error: 'NEW_CUSTOMER_ANON' as const };

      const eff = toDbDate(input.effectiveDate);
      if (!(eff >= existing.startDate && eff <= existing.endDate)) return { error: 'BAD_DATE' as const };

      const collected = Number(existing.amountCollected);
      const total = Number(existing.totalPrice);
      const refundOut = input.refundToPrevious;
      const collectIn = input.collectedFromNew;
      if (!(refundOut >= 0 && refundOut <= collected)) return { error: 'BAD_REFUND' as const };
      if (!(collectIn >= 0)) return { error: 'BAD_COLLECT' as const };
      const newCollected = collected - refundOut + collectIn;
      if (cents(newCollected) > cents(total)) return { error: 'OVER_TOTAL' as const };

      const paymentStatus =
        cents(newCollected) === 0 ? 'unpaid' : cents(newCollected) === cents(total) ? 'paid' : 'partial';

      await tx.bookingTransfer.create({
        data: {
          bookingId: id,
          establishmentId: tenantId,
          previousCustomerId: existing.customerId,
          newCustomerId: input.newCustomerId,
          effectiveDate: eff,
          refundToPrevious: refundOut,
          collectedFromNew: collectIn,
          reason: input.reason ?? null,
        },
      });
      const row = await tx.booking.update({
        where: { id },
        data: { customerId: input.newCustomerId, amountCollected: newCollected, paymentStatus },
      });
      return { row };
    });

    if ('error' in outcome) {
      const e = outcome.error;
      if (e === 'NOT_FOUND') throw new NotFoundException('Prenotazione non trovata');
      if (e === 'NOT_SUBSCRIPTION') throw new UnprocessableEntityException('Solo gli abbonamenti possono essere ceduti');
      if (e === 'NOT_CONFIRMED') throw new UnprocessableEntityException('Abbonamento non attivo');
      if (e === 'TERMINATED') throw new UnprocessableEntityException('Abbonamento disdetto: non cedibile');
      if (e === 'OPEN_SUSPENSION') throw new ConflictException('Sospensione aperta: riattiva prima di cedere');
      if (e === 'SAME_HOLDER') throw new UnprocessableEntityException('Il subentrante coincide col titolare attuale');
      if (e === 'NEW_CUSTOMER_INVALID') throw new UnprocessableEntityException('Cliente subentrante non valido');
      if (e === 'NEW_CUSTOMER_ANON') throw new UnprocessableEntityException('Cliente subentrante anonimizzato');
      if (e === 'BAD_DATE') throw new UnprocessableEntityException('Data di cessione non valida');
      if (e === 'OVER_TOTAL') throw new UnprocessableEntityException('Il netto incassato supera il totale');
      throw new UnprocessableEntityException('Importi di cessione non validi'); // BAD_REFUND / BAD_COLLECT
    }
    return toBookingDTO(outcome.row);
  }
```

- [ ] **Step 5: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api exec jest bookings-transfer.service -- --runInBand`
Expected: PASS (tutti i casi).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings-transfer.service.spec.ts
git commit -m "feat(api): BookingsService.transfer — titolarita + movimento netto incasso (D-013)"
```

---

## Task 6: Service `listCededByCustomer()` + `transfers[]` nella Scheda

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (`listByCustomer` ~63-123; nuovo metodo)
- Modify: `apps/api/src/bookings/customer-booking.projection.ts` (enrichment + DTO)
- Test: estendi `bookings-transfer.service.spec.ts` o aggiungi al projection spec

**Interfaces:**
- Consumes: `toTransferDTO`, `toCededSubscriptionDTO` (Task 4); `resolveSeasonName` (esistente).
- Produces: `BookingsService.listCededByCustomer(customerId: string): Promise<CededSubscriptionDTO[]>`; `CustomerBookingDTO.transfers` popolato.

- [ ] **Step 1: Aggiungi `transfers` all'enrichment** in `customer-booking.projection.ts`. In `CustomerBookingEnrichment` (dopo `suspensions?`):

```ts
  transfers?: TransferDTO[];
```
Aggiorna l'import: `import type { CustomerBookingDTO, SuspensionDTO, TransferDTO } from '@coralyn/contracts';`
In `toCustomerBookingDTO`, dopo `suspensions: e.suspensions ?? [],`:

```ts
    transfers: e.transfers ?? [],
```

- [ ] **Step 2: Carica i transfers in `listByCustomer`.** Nell'`include` della `findMany` (dopo `suspensions: {...}`, riga 73):

```ts
          transfers: {
            include: { previousCustomer: true, newCustomer: true },
            orderBy: { effectiveDate: 'desc' },
          },
```
E nel `.map` finale, nell'oggetto enrichment (dopo `suspensions: b.suspensions.map(toSuspensionDTO),`, riga 119):

```ts
          transfers: b.transfers.map(toTransferDTO),
```

- [ ] **Step 3: Implementa `listCededByCustomer`** in `bookings.service.ts` (dopo `listByCustomer`, ~riga 123):

```ts
  /** Cessioni EFFETTUATE da un cliente (previousCustomerId = customerId): per la sezione "cessioni
   *  effettuate" della sua Scheda. Read-only, tenant-scoped. Ordine effectiveDate desc. */
  async listCededByCustomer(customerId: string): Promise<CededSubscriptionDTO[]> {
    const tenantId = this.tenant.require();
    if (!UUID_SHAPE.test(customerId)) return [];
    return this.prisma.forTenant(tenantId, async (tx) => {
      const rows = await tx.bookingTransfer.findMany({
        where: { previousCustomerId: customerId },
        include: { newCustomer: true, booking: { include: { umbrella: true } } },
        orderBy: { effectiveDate: 'desc' },
      });
      if (rows.length === 0) return [];
      const seasons = await tx.season.findMany({});
      return rows.map((t) =>
        toCededSubscriptionDTO(t, {
          umbrellaLabel: t.booking.umbrella.label,
          seasonName: resolveSeasonName(seasons, t.booking.startDate),
        }),
      );
    });
  }
```

- [ ] **Step 4: Test** — aggiungi al projection spec o allo service spec un caso che verifica l'ordinamento e la mappa (mock `tx.bookingTransfer.findMany` → 2 righe con date diverse; assert ordine desc e campi). Poi esegui:

Run: `corepack pnpm --filter @coralyn/api exec jest -- --runInBand`
Expected: PASS (unit del modulo bookings tutte verdi).

- [ ] **Step 5: Typecheck** (l'include tipizza `transfers`/`newCustomer` — verifica):

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/customer-booking.projection.ts apps/api/src/bookings/*.spec.ts
git commit -m "feat(api): listCededByCustomer + transfers[] nella Scheda (D-013)"
```

---

## Task 7: Controller — `POST /bookings/:id/transfer` + `GET /customers/:id/ceded-subscriptions`

**Files:**
- Modify: `apps/api/src/bookings/bookings.controller.ts` (import + rotta)
- Modify: `apps/api/src/customers/customers.controller.ts` (rotta)

**Interfaces:**
- Consumes: `BookingsService.transfer` (Task 5), `listCededByCustomer` (Task 6); `TransferSubscriptionDto` (Task 3).

- [ ] **Step 1: bookings.controller.ts** — import (dopo riga 13):

```ts
import { TransferSubscriptionDto } from './dto/transfer-subscription.dto';
```
Rotta (dopo `reactivate`, riga 70):

```ts
  @Post(':id/transfer')
  @HttpCode(200)
  @Roles(Role.Admin)
  transfer(@Param('id') id: string, @Body() body: TransferSubscriptionDto): Promise<BookingDTO> {
    return this.bookings.transfer(id, body);
  }
```

- [ ] **Step 2: customers.controller.ts** — import type (riga 3, aggiungi `CededSubscriptionDTO`):

```ts
import { CustomerDTO, CustomerBookingDTO, CededSubscriptionDTO, DeleteCustomerResult, Role } from '@coralyn/contracts';
```
Rotta (dopo `listBookings`, riga 26):

```ts
  @Get(':id/ceded-subscriptions')
  listCeded(@Param('id') id: string): Promise<CededSubscriptionDTO[]> {
    return this.bookings.listCededByCustomer(id);
  }
```

- [ ] **Step 3: Typecheck + build**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bookings/bookings.controller.ts apps/api/src/customers/customers.controller.ts
git commit -m "feat(api): transfer + ceded-subscriptions endpoints (D-013)"
```

---

## Task 8: e2e — cessione (admin happy, guardie, RLS, lato-cedente)

**Files:**
- Create: `apps/api/test/subscription-cession.e2e-spec.ts`

> **Nota implementer:** mirror lo scaffold di `apps/api/test/customer-bookings.e2e-spec.ts` (bootstrap app Nest, login admin `admin@coralyn.dev`, seed di un abbonamento confermato + due clienti). Usa lo stesso helper di autenticazione/tenant già in quel file. Rotte sotto `/api`.

**Interfaces:**
- Consumes: gli endpoint dei Task 7.

- [ ] **Step 1: Scrivi la e2e** con questi casi (assert espliciti):

```ts
// Setup: tenant T, admin, staff; clienti A (titolare) e B; un abbonamento sub (customerId=A, confermato,
// totalPrice 1000, amountCollected 1000, span nella stagione 2026), 1 coverage.

// 1) Admin happy — lido processa:
//    POST /api/bookings/:id/transfer { newCustomerId: B, effectiveDate: <metà span>, refundToPrevious:500, collectedFromNew:500 }
//    -> 200; body.customerId === B; body.amountCollected === 1000; body.paymentStatus === 'paid'; body.refundedAmount === 0
// 2) GET /api/customers/<B>/bookings -> l'abbonamento c'è, transfers[] contiene { newCustomerId:B, refundToPrevious:500 }
// 3) GET /api/customers/<A>/bookings -> l'abbonamento NON è più tra i confermati attivi di A
// 4) GET /api/customers/<A>/ceded-subscriptions -> 1 riga { bookingId, newCustomerName:'<B fullname>', refundToPrevious:500 }
// 5) Occupazione invariata: GET /api/map?date=<data nello span> -> l'ombrellone risulta occupato (coverage non toccata)
// 6) 403: staff (non admin) su transfer -> 403
// 7) 404: transfer su id inesistente -> 404
// 8) 422: effectiveDate fuori dallo span -> 422
// 9) 422: newCustomerId === titolare attuale -> 422
// 10) 422: OVER_TOTAL (refundToPrevious:0 collectedFromNew:1) -> 422
// 11) 409: con una sospensione aperta sull'abbonamento, transfer -> 409
// 12) RLS: admin di un ALTRO tenant che fa transfer sull'id -> 404 (invisibile)
```

- [ ] **Step 2: Esegui la e2e (runInBand obbligatorio)**

Run: `corepack pnpm --filter @coralyn/api run test:e2e -- --runInBand subscription-cession`
Expected: PASS (tutti i casi).

- [ ] **Step 3: Suite e2e completa (no regressioni)**

Run: `corepack pnpm --filter @coralyn/api run test:e2e -- --runInBand`
Expected: PASS; totale ≥ 264 + i nuovi.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/subscription-cession.e2e-spec.ts
git commit -m "test(api): e2e cessione — happy/guardie/RLS/lato-cedente (D-013)"
```

---

## Task 9: FE helper `cessionRefund.ts`

**Files:**
- Create: `apps/web-staff/src/features/customers/cessionRefund.ts`
- Test: `apps/web-staff/src/features/customers/cessionRefund.spec.ts`

**Interfaces:**
- Produces: `suggestedCessionRefund(b, effectiveDate): number` — pro-rata del residuo `[effectiveDate, end]`.

- [ ] **Step 1: Scrivi il test** (mirror `suspensionRefund.spec.ts`):

```ts
import { suggestedCessionRefund } from './cessionRefund';

const b = { startDate: '2026-06-01', endDate: '2026-09-30', totalPrice: 1000, amountCollected: 1000, refundedAmount: 0 };

describe('suggestedCessionRefund', () => {
  it('pro-rata del residuo [effectiveDate, end]', () => {
    // plannedDays = 122; residualDays da 2026-08-01 a 2026-09-30 = 61 -> round2(1000*61/122) = 500
    expect(suggestedCessionRefund(b, '2026-08-01')).toBe(500);
  });
  it('effectiveDate = start -> intero (tutto residuo)', () => {
    expect(suggestedCessionRefund(b, '2026-06-01')).toBe(1000);
  });
  it('clampa al residuo incassato (amountCollected − refundedAmount)', () => {
    expect(suggestedCessionRefund({ ...b, amountCollected: 300, refundedAmount: 0 }, '2026-06-01')).toBe(300);
  });
  it('effectiveDate oltre end -> 0', () => {
    expect(suggestedCessionRefund(b, '2026-10-15')).toBe(0);
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/web-staff exec vitest run cessionRefund`
Expected: FAIL — modulo non trovato.

- [ ] **Step 3: Implementa:**

```ts
import type { CustomerBookingDTO } from '@coralyn/contracts';

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * Rimborso pro-rata SUGGERITO al cedente per una cessione (D-013). residualDays = |[effectiveDate, end]|.
 * suggested = totalPrice × residualDays / plannedDays, clampato al residuo incassato
 * (amountCollected − refundedAmount). NON autoritativo: l'operatore sovrascrive; il server valida i bound.
 * Pre-compila anche collectedFromNew (handover pulito → amountCollected invariato).
 */
export function suggestedCessionRefund(
  b: Pick<CustomerBookingDTO, 'startDate' | 'endDate' | 'totalPrice' | 'amountCollected' | 'refundedAmount'>,
  effectiveDate: string,
): number {
  const plannedDays = dayDiff(b.startDate, b.endDate) + 1;
  if (plannedDays <= 0) return 0;
  const residualDays = dayDiff(effectiveDate, b.endDate) + 1; // |[effectiveDate, end]| inclusivo
  if (residualDays <= 0) return 0;
  const raw = round2(b.totalPrice * clamp(residualDays / plannedDays, 0, 1));
  const residual = b.amountCollected - (b.refundedAmount ?? 0);
  return clamp(raw, 0, Math.max(residual, 0));
}
```

- [ ] **Step 4: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/web-staff exec vitest run cessionRefund`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/customers/cessionRefund.ts apps/web-staff/src/features/customers/cessionRefund.spec.ts
git commit -m "feat(web-staff): cessionRefund pro-rata helper (D-013)"
```

---

## Task 10: FE hooks + queryKey

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Modify: `apps/web-staff/src/features/customers/useCustomers.ts`

**Interfaces:**
- Consumes: `TransferSubscriptionInput`, `CededSubscriptionDTO`, `BookingDTO` (contracts).
- Produces: `useTransferSubscription(customerId)`, `useCededSubscriptions(customerId)`, `queryKeys.cededSubscriptions`.

- [ ] **Step 1: queryKey** in `queryKeys.ts` (dopo `customerBookings`, riga 4):

```ts
  cededSubscriptions: (tenantId: string, id: string) => ['customer', tenantId, id, 'ceded'] as const,
```

- [ ] **Step 2: hooks** in `useCustomers.ts`. Estendi l'import (riga 1) con `CededSubscriptionDTO, TransferSubscriptionInput`. Poi aggiungi (dopo `useReactivateSubscription`, riga 91):

```ts
/** Cessione/subentro (D-013, admin-only). Invalida la Scheda cliente (bookings + ceded). Errore inline nel modale. */
export function useTransferSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TransferSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/transfer`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [
      queryKeys.customerBookings(session.establishmentId, customerId),
      queryKeys.cededSubscriptions(session.establishmentId, customerId),
    ],
    quiet: true,
  });
}

/** Cessioni EFFETTUATE da questo cliente (sezione read-only nella sua Scheda). */
export function useCededSubscriptions(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.cededSubscriptions(session.establishmentId, id),
    queryFn: () => apiFetch<CededSubscriptionDTO[]>(`/customers/${id}/ceded-subscriptions`),
  });
}
```

- [ ] **Step 3: Typecheck FE**

Run: `corepack pnpm --filter @coralyn/web-staff exec vue-tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/customers/useCustomers.ts
git commit -m "feat(web-staff): useTransferSubscription + useCededSubscriptions hooks (D-013)"
```

---

## Task 11: FE modale `TransferSubscriptionModal.vue` + MSW handler transfer

**Files:**
- Create: `apps/web-staff/src/features/customers/TransferSubscriptionModal.vue`
- Test: `apps/web-staff/src/features/customers/TransferSubscriptionModal.spec.ts`
- Modify: `apps/web-staff/src/mocks/server.ts` (handler `transfer`)

**Interfaces:**
- Consumes: `useTransferSubscription` (Task 10), `useCustomers` (esistente → lista clienti per il selettore), `suggestedCessionRefund` (Task 9).

- [ ] **Step 1: MSW handler** in `server.ts` (dopo il blocco `reactivate`, ~riga 483, dentro l'array `http.*`):

```ts
  http.post('/api/bookings/:id/transfer', async ({ params, request }) => {
    const input = (await request.json()) as { newCustomerId: string; effectiveDate: string; refundToPrevious: number; collectedFromNew: number; reason?: string };
    for (const [cid, list] of Object.entries(customerBookings)) {
      const idx = list.findIndex((x) => x.id === params.id);
      if (idx >= 0) {
        const b = list[idx];
        const newCollected = b.amountCollected - input.refundToPrevious + input.collectedFromNew;
        // mock: sposta l'abbonamento sotto il subentrante e registra la cessione nella Scheda del cedente
        list.splice(idx, 1);
        (customerBookings[input.newCustomerId] ??= []).push({ ...b, amountCollected: newCollected });
        return HttpResponse.json({ ...b, customerId: input.newCustomerId, amountCollected: newCollected });
      }
      void cid;
    }
    return new HttpResponse(null, { status: 404 });
  }),
```

- [ ] **Step 2: Scrivi il test** `TransferSubscriptionModal.spec.ts` (mirror lo scaffold di `SuspendSubscriptionModal` spec — monta con `open=true`, un `booking` sub e `customerId`, MSW attivo). Casi:

```ts
// 1) All'apertura: il campo importo "rimborso al cedente" e "incasso dal subentrante" sono pre-compilati
//    al residuo suggerito (suggestedCessionRefund) uguali fra loro.
// 2) Il selettore subentrante NON include il titolare attuale (customerId del booking assente tra le opzioni).
// 3) Submit con un subentrante scelto -> chiama POST /bookings/:id/transfer con il payload corretto
//    { newCustomerId, effectiveDate, refundToPrevious, collectedFromNew } e chiude (open=false).
// 4) 409 dal server -> messaggio "Sospensione aperta..." inline; 422 -> "Dati non validi.".
```

- [ ] **Step 3: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/web-staff exec vitest run TransferSubscriptionModal`
Expected: FAIL — componente non trovato.

- [ ] **Step 4: Implementa il componente** (mirror `SuspendSubscriptionModal.vue`; selettore = `<select>` nativo su `useCustomers()` escludendo il titolare):

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Modal, Field, Button, formatEuro } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { useSessionStore } from '@/stores/session';
import { todayIso } from '@/lib/dates';
import { suggestedCessionRefund } from './cessionRefund';
import { useTransferSubscription, useCustomers } from './useCustomers';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ booking: CustomerBookingDTO | null; customerId: string }>();

const session = useSessionStore();
const transfer = useTransferSubscription(props.customerId);
const { data: customers } = useCustomers();

const newCustomerId = ref('');
const effectiveDate = ref('');
const refundToPrevious = ref(0);
const collectedFromNew = ref(0);
const reason = ref('');
const error = ref('');
const submitting = ref(false);

const inputClass =
  'w-full rounded-[11px] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-[13.5px] text-[var(--color-text)] focus:outline-none';

const minDate = computed(() => props.booking?.startDate ?? todayIso());
const maxDate = computed(() => props.booking?.endDate ?? '');
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
// il subentrante non può essere il titolare attuale (Scheda = customerId)
const candidates = computed(() => (customers.value ?? []).filter((c) => c.id !== props.customerId && !c.anonymizedAt));
const suggested = computed(() =>
  props.booking && effectiveDate.value ? suggestedCessionRefund(props.booking, effectiveDate.value) : 0,
);

watch(open, (isOpen) => {
  if (isOpen && props.booking) {
    newCustomerId.value = '';
    effectiveDate.value = clampDate(session.activeDate || todayIso(), minDate.value, maxDate.value);
    const s = suggestedCessionRefund(props.booking, effectiveDate.value);
    refundToPrevious.value = s;
    collectedFromNew.value = s;
    reason.value = '';
    error.value = '';
  }
});

watch(effectiveDate, () => {
  if (!props.booking) return;
  const s = suggestedCessionRefund(props.booking, effectiveDate.value);
  refundToPrevious.value = s;
  collectedFromNew.value = s;
});

async function confirm(): Promise<void> {
  if (!props.booking || !newCustomerId.value) { error.value = 'Seleziona il subentrante.'; return; }
  error.value = '';
  submitting.value = true;
  try {
    await transfer.mutateAsync({
      id: props.booking.id,
      input: {
        newCustomerId: newCustomerId.value,
        effectiveDate: effectiveDate.value,
        refundToPrevious: refundToPrevious.value,
        collectedFromNew: collectedFromNew.value,
        reason: reason.value || undefined,
      },
    });
    open.value = false;
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    error.value =
      status === 409 ? 'Sospensione aperta: riattiva prima di cedere.' : status === 422 ? 'Dati non validi.' : 'Errore durante la cessione.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" title="Cedi abbonamento" eyebrow="Subentro">
    <div v-if="booking" class="flex flex-col gap-[18px]">
      <Field label="Cliente subentrante">
        <select v-model="newCustomerId" data-testid="transfer-new-customer" :class="inputClass">
          <option value="" disabled>Seleziona…</option>
          <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
        </select>
      </Field>

      <Field label="Data effettiva del subentro">
        <input v-model="effectiveDate" data-testid="transfer-date" type="date" :min="minDate" :max="maxDate" :class="inputClass" />
      </Field>

      <Field label="Rimborso al cedente (€)">
        <input v-model.number="refundToPrevious" data-testid="transfer-refund" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <Field label="Incasso dal subentrante (€)">
        <input v-model.number="collectedFromNew" data-testid="transfer-collect" type="number" min="0" step="0.01" :class="inputClass" />
      </Field>
      <div class="flex items-center gap-2 text-[12.5px] text-[var(--color-text-2nd)]">
        <span>Residuo suggerito: <span class="font-semibold tabular-nums text-[var(--color-text)]">{{ formatEuro(suggested) }}</span></span>
        <Button type="button" variant="ghost" @click="refundToPrevious = suggested; collectedFromNew = suggested">Usa suggerito</Button>
        <Button type="button" variant="ghost" @click="refundToPrevious = 0; collectedFromNew = 0">Regolamento privato</Button>
      </div>

      <Field label="Motivo (opzionale)">
        <textarea v-model="reason" rows="2" :class="inputClass"></textarea>
      </Field>

      <p v-if="error" class="text-[12.5px] text-[var(--color-danger)]">{{ error }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" @click="open = false">Annulla</Button>
        <Button data-testid="transfer-confirm" variant="primary" :disabled="submitting" @click="confirm">Cedi</Button>
      </div>
    </div>
  </Modal>
</template>
```

- [ ] **Step 5: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/web-staff exec vitest run TransferSubscriptionModal`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/TransferSubscriptionModal.vue apps/web-staff/src/features/customers/TransferSubscriptionModal.spec.ts apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): TransferSubscriptionModal + MSW transfer handler (D-013)"
```

---

## Task 12: FE card (bottone Cedi + sezione "cessioni effettuate") + wiring Scheda

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts` (handler `ceded-subscriptions`)
- Test: estendi lo spec della card / `CustomerDetailView` esistente

**Interfaces:**
- Consumes: `useCededSubscriptions` (Task 10), `TransferSubscriptionModal` (Task 11), `CededSubscriptionDTO`.

- [ ] **Step 1: MSW handler ceded** in `server.ts` (accanto agli altri `customers` handler; ritorna una lista in-memory, default `[]`):

```ts
  http.get('/api/customers/:id/ceded-subscriptions', ({ params }) => HttpResponse.json(cededByCustomer[params.id as string] ?? [])),
```
Aggiungi in cima al file, accanto a `customerBookings`, lo store: `const cededByCustomer: Record<string, unknown[]> = {};` (se serve ai test, popolalo nel setup del test specifico).

- [ ] **Step 2: Card** `CustomerSubscriptionsCard.vue`. Estendi le props/emits (righe 7-12):

```ts
import type { CustomerBookingDTO, SuspensionDTO, CededSubscriptionDTO } from '@coralyn/contracts';
const props = defineProps<{ bookings: CustomerBookingDTO[]; ceded?: CededSubscriptionDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{
  terminate: [CustomerBookingDTO];
  suspend: [CustomerBookingDTO];
  reactivate: [{ booking: CustomerBookingDTO; suspension: SuspensionDTO }];
  transfer: [CustomerBookingDTO];
}>();
```
Bottone "Cedi" accanto a "Sospendi" (dopo riga 46, stessa `canSuspend` gating — cedibile = come sospendibile: confermato, non disdetto, futuro, senza sospensione aperta):

```vue
            <Button v-if="isAdmin && canSuspend(b)" variant="secondary" :data-testid="`transfer-${b.id}`" @click="emit('transfer', b)"><Icon name="repeat" :size="15" />Cedi</Button>
```
Sezione "cessioni effettuate" in fondo al template, dopo la `</ul>` (riga 64), dentro la `SectionCard`:

```vue
    <div v-if="(ceded ?? []).length" class="mt-4 border-t border-[var(--color-border)] pt-3">
      <div class="mb-2 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cessioni effettuate</div>
      <div v-for="c in ceded" :key="c.transferId" class="mb-2 rounded-[var(--radius-sm)] bg-[var(--color-raised)] px-2.5 py-2 text-[12px] text-[var(--color-text-2nd)]">
        Ombrellone {{ c.umbrellaLabel }} ceduto a {{ c.newCustomerName }} il {{ c.effectiveDate.slice(0, 10) }}<span v-if="c.refundToPrevious"> · rimborso {{ formatEuro(c.refundToPrevious) }}</span><span v-if="c.reason"> · {{ c.reason }}</span>
      </div>
    </div>
```

- [ ] **Step 3: Wiring** in `CustomerDetailView.vue`. Import + hook (dopo riga 23):

```ts
import TransferSubscriptionModal from './TransferSubscriptionModal.vue';
import { useCustomer, useCustomerBookings, useDeleteCustomer, useCededSubscriptions } from './useCustomers';
```
```ts
const { data: ceded } = useCededSubscriptions(props.id);
const transferOpen = ref(false);
const transferTarget = ref<CustomerBookingDTO | null>(null);
function onTransfer(b: CustomerBookingDTO) {
  transferTarget.value = b;
  transferOpen.value = true;
}
```
Card (riga 130) — passa `:ceded` e `@transfer`:

```vue
        <CustomerSubscriptionsCard :bookings="bookings ?? []" :ceded="ceded ?? []" :is-admin="isAdmin" @terminate="onTerminate" @suspend="onSuspend" @reactivate="onReactivate" @transfer="onTransfer" />
```
Modale (dopo `ReactivateSubscriptionModal`, riga 146):

```vue
      <TransferSubscriptionModal :booking="transferTarget" :customer-id="id" v-model:open="transferOpen" />
```

- [ ] **Step 4: Test** — estendi lo spec della card (bottone `transfer-<id>` emesso solo per admin su abbonamento cedibile; sezione "cessioni effettuate" renderizza le righe da `ceded`). Esegui:

Run: `corepack pnpm --filter @coralyn/web-staff exec vitest run CustomerSubscriptions`
Expected: PASS.

- [ ] **Step 5: Suite FE completa + typecheck (no regressioni)**

Run:
```bash
corepack pnpm --filter @coralyn/web-staff exec vue-tsc --noEmit
corepack pnpm --filter @coralyn/web-staff test
```
Expected: typecheck pulito; test ≥ 332 + i nuovi.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/mocks/server.ts apps/web-staff/src/features/customers/*.spec.ts
git commit -m "feat(web-staff): Cedi button + cessioni effettuate + wiring Scheda (D-013)"
```

---

## Task 13: ADR-0047 + design docs (ADR-0009 DoD)

**Files:**
- Create: `docs/architecture/decisions/0047-cessione-subentro-titolarita-incasso.md`
- Modify: `docs/design/data-model.md`, `docs/design/flows.md`
- Create: `docs/design/mockups/subscription-transfer-modal.html`

**Interfaces:** nessuna (documentazione).

- [ ] **Step 1: Scrivi ADR-0047** (mirror la struttura di `0046-...md`: Status/Data/Decisori/Correlati, Context, Decision, Consequences, Alternatives, Rubric check). Contenuto chiave:
  - **Decision (a):** il subentro è un cambio di `Booking.customerId` sulla **stessa** prenotazione (identità/seniority/prelazione preservate), non disdetta+nuova.
  - **Decision (b):** riconciliazione incasso = **movimento netto su `amountCollected`** (`− refundToPrevious + collectedFromNew`), `refundedAmount` **intatto**; motiva: la cessione è un **trasferimento**, non una perdita di ricavo (a differenza di disdetta/sospensione), quindi non deve sporcare `refundedAmount` né rompere `netto = amountCollected − refundedAmount`; `amountCollected` resta `≤ totalPrice` (coerente con `resolvePayment`/`OVER_TOTAL`).
  - **Decision (c):** `BookingTransfer` child RLS-FORCE come storia (nessun `createdBy` → audit attore in D-047).
  - **Alternatives considered:** disdetta+nuova-prenotazione (scartata: distrugge seniority/prelazione); `refundToPrevious`→`refundedAmount` + `collectedFromNew`→`amountCollected` (scartata: OVER_TOTAL e refundedAmount sporcato); ledger parallelo (scartata: rompe la formula netto fonte-unica).
  - Additivo su [ADR-0011] e [ADR-0046] (coverage non toccata).

- [ ] **Step 2: `data-model.md`** — aggiungi `BookingTransfer` all'ER (relazioni verso Booking + due verso Customer) e la nota "`Booking.customerId` mutabile via cessione".

- [ ] **Step 3: `flows.md`** — aggiungi il flusso cessione: guardie (tipo/stato/non-disdetto/no-sospensione-aperta/subentrante-valido/effectiveDate∈span/bound cassa) → scrittura (`BookingTransfer` + `Booking.{customerId, amountCollected, paymentStatus}`), e la nota "occupazione invariata".

- [ ] **Step 4: `mockups/subscription-transfer-modal.html`** — mockup statico della modale (selettore subentrante, data effettiva, due importi con "usa suggerito"/"regolamento privato", motivo). Mirror lo stile di `subscription-suspension-modal.html`.

- [ ] **Step 5: Aggiungi i riferimenti incrociati** — nel front-matter/correlati di ADR-0011 e ADR-0046 non serve modificare; verifica solo che i link relativi nella spec risolvano.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/decisions/0047-cessione-subentro-titolarita-incasso.md docs/design/data-model.md docs/design/flows.md docs/design/mockups/subscription-transfer-modal.html
git commit -m "docs(D-013): ADR-0047 cessione + design docs (ER/flows/mockup)"
```

---

## Self-Review (esito)

**Spec coverage** (ogni sezione della spec → task):
- §2/§3.1 titolarità pura → Task 5. §3.2/§5 movimento netto incasso → Task 5 (+ADR Task 13). §3.4 suggerimento pro-rata → Task 9. §3.5 subentrante esistente/non-anon/≠titolare → Task 5. §3.6 effectiveDate∈[start,end] → Task 5. §3.7 409 sospensione aperta → Task 5. §3.8 cessioni effettuate lato-A → Task 6 (service) + Task 7 (endpoint) + Task 12 (UI).
- §4 modello dati `BookingTransfer` RLS → Task 1. §6 invarianti → Task 5 (unit) + Task 8 (e2e). §7 contracts → Task 2 + Task 4 (projection). §8 UI → Task 11 (modale) + Task 12 (card/sezione/wiring). §9 impatto file → tutti. §11 verifiche → Task 8 (e2e). §15 ADR-0047 → Task 13. §16 design docs → Task 13.

**Placeholder scan:** i casi e2e (Task 8) e alcuni unit (Task 5) sono descritti come commenti-specifica con assert espliciti sui valori, perché lo scaffold di bootstrap (Nest app/login/seed, mock `tx`) è repo-specifico e va ricalcato dai file vicini indicati (`customer-bookings.e2e-spec.ts`, `*.service.spec.ts`) — non è un placeholder di logica: i valori attesi (200/customerId=B/amountCollected 1000/paid, 409/422/404, ordine desc) sono fissati.

**Type consistency:** `transfer(id, TransferSubscriptionInput)→BookingDTO`, `listCededByCustomer(customerId)→CededSubscriptionDTO[]`, `toTransferDTO`, `toCededSubscriptionDTO`, `suggestedCessionRefund(b, effectiveDate)`, `useTransferSubscription`/`useCededSubscriptions`, `queryKeys.cededSubscriptions` — coerenti tra Task 2/4/5/6/7/9/10/11/12.

## Verifica finale (dopo tutti i task, prima della review)
- Rebuild contracts → typecheck api (`tsc --noEmit`) + FE (`vue-tsc --noEmit`) puliti.
- `corepack pnpm --filter @coralyn/api test -- --runInBand` (unit) + `run test:e2e -- --runInBand` (e2e) verdi, ≥ baseline.
- `corepack pnpm --filter @coralyn/web-staff test` verde, ≥ baseline.
- Poi: whole-branch review (opus) → verifica LIVE su Docker (`--profile full`, login `admin@coralyn.dev`) → presentare all'utente e attendere OK per il merge FF (push su `main` SOLO con ok esplicito).
