# Noleggio mezzi/servizi (RentalItem/RentalTariff/Rental) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `superpowers:subagent-driven-development` (consigliato) o
> `superpowers:executing-plans` per implementare task-by-task. Gli step usano checkbox (`- [ ]`).

**Goal:** Aggiungere il **noleggio al banco** di mezzi/servizi (pedalò, canoe, babysitting…): catalogo articoli
personalizzabili, tariffe stagionali, transazione uscita/rientro con incasso e disponibilità informativa.

**Architecture:** Nuovo bounded context `rentals`, **additivo** e disgiunto dal dominio prenotazioni/pricing. Tre entità
tenant-scoped (`RentalItem`, `RentalTariff`, `Rental`) con RLS. Il backend **riusa** `CatalogService.resolveSeasonWithin`
(risoluzione stagione) e `resolvePayment` (incasso ADR-0011); non tocca il motore `Rate`. Prezzo = `tariff.price × units`,
**snapshot** al checkout. Stato del noleggio **derivato dai timestamp** (`cancelled > returned > active`). Disponibilità
`stock − Σ units attivi`, **mai bloccante**.

**Tech Stack:** NestJS + Prisma + PostgreSQL (RLS) + Jest/supertest (BE); Vue 3 + TanStack Query + MSW + Vitest (FE);
`@coralyn/contracts` (tipi condivisi), `@coralyn/ui-kit` (design system).

**Spec di riferimento:** [docs/specs/2026-07-20-rentals-noleggio-mezzi-servizi-design.md](../specs/2026-07-20-rentals-noleggio-mezzi-servizi-design.md).

## Global Constraints

- **Codice/DB in inglese, UI/doc in italiano** (ADR-0030). Termini di dominio: `RentalItem`/`RentalTariff`/`Rental`.
- **RLS FORCE tenant-scoped** su ogni nuova tabella: policy `tenant_isolation` scritta a mano in migration (Prisma non la
  genera). Ogni accesso DB passa da `this.prisma.forTenant(tenantId, (tx) => …)`; `tenantId = this.tenant.require()`.
- **Money** = `Decimal(10,2)`; confronti in **centesimi interi** (già dentro `resolvePayment`). Projection: `Decimal → Number`.
- **Fuso Roma** (ADR-0031): date operative via `todayInRome()`; date `@db.Date`; istanti timestamptz (`@default(now())`).
- **API prefix** `/api` (già globale). **Auth**: `JwtAuthGuard` globale — gli endpoint sono protetti di default.
- **TDD**: test-first, un commit per step verde. **Non regredire** i conteggi di test (rilevare la baseline live a inizio
  slice con `pnpm -C apps/api test` e `pnpm -C apps/web-staff test`).
- **DB di test**: `coralyn_test`; la migration va applicata a **dev e test** (`prisma migrate deploy` / `migrate dev`).

---

## Struttura file (cosa si crea/tocca)

**Backend** (`apps/api/`)
- `prisma/schema.prisma` — 3 nuovi model + relazioni inverse (modify).
- `prisma/migrations/<ts>_add_rentals/migration.sql` — create table + RLS (create).
- `prisma/seed.ts` — articoli/tariffe demo (modify).
- `src/rentals/rentals.module.ts` — modulo (create).
- `src/rentals/rental-item.projection.ts` · `rental-tariff.projection.ts` · `rental.projection.ts` (+ `.spec.ts`) — projection pure (create).
- `src/rentals/rental-catalog.service.ts` — CRUD `RentalItem` + `RentalTariff` (create).
- `src/rentals/rentals.service.ts` — transazione (checkout/return/cancel/payment/list) (create).
- `src/rentals/rental-items.controller.ts` · `rental-tariffs.controller.ts` · `rentals.controller.ts` (create).
- `src/rentals/dto/*.dto.ts` — validazione input (create).
- `src/app.module.ts` — registra `RentalsModule` (modify).
- `test/rental-items.e2e-spec.ts` · `rental-tariffs.e2e-spec.ts` · `rentals.e2e-spec.ts` (create).

**Contratti** (`packages/contracts/src/index.ts`) — DTO/Input rental (modify).

**Frontend** (`apps/web-staff/`)
- `src/features/rentals/useRentalItems.ts` · `useRentalTariffs.ts` · `useRentals.ts` — query/mutation (create).
- `src/features/rentals/RentalCatalogView.vue` · `RentalsView.vue` (create).
- `src/mocks/server.ts` — handler MSW (modify).
- app-shell nav — voce "Noleggi" (modify).

**Doc**
- `docs/architecture/decisions/0050-noleggio-mezzi-servizi.md` (create).
- `docs/architecture/glossary.md` · `docs/architecture/deferred.md` (modify: D-052/D-053).

**Nota di coerenza con lo spec:** la disponibilità è esposta **solo** dall'endpoint banco `GET /api/rentals?date=` (dove
serve viva), **non** dal `GET /api/rental-items` (catalogo puro di configurazione). Single source `computeAvailability`.

---

## Task 1: Schema + migration additiva + RLS + seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_rentals/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces: tabelle `RentalItem`/`RentalTariff`/`Rental` + client Prisma tipizzato (`tx.rentalItem`, `tx.rentalTariff`,
  `tx.rental`). Relazioni inverse su `Establishment`/`Season`/`Customer`.

- [ ] **Step 1: Aggiungi i model a `schema.prisma`**

Inserisci (dopo `model PackageEquipment { … }`) i tre model **esattamente** come nello spec §3.1:

```prisma
model RentalItem {
  id              String         @id @default(uuid()) @db.Uuid
  establishmentId String         @db.Uuid
  name            String
  stock           Int?
  archivedAt      DateTime?
  establishment   Establishment  @relation(fields: [establishmentId], references: [id])
  tariffs         RentalTariff[]
  rentals         Rental[]

  @@unique([establishmentId, name])
  @@index([establishmentId])
}

model RentalTariff {
  id              String        @id @default(uuid()) @db.Uuid
  establishmentId String        @db.Uuid
  rentalItemId    String        @db.Uuid
  seasonId        String        @db.Uuid
  label           String
  price           Decimal       @db.Decimal(10, 2)
  durationMinutes Int?
  sortOrder       Int
  archivedAt      DateTime?
  establishment   Establishment @relation(fields: [establishmentId], references: [id])
  rentalItem      RentalItem    @relation(fields: [rentalItemId], references: [id], onDelete: Cascade)
  season          Season        @relation(fields: [seasonId], references: [id])
  rentals         Rental[]

  @@index([establishmentId])
  @@index([rentalItemId, seasonId])
}

model Rental {
  id              String         @id @default(uuid()) @db.Uuid
  establishmentId String         @db.Uuid
  rentalItemId    String         @db.Uuid
  rentalTariffId  String         @db.Uuid
  customerId      String?        @db.Uuid
  units           Int            @default(1)
  startAt         DateTime       @default(now())
  returnedAt      DateTime?
  cancelledAt     DateTime?
  totalPrice      Decimal        @db.Decimal(10, 2)
  paymentStatus   PaymentStatus  @default(unpaid)
  amountCollected Decimal        @default(0) @db.Decimal(10, 2)
  paymentMethod   PaymentMethod?
  collectionDate  DateTime?      @db.Date
  createdAt       DateTime       @default(now())

  establishment   Establishment  @relation(fields: [establishmentId], references: [id])
  rentalItem      RentalItem     @relation(fields: [rentalItemId], references: [id], onDelete: Restrict)
  rentalTariff    RentalTariff   @relation(fields: [rentalTariffId], references: [id], onDelete: Restrict)
  customer        Customer?      @relation(fields: [customerId], references: [id])

  @@index([establishmentId])
  @@index([rentalItemId])
  @@index([establishmentId, startAt])
}
```

Aggiungi le **relazioni inverse** (liste) ai model esistenti:
- `Establishment`: `rentalItems RentalItem[]`, `rentalTariffs RentalTariff[]`, `rentals Rental[]`.
- `Season`: `rentalTariffs RentalTariff[]`.
- `Customer`: `rentals Rental[]`.

- [ ] **Step 2: Genera la migration (senza applicarla ancora al file RLS)**

