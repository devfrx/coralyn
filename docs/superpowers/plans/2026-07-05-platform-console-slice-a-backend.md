# Platform Console — Slice A (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend `platform/` module cross-tenant per il distributore (superuser): provisioning lidi (crea Establishment + primo admin), sospensione/riattivazione, e metriche aggregate PII-free — tutto `@Roles(superuser)`.

**Architecture:** Modulo NestJS `apps/api/src/platform/` con due service: `PlatformMetricsService` (aggregati via loop `prisma.forTenant`, [ADR-0040](../../architecture/decisions/0040-lettura-aggregata-cross-tenant.md)) e `PlatformProvisioningService` (create/suspend/reactivate + audit in-transaction). `Establishment` guadagna `createdAt`/`suspendedAt`; nuova entità RLS-free `PlatformAuditLog` ([ADR-0015](../../architecture/decisions/0015-osservabilita-e-console-superuser.md)). Il login respinge gli utenti di lidi sospesi. Spec: [2026-07-05-platform-console-superuser-design.md](../specs/2026-07-05-platform-console-superuser-design.md).

**Tech Stack:** NestJS, Prisma (PostgreSQL, RLS FORCE), `@coralyn/contracts` (DTO condivisi), Jest (unit con Prisma mockato + e2e con DB reale), argon2id.

---

## Gotcha da conoscere PRIMA di iniziare (dall'handoff)

- **`@coralyn/contracts` compila in `dist/` (gitignored):** dopo ogni modifica a `packages/contracts/src/index.ts` lancia `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test api.
- **Migrazioni non-interattive:** `prisma migrate dev` NON gira in questa harness. Si **hand-authora** la cartella migrazione e si applica con `migrate deploy` a **`coralyn_dev` E `coralyn_test`** (localhost:5433, utente/pass `coralyn_app`/`coralyn_app`), poi `prisma generate`.
- **`RolesGuard` è GLOBALE:** dopo modifiche a rotte/guard ri-esegui **tutta** la suite api (unit + e2e).
- **`Establishment` e `User` sono FUORI RLS:** listare/creare lidi e utenti sono query libere; solo le tabelle di business passano dal `forTenant`. `PlatformAuditLog` è volutamente **RLS-free** (dato di piattaforma).
- **Baseline test da non regredire:** ui-kit 70 · web-staff 210 · api unit 167 · api e2e 214 · typecheck pulito.

Comandi ricorrenti:
```bash
# build contracts (dopo ogni edit di index.ts)
corepack pnpm --filter @coralyn/contracts build
# unit api (tutti o filtrati per file)
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test -- platform-metrics.service
# e2e api
corepack pnpm --filter @coralyn/api test:e2e -- platform
# typecheck
corepack pnpm --filter @coralyn/api exec tsc --noEmit
```

---

## File Structure

**Create:**
- `apps/api/prisma/migrations/20260705130000_platform_console/migration.sql` — enum + colonne + tabella audit
- `apps/api/src/platform/platform.module.ts` — wiring modulo
- `apps/api/src/platform/platform.controller.ts` — rotte `/api/platform/*`, `@Roles(Superuser)`
- `apps/api/src/platform/platform-metrics.service.ts` (+ `.spec.ts`) — aggregati cross-tenant
- `apps/api/src/platform/platform-provisioning.service.ts` (+ `.spec.ts`) — create/suspend/reactivate + audit
- `apps/api/src/platform/dto/create-establishment.dto.ts` — validazione input
- `apps/api/src/identity/identity.service.spec.ts` — unit del check "lido sospeso" nel login
- `apps/api/test/platform.e2e-spec.ts` — e2e end-to-end

**Modify:**
- `apps/api/prisma/schema.prisma` — `Establishment.createdAt`/`suspendedAt`, model `PlatformAuditLog`, enum `PlatformAction`
- `packages/contracts/src/index.ts` — `PlatformEstablishmentDTO`, `CreateEstablishmentInput`, `CreateEstablishmentResponse`
- `apps/api/src/identity/identity.service.ts` — login respinge lidi sospesi
- `apps/api/src/app.module.ts` — importa `PlatformModule`
- `apps/api/prisma/seed.ts` — bootstrap superuser env-gated

---

## Task 1: Migrazione DB + schema Prisma

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260705130000_platform_console/migration.sql`

- [ ] **Step 1: Aggiungi `createdAt`/`suspendedAt` a `Establishment` in `schema.prisma`**

Nel model `Establishment` (attorno a riga 10-12), dopo `name String`, aggiungi:

```prisma
model Establishment {
  id                String             @id @default(uuid()) @db.Uuid
  name              String
  createdAt         DateTime           @default(now())
  suspendedAt       DateTime? // null = attivo; valorizzato = lido sospeso (il login lo respinge)
  customers         Customer[]
  // …resto invariato…
}
```

- [ ] **Step 2: Aggiungi enum `PlatformAction` e model `PlatformAuditLog` in fondo a `schema.prisma`**

```prisma
enum PlatformAction {
  create_establishment
  suspend_establishment
  reactivate_establishment
}

// Audit di piattaforma (ADR-0015): SOLO mutazioni del superuser. Volutamente FUORI RLS
// (dato di piattaforma, non di tenant). Nessuna relation su Establishment: targetEstablishmentId
// è un soft-ref (l'audit sopravvive alla cancellazione del lido). Mai PII dei bagnanti nel metadata.
model PlatformAuditLog {
  id                    String         @id @default(uuid()) @db.Uuid
  actorUserId           String         @db.Uuid
  action                PlatformAction
  targetEstablishmentId String?        @db.Uuid
  metadata              Json?          @db.JsonB
  createdAt             DateTime       @default(now())

  @@index([targetEstablishmentId])
  @@index([createdAt])
}
```

- [ ] **Step 3: Hand-author la migrazione SQL**

Crea `apps/api/prisma/migrations/20260705130000_platform_console/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "PlatformAction" AS ENUM ('create_establishment', 'suspend_establishment', 'reactivate_establishment');

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Establishment" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" "PlatformAction" NOT NULL,
    "targetEstablishmentId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformAuditLog_targetEstablishmentId_idx" ON "PlatformAuditLog"("targetEstablishmentId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
```

> Nota: `PlatformAuditLog` **non** riceve `ENABLE ROW LEVEL SECURITY` — è per scelta fuori RLS (vedi commento schema).

- [ ] **Step 4: Applica la migrazione a dev E test, poi rigenera il client**

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm --filter @coralyn/api exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm --filter @coralyn/api exec prisma migrate deploy
corepack pnpm --filter @coralyn/api exec prisma generate
```
Expected: entrambe le `migrate deploy` riportano `1 migration applied` (o "already applied" alla riseconda esecuzione); `generate` → `Generated Prisma Client`.

- [ ] **Step 5: Verifica assenza di drift**

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm --filter @coralyn/api exec prisma migrate status
```
Expected: `Database schema is up to date!`

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260705130000_platform_console/
git commit -m "feat(api): schema Platform Console — Establishment.createdAt/suspendedAt + PlatformAuditLog"
```

---

## Task 2: Contracts — DTO condivisi

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i DTO in `packages/contracts/src/index.ts`**

In coda al file (o vicino agli altri DTO establishment), aggiungi:

```ts
/** Metriche aggregate di un lido per la Platform Console (superuser). PII-free per costruzione
 *  (solo count/sum/timestamp): nessun dato personale dei bagnanti. Vedi ADR-0040. */