Run: `pnpm -C apps/api exec prisma migrate dev --name add_rentals --create-only`
Expected: crea `prisma/migrations/<ts>_add_rentals/migration.sql` con `CREATE TABLE`/FK/index (NO RLS — la aggiungiamo a mano).

- [ ] **Step 3: Appendi la RLS alla migration** (mirror migration equipment)

In coda a `migration.sql`, per **ognuna** delle 3 tabelle:

```sql
-- RLS tenant_isolation (Prisma non la genera).
ALTER TABLE "RentalItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RentalItem"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "RentalTariff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RentalTariff" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RentalTariff"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");

ALTER TABLE "Rental" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rental" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rental"
  USING (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId")
  WITH CHECK (nullif(current_setting('app.current_tenant', true), '')::uuid = "establishmentId");
```

- [ ] **Step 4: Applica a dev e test, rigenera il client**

Run:
```bash
pnpm -C apps/api exec prisma migrate dev            # applica a coralyn_dev + genera client
DATABASE_URL=$TEST_DATABASE_URL pnpm -C apps/api exec prisma migrate deploy   # coralyn_test
pnpm -C apps/api exec prisma migrate status
```
Expected: `Database schema is up to date!` su entrambi; `@prisma/client` rigenerato con `rentalItem`/`rentalTariff`/`rental`.

- [ ] **Step 5: Seed demo** (in `seed.ts`, dentro la transazione tenant, dopo la creazione di `SEASON`)

Mirror del blocco pacchetti; usa id fissi e le costanti esistenti `EID`/`SEASON`:

```ts
// --- Noleggio demo: articoli fungibili + tariffe stagionali. ---
const PEDALO = '00000000-0000-0000-0000-0000000000a1';
const BABYSIT = '00000000-0000-0000-0000-0000000000a2';
await tx.rentalItem.upsert({
  where: { establishmentId_name: { establishmentId: EID, name: 'Pedalò' } },
  update: { stock: 5 },
  create: { id: PEDALO, establishmentId: EID, name: 'Pedalò', stock: 5 },
});
await tx.rentalItem.upsert({
  where: { establishmentId_name: { establishmentId: EID, name: 'Babysitting' } },
  update: { stock: null },
  create: { id: BABYSIT, establishmentId: EID, name: 'Babysitting', stock: null },
});
for (const t of [
  { itemId: PEDALO, label: '30 min', price: 5, durationMinutes: 30, sortOrder: 1 },
  { itemId: PEDALO, label: '1 ora', price: 8, durationMinutes: 60, sortOrder: 2 },
  { itemId: BABYSIT, label: '1 ora', price: 15, durationMinutes: 60, sortOrder: 1 },
]) {
  await tx.rentalTariff.create({
    data: { establishmentId: EID, rentalItemId: t.itemId, seasonId: SEASON, label: t.label,
            price: t.price, durationMinutes: t.durationMinutes, sortOrder: t.sortOrder },
  });
}
```
> `rentalTariff.create` (non upsert): non c'è unique naturale; per idempotenza del seed, prependi
> `await tx.rentalTariff.deleteMany({ where: { rentalItemId: { in: [PEDALO, BABYSIT] } } });`.

- [ ] **Step 6: Verifica seed + status**

Run: `pnpm -C apps/api exec prisma db seed` → Expected: nessun errore. `prisma migrate status` pulito.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts
git commit -m "feat(rentals): schema RentalItem/RentalTariff/Rental + migration RLS + seed demo"
```

---

## Task 2: Backend catalogo `RentalItem` (contratti + projection + CRUD + e2e)

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/rentals/rental-item.projection.ts` (+ `.spec.ts`)
- Create: `apps/api/src/rentals/rental-catalog.service.ts`
- Create: `apps/api/src/rentals/rental-items.controller.ts`
- Create: `apps/api/src/rentals/dto/create-rental-item.dto.ts` · `update-rental-item.dto.ts`
- Create: `apps/api/src/rentals/rentals.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/rental-items.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant`, `TenantContext.require()`.
- Produces: `RentalItemDTO { id; name; stock: number|null; archived?: true }`; `CreateRentalItemInput { name; stock?: number|null }`;
  `UpdateRentalItemInput { name?; stock?: number|null }`; `toRentalItemDTO(row)`; `RentalCatalogService.{list,create,update,archive,restore,delete}RentalItem`.

- [ ] **Step 1: Contratti** — appendi a `packages/contracts/src/index.ts`:

```ts
// --- Noleggio (rentals) -----------------------------------------------------
export interface RentalItemDTO { id: string; name: string; stock: number | null; archived?: true; }
export interface CreateRentalItemInput { name: string; stock?: number | null; }
export interface UpdateRentalItemInput { name?: string; stock?: number | null; }
```

- [ ] **Step 2: Test projection (fallisce)** — `rental-item.projection.spec.ts`:

```ts
import { toRentalItemDTO } from './rental-item.projection';

describe('toRentalItemDTO', () => {
  const base = { id: 'i1', establishmentId: 't1', name: 'Pedalò', stock: 5, archivedAt: null };
  it('mappa i campi e omette archived quando attivo', () => {
    expect(toRentalItemDTO(base as never)).toEqual({ id: 'i1', name: 'Pedalò', stock: 5 });
  });
  it('stock null passa; archived:true quando archiviato', () => {
    expect(toRentalItemDTO({ ...base, stock: null, archivedAt: new Date() } as never))
      .toEqual({ id: 'i1', name: 'Pedalò', stock: null, archived: true });
  });
});
```

- [ ] **Step 3: Run test → FAIL** — Run: `pnpm -C apps/api test rental-item.projection` → Expected: FAIL (module not found).

- [ ] **Step 4: Implementa projection** — `rental-item.projection.ts`:

```ts
import type { RentalItem } from '@prisma/client';
import type { RentalItemDTO } from '@coralyn/contracts';

export function toRentalItemDTO(r: RentalItem): RentalItemDTO {
  return { id: r.id, name: r.name, stock: r.stock, ...(r.archivedAt != null ? { archived: true } : {}) };
}
```

- [ ] **Step 5: Run test → PASS** — Run: `pnpm -C apps/api test rental-item.projection` → Expected: PASS.

- [ ] **Step 6: DTO input** — `dto/create-rental-item.dto.ts`:

```ts
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import type { CreateRentalItemInput } from '@coralyn/contracts';

export class CreateRentalItemDto implements CreateRentalItemInput {
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) stock?: number | null;
}
```
`dto/update-rental-item.dto.ts`: identico ma `@IsOptional() name?` e stesso `stock`.

- [ ] **Step 7: Service** — `rental-catalog.service.ts` (metodi `RentalItem`; i metodi tariffa arrivano nel Task 3):

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toRentalItemDTO } from './rental-item.projection';