export interface PlatformEstablishmentDTO {
  id: string;
  name: string;
  createdAt: string; // ISO
  suspendedAt: string | null; // ISO | null
  // capacità (struttura)
  sectors: number;
  rows: number;
  umbrellas: number;
  // vitalità / engagement
  staffUsersActive: number;
  lastActivityAt: string | null; // max(Booking.createdAt) del lido — proxy "è vivo?" (D-044)
  // valore commerciale
  revenueSeasonTotal: number; // somma incassato della stagione attiva
  activeSubscriptions: number;
  bookingsThisSeason: number;
  // operatività live
  occupancyPctToday: number; // 0..100 — quota ombrelloni con prenotazione confermata oggi
}

/** Input di provisioning di un nuovo lido (superuser). */
export interface CreateEstablishmentInput {
  name: string;
  adminEmail: string;
}

/** Risposta della create: il DTO del lido + credenziali iniziali dell'admin, mostrate UNA volta. */
export interface CreateEstablishmentResponse {
  establishment: PlatformEstablishmentDTO;
  adminEmail: string;
  temporaryPassword: string;
}
```

- [ ] **Step 2: Builda i contracts e verifica**

```bash
corepack pnpm --filter @coralyn/contracts build
```
Expected: build OK, nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): DTO Platform Console — PlatformEstablishmentDTO + Create*"
```

---

## Task 3: `PlatformMetricsService` (aggregati cross-tenant)

**Files:**
- Create: `apps/api/src/platform/platform-metrics.service.ts`
- Test: `apps/api/src/platform/platform-metrics.service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/api/src/platform/platform-metrics.service.spec.ts`. Mocka Prisma con lo stesso pattern degli altri unit spec (`forTenant` che esegue la callback su un `tx` mockato):

```ts
import { NotFoundException } from '@nestjs/common';
import { PlatformMetricsService } from './platform-metrics.service';

function makeTx() {
  return {
    sector: { count: jest.fn().mockResolvedValue(2) },
    row: { count: jest.fn().mockResolvedValue(5) },
    umbrella: { count: jest.fn().mockResolvedValue(10) },
    season: { findFirst: jest.fn().mockResolvedValue({ startDate: new Date('2026-05-01'), endDate: new Date('2026-09-30') }) },
    booking: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeService(tx: ReturnType<typeof makeTx>, establishmentOverrides: Record<string, jest.Mock> = {}, userCount = 3) {
  const prisma = {
    forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx),
    user: { count: jest.fn().mockResolvedValue(userCount) },
    establishment: { findMany: jest.fn(), findUnique: jest.fn(), ...establishmentOverrides },
  } as any;
  return { service: new PlatformMetricsService(prisma), prisma };
}

describe('PlatformMetricsService', () => {
  const EST = { id: 'e-1', name: 'Lido A', createdAt: new Date('2026-01-02T00:00:00Z'), suspendedAt: null };

  it('metricsFor: compone il DTO PII-free da count/sum/aggregate', async () => {
    const tx = makeTx();
    tx.booking.aggregate
      .mockResolvedValueOnce({ _max: { createdAt: new Date('2026-06-30T10:00:00Z') } }) // lastActivity
      .mockResolvedValueOnce({ _sum: { amountCollected: 1234 } }); // revenueSeason
    tx.booking.count
      .mockResolvedValueOnce(7)   // bookingsThisSeason
      .mockResolvedValueOnce(4);  // activeSubscriptions
    tx.booking.findMany.mockResolvedValue([{ umbrellaId: 'u1' }, { umbrellaId: 'u2' }]); // occupied distinct
    const { service } = makeService(tx);

    const dto = await service.metricsFor(EST);

    expect(dto).toEqual({
      id: 'e-1', name: 'Lido A',
      createdAt: '2026-01-02T00:00:00.000Z', suspendedAt: null,
      sectors: 2, rows: 5, umbrellas: 10,
      staffUsersActive: 3,
      lastActivityAt: '2026-06-30T10:00:00.000Z',
      revenueSeasonTotal: 1234, activeSubscriptions: 4, bookingsThisSeason: 7,
      occupancyPctToday: 20, // 2 occupati / 10 ombrelloni
    });
  });

  it('metricsFor: senza stagione attiva → revenue e bookingsThisSeason a 0', async () => {
    const tx = makeTx();
    tx.season.findFirst.mockResolvedValue(null);
    tx.booking.aggregate.mockResolvedValueOnce({ _max: { createdAt: null } }); // lastActivity solo (no revenue call)
    tx.booking.count.mockResolvedValueOnce(1); // activeSubscriptions
    tx.booking.findMany.mockResolvedValue([]);
    const { service } = makeService(tx);

    const dto = await service.metricsFor(EST);
    expect(dto.revenueSeasonTotal).toBe(0);
    expect(dto.bookingsThisSeason).toBe(0);
    expect(dto.lastActivityAt).toBeNull();
    expect(dto.occupancyPctToday).toBe(0);
  });

  it('getOne: 404 se il lido non esiste', async () => {
    const tx = makeTx();
    const { service } = makeService(tx, { findUnique: jest.fn().mockResolvedValue(null) });
    await expect(service.getOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Esegui il test — deve FALLIRE**

```bash
corepack pnpm --filter @coralyn/api test -- platform-metrics.service
```
Expected: FAIL — `Cannot find module './platform-metrics.service'`.

- [ ] **Step 3: Implementa il service**

Crea `apps/api/src/platform/platform-metrics.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { todayInRome, toDbDate } from '../common/dates';
import { occupancyPct } from '../reports/report.projection';

type EstablishmentRow = { id: string; name: string; createdAt: Date; suspendedAt: Date | null };
const EST_SELECT = { id: true, name: true, createdAt: true, suspendedAt: true } as const;