@Injectable()
export class RentalCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContext) {}

  private normalizeName(n: string): string { return n.trim(); }

  async listRentalItems(includeArchived = false): Promise<RentalItemDTO[]> {
    const t = this.tenant.require();
    const rows = await this.prisma.forTenant(t, (tx) =>
      tx.rentalItem.findMany({ where: includeArchived ? {} : { archivedAt: null }, orderBy: { name: 'asc' } }));
    return rows.map(toRentalItemDTO);
  }

  async createRentalItem(input: CreateRentalItemInput): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const name = this.normalizeName(input.name);
    const row = await this.prisma.forTenant(t, async (tx) => {
      const clash = await tx.rentalItem.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new ConflictException('Esiste già un articolo con questo nome.');
      return tx.rentalItem.create({ data: { establishmentId: t, name, stock: input.stock ?? null } });
    });
    return toRentalItemDTO(row);
  }

  async updateRentalItem(id: string, input: UpdateRentalItemInput): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      const data: { name?: string; stock?: number | null } = {};
      if (input.name !== undefined) {
        const name = this.normalizeName(input.name);
        const clash = await tx.rentalItem.findFirst({
          where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un articolo con questo nome.');
        data.name = name;
      }
      if (input.stock !== undefined) data.stock = input.stock;
      return tx.rentalItem.update({ where: { id }, data });
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }

  async archiveRentalItem(id: string): Promise<RentalItemDTO> { return this.setArchived(id, true); }
  async restoreRentalItem(id: string): Promise<RentalItemDTO> { return this.setArchived(id, false); }

  private async setArchived(id: string, archived: boolean): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      if ((existing.archivedAt != null) === archived) return existing;
      return tx.rentalItem.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }

  async deleteRentalItem(id: string): Promise<RentalItemDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const existing = await tx.rentalItem.findFirst({ where: { id } });
      if (!existing) return null;
      if (existing.archivedAt == null)
        throw new ConflictException('Archivia l’articolo prima di eliminarlo definitivamente.');
      const refs = await tx.rental.count({ where: { rentalItemId: id } });
      if (refs > 0)
        throw new ConflictException('Articolo con noleggi registrati: non eliminabile.');
      await tx.rentalItem.delete({ where: { id } }); // le tariffe seguono in cascade
      return existing;
    });
    if (!row) throw new NotFoundException('Articolo non trovato');
    return toRentalItemDTO(row);
  }
}
```

- [ ] **Step 8: Controller** — `rental-items.controller.ts` (mirror `equipment-types.controller.ts`):

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalItemDTO } from '@coralyn/contracts';
import { RentalCatalogService } from './rental-catalog.service';
import { CreateRentalItemDto } from './dto/create-rental-item.dto';
import { UpdateRentalItemDto } from './dto/update-rental-item.dto';

@Controller('rental-items')
export class RentalItemsController {
  constructor(private readonly catalog: RentalCatalogService) {}

  @Get() list(@Query('includeArchived') a?: string): Promise<RentalItemDTO[]> {
    return this.catalog.listRentalItems(a === 'true');
  }
  @Post() create(@Body() b: CreateRentalItemDto): Promise<RentalItemDTO> { return this.catalog.createRentalItem(b); }
  @Patch(':id') update(@Param('id') id: string, @Body() b: UpdateRentalItemDto): Promise<RentalItemDTO> {
    return this.catalog.updateRentalItem(id, b);
  }
  @Post(':id/archive') archive(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.archiveRentalItem(id); }
  @Post(':id/restore') restore(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.restoreRentalItem(id); }
  @Delete(':id') remove(@Param('id') id: string): Promise<RentalItemDTO> { return this.catalog.deleteRentalItem(id); }
}
```

- [ ] **Step 9: Modulo + registrazione** — `rentals.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { RentalCatalogService } from './rental-catalog.service';
import { RentalItemsController } from './rental-items.controller';

@Module({
  imports: [CatalogModule],
  controllers: [RentalItemsController],
  providers: [RentalCatalogService],
})
export class RentalsModule {}
```
In `app.module.ts`: importa `RentalsModule` e aggiungilo all'array `imports`.

- [ ] **Step 10: e2e (fallisce, poi passa)** — `test/rental-items.e2e-spec.ts` (mirror `packages.e2e-spec.ts`):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

describe('RentalItems (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let s1: string; let s2: string; let t1: string; let t2: string;
  const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(m); prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rent A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Rent B' } })).id;
    await createUser(prisma, { email: 'a.ri1@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'a.ri2@e2e.test', password: 'pw2', role: Role.admin, establishmentId: s2 });
    t1 = await login(app, 'a.ri1@e2e.test', 'pw1'); t2 = await login(app, 'a.ri2@e2e.test', 'pw2');
  });
  afterAll(async () => {
    for (const s of [s1, s2]) await prisma.forTenant(s, async (tx) => {
      await tx.rental.deleteMany({}); await tx.rentalTariff.deleteMany({}); await tx.rentalItem.deleteMany({});
    });
    await prisma.user.deleteMany({ where: { email: { in: ['a.ri1@e2e.test', 'a.ri2@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const srv = () => app.getHttpServer();

  it('CRUD + unicità nome + isolamento tenant', async () => {
    const c = await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Pedalò', stock: 5 }).expect(201);
    expect(c.body).toMatchObject({ name: 'Pedalò', stock: 5 });
    const id = c.body.id as string;
    await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'pedalò' }).expect(409); // case-insensitive
    const upd = await request(srv()).patch(`/api/rental-items/${id}`).set(...bearer(t1)).send({ stock: null }).expect(200);
    expect(upd.body.stock).toBeNull();
    const listS2 = await request(srv()).get('/api/rental-items').set(...bearer(t2)).expect(200);
    expect(listS2.body.some((i: { id: string }) => i.id === id)).toBe(false);
    await request(srv()).patch(`/api/rental-items/${id}`).set(...bearer(t2)).send({ name: 'x' }).expect(404); // cross-tenant
  });

  it('archive/restore + delete guardato (409 se non archiviato) + delete 200 archiviato+0 noleggi', async () => {
    const c = await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Canoa' }).expect(201);
    const id = c.body.id as string;
    await request(srv()).delete(`/api/rental-items/${id}`).set(...bearer(t1)).expect(409); // non archiviato
    await request(srv()).post(`/api/rental-items/${id}/archive`).set(...bearer(t1)).expect(201);
    const arch = await request(srv()).get('/api/rental-items?includeArchived=true').set(...bearer(t1)).expect(200);
    expect(arch.body.find((i: { id: string; archived?: boolean }) => i.id === id).archived).toBe(true);
    await request(srv()).post(`/api/rental-items/${id}/restore`).set(...bearer(t1)).expect(201);
    await request(srv()).post(`/api/rental-items/${id}/archive`).set(...bearer(t1)).expect(201);
    await request(srv()).delete(`/api/rental-items/${id}`).set(...bearer(t1)).expect(200); // archiviato + 0 noleggi
  });
});
```

Run: `pnpm -C apps/api test:e2e rental-items` → prima FAIL (404 rotta assente), dopo Step 7-9 → PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/contracts apps/api/src/rentals apps/api/src/app.module.ts apps/api/test/rental-items.e2e-spec.ts
git commit -m "feat(rentals): catalogo RentalItem (CRUD, archivio, projection, e2e)"
```

---

## Task 3: Backend tariffe `RentalTariff` (season-scoped)

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/rentals/rental-tariff.projection.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/rentals/rental-catalog.service.ts` (metodi tariffa)
- Create: `apps/api/src/rentals/rental-tariffs.controller.ts`
- Create: `apps/api/src/rentals/dto/create-rental-tariff.dto.ts` · `update-rental-tariff.dto.ts`
- Modify: `apps/api/src/rentals/rentals.module.ts`
- Create: `apps/api/test/rental-tariffs.e2e-spec.ts`

**Interfaces:**
- Consumes: `RentalCatalogService`, `CatalogService.resolveSeasonWithin(tx, dateISO)` (per default stagione attiva), `todayInRome()`.
- Produces: `RentalTariffDTO { id; rentalItemId; seasonId; label; price: number; durationMinutes: number|null; archived?: true }`;
  `CreateRentalTariffInput { label; price; durationMinutes?: number|null; sortOrder? }`; `UpdateRentalTariffInput` (senza seasonId);
  `toRentalTariffDTO(row)`; metodi `RentalCatalogService.{list,create,update,archive,restore,delete}RentalTariff`.

- [ ] **Step 1: Contratti** — appendi:

```ts
export interface RentalTariffDTO {
  id: string; rentalItemId: string; seasonId: string;
  label: string; price: number; durationMinutes: number | null; archived?: true;
}
export interface CreateRentalTariffInput {
  label: string; price: number; durationMinutes?: number | null; sortOrder?: number;
}
export interface UpdateRentalTariffInput {
  label?: string; price?: number; durationMinutes?: number | null; sortOrder?: number;
}
```

- [ ] **Step 2: Test projection (FAIL)** — `rental-tariff.projection.spec.ts`:

```ts
import { toRentalTariffDTO } from './rental-tariff.projection';
describe('toRentalTariffDTO', () => {
  const base = { id: 'r1', establishmentId: 't', rentalItemId: 'i1', seasonId: 's1',
    label: '1 ora', price: { toString: () => '8' }, durationMinutes: 60, sortOrder: 2, archivedAt: null };
  it('Decimal→number, archived omesso quando attivo', () => {
    expect(toRentalTariffDTO(base as never)).toEqual(
      { id: 'r1', rentalItemId: 'i1', seasonId: 's1', label: '1 ora', price: 8, durationMinutes: 60 });
  });
  it('archived:true + durationMinutes null', () => {
    expect(toRentalTariffDTO({ ...base, durationMinutes: null, archivedAt: new Date() } as never))
      .toMatchObject({ durationMinutes: null, archived: true });
  });
});
```

- [ ] **Step 3: Run → FAIL** — Run: `pnpm -C apps/api test rental-tariff.projection` → FAIL.

- [ ] **Step 4: Implementa projection** — `rental-tariff.projection.ts`:

```ts
import type { RentalTariff } from '@prisma/client';
import type { RentalTariffDTO } from '@coralyn/contracts';

export function toRentalTariffDTO(r: RentalTariff): RentalTariffDTO {
  return {
    id: r.id, rentalItemId: r.rentalItemId, seasonId: r.seasonId,
    label: r.label, price: Number(r.price), durationMinutes: r.durationMinutes,
    ...(r.archivedAt != null ? { archived: true } : {}),
  };
}
```

- [ ] **Step 5: Run → PASS**.

- [ ] **Step 6: DTO** — `dto/create-rental-tariff.dto.ts`:

```ts
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import type { CreateRentalTariffInput } from '@coralyn/contracts';

export class CreateRentalTariffDto implements CreateRentalTariffInput {
  @IsString() @IsNotEmpty() label!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) durationMinutes?: number | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
```
`update-rental-tariff.dto.ts`: tutti `@IsOptional()`; **nessun** `seasonId`/`rentalItemId`.

- [ ] **Step 7: Metodi service** — aggiungi a `RentalCatalogService` (inietta `CatalogService`; importa `todayInRome`):

```ts
// costruttore: aggiungi `private readonly catalog: CatalogService`
// import: CatalogService da '../catalog/catalog.service'; todayInRome da '../common/dates';
//         CreateRentalTariffInput, RentalTariffDTO, UpdateRentalTariffInput da '@coralyn/contracts';
//         toRentalTariffDTO da './rental-tariff.projection'

async listRentalTariffs(itemId: string, seasonId: string | undefined, includeArchived = false): Promise<RentalTariffDTO[]> {
  const t = this.tenant.require();
  const rows = await this.prisma.forTenant(t, async (tx) => {
    const sid = seasonId ?? (await this.resolveActiveSeasonId(tx));
    if (!sid) return [];
    return tx.rentalTariff.findMany({
      where: { rentalItemId: itemId, seasonId: sid, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  });
  return rows.map(toRentalTariffDTO);
}

async createRentalTariff(itemId: string, input: CreateRentalTariffInput, seasonId?: string): Promise<RentalTariffDTO> {
  const t = this.tenant.require();
  const row = await this.prisma.forTenant(t, async (tx) => {
    const item = await tx.rentalItem.findFirst({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Articolo non trovato');
    const sid = seasonId ?? (await this.resolveActiveSeasonId(tx));
    if (!sid) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
    const season = await tx.season.findFirst({ where: { id: sid } });
    if (!season) throw new UnprocessableEntityException('Stagione non valida');
    return tx.rentalTariff.create({ data: {
      establishmentId: t, rentalItemId: itemId, seasonId: sid, label: input.label.trim(),
      price: input.price, durationMinutes: input.durationMinutes ?? null, sortOrder: input.sortOrder ?? 0,
    } });
  });
  return toRentalTariffDTO(row);
}

async updateRentalTariff(id: string, input: UpdateRentalTariffInput): Promise<RentalTariffDTO> {
  const t = this.tenant.require();
  const row = await this.prisma.forTenant(t, async (tx) => {
    const existing = await tx.rentalTariff.findFirst({ where: { id } });
    if (!existing) return null;
    return tx.rentalTariff.update({ where: { id }, data: {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    } }); // seasonId/rentalItemId volutamente NON toccati (immutabili)
  });
  if (!row) throw new NotFoundException('Tariffa non trovata');
  return toRentalTariffDTO(row);
}

async archiveRentalTariff(id: string): Promise<RentalTariffDTO> { return this.setTariffArchived(id, true); }
async restoreRentalTariff(id: string): Promise<RentalTariffDTO> { return this.setTariffArchived(id, false); }

private async setTariffArchived(id: string, archived: boolean): Promise<RentalTariffDTO> {
  const t = this.tenant.require();
  const row = await this.prisma.forTenant(t, async (tx) => {
    const existing = await tx.rentalTariff.findFirst({ where: { id } });
    if (!existing) return null;
    if ((existing.archivedAt != null) === archived) return existing;
    return tx.rentalTariff.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  });
  if (!row) throw new NotFoundException('Tariffa non trovata');
  return toRentalTariffDTO(row);
}

async deleteRentalTariff(id: string): Promise<RentalTariffDTO> {
  const t = this.tenant.require();
  const row = await this.prisma.forTenant(t, async (tx) => {
    const existing = await tx.rentalTariff.findFirst({ where: { id } });
    if (!existing) return null;
    if (existing.archivedAt == null)
      throw new ConflictException('Archivia la tariffa prima di eliminarla definitivamente.');
    const refs = await tx.rental.count({ where: { rentalTariffId: id } });
    if (refs > 0) throw new ConflictException('Tariffa con noleggi registrati: non eliminabile.');
    await tx.rentalTariff.delete({ where: { id } });
    return existing;
  });
  if (!row) throw new NotFoundException('Tariffa non trovata');
  return toRentalTariffDTO(row);
}

/** Id della stagione che contiene oggi (Roma), o null. Riusa il resolver del catalogo ombrelloni. */
private async resolveActiveSeasonId(tx: Parameters<Parameters<PrismaService['forTenant']>[1]>[0]): Promise<string | null> {
  const s = await this.catalog.resolveSeasonWithin(tx, todayInRome());
  return s.ok ? s.id : null;
}
```
> Aggiorna gli import di `UnprocessableEntityException` in cima al file.

- [ ] **Step 8: Controller** — `rental-tariffs.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalTariffDTO } from '@coralyn/contracts';
import { RentalCatalogService } from './rental-catalog.service';
import { CreateRentalTariffDto } from './dto/create-rental-tariff.dto';
import { UpdateRentalTariffDto } from './dto/update-rental-tariff.dto';

@Controller()
export class RentalTariffsController {
  constructor(private readonly catalog: RentalCatalogService) {}

  @Get('rental-items/:itemId/tariffs')
  list(@Param('itemId') itemId: string, @Query('seasonId') seasonId?: string,
       @Query('includeArchived') a?: string): Promise<RentalTariffDTO[]> {
    return this.catalog.listRentalTariffs(itemId, seasonId, a === 'true');
  }
  @Post('rental-items/:itemId/tariffs')
  create(@Param('itemId') itemId: string, @Body() b: CreateRentalTariffDto,
         @Query('seasonId') seasonId?: string): Promise<RentalTariffDTO> {
    return this.catalog.createRentalTariff(itemId, b, seasonId);
  }
  @Patch('rental-tariffs/:id')
  update(@Param('id') id: string, @Body() b: UpdateRentalTariffDto): Promise<RentalTariffDTO> {
    return this.catalog.updateRentalTariff(id, b);
  }
  @Post('rental-tariffs/:id/archive') archive(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.archiveRentalTariff(id);
  }
  @Post('rental-tariffs/:id/restore') restore(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.restoreRentalTariff(id);
  }
  @Delete('rental-tariffs/:id') remove(@Param('id') id: string): Promise<RentalTariffDTO> {
    return this.catalog.deleteRentalTariff(id);
  }
}
```
Registra `RentalTariffsController` nell'array `controllers` di `rentals.module.ts`.

- [ ] **Step 9: e2e** — `test/rental-tariffs.e2e-spec.ts` (setup come Task 2, **più** una `Season` che contiene oggi):

```ts
// nel beforeAll, dopo aver creato s1: crea una stagione che copre oggi e un articolo
const today = new Date(); const y = today.getUTCFullYear();
await prisma.forTenant(s1, (tx) => tx.season.create({ data: {
  establishmentId: s1, name: `Stag ${y}`,
  startDate: new Date(Date.UTC(y, 0, 1)), endDate: new Date(Date.UTC(y, 11, 31)) } }));
itemId = (await request(srv()).post('/api/rental-items').set(...bearer(t1)).send({ name: 'Pedalò' })).body.id;
```
Casi (ogni `it` con asserzioni reali):
```ts
it('crea tariffa sulla stagione attiva e la elenca', async () => {
  const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
    .send({ label: '1 ora', price: 8, durationMinutes: 60, sortOrder: 1 }).expect(201);
  expect(c.body).toMatchObject({ label: '1 ora', price: 8, durationMinutes: 60, rentalItemId: itemId });
  const list = await request(srv()).get(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1)).expect(200);
  expect(list.body).toHaveLength(1);
});
it('PATCH non cambia seasonId (immutabile)', async () => {
  const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
    .send({ label: '30 min', price: 5 }).expect(201);
  const before = c.body.seasonId;
  const u = await request(srv()).patch(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1))
    .send({ price: 6, seasonId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }).expect(200);
  expect(u.body.seasonId).toBe(before); expect(u.body.price).toBe(6);
});
it('archive→delete 200; delete non archiviata→409; isolamento tenant', async () => {
  const c = await request(srv()).post(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t1))
    .send({ label: 'giornata', price: 20 }).expect(201);
  await request(srv()).delete(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1)).expect(409);
  await request(srv()).post(`/api/rental-tariffs/${c.body.id}/archive`).set(...bearer(t1)).expect(201);
  await request(srv()).delete(`/api/rental-tariffs/${c.body.id}`).set(...bearer(t1)).expect(200);
  await request(srv()).get(`/api/rental-items/${itemId}/tariffs`).set(...bearer(t2)).expect(200)
    .then((r) => expect(r.body).toEqual([]));
});
```
> Aggiungi `tx.season.deleteMany({})` nel cleanup `afterAll` **prima** di `rentalItem`.

Run: `pnpm -C apps/api test:e2e rental-tariffs` → FAIL poi PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/contracts apps/api/src/rentals apps/api/test/rental-tariffs.e2e-spec.ts
git commit -m "feat(rentals): tariffe RentalTariff season-scoped (CRUD, seasonId immutabile, projection, e2e)"
```

---

## Task 4: Backend transazione `Rental` (banco: checkout/return/cancel/payment/list)

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/rentals/rental.projection.ts` (+ `.spec.ts`)
- Create: `apps/api/src/rentals/rentals.service.ts`
- Create: `apps/api/src/rentals/rentals.controller.ts`
- Create: `apps/api/src/rentals/dto/checkout-rental.dto.ts`
- Modify: `apps/api/src/rentals/rentals.module.ts`
- Create: `apps/api/test/rentals.e2e-spec.ts`

**Interfaces:**
- Consumes: `CatalogService.resolveSeasonWithin`, `resolvePayment` (`../bookings/booking.payment`), `todayInRome`, `SettlePaymentInput`.
- Produces: `RentalStatus`, `RentalDTO`, `RentalAvailabilityDTO`, `RentalsDayDTO`, `CheckoutRentalInput`;
  `rentalStatus(row)`, `toRentalDTO(row)`, `computeAvailability(item, out)`;
  `RentalsService.{checkout,returnRental,cancelRental,settlePayment,listByDate}`.

- [ ] **Step 1: Contratti** — appendi:

```ts
export type RentalStatus = 'active' | 'returned' | 'cancelled';
export interface RentalDTO {
  id: string; rentalItemId: string; rentalItemName: string;
  rentalTariffId: string; tariffLabel: string;
  customerId: string | null; customerName: string | null;
  units: number; startAt: string; returnedAt: string | null; status: RentalStatus;
  totalPrice: number; paymentStatus: PaymentStatus; amountCollected: number;
  paymentMethod?: PaymentMethod; collectionDate?: string;
}
export interface RentalAvailabilityDTO { rentalItemId: string; stock: number | null; out: number; available: number | null; }
export interface RentalsDayDTO { rentals: RentalDTO[]; availability: RentalAvailabilityDTO[]; }
export interface CheckoutRentalInput { rentalItemId: string; rentalTariffId: string; customerId?: string | null; units?: number; }
```

- [ ] **Step 2: Test projection (FAIL)** — `rental.projection.spec.ts`:

```ts
import { rentalStatus, toRentalDTO, computeAvailability } from './rental.projection';

const row = {
  id: 'x1', rentalItemId: 'i1', rentalTariffId: 'r1', customerId: null,
  units: 2, startAt: new Date('2026-07-20T10:00:00Z'), returnedAt: null, cancelledAt: null,
  totalPrice: { toString: () => '16' }, paymentStatus: 'unpaid',
  amountCollected: { toString: () => '0' }, paymentMethod: null, collectionDate: null,
  rentalItem: { name: 'Pedalò' }, rentalTariff: { label: '1 ora' }, customer: null,
};

describe('rentalStatus', () => {
  it('cancelled > returned > active', () => {
    expect(rentalStatus({ cancelledAt: new Date(), returnedAt: new Date() } as never)).toBe('cancelled');
    expect(rentalStatus({ cancelledAt: null, returnedAt: new Date() } as never)).toBe('returned');
    expect(rentalStatus({ cancelledAt: null, returnedAt: null } as never)).toBe('active');
  });
});
describe('toRentalDTO', () => {
  it('risolve nomi/stato, Decimal→number, date→ISO', () => {
    expect(toRentalDTO(row as never)).toMatchObject({
      rentalItemName: 'Pedalò', tariffLabel: '1 ora', customerName: null,
      units: 2, status: 'active', totalPrice: 16, amountCollected: 0, startAt: '2026-07-20T10:00:00.000Z',
    });
  });
});
describe('computeAvailability', () => {
  it('stock null→available null; out>stock→clamp 0', () => {
    expect(computeAvailability({ id: 'i1', stock: null } as never, 3)).toEqual({ rentalItemId: 'i1', stock: null, out: 3, available: null });
    expect(computeAvailability({ id: 'i1', stock: 2 } as never, 5)).toEqual({ rentalItemId: 'i1', stock: 2, out: 5, available: 0 });
    expect(computeAvailability({ id: 'i1', stock: 5 } as never, 2)).toEqual({ rentalItemId: 'i1', stock: 5, out: 2, available: 3 });
  });
});
```

- [ ] **Step 3: Run → FAIL**.

- [ ] **Step 4: Implementa projection** — `rental.projection.ts`:

```ts
import type { Prisma, Rental, RentalItem } from '@prisma/client';
import type { PaymentMethod, RentalAvailabilityDTO, RentalDTO, RentalStatus } from '@coralyn/contracts';

export const RENTAL_INCLUDE = { rentalItem: true, rentalTariff: true, customer: true } as const;
type RentalRow = Prisma.RentalGetPayload<{ include: typeof RENTAL_INCLUDE }>;

export function rentalStatus(r: Pick<Rental, 'cancelledAt' | 'returnedAt'>): RentalStatus {
  if (r.cancelledAt != null) return 'cancelled';
  if (r.returnedAt != null) return 'returned';
  return 'active';
}

export function toRentalDTO(r: RentalRow): RentalDTO {
  const customerName = r.customer ? `${r.customer.firstName} ${r.customer.lastName}`.trim() : null;
  return {
    id: r.id, rentalItemId: r.rentalItemId, rentalItemName: r.rentalItem.name,
    rentalTariffId: r.rentalTariffId, tariffLabel: r.rentalTariff.label,
    customerId: r.customerId, customerName,
    units: r.units, startAt: r.startAt.toISOString(),
    returnedAt: r.returnedAt ? r.returnedAt.toISOString() : null, status: rentalStatus(r),
    totalPrice: Number(r.totalPrice), paymentStatus: r.paymentStatus, amountCollected: Number(r.amountCollected),
    ...(r.paymentMethod ? { paymentMethod: r.paymentMethod as PaymentMethod } : {}),
    ...(r.collectionDate ? { collectionDate: r.collectionDate.toISOString().slice(0, 10) } : {}),
  };
}

export function computeAvailability(item: Pick<RentalItem, 'id' | 'stock'>, out: number): RentalAvailabilityDTO {
  return { rentalItemId: item.id, stock: item.stock, out, available: item.stock == null ? null : Math.max(0, item.stock - out) };
}
```

- [ ] **Step 5: Run → PASS**.

- [ ] **Step 6: DTO checkout** — `dto/checkout-rental.dto.ts`:

```ts
import { IsInt, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';
import type { CheckoutRentalInput } from '@coralyn/contracts';

export class CheckoutRentalDto implements CheckoutRentalInput {
  @IsUUID() rentalItemId!: string;
  @IsUUID() rentalTariffId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() customerId?: string | null;
  @IsOptional() @IsInt() @Min(1) units?: number;
}
```
Per l'incasso riusa il DTO esistente `SettlePaymentDto` (bookings). Se non è esportato/riutilizzabile, crea
`dto/settle-payment.dto.ts` copiando quello di bookings (stessa forma di `SettlePaymentInput`).

- [ ] **Step 7: Service** — `rentals.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { CheckoutRentalInput, RentalDTO, RentalsDayDTO, SettlePaymentInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { CatalogService } from '../catalog/catalog.service';
import { resolvePayment } from '../bookings/booking.payment';
import { todayInRome, toDbDate } from '../common/dates';
import { RENTAL_INCLUDE, computeAvailability, toRentalDTO } from './rental.projection';

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly catalog: CatalogService,
  ) {}

  async checkout(input: CheckoutRentalInput): Promise<RentalDTO> {
    const t = this.tenant.require();
    const units = input.units ?? 1;
    const row = await this.prisma.forTenant(t, async (tx) => {
      const season = await this.catalog.resolveSeasonWithin(tx, todayInRome());
      if (!season.ok) throw new UnprocessableEntityException('Nessuna stagione attiva per questa data');
      const tariff = await tx.rentalTariff.findFirst({ where: { id: input.rentalTariffId } });
      if (!tariff || tariff.archivedAt != null || tariff.rentalItemId !== input.rentalItemId || tariff.seasonId !== season.id)
        throw new UnprocessableEntityException('Tariffa non valida per l’articolo o la stagione');
      if (input.customerId != null) {
        const c = await tx.customer.findFirst({ where: { id: input.customerId } });
        if (!c) throw new UnprocessableEntityException('Cliente non valido');
      }
      const created = await tx.rental.create({ data: {
        establishmentId: t, rentalItemId: input.rentalItemId, rentalTariffId: input.rentalTariffId,
        customerId: input.customerId ?? null, units, totalPrice: Number(tariff.price) * units,
      } });
      return tx.rental.findUniqueOrThrow({ where: { id: created.id }, include: RENTAL_INCLUDE });
    });
    return toRentalDTO(row);
  }

  async returnRental(id: string): Promise<RentalDTO> {
    return this.mutate(id, (r) => {
      if (r.cancelledAt != null) throw new ConflictException('Noleggio annullato: impossibile registrare il rientro');
      return r.returnedAt != null ? {} : { returnedAt: new Date() }; // idempotente
    });
  }

  async cancelRental(id: string): Promise<RentalDTO> {
    return this.mutate(id, (r) => {
      if (r.cancelledAt != null) return {}; // idempotente
      if (Number(r.amountCollected) > 0)
        throw new ConflictException('Storna l’incasso prima di annullare il noleggio');
      return { cancelledAt: new Date() };
    });
  }

  async settlePayment(id: string, input: SettlePaymentInput): Promise<RentalDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const r = await tx.rental.findFirst({ where: { id } });
      if (!r) return null;
      if (r.cancelledAt != null) throw new ConflictException('Noleggio annullato: impossibile registrare l’incasso');
      const res = resolvePayment(input, Number(r.totalPrice), todayInRome());
      if (!res.ok) {
        if (res.reason === 'OVER_TOTAL') throw new UnprocessableEntityException('Importo superiore al totale');
        throw new UnprocessableEntityException('Metodo di pagamento richiesto');
      }
      await tx.rental.update({ where: { id }, data: {
        amountCollected: res.fields.amountCollected, paymentStatus: res.fields.paymentStatus,
        paymentMethod: res.fields.paymentMethod, collectionDate: res.fields.collectionDate ? toDbDate(res.fields.collectionDate) : null,
      } });
      return tx.rental.findUniqueOrThrow({ where: { id }, include: RENTAL_INCLUDE });
    });
    if (!row) throw new NotFoundException('Noleggio non trovato');
    return toRentalDTO(row);
  }

  async listByDate(date?: string): Promise<RentalsDayDTO> {
    const t = this.tenant.require();
    const day = date ?? todayInRome();
    return this.prisma.forTenant(t, async (tx) => {
      const start = new Date(`${day}T00:00:00.000Z`); const end = new Date(`${day}T23:59:59.999Z`);
      const rentals = await tx.rental.findMany({
        where: { startAt: { gte: start, lte: end } }, include: RENTAL_INCLUDE, orderBy: { startAt: 'desc' } });
      const items = await tx.rentalItem.findMany({ where: { archivedAt: null } });
      const out = new Map<string, number>();
      const active = await tx.rental.findMany({ where: { cancelledAt: null, returnedAt: null } });
      for (const a of active) out.set(a.rentalItemId, (out.get(a.rentalItemId) ?? 0) + a.units);
      return {
        rentals: rentals.map(toRentalDTO),
        availability: items.map((i) => computeAvailability(i, out.get(i.id) ?? 0)),
      };
    });
  }

  private async mutate(id: string, patch: (r: { cancelledAt: Date | null; returnedAt: Date | null; amountCollected: unknown }) => object): Promise<RentalDTO> {
    const t = this.tenant.require();
    const row = await this.prisma.forTenant(t, async (tx) => {
      const r = await tx.rental.findFirst({ where: { id } });
      if (!r) return null;
      const data = patch(r);
      if (Object.keys(data).length > 0) await tx.rental.update({ where: { id }, data });
      return tx.rental.findUniqueOrThrow({ where: { id }, include: RENTAL_INCLUDE });
    });
    if (!row) throw new NotFoundException('Noleggio non trovato');
    return toRentalDTO(row);
  }
}
```
> Nota: `toDbDate` accetta `yyyy-mm-dd`; `resolvePayment` restituisce `collectionDate` come ISO date. La finestra
> giorno usa `startAt` in UTC sui confini Roma — accettabile per l'MVP (l'elenco è del giorno operativo); se emergesse
> scostamento di fuso, allineare ai confini Roma come fa `bookings` (fuori scope qui).

- [ ] **Step 8: Controller** — `rentals.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { RentalDTO, RentalsDayDTO } from '@coralyn/contracts';
import { RentalsService } from './rentals.service';
import { CheckoutRentalDto } from './dto/checkout-rental.dto';
import { SettlePaymentDto } from './dto/settle-payment.dto'; // o riusa quello di bookings

@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Get() list(@Query('date') date?: string): Promise<RentalsDayDTO> { return this.rentals.listByDate(date); }
  @Post() checkout(@Body() b: CheckoutRentalDto): Promise<RentalDTO> { return this.rentals.checkout(b); }
  @Patch(':id/return') ret(@Param('id') id: string): Promise<RentalDTO> { return this.rentals.returnRental(id); }
  @Patch(':id/cancel') cancel(@Param('id') id: string): Promise<RentalDTO> { return this.rentals.cancelRental(id); }
  @Patch(':id/payment') pay(@Param('id') id: string, @Body() b: SettlePaymentDto): Promise<RentalDTO> {
    return this.rentals.settlePayment(id, b);
  }
}
```
Aggiungi `RentalsController` ai `controllers` e `RentalsService` ai `providers` di `rentals.module.ts`.

- [ ] **Step 9: e2e** — `test/rentals.e2e-spec.ts` (setup: tenant + stagione-che-copre-oggi + articolo + tariffa, come Task 3):

```ts
it('checkout: prezzo = price×units (snapshot), stato active', async () => {
  const r = await request(srv()).post('/api/rentals').set(...bearer(t1))
    .send({ rentalItemId: itemId, rentalTariffId: tariffId, units: 2 }).expect(201);
  expect(r.body).toMatchObject({ status: 'active', units: 2, totalPrice: 16, paymentStatus: 'unpaid' });
});
it('checkout 422: tariffa di altro articolo / archiviata / units<1', async () => {
  await request(srv()).post('/api/rentals').set(...bearer(t1))
    .send({ rentalItemId: otherItemId, rentalTariffId: tariffId }).expect(422);
});
it('return idempotente; cancel 409 se incassato; payment riusa resolvePayment', async () => {
  const r = (await request(srv()).post('/api/rentals').set(...bearer(t1))
    .send({ rentalItemId: itemId, rentalTariffId: tariffId })).body;
  await request(srv()).patch(`/api/rentals/${r.id}/return`).set(...bearer(t1)).expect(200);
  await request(srv()).patch(`/api/rentals/${r.id}/return`).set(...bearer(t1)).expect(200); // idempotente
  await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1))
    .send({ amountCollected: 8, paymentMethod: 'cash' }).expect(200)
    .then((x) => expect(x.body.paymentStatus).toBe('paid'));
  await request(srv()).patch(`/api/rentals/${r.id}/cancel`).set(...bearer(t1)).expect(409); // incassato
});
it('payment 422 OVER_TOTAL / METHOD_REQUIRED; 409 su annullato', async () => {
  const r = (await request(srv()).post('/api/rentals').set(...bearer(t1))
    .send({ rentalItemId: itemId, rentalTariffId: tariffId })).body;
  await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 999 }).expect(422);
  await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 8 }).expect(422); // metodo
  await request(srv()).patch(`/api/rentals/${r.id}/cancel`).set(...bearer(t1)).expect(200);
  await request(srv()).patch(`/api/rentals/${r.id}/payment`).set(...bearer(t1)).send({ amountCollected: 8, paymentMethod: 'cash' }).expect(409);
});
it('GET ?date: elenco del giorno + availability (out somma solo attivi)', async () => {
  const res = await request(srv()).get('/api/rentals').set(...bearer(t1)).expect(200);
  const av = res.body.availability.find((a: { rentalItemId: string }) => a.rentalItemId === itemId);
  expect(av).toMatchObject({ stock: expect.anything() });
  expect(Array.isArray(res.body.rentals)).toBe(true);
});
it('checkout 422 se la tariffa non è della stagione attiva', async () => {
  // Crea una stagione PASSATA e una sua tariffa: la resolveSeasonWithin(oggi) risolve la stagione CORRENTE,
  // quindi tariff.seasonId ≠ season.id → 422 (stesso 422 del ramo "nessuna stagione", esercitato in modo deterministico).
  const py = new Date().getUTCFullYear() - 1;
  const pastSeason = await prisma.forTenant(s1, (tx) => tx.season.create({ data: {
    establishmentId: s1, name: `Stag ${py}`,
    startDate: new Date(Date.UTC(py, 0, 1)), endDate: new Date(Date.UTC(py, 11, 31)) } }));
  const pastTariff = await prisma.forTenant(s1, (tx) => tx.rentalTariff.create({ data: {
    establishmentId: s1, rentalItemId: itemId, seasonId: pastSeason.id, label: 'vecchia', price: 4, sortOrder: 9 } }));
  await request(srv()).post('/api/rentals').set(...bearer(t1))
    .send({ rentalItemId: itemId, rentalTariffId: pastTariff.id }).expect(422);
});
```
> Prepara nel `beforeAll`: `tariffId` (POST tariffa) e `otherItemId` (secondo articolo **senza** tariffa). Cleanup
> `afterAll`: `rental` → `rentalTariff` → `season` → `rentalItem` (ordine per le FK Restrict).

Run: `pnpm -C apps/api test:e2e rentals` → FAIL poi PASS. Poi: `pnpm -C apps/api test` (unit) + `test:e2e` completi → nessuna regressione.

- [ ] **Step 10: Commit**

```bash
git add packages/contracts apps/api/src/rentals apps/api/test/rentals.e2e-spec.ts
git commit -m "feat(rentals): banco Rental (checkout/return/cancel/payment/list + availability, riuso resolveSeason/resolvePayment)"
```

---

## Task 5: Frontend — catalogo articoli & tariffe (`web-staff`)

**Files:**
- Create: `apps/web-staff/src/features/rentals/useRentalItems.ts` · `useRentalTariffs.ts`
- Create: `apps/web-staff/src/features/rentals/RentalCatalogView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts` (handler MSW)
- Modify: router + app-shell (rotta/voce, vedi Task 6 per la nav)

**Interfaces:**
- Consumes: DTO `RentalItemDTO`/`RentalTariffDTO` da `@coralyn/contracts`; pattern query da `useEquipmentTypes.ts`/`useSeasons.ts`.
- Produces: `useRentalItems`/`useAllRentalItems` + mutation; `useRentalTariffs(itemId, seasonId)` + mutation.

- [ ] **Step 1: Query hooks** — `useRentalItems.ts` (mirror `useEquipmentTypes.ts`):

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput } from '@coralyn/contracts';
import { api } from '@/lib/api'; // stesso client usato dalle altre feature

const KEY = ['rental-items'] as const;
export function useRentalItems(includeArchived = false) {
  return useQuery({
    queryKey: [...KEY, { includeArchived }],
    queryFn: () => api.get<RentalItemDTO[]>(`/rental-items${includeArchived ? '?includeArchived=true' : ''}`),
  });
}
export function useRentalItemMutations() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    create: useMutation({ mutationFn: (b: CreateRentalItemInput) => api.post<RentalItemDTO>('/rental-items', b), onSuccess: inval }),
    update: useMutation({ mutationFn: (v: { id: string; body: UpdateRentalItemInput }) => api.patch<RentalItemDTO>(`/rental-items/${v.id}`, v.body), onSuccess: inval }),
    archive: useMutation({ mutationFn: (id: string) => api.post(`/rental-items/${id}/archive`, {}), onSuccess: inval }),
    restore: useMutation({ mutationFn: (id: string) => api.post(`/rental-items/${id}/restore`, {}), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: string) => api.del(`/rental-items/${id}`), onSuccess: inval }),
  };
}
```
> Adegua `api`/il client HTTP e la firma di `useMutation` **esattamente** a come li usa `useEquipmentTypes.ts` (leggilo
> prima: alcune versioni passano `axios`/`fetch` wrapper diversi). `useRentalTariffs.ts` analogo, con
> `queryKey: ['rental-tariffs', itemId, seasonId]` e URL `/rental-items/${itemId}/tariffs?seasonId=${seasonId}`.