@Injectable()
export class PlatformMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlatformEstablishmentDTO[]> {
    const rows = await this.prisma.establishment.findMany({ select: EST_SELECT, orderBy: { createdAt: 'asc' } });
    return Promise.all(rows.map((r) => this.metricsFor(r)));
  }

  async getOne(id: string): Promise<PlatformEstablishmentDTO> {
    const row = await this.prisma.establishment.findUnique({ where: { id }, select: EST_SELECT });
    if (!row) throw new NotFoundException('Stabilimento non trovato');
    return this.metricsFor(row);
  }

  async metricsFor(est: EstablishmentRow): Promise<PlatformEstablishmentDTO> {
    const today = toDbDate(todayInRome());

    // User è fuori RLS → conteggio con filtro esplicito, senza GUC.
    const staffUsersActive = await this.prisma.user.count({
      where: { establishmentId: est.id, disabledAt: null, role: { in: ['admin', 'staff'] } },
    });

    const agg = await this.prisma.forTenant(est.id, async (tx) => {
      const [sectors, rows, umbrellas] = [await tx.sector.count(), await tx.row.count(), await tx.umbrella.count()];
      const lastBooking = await tx.booking.aggregate({ _max: { createdAt: true } });

      const season = await tx.season.findFirst({
        where: { startDate: { lte: today }, endDate: { gte: today } },
        select: { startDate: true, endDate: true },
      });
      let revenueSeasonTotal = 0;
      let bookingsThisSeason = 0;
      if (season) {
        const paid = await tx.booking.aggregate({
          _sum: { amountCollected: true },
          where: { collectionDate: { gte: season.startDate, lte: season.endDate } },
        });
        revenueSeasonTotal = Number(paid._sum.amountCollected ?? 0);
        bookingsThisSeason = await tx.booking.count({
          where: { status: 'confirmed', startDate: { gte: season.startDate, lte: season.endDate } },
        });
      }

      const activeSubscriptions = await tx.booking.count({
        where: { type: 'subscription', status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
      });
      const occupied = await tx.booking.findMany({
        where: { status: 'confirmed', startDate: { lte: today }, endDate: { gte: today } },
        select: { umbrellaId: true },
        distinct: ['umbrellaId'],
      });

      return {
        sectors, rows, umbrellas,
        lastActivityAt: lastBooking._max.createdAt,
        revenueSeasonTotal, bookingsThisSeason, activeSubscriptions,
        occupancyPctToday: occupancyPct(occupied.length, umbrellas),
      };
    });

    return {
      id: est.id,
      name: est.name,
      createdAt: est.createdAt.toISOString(),
      suspendedAt: est.suspendedAt ? est.suspendedAt.toISOString() : null,
      sectors: agg.sectors,
      rows: agg.rows,
      umbrellas: agg.umbrellas,
      staffUsersActive,
      lastActivityAt: agg.lastActivityAt ? agg.lastActivityAt.toISOString() : null,
      revenueSeasonTotal: agg.revenueSeasonTotal,
      activeSubscriptions: agg.activeSubscriptions,
      bookingsThisSeason: agg.bookingsThisSeason,
      occupancyPctToday: agg.occupancyPctToday,
    };
  }
}
```

- [ ] **Step 4: Esegui il test — deve PASSARE**

```bash
corepack pnpm --filter @coralyn/api test -- platform-metrics.service
```
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/platform-metrics.service.ts apps/api/src/platform/platform-metrics.service.spec.ts
git commit -m "feat(api): PlatformMetricsService — aggregati cross-tenant PII-free via loop forTenant"
```

---

## Task 4: `PlatformProvisioningService` (create/suspend/reactivate + audit)

**Files:**
- Create: `apps/api/src/platform/platform-provisioning.service.ts`
- Test: `apps/api/src/platform/platform-provisioning.service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/api/src/platform/platform-provisioning.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformProvisioningService } from './platform-provisioning.service';

const DTO = { id: 'e-new', name: 'Lido X' }; // parziale: metrics.getOne è mockato

function makeService(txOverrides: any = {}) {
  const tx = {
    establishment: { create: jest.fn().mockResolvedValue({ id: 'e-new' }), update: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    platformAuditLog: { create: jest.fn().mockResolvedValue({}) },
    ...txOverrides,
  };
  const prisma = {
    $transaction: (cb: (tx: unknown) => unknown) => cb(tx),
    establishment: { findUnique: jest.fn().mockResolvedValue({ id: 'e-new' }) },
  } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('hashed') } as any;
  const metrics = { getOne: jest.fn().mockResolvedValue(DTO) } as any;
  return { service: new PlatformProvisioningService(prisma, hasher, metrics), tx, prisma, hasher, metrics };
}

describe('PlatformProvisioningService', () => {
  it('create: crea lido + admin + audit e ritorna la password temporanea (una volta)', async () => {
    const { service, tx, hasher } = makeService();
    const res = await service.create({ name: 'Lido X', adminEmail: 'admin@lidox.it' }, 'su-1');

    expect(hasher.hash).toHaveBeenCalledWith(expect.any(String));
    expect(tx.establishment.create).toHaveBeenCalledWith({ data: { name: 'Lido X' } });
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ establishmentId: 'e-new', email: 'admin@lidox.it', role: 'admin', passwordHash: 'hashed' }),
    }));
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorUserId: 'su-1', action: 'create_establishment', targetEstablishmentId: 'e-new' }),
    }));
    expect(res.adminEmail).toBe('admin@lidox.it');
    expect(typeof res.temporaryPassword).toBe('string');
    expect(res.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(res.establishment).toEqual(DTO);
  });

  it('create: email duplicata (P2002) → 409', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });
    const { service } = makeService({ user: { create: jest.fn().mockRejectedValue(err) } });
    await expect(service.create({ name: 'Lido X', adminEmail: 'dup@lidox.it' }, 'su-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('suspend: 404 se il lido non esiste', async () => {
    const { service, prisma } = makeService();
    prisma.establishment.findUnique.mockResolvedValue(null);
    await expect(service.suspend('nope', 'su-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suspend: valorizza suspendedAt e scrive audit', async () => {
    const { service, tx } = makeService();
    await service.suspend('e-new', 'su-1');
    expect(tx.establishment.update).toHaveBeenCalledWith({ where: { id: 'e-new' }, data: { suspendedAt: expect.any(Date) } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'suspend_establishment', targetEstablishmentId: 'e-new' }),
    }));
  });

  it('reactivate: azzera suspendedAt e scrive audit reactivate', async () => {
    const { service, tx } = makeService();
    await service.reactivate('e-new', 'su-1');
    expect(tx.establishment.update).toHaveBeenCalledWith({ where: { id: 'e-new' }, data: { suspendedAt: null } });
    expect(tx.platformAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'reactivate_establishment' }),
    }));
  });
});
```

- [ ] **Step 2: Esegui il test — deve FALLIRE**

```bash
corepack pnpm --filter @coralyn/api test -- platform-provisioning.service
```
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Implementa il service**

Crea `apps/api/src/platform/platform-provisioning.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { PlatformMetricsService } from './platform-metrics.service';

@Injectable()
export class PlatformProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly metrics: PlatformMetricsService,
  ) {}

  async create(input: CreateEstablishmentInput, actorUserId: string): Promise<CreateEstablishmentResponse> {
    // Password temporanea generata SEMPRE server-side (mai scelta dal client), ~12 char url-safe.
    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await this.hasher.hash(temporaryPassword);
    let establishmentId: string;
    try {
      // Establishment + User + audit sono RLS-free → transazione interattiva senza GUC.
      establishmentId = await this.prisma.$transaction(async (tx) => {
        const est = await tx.establishment.create({ data: { name: input.name } });
        await tx.user.create({
          data: { establishmentId: est.id, email: input.adminEmail, passwordHash, role: 'admin' },
        });
        await tx.platformAuditLog.create({
          data: {
            actorUserId,
            action: 'create_establishment',
            targetEstablishmentId: est.id,
            metadata: { name: input.name, adminEmail: input.adminEmail },
          },
        });
        return est.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    const establishment = await this.metrics.getOne(establishmentId);
    return { establishment, adminEmail: input.adminEmail, temporaryPassword };
  }

  async suspend(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, true);
  }

  async reactivate(id: string, actorUserId: string): Promise<PlatformEstablishmentDTO> {
    return this.setSuspended(id, actorUserId, false);
  }

  private async setSuspended(id: string, actorUserId: string, suspended: boolean): Promise<PlatformEstablishmentDTO> {
    const existing = await this.prisma.establishment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Stabilimento non trovato');
    await this.prisma.$transaction(async (tx) => {
      await tx.establishment.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } });
      await tx.platformAuditLog.create({
        data: {
          actorUserId,
          action: suspended ? 'suspend_establishment' : 'reactivate_establishment',
          targetEstablishmentId: id,
        },
      });
    });
    return this.metrics.getOne(id);
  }
}
```

- [ ] **Step 4: Esegui il test — deve PASSARE**

```bash
corepack pnpm --filter @coralyn/api test -- platform-provisioning.service
```
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/platform-provisioning.service.ts apps/api/src/platform/platform-provisioning.service.spec.ts
git commit -m "feat(api): PlatformProvisioningService — create/suspend/reactivate lido + audit in-transaction"
```

---

## Task 5: DTO di validazione + Controller + Module + wiring

**Files:**
- Create: `apps/api/src/platform/dto/create-establishment.dto.ts`
- Create: `apps/api/src/platform/platform.controller.ts`
- Create: `apps/api/src/platform/platform.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTO di validazione**

Crea `apps/api/src/platform/dto/create-establishment.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { CreateEstablishmentInput } from '@coralyn/contracts';

export class CreateEstablishmentDto implements CreateEstablishmentInput {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  adminEmail!: string;
}
```

- [ ] **Step 2: Controller (`@Roles(Superuser)` a livello classe)**