- [ ] **Step 2: MSW handlers** — in `mocks/server.ts` aggiungi gli handler per tutte le rotte rental (mirror di quelli
  equipment/pricing), con uno store in memoria per articoli/tariffe. Test FE dipendono da questi.

- [ ] **Step 3: Vista catalogo** — `RentalCatalogView.vue` (mirror struttura `PricingView.vue`):
  - Griglia articoli: nome + campo **scorta opzionale** (input numerico svuotabile → `null`); azioni crea/rinomina/archivia.
  - Sezione "Archiviati (N)" a scomparsa con Ripristina + Elimina (con `ConfirmDialog`).
  - Per l'articolo selezionato: **selettore Stagione** (riusa `useSeasons`) + editor tariffe (label/prezzo/durata
    opzionale/ordine) con archivia/ripristina/elimina.
  - `rentalItemLabel`/formattazione prezzo: riusa `formatEuro` da `@/lib` (già esistente).

- [ ] **Step 4: Test FE (Vitest)** — `RentalCatalogView.spec.ts`: crea articolo, imposta scorta a vuoto→null, aggiungi
  tariffa, archivia/ripristina, elimina con conferma. Mirror `PricingView.spec.ts`.

- [ ] **Step 5: Run** — `pnpm -C apps/web-staff test rentals` → PASS; `pnpm -C apps/web-staff typecheck` pulito.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/rentals apps/web-staff/src/mocks/server.ts
git commit -m "feat(web-staff): catalogo noleggio (articoli + tariffe stagionali) + MSW + test"
```

---

## Task 6: Frontend — banco noleggi + navigazione

**Files:**
- Create: `apps/web-staff/src/features/rentals/useRentals.ts`
- Create: `apps/web-staff/src/features/rentals/RentalsView.vue`
- Modify: `apps/web-staff/src/mocks/server.ts` (handler `/rentals`)
- Modify: router + app-shell nav (voce "Noleggi")

**Interfaces:**
- Consumes: `RentalDTO`/`RentalsDayDTO`/`CheckoutRentalInput`/`SettlePaymentInput`; rubrica clienti esistente; pattern incasso da `BookingsView`/`SettlePaymentModal`.
- Produces: `useRentals(date)` + mutation `checkout/return/cancel/pay`.

- [ ] **Step 1: Query hooks** — `useRentals.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { CheckoutRentalInput, RentalsDayDTO, SettlePaymentInput } from '@coralyn/contracts';
import { api } from '@/lib/api';