Crea `apps/api/src/platform/platform.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { CreateEstablishmentResponse, PlatformEstablishmentDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { CreateEstablishmentDto } from './dto/create-establishment.dto';

@Controller('platform')
@Roles(Role.Superuser) // l'intero modulo è cross-tenant, solo distributore
export class PlatformController {
  constructor(
    private readonly metrics: PlatformMetricsService,
    private readonly provisioning: PlatformProvisioningService,
  ) {}

  @Get('establishments')
  list(): Promise<PlatformEstablishmentDTO[]> {
    return this.metrics.list();
  }

  @Get('establishments/:id')
  getOne(@Param('id') id: string): Promise<PlatformEstablishmentDTO> {
    return this.metrics.getOne(id);
  }

  @Post('establishments')
  create(@Body() body: CreateEstablishmentDto, @CurrentUser() user: AuthUser): Promise<CreateEstablishmentResponse> {
    return this.provisioning.create(body, user.id);
  }

  @Post('establishments/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PlatformEstablishmentDTO> {
    return this.provisioning.suspend(id, user.id);
  }

  @Post('establishments/:id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<PlatformEstablishmentDTO> {
    return this.provisioning.reactivate(id, user.id);
  }
}
```

> Verifica prima: `apps/api/src/identity/current-user.decorator.ts` espone `@CurrentUser()` con `AuthUser` (`{ id, role, establishmentId }`) — usato già da `EstablishmentUsersController`.

- [ ] **Step 3: Module**

Crea `apps/api/src/platform/platform.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformProvisioningService } from './platform-provisioning.service';
import { PasswordHasher } from '../identity/password-hasher';

@Module({
  controllers: [PlatformController],
  providers: [PlatformMetricsService, PlatformProvisioningService, PasswordHasher],
})
export class PlatformModule {}
```

- [ ] **Step 4: Registra il modulo in `app.module.ts`**

Aggiungi l'import e inseriscilo nell'array `imports` dopo `EstablishmentModule`:

```ts
import { PlatformModule } from './platform/platform.module';
// …
  imports: [
    // …esistenti…
    EstablishmentModule,
    PlatformModule,
  ],
```

- [ ] **Step 5: Typecheck + build contracts**

```bash
corepack pnpm --filter @coralyn/contracts build
corepack pnpm --filter @coralyn/api exec tsc --noEmit
```
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/platform/platform.controller.ts apps/api/src/platform/platform.module.ts apps/api/src/platform/dto/create-establishment.dto.ts apps/api/src/app.module.ts
git commit -m "feat(api): PlatformController + module wiring (/api/platform, superuser-only)"
```

---

## Task 6: Il login respinge gli utenti di lidi sospesi

**Files:**
- Modify: `apps/api/src/identity/identity.service.ts`
- Create: `apps/api/src/identity/identity.service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `apps/api/src/identity/identity.service.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { IdentityService } from './identity.service';

function makeService(user: any, establishment: any = null) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    establishment: { findUnique: jest.fn().mockResolvedValue(establishment) },
  } as any;
  const hasher = { verify: jest.fn().mockResolvedValue(true) } as any;
  const tokens = { sign: jest.fn().mockReturnValue('signed-token') } as any;
  return { service: new IdentityService(prisma, hasher, tokens), prisma, tokens };
}

const ADMIN = { id: 'u-1', email: 'a@lido.it', passwordHash: 'h', role: 'admin', disabledAt: null, establishmentId: 'e-1' };

describe('IdentityService.login', () => {
  it('lido sospeso → 401 generico, nessun token', async () => {
    const { service, tokens } = makeService(ADMIN, { suspendedAt: new Date() });
    await expect(service.login({ email: 'a@lido.it', password: 'pw' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.sign).not.toHaveBeenCalled();
  });

  it('lido attivo → login ok', async () => {
    const { service } = makeService(ADMIN, { suspendedAt: null });
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
  });

  it('superuser (establishmentId null) → non controlla la sospensione, login ok', async () => {
    const su = { ...ADMIN, id: 'su-1', role: 'superuser', establishmentId: null };
    const { service, prisma } = makeService(su);
    const res = await service.login({ email: 'a@lido.it', password: 'pw' });
    expect(res.accessToken).toBe('signed-token');
    expect(prisma.establishment.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui il test — deve FALLIRE**

```bash
corepack pnpm --filter @coralyn/api test -- identity.service
```
Expected: FAIL sul primo test (oggi il login non controlla `suspendedAt` → firmerebbe il token).

- [ ] **Step 3: Aggiungi il check in `identity.service.ts`**

In `apps/api/src/identity/identity.service.ts`, dentro `login`, subito **dopo** il blocco `if (user.disabledAt) { … }` e **prima** di `const dto = this.toDTO(user);`, inserisci:

```ts
    // Sospensione a livello tenant: se il lido dell'utente è sospeso, stesso 401 generico
    // (nessuna enumerazione). Il superuser (establishmentId null) non è mai sospendibile.
    if (user.establishmentId) {
      const est = await this.prisma.establishment.findUnique({
        where: { id: user.establishmentId },
        select: { suspendedAt: true },
      });
      if (est?.suspendedAt) {
        throw new UnauthorizedException('Credenziali non valide');
      }
    }