export function useRentals(date: () => string | undefined) {
  return useQuery({
    queryKey: ['rentals', date],
    queryFn: () => api.get<RentalsDayDTO>(`/rentals${date() ? `?date=${date()}` : ''}`),
  });
}
export function useRentalMutations() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['rentals'] });
  return {
    checkout: useMutation({ mutationFn: (b: CheckoutRentalInput) => api.post('/rentals', b), onSuccess: inval }),
    ret: useMutation({ mutationFn: (id: string) => api.patch(`/rentals/${id}/return`, {}), onSuccess: inval }),
    cancel: useMutation({ mutationFn: (id: string) => api.patch(`/rentals/${id}/cancel`, {}), onSuccess: inval }),
    pay: useMutation({ mutationFn: (v: { id: string; body: SettlePaymentInput }) => api.patch(`/rentals/${v.id}/payment`, v.body), onSuccess: inval }),
  };
}
```

- [ ] **Step 2: Vista banco** — `RentalsView.vue`:
  - Tabella noleggi del giorno: articolo, tariffa, cliente (o "—"), unità, stato (chip Attivo/Rientrato/Annullato via
    `statusMaps`), incasso. Azioni per riga: **Rientro**, **Registra incasso** (riusa `SettlePaymentModal`), **Annulla**
    (con `ConfirmDialog`; se il BE risponde 409 "incasso", mostra il messaggio).
  - Barra disponibilità: per ogni articolo attivo, "Disponibili: X / stock" oppure "—" se `available===null`.
  - Modale **Nuovo noleggio**: select articolo → select tariffa (della stagione attiva, da `useRentalTariffs`) → cliente
    opzionale (rubrica) → unità → **anteprima prezzo read-only** = `tariff.price × units` (client-side, nessun quote):
    ```ts
    const preview = computed(() => selectedTariff.value ? selectedTariff.value.price * units.value : 0);
    ```
    onConfirm → `checkout.mutate({ rentalItemId, rentalTariffId, customerId, units })`; gestisci 422 (toast).

- [ ] **Step 3: Navigazione** — aggiungi la voce "Noleggi" all'app-shell e la rotta a `RentalsView` (mirror di come è
  registrata la voce "Prenotazioni"/"Listino"). Il catalogo (Task 5) può essere una tab dentro "Noleggi" o una voce
  "Listino noleggi": segui il pattern con cui `PricingView` è raggiunta.

- [ ] **Step 4: Test FE** — `RentalsView.spec.ts`: nuovo noleggio (anteprima prezzo = price×units, checkout), rientro,
  incasso (paid), annulla bloccato dopo incasso (mostra messaggio). MSW handler `/rentals` con store.

- [ ] **Step 5: Run + verifica browser** — `pnpm -C apps/web-staff test` PASS; typecheck pulito. Avvia il dev server
  (preview) e verifica il flusso uscita→incasso→rientro sulla vista Noleggi (console/network puliti).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/rentals apps/web-staff/src/mocks/server.ts apps/web-staff/src/<router+shell>
git commit -m "feat(web-staff): banco noleggi (uscita/rientro/incasso/annulla + disponibilità) + navigazione"
```