```

- [ ] **Step 4: Esegui il test — deve PASSARE**

```bash
corepack pnpm --filter @coralyn/api test -- identity.service
```
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/identity/identity.service.ts apps/api/src/identity/identity.service.spec.ts
git commit -m "feat(api): il login respinge gli utenti di lidi sospesi (Establishment.suspendedAt)"
```

---

## Task 7: Bootstrap del primo superuser (seed env-gated)

**Files:**
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: Aggiungi il bootstrap superuser nel seed**

In `apps/api/prisma/seed.ts`, subito **dopo** l'upsert dell'admin di sviluppo (dopo il blocco `prisma.user.upsert({ where: { email }, … })`, riga ~29) e **prima** del commento `// --- Map demo …`, inserisci:

```ts
  // Bootstrap del primo superuser di piattaforma (env-gated, idempotente). establishmentId null =
  // cross-tenant (ADR-0026). No-op se le env non sono impostate. Vedi spec Platform Console.
  const suEmail = process.env.PLATFORM_SUPERUSER_EMAIL;
  const suPassword = process.env.PLATFORM_SUPERUSER_PASSWORD;
  if (suEmail && suPassword) {
    const suHash = await argon2.hash(suPassword, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: suEmail },
      update: { passwordHash: suHash, role: Role.superuser, establishmentId: null },
      create: { email: suEmail, passwordHash: suHash, role: Role.superuser, establishmentId: null },
    });
  }
```

- [ ] **Step 2: Esegui il seed con le env del superuser (verifica manuale)**

```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
DEV_ADMIN_PASSWORD=coralyn-admin-8473 \
PLATFORM_SUPERUSER_EMAIL=super@coralyn.dev \
PLATFORM_SUPERUSER_PASSWORD=coralyn-super-9182 \
corepack pnpm --filter @coralyn/api exec ts-node prisma/seed.ts
```
Expected: nessun errore. Verifica che l'utente esista:
```bash
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
corepack pnpm --filter @coralyn/api exec prisma db execute --stdin <<< "SELECT email, role, \"establishmentId\" FROM \"User\" WHERE email='super@coralyn.dev';"
```
Expected: una riga con `role=superuser`, `establishmentId` NULL.