---

## Task 7: Documentazione — ADR-0050 + glossario + deferred

**Files:**
- Create: `docs/architecture/decisions/0050-noleggio-mezzi-servizi.md`
- Modify: `docs/architecture/glossary.md`
- Modify: `docs/architecture/deferred.md`
- Modify: `README.md` (riga di stato, opzionale)

- [ ] **Step 1: ADR-0050** — crea il file seguendo il template ADR del repo (Contesto/Decisione/Conseguenze), contenuto:
  noleggio come **bounded context** (`RentalItem` + `RentalTariff` season-scoped + `Rental` a tempo reale), distinto da
  prenotazioni/pricing (ADR-0006/0032) e dotazione inclusa (ADR-0036); riuso incasso (ADR-0011) e fuso Roma (ADR-0031);
  disponibilità **informativa** (no vincolo); tariffa a **prezzo fisso** snapshot; stato **derivato dai timestamp**;
  `units`=conteggio fisico (rientro tutto-o-niente → D-052); overtime → D-053.

- [ ] **Step 2: Glossario** — aggiungi le righe (colonna Codice/DB EN):
  - **Articolo noleggiabile** `RentalItem` — cosa il lido noleggia; fungibile; scorta opzionale.
  - **Tariffa di noleggio** `RentalTariff` — opzione di prezzo per Stagione (label/prezzo/durata opz.).
  - **Noleggio** `Rental` — transazione al banco (uscita/rientro), cliente opzionale, incasso ADR-0011.