> Nota: se il comando `ts-node` non è lo script di seed usato dal progetto, usa lo script npm equivalente (`corepack pnpm --filter @coralyn/api exec prisma db seed` con le stesse env). Verifica in `apps/api/package.json` la chiave `prisma.seed`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/seed.ts
git commit -m "feat(api): seed bootstrap primo superuser di piattaforma (env-gated, idempotente)"
```

---

## Task 8: e2e — gating, provisioning, sospensione, audit

**Files:**
- Create: `apps/api/test/platform.e2e-spec.ts`

- [ ] **Step 1: Scrivi l'e2e completo**

Crea `apps/api/test/platform.e2e-spec.ts` (mirror di `establishment-users.e2e-spec.ts` per bootstrap app/prisma e helper `createUser`/`login`):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const SUPER_EMAIL = 'su@platform.e2e';
const STAFF_EMAIL = 'staff@platform.e2e';
const NEW_ADMIN_EMAIL = 'new.admin@platform.e2e';

describe('Platform Console (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hostEstId: string;
  let superT: string;
  let staffT: string;
  let createdEstId: string;
  let tempPassword: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // Un lido "host" per lo staff (superuser è cross-tenant, establishmentId null).
    hostEstId = (await prisma.establishment.create({ data: { name: 'PLATFORM HOST' } })).id;
    await createUser(prisma, { email: SUPER_EMAIL, password: 'pw-super-1', role: Role.superuser, establishmentId: null });
    await createUser(prisma, { email: STAFF_EMAIL, password: 'pw-staff-1', role: Role.staff, establishmentId: hostEstId });
    superT = await login(app, SUPER_EMAIL, 'pw-super-1');
    staffT = await login(app, STAFF_EMAIL, 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.platformAuditLog.deleteMany({ where: { targetEstablishmentId: createdEstId } });
    await prisma.user.deleteMany({ where: { email: { in: [SUPER_EMAIL, STAFF_EMAIL, NEW_ADMIN_EMAIL] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [hostEstId, createdEstId].filter(Boolean) } } });
    await app.close();
  });

  it('staff → 403 sulla lista (role-guard superuser)', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments').set(...bearer(staffT)).expect(403);
  });

  it('anonimo → 401', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments').expect(401);
  });

  it('superuser: crea un lido + primo admin → 201 con password temporanea; il nuovo admin fa login', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Lido Nuovo', adminEmail: NEW_ADMIN_EMAIL })
      .expect(201);
    expect(res.body.adminEmail).toBe(NEW_ADMIN_EMAIL);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect(res.body.establishment).toEqual(expect.objectContaining({ name: 'Lido Nuovo', suspendedAt: null, umbrellas: 0 }));
    createdEstId = res.body.establishment.id;
    tempPassword = res.body.temporaryPassword;

    // il nuovo admin può autenticarsi con la password temporanea
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(200);
  });

  it('email admin duplicata → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/platform/establishments')
      .set(...bearer(superT))
      .send({ name: 'Altro Lido', adminEmail: NEW_ADMIN_EMAIL })
      .expect(409);
  });

  it('la lista mostra il lido creato con metriche PII-free', async () => {
    const res = await request(app.getHttpServer()).get('/api/platform/establishments').set(...bearer(superT)).expect(200);
    const item = res.body.find((e: { id: string }) => e.id === createdEstId);
    expect(item).toEqual(expect.objectContaining({ name: 'Lido Nuovo', umbrellas: 0, staffUsersActive: 1, occupancyPctToday: 0 }));
  });

  it('suspend → il nuovo admin non fa più login (401); reactivate → torna a fare login (200)', async () => {
    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/suspend`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(401);

    await request(app.getHttpServer()).post(`/api/platform/establishments/${createdEstId}/reactivate`).set(...bearer(superT)).expect(201);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: NEW_ADMIN_EMAIL, password: tempPassword }).expect(200);
  });

  it('getOne di un id inesistente → 404', async () => {
    await request(app.getHttpServer()).get('/api/platform/establishments/00000000-0000-4000-8000-000000000999').set(...bearer(superT)).expect(404);
  });

  it('PlatformAuditLog registra create + suspend + reactivate del lido', async () => {
    const logs = await prisma.platformAuditLog.findMany({ where: { targetEstablishmentId: createdEstId }, orderBy: { createdAt: 'asc' } });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['create_establishment', 'suspend_establishment', 'reactivate_establishment']));
  });
});
```

> Nota `POST … → 201`: Nest risponde 201 di default ai `@Post()` senza `@HttpCode`. Gli endpoint suspend/reactivate quindi tornano **201** (non 200); i test lo riflettono. Se si preferisce 200, aggiungere `@HttpCode(200)` nel controller e aggiornare i test — non richiesto per questa slice.

- [ ] **Step 2: Esegui l'e2e — deve PASSARE**

```bash
corepack pnpm --filter @coralyn/api test:e2e -- platform
```
Expected: PASS (8 test).

- [ ] **Step 3: Suite completa (RolesGuard globale → non regredire)**

```bash
corepack pnpm --filter @coralyn/api test
corepack pnpm --filter @coralyn/api test:e2e
```
Expected: unit ≥ 167+precedenti nuovi, e2e ≥ 214+8; nessun fallimento.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/platform.e2e-spec.ts
git commit -m "test(api): e2e Platform Console — gating superuser, provisioning, sospensione, audit"
```

---

## Self-Review (già eseguita in fase di scrittura)

- **Spec coverage:** §4.1 suspendedAt → Task 1+6; §4.2 PlatformAuditLog → Task 1+4; §4.3 bootstrap → Task 7; §5 API → Task 5; §6 DTO → Task 2; §7 loop forTenant → Task 3; §11 test → Task 3/4/6/8. Tutte le sezioni backend coperte. (§9 FE = Slice B, fuori da questo piano.)
- **Type consistency:** `metricsFor`/`getOne`/`list` usati coerentemente tra service, controller e test; `PlatformEstablishmentDTO`/`CreateEstablishmentResponse` identici tra contracts, service, controller ed e2e; `action` enum values (`create_establishment`/`suspend_establishment`/`reactivate_establishment`) identici tra migrazione, schema, service e e2e.
- **No placeholder:** ogni step ha codice/comandi completi.
- **Gap noto e intenzionale:** `occupancyPctToday` è definito come "quota ombrelloni con prenotazione confermata oggi" (approssimazione cheap, PII-free) — non l'occupazione slot-accurata dei report; documentato nel DTO. `User.lastLoginAt` non tracciato → `lastActivityAt` = `max(Booking.createdAt)` (D-044).

---

## Verifica LIVE (dopo il merge, prima di presentare)

Rebuild container e prova end-to-end contro il web Docker (più affidabile del preview Vite, vedi handoff):
```bash
docker compose --profile full up -d --build api
```
Poi via `fetch` autenticato come superuser: `GET /api/platform/establishments`, `POST /api/platform/establishments`, verifica login del nuovo admin, suspend→login negato.