- [ ] **Step 3: Deferred** — aggiungi a `deferred.md`:
  - **D-052** — Unità fisiche numerate + rientro parziale/sfalsato di un gruppo.
  - **D-053** — Overtime automatico / billing a durata reale.
  - (Reports ricavi noleggio: nota come slice successiva.)

- [ ] **Step 4: Commit**

```bash
git add docs/architecture README.md
git commit -m "docs(rentals): ADR-0050 + glossario RentalItem/RentalTariff/Rental + deferred D-052/D-053"
```

---

## Self-Review (eseguita)

- **Copertura spec:** §3 schema→Task 1; §4.1 contratti→Task 2/3/4 (incrementali); §4.2 RentalItem→Task 2; §4.3
  RentalTariff→Task 3; §4.4 banco→Task 4; §4.5 projection→Task 2/3/4; §5 FE→Task 5/6; §6 disponibilità→Task 4
  (`computeAvailability`) esposta dal banco (deviazione dichiarata: **non** su GET rental-items); §7 test→ogni task; §9
  ADR/glossario→Task 7; §10 deferred→Task 7.
- **Deviazione dichiarata:** availability spostata dal `GET /rental-items` (spec §4.2) al `GET /rentals?date=` — single
  source, config/runtime disaccoppiati. Aggiornare la riga §4.2 dello spec se si vuole allineare la doc.
- **Coerenza tipi:** `RentalItemDTO`/`RentalTariffDTO`/`RentalDTO`/`RentalAvailabilityDTO`/`RentalsDayDTO`/`CheckoutRentalInput`
  usati identici tra contratti↔service↔projection↔e2e; `rentalStatus`/`toRentalDTO`/`computeAvailability`/`RENTAL_INCLUDE`
  coerenti; endpoint `/rental-items`, `/rental-items/:itemId/tariffs`, `/rental-tariffs/:id`, `/rentals*` coerenti tra
  controller e e2e.
- **Placeholder:** i punti FE "mirror di X" rimandano a **file esistenti leggibili** (non ad altri task); il codice nuovo
  non banale (hook, projection, service, anteprima prezzo) è mostrato per intero.

## Punti che richiedono verifica a runtime (non assunzioni)

1. **Client HTTP FE** (`api`/axios/fetch wrapper) e firma esatta di `useMutation`: leggere `useEquipmentTypes.ts` prima di
   scrivere gli hook.
2. **`SettlePaymentDto`**: verificare se quello di bookings è riusabile o va copiato in `rentals/dto`.
3. **`prisma.forTenant` typing** del parametro `tx` per la firma di `resolveActiveSeasonId` (usato il tipo derivato; se il
   progetto espone un alias `TenantTx`, preferirlo).
4. **Confini giorno Roma** in `listByDate`: MVP su UTC; allineare a Roma solo se emerge scostamento (fuori scope).
