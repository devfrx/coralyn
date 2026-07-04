# Stabilimento `Configura` — Slice 1: struttura (lettura) + Tipologie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attivare il bottone «Configura» dello Stabilimento aprendo la vista **«Struttura della spiaggia»** che mostra l'albero settori→file→ombrelloni (sola lettura) e permette all'admin di gestire le **Tipologie** ombrellone (crea/modifica/elimina).

**Architecture:** Migrazione additiva `Sector.kind`. Endpoint di **lettura** `GET /api/establishment/structure` (albero proiettato, admin-only) + CRUD **Tipologie** sotto `/api/establishment/umbrella-types` (admin-only, riuso del role-guard ADR-0039), con guardie block-409 identiche alla convenzione `catalog`. FE: nuova rotta admin-gated `/establishment/structure`, vista che rende l'albero e una card Tipologie funzionante con modali ui-kit + `mutationResource` che invalida la query struttura.

**Tech Stack:** NestJS (guard/reflector/class-validator) · Prisma (RLS FORCE su tabelle mappa, migrazione additiva) · `@coralyn/contracts` (compila in `dist/`) · Vue 3 + Pinia + TanStack Query + ui-kit · Vitest + MSW · Jest e2e + supertest.

**Gotcha (handoff):**
- Dopo modifiche a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api.
- `Sector`/`Row`/`Umbrella`/`UmbrellaType` sono **RLS FORCE**: ogni scrittura/lettura va in `prisma.forTenant(tenantId, tx => …)`; i `create` devono passare **`establishmentId: tenantId` esplicito** (mirror di `time-slots.service`).
- Il `RolesGuard` è **globale** → ri-esegui **tutta** la suite api dopo aver aggiunto gli endpoint.
- DB dev `coralyn_dev` / test `coralyn_test` su `localhost:5433`, utente/pass `coralyn_app`. Prisma non auto-carica il `.env` di root da `apps/api` → `DATABASE_URL` inline per i comandi migrate.
- Bash tool Windows = Git Bash/POSIX: heredoc per i commit, path assoluti; per `docker compose exec` con path assoluti usa `MSYS_NO_PATHCONV=1`.

**Baseline da non regredire:** ui-kit 70 · web-staff 191 · api unit 134 · api e2e 182 · typecheck pulito.

---

## File Structure
**Contracts (Task 1):** Modify `packages/contracts/src/index.ts` — `SectorKind`, Structure DTOs, `Create/UpdateUmbrellaTypeInput`.

**API (Task 2 — un commit):**
- Modify `apps/api/prisma/schema.prisma` — enum `SectorKind` + `Sector.kind`.
- Create `apps/api/prisma/migrations/<ts>_add_sector_kind/migration.sql`.
- Create `apps/api/src/establishment/establishment-structure.projection.ts` + `.spec.ts`.
- Create `apps/api/src/establishment/establishment-structure.service.ts`.
- Create `apps/api/src/establishment/establishment-structure.controller.ts` — `GET /establishment/structure`.
- Create `apps/api/src/establishment/dto/create-umbrella-type.dto.ts` + `update-umbrella-type.dto.ts`.
- Create `apps/api/src/establishment/umbrella-types.service.ts` + `.spec.ts`.
- Create `apps/api/src/establishment/umbrella-types.controller.ts` — CRUD.
- Modify `apps/api/src/establishment/establishment.module.ts` — registra controller/service.
- Create `apps/api/test/establishment-structure.e2e-spec.ts`.

**FE (Task 3 — un commit):**
- Modify `apps/web-staff/src/lib/queryKeys.ts` — `establishmentStructure`.
- Create `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`.
- Create `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` + `.spec.ts`.
- Modify `apps/web-staff/src/router/index.ts` — rotta `/establishment/structure` admin-gated.
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue` — «Configura» admin → naviga.
- Modify `apps/web-staff/src/mocks/server.ts` — handler `GET /structure` + CRUD tipologie.

---

## Task 1: Contratti (layer `contracts`)

**Files:** Modify `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i tipi struttura + input tipologie**

In coda a `packages/contracts/src/index.ts`:
```ts
/** Disposizione di un settore (editor struttura). */
export type SectorKind = 'grid' | 'special';

/** Ombrellone nell'editor struttura (senza stato prenotazioni, a differenza di UmbrellaDTO della mappa). */
export interface StructureUmbrellaDTO { id: string; label: string; umbrellaTypeId: string | null; }
export interface StructureRowDTO { id: string; label: string; sortOrder: number; umbrellas: StructureUmbrellaDTO[]; }
export interface StructureSectorDTO { id: string; name: string; sortOrder: number; kind: SectorKind; rows: StructureRowDTO[]; }
/** Albero completo (GET /api/establishment/structure, admin-only). */
export interface EstablishmentStructureDTO {
  sectors: StructureSectorDTO[];   // ordinati per sortOrder; ogni fila per sortOrder, ombrelloni per logicalOrder
  umbrellaTypes: UmbrellaTypeDTO[]; // ordinati per sortOrder ("Normale" = null, non in lista)
}

/** Input creazione tipologia (admin-only). icon = chiave icon-registry ui-kit. */
export interface CreateUmbrellaTypeInput { name: string; icon: string; }
export interface UpdateUmbrellaTypeInput { name?: string; icon?: string; }
```

- [ ] **Step 2: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK; i nuovi simboli presenti in `packages/contracts/dist/index.d.ts`.

- [ ] **Step 3: Commit (layer contracts)**

```bash
cd /c/Users/Jays/Desktop/new && git add packages/contracts/src/index.ts && git commit -F - <<'EOF'
feat(contracts): struttura stabilimento — Structure DTO + Create/UpdateUmbrellaTypeInput + SectorKind

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Backend — migrazione + GET /structure + Tipologie CRUD (layer `api`, TDD)

### Migrazione

- [ ] **Step 1: Aggiungi enum + colonna allo schema**

In `apps/api/prisma/schema.prisma`: aggiungi l'enum (vicino a `enum Role`) e il campo dentro `model Sector`:
```prisma
enum SectorKind {
  grid    // file regolari, impilate verso il mare
  special // ombrelloni fuori griglia (es. palme)
}
```
in `model Sector { … }` dopo `sortOrder Int`:
```prisma
  kind            SectorKind    @default(grid)
```

- [ ] **Step 2: Genera + applica la migrazione (dev, poi test)**

```bash
cd /c/Users/Jays/Desktop/new/apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm exec prisma migrate dev --name add_sector_kind
```
Expected: crea `prisma/migrations/<ts>_add_sector_kind/migration.sql` (`CREATE TYPE "SectorKind"…` + `ALTER TABLE "Sector" ADD COLUMN "kind" "SectorKind" NOT NULL DEFAULT 'grid'`), applica a `coralyn_dev`, rigenera il client. ⚠️ Verifica che la migrazione **non** contenga un `DROP INDEX "Rate_signature_key"` spurio; se c'è, rimuovilo e ricrea l'indice raw (vedi handoff). Poi il test DB:
```bash
cd /c/Users/Jays/Desktop/new/apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy
```

### GET /structure (projection + service + controller)

- [ ] **Step 3: Test della projection (fallisce)**

Crea `apps/api/src/establishment/establishment-structure.projection.spec.ts`:
```ts
import { toEstablishmentStructure } from './establishment-structure.projection';

describe('toEstablishmentStructure', () => {
  it('proietta l’albero e mappa icon null→assente', () => {
    const dto = toEstablishmentStructure({
      sectors: [
        { id: 's1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
          { id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
            { id: 'u1', label: '1', umbrellaTypeId: 't1', logicalOrder: 1 },
            { id: 'u2', label: '2', umbrellaTypeId: null, logicalOrder: 2 },
          ] },
        ] },
      ],
      umbrellaTypes: [
        { id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' },
        { id: 't2', name: 'Nuda', sortOrder: 2, icon: null },
      ],
    });
    expect(dto.sectors[0]).toEqual({ id: 's1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
      { id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'u1', label: '1', umbrellaTypeId: 't1' },
        { id: 'u2', label: '2', umbrellaTypeId: null },
      ] } ] });
    expect(dto.umbrellaTypes).toEqual([
      { id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' },
      { id: 't2', name: 'Nuda', sortOrder: 2 },
    ]);
  });
});
```

- [ ] **Step 4: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-structure.projection`
Expected: FAIL "Cannot find module './establishment-structure.projection'".

- [ ] **Step 5: Implementa la projection**

Crea `apps/api/src/establishment/establishment-structure.projection.ts`:
```ts
import type { EstablishmentStructureDTO, SectorKind, StructureSectorDTO, UmbrellaTypeDTO } from '@coralyn/contracts';

type RawUmbrella = { id: string; label: string; umbrellaTypeId: string | null; logicalOrder: number };
type RawRow = { id: string; label: string; sortOrder: number; umbrellas: RawUmbrella[] };
type RawSector = { id: string; name: string; sortOrder: number; kind: string; rows: RawRow[] };
type RawType = { id: string; name: string; sortOrder: number; icon: string | null };

export function toEstablishmentStructure(raw: { sectors: RawSector[]; umbrellaTypes: RawType[] }): EstablishmentStructureDTO {
  const sectors: StructureSectorDTO[] = raw.sectors.map((s) => ({
    id: s.id, name: s.name, sortOrder: s.sortOrder, kind: s.kind as SectorKind,
    rows: s.rows.map((r) => ({
      id: r.id, label: r.label, sortOrder: r.sortOrder,
      umbrellas: r.umbrellas.map((u) => ({ id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId })),
    })),
  }));
  const umbrellaTypes: UmbrellaTypeDTO[] = raw.umbrellaTypes.map((t) => ({
    id: t.id, name: t.name, sortOrder: t.sortOrder, ...(t.icon ? { icon: t.icon } : {}),
  }));
  return { sectors, umbrellaTypes };
}
```

- [ ] **Step 6: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-structure.projection`
Expected: PASS (1/1).

- [ ] **Step 7: Service di lettura**

Crea `apps/api/src/establishment/establishment-structure.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { toEstablishmentStructure } from './establishment-structure.projection';

@Injectable()
export class EstablishmentStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getStructure(): Promise<EstablishmentStructureDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [umbrellaTypes, sectors] = await Promise.all([
        tx.umbrellaType.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sortOrder: true, icon: true } }),
        tx.sector.findMany({
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true, sortOrder: true, kind: true,
            rows: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, label: true, sortOrder: true,
                umbrellas: { orderBy: { logicalOrder: 'asc' }, select: { id: true, label: true, umbrellaTypeId: true, logicalOrder: true } } },
            },
          },
        }),
      ]);
      return toEstablishmentStructure({ sectors, umbrellaTypes });
    });
  }
}
```

- [ ] **Step 8: Controller di lettura (admin-only)**

Crea `apps/api/src/establishment/establishment-structure.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { EstablishmentStructureDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { EstablishmentStructureService } from './establishment-structure.service';

@Controller('establishment/structure')
@Roles(Role.Admin)
export class EstablishmentStructureController {
  constructor(private readonly structure: EstablishmentStructureService) {}

  @Get()
  get(): Promise<EstablishmentStructureDTO> {
    return this.structure.getStructure();
  }
}
```

### Tipologie CRUD (TDD sul service)

- [ ] **Step 9: DTO tipologie**

Crea `apps/api/src/establishment/dto/create-umbrella-type.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateUmbrellaTypeInput } from '@coralyn/contracts';

const ICON_KEYS = ['umbrella', 'leaf', 'palmtree'] as const;

export class CreateUmbrellaTypeDto implements CreateUmbrellaTypeInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIn(ICON_KEYS)
  icon!: string;
}
```
Crea `apps/api/src/establishment/dto/update-umbrella-type.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateUmbrellaTypeInput } from '@coralyn/contracts';

const ICON_KEYS = ['umbrella', 'leaf', 'palmtree'] as const;

export class UpdateUmbrellaTypeDto implements UpdateUmbrellaTypeInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(ICON_KEYS)
  icon?: string;
}
```

- [ ] **Step 10: Unit test del service (fallisce)**

Crea `apps/api/src/establishment/umbrella-types.service.spec.ts`:
```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UmbrellaTypesService } from './umbrella-types.service';

const TENANT = 't-1';

function makeService(txOverrides: Record<string, jest.Mock> = {}) {
  const tx = {
    umbrellaType: {
      findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    umbrella: { count: jest.fn() },
    ...txOverrides,
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new UmbrellaTypesService(prisma, tenant), tx };
}

describe('UmbrellaTypesService', () => {
  it('create: 409 se il nome esiste già', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findFirst.mockResolvedValue({ id: 'x' });
    await expect(service.create({ name: 'Palma', icon: 'palmtree' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrellaType.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findFirst
      .mockResolvedValueOnce(null) // clash check
      .mockResolvedValueOnce({ sortOrder: 4 }); // nextSortOrder
    tx.umbrellaType.create.mockResolvedValue({ id: 'n', name: 'Palma', sortOrder: 5, icon: 'palmtree' });
    const res = await service.create({ name: 'Palma', icon: 'palmtree' });
    expect(tx.umbrellaType.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, name: 'Palma', icon: 'palmtree', sortOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', name: 'Palma', sortOrder: 5, icon: 'palmtree' });
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se assegnata a ombrelloni', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
    tx.umbrella.count.mockResolvedValue(3);
    await expect(service.remove('t')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrellaType.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se non in uso e ritorna il DTO', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
    tx.umbrella.count.mockResolvedValue(0);
    const res = await service.remove('t');
    expect(tx.umbrellaType.delete).toHaveBeenCalledWith({ where: { id: 't' } });
    expect(res).toEqual({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
  });
});
```

- [ ] **Step 11: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- umbrella-types.service`
Expected: FAIL "Cannot find module './umbrella-types.service'".

- [ ] **Step 12: Implementa il service (mirror di time-slots.service)**

Crea `apps/api/src/establishment/umbrella-types.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateUmbrellaTypeInput, UmbrellaTypeDTO, UpdateUmbrellaTypeInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';

const SELECT = { id: true, name: true, sortOrder: true, icon: true } as const;
type Row = { id: string; name: string; sortOrder: number; icon: string | null };

@Injectable()
export class UmbrellaTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private toDTO(t: Row): UmbrellaTypeDTO {
    return { id: t.id, name: t.name, sortOrder: t.sortOrder, ...(t.icon ? { icon: t.icon } : {}) };
  }

  private async nextSortOrder(tx: Prisma.TransactionClient): Promise<number> {
    const last = await tx.umbrellaType.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateUmbrellaTypeInput): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.umbrellaType.findFirst({ where: { name: input.name } });
      if (clash) throw new ConflictException('Esiste già una tipologia con questo nome.');
      const sortOrder = await this.nextSortOrder(tx);
      return tx.umbrellaType.create({
        data: { establishmentId: tenantId, name: input.name, icon: input.icon, sortOrder },
        select: SELECT,
      });
    });
    return this.toDTO(created);
  }

  async update(id: string, input: UpdateUmbrellaTypeInput): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrellaType.findUnique({ where: { id } });
      if (!existing) return null;
      if (input.name !== undefined && input.name !== existing.name) {
        const clash = await tx.umbrellaType.findFirst({ where: { name: input.name, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già una tipologia con questo nome.');
      }
      const data: Prisma.UmbrellaTypeUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.icon !== undefined) data.icon = input.icon;
      return tx.umbrellaType.update({ where: { id }, data, select: SELECT });
    });
    if (!result) throw new NotFoundException('Tipologia non trovata');
    return this.toDTO(result);
  }

  async remove(id: string): Promise<UmbrellaTypeDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrellaType.findUnique({ where: { id }, select: SELECT });
      if (!existing) return null;
      const refs = await tx.umbrella.count({ where: { umbrellaTypeId: id } });
      if (refs > 0) throw new ConflictException('Tipologia in uso da ombrelloni: riassegnali prima di eliminarla.');
      await tx.umbrellaType.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Tipologia non trovata');
    return this.toDTO(removed);
  }
}
```

- [ ] **Step 13: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- umbrella-types.service`
Expected: PASS (5/5).

- [ ] **Step 14: Controller tipologie (admin-only)**

Crea `apps/api/src/establishment/umbrella-types.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { UmbrellaTypesService } from './umbrella-types.service';
import { CreateUmbrellaTypeDto } from './dto/create-umbrella-type.dto';
import { UpdateUmbrellaTypeDto } from './dto/update-umbrella-type.dto';

@Controller('establishment/umbrella-types')
@Roles(Role.Admin)
export class UmbrellaTypesController {
  constructor(private readonly types: UmbrellaTypesService) {}

  @Post()
  create(@Body() body: CreateUmbrellaTypeDto): Promise<UmbrellaTypeDTO> {
    return this.types.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUmbrellaTypeDto): Promise<UmbrellaTypeDTO> {
    return this.types.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<UmbrellaTypeDTO> {
    return this.types.remove(id);
  }
}
```

- [ ] **Step 15: Registra nel modulo**

Sostituisci `apps/api/src/establishment/establishment.module.ts` aggiungendo i nuovi controller/service (mantieni quelli di Fase 1/2):
```ts
import { Module } from '@nestjs/common';
import { EstablishmentController } from './establishment.controller';
import { EstablishmentService } from './establishment.service';
import { EstablishmentUsersController } from './establishment-users.controller';
import { EstablishmentUsersService } from './establishment-users.service';
import { EstablishmentStructureController } from './establishment-structure.controller';
import { EstablishmentStructureService } from './establishment-structure.service';
import { UmbrellaTypesController } from './umbrella-types.controller';
import { UmbrellaTypesService } from './umbrella-types.service';
import { PasswordHasher } from '../identity/password-hasher';

@Module({
  controllers: [EstablishmentController, EstablishmentUsersController, EstablishmentStructureController, UmbrellaTypesController],
  providers: [EstablishmentService, EstablishmentUsersService, EstablishmentStructureService, UmbrellaTypesService, PasswordHasher],
})
export class EstablishmentModule {}
```

### e2e

- [ ] **Step 16: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment-structure.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['str.admin@e2e.test', 'str.staff@e2e.test'];

describe('Establishment structure + umbrella-types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let typeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'STRUCT A' } })).id;
    await createUser(prisma, { email: 'str.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'str.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'str.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'str.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.umbrellaType.deleteMany({ where: { establishmentId: s1 } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('GET /structure staff → 403', async () => {
    await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(staffT)).expect(403);
  });

  it('GET /structure admin → 200 forma corretta (vuota all’inizio)', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(res.body).toEqual({ sectors: [], umbrellaTypes: [] });
  });

  it('POST tipologia staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(staffT)).send({ name: 'X', icon: 'umbrella' }).expect(403);
  });

  it('POST tipologia icona non valida → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'X', icon: 'bogus' }).expect(400);
  });

  it('POST admin crea tipologia → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'Palma', icon: 'palmtree' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ name: 'Palma', icon: 'palmtree', sortOrder: expect.any(Number) }));
    typeId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(struct.body.umbrellaTypes.map((t: { name: string }) => t.name)).toContain('Palma');
  });

  it('POST nome duplicato → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrella-types').set(...bearer(adminT)).send({ name: 'Palma', icon: 'leaf' }).expect(409);
  });

  it('DELETE tipologia in uso → 409, poi libera → 200', async () => {
    // crea un settore/fila/ombrellone che usa la tipologia (via prisma diretto: struttura editor CRUD arriva negli slice 2/3)
    const sector = await prisma.sector.create({ data: { establishmentId: s1, name: 'Centro', sortOrder: 1 } });
    const row = await prisma.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'Fila 1', sortOrder: 1 } });
    const umb = await prisma.umbrella.create({ data: { establishmentId: s1, rowId: row.id, umbrellaTypeId: typeId, label: 'STR-1', logicalOrder: 1 } });
    await request(app.getHttpServer()).delete(`/api/establishment/umbrella-types/${typeId}`).set(...bearer(adminT)).expect(409);
    await prisma.umbrella.delete({ where: { id: umb.id } });
    await prisma.row.delete({ where: { id: row.id } });
    await prisma.sector.delete({ where: { id: sector.id } });
    await request(app.getHttpServer()).delete(`/api/establishment/umbrella-types/${typeId}`).set(...bearer(adminT)).expect(200);
  });
});
```

- [ ] **Step 17: Builda contracts + esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment-structure`
Expected: PASS (7/7). Se il DB test è indietro: riesegui lo Step 2 (deploy).

- [ ] **Step 18: NESSUNA regressione (guard globale)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: api unit ≥ 134 + 6 (projection 1 + service 5) = **140** · api e2e ≥ 182 + 7 = **189**, tutti verdi.

- [ ] **Step 19: Commit (layer api)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/establishment/establishment-structure.projection.ts apps/api/src/establishment/establishment-structure.projection.spec.ts apps/api/src/establishment/establishment-structure.service.ts apps/api/src/establishment/establishment-structure.controller.ts apps/api/src/establishment/dto apps/api/src/establishment/umbrella-types.service.ts apps/api/src/establishment/umbrella-types.service.spec.ts apps/api/src/establishment/umbrella-types.controller.ts apps/api/src/establishment/establishment.module.ts apps/api/test/establishment-structure.e2e-spec.ts && git commit -F - <<'EOF'
feat(api): struttura stabilimento — GET /structure + Tipologie CRUD admin-only (+ Sector.kind)

Migrazione additiva Sector.kind. GET /establishment/structure (albero, admin-only) e
CRUD /establishment/umbrella-types @Roles(admin): nome unico → 409, icona validata,
delete-guard 409 se in uso da ombrelloni. Projection + unit + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Frontend — vista struttura (albero) + Tipologie CRUD (layer `web-staff`, TDD)

### Data-layer + MSW

- [ ] **Step 1: Query key**

In `apps/web-staff/src/lib/queryKeys.ts`, aggiungi dentro l'oggetto `queryKeys` (dopo `establishmentOverview`):
```ts
  establishmentStructure: (tenantId: string) => ['establishment', tenantId, 'structure'] as const,
```

- [ ] **Step 2: Composable**

Crea `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`:
```ts
import type { EstablishmentStructureDTO, UmbrellaTypeDTO, CreateUmbrellaTypeInput, UpdateUmbrellaTypeInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentStructure() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentStructure(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentStructureDTO>('/establishment/structure'),
  });
}

export function useCreateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>('/establishment/umbrella-types', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, icon: vars.icon }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}
```

- [ ] **Step 3: Handler MSW**

In `apps/web-staff/src/mocks/server.ts`, dopo il blocco establishment (dopo gli handler users), aggiungi:
```ts
  http.get('/api/establishment/structure', () =>
    HttpResponse.json({
      sectors: [
        { id: 'sec-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
          { id: 'row-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
            { id: 'omb-1', label: '1', umbrellaTypeId: 'typ-1' },
            { id: 'omb-2', label: '2', umbrellaTypeId: null },
          ] },
        ] },
      ],
      umbrellaTypes: [
        { id: 'typ-1', name: 'Palma', sortOrder: 1, icon: 'palmtree' },
        { id: 'typ-2', name: 'Mini-palma', sortOrder: 2, icon: 'leaf' },
      ],
    })),
  http.post('/api/establishment/umbrella-types', async ({ request }) => {
    const b = (await request.json()) as { name: string; icon: string };
    return HttpResponse.json({ id: `typ-${b.name}`, name: b.name, sortOrder: 9, icon: b.icon }, { status: 201 });
  }),
  http.patch('/api/establishment/umbrella-types/:id', async ({ params, request }) => {
    const b = (await request.json()) as { name?: string; icon?: string };
    return HttpResponse.json({ id: params.id as string, name: b.name ?? 'Palma', sortOrder: 1, icon: b.icon ?? 'palmtree' });
  }),
  http.delete('/api/establishment/umbrella-types/:id', ({ params }) =>
    HttpResponse.json({ id: params.id as string, name: 'Palma', sortOrder: 1, icon: 'palmtree' })),
```

### Vista + test

- [ ] **Step 4: Scrivi il test della vista (fallisce)**

Crea `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentStructureView from './EstablishmentStructureView.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('EstablishmentStructureView', () => {
  afterEach(() => server.resetHandlers());

  it('rende contatori, albero e tipologie dai dati reali', async () => {
    const w = mountApp(EstablishmentStructureView);
    await settle();
    expect(w.text()).toContain('Struttura della spiaggia');
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('Fila 1');
    expect(w.text()).toContain('Palma');
    expect(w.text()).toContain('Mini-palma');
  });

  it('admin: crea una tipologia', async () => {
    const seen: Array<{ name: string; icon: string }> = [];
    server.use(http.post('/api/establishment/umbrella-types', async ({ request }) => {
      const b = (await request.json()) as { name: string; icon: string };
      seen.push(b);
      return HttpResponse.json({ id: 'typ-new', name: b.name, sortOrder: 9, icon: b.icon }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-type"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="type-name"]') as HTMLInputElement).value = 'Gazebo';
    (document.querySelector('[data-testid="type-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="type-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ name: 'Gazebo', icon: 'umbrella' }]);
    w.unmount();
  });

  it('staff: tipologie read-only (nessun bottone gestione)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="add-type"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 5: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: FAIL (componente inesistente).

- [ ] **Step 6: Implementa la vista**

Crea `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Badge, Button, Icon, Modal, Field, Input, Select } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import type { UmbrellaTypeDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import {
  useEstablishmentStructure, useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType,
} from './useEstablishmentStructure';

const session = useSessionStore();
const router = useRouter();
const { data } = useEstablishmentStructure();
const isAdmin = computed(() => session.role === Role.Admin);

const sectors = computed(() => data.value?.sectors ?? []);
const types = computed(() => data.value?.umbrellaTypes ?? []);
const counts = computed(() => {
  const s = sectors.value;
  const rows = s.reduce((n, x) => n + x.rows.length, 0);
  const umbrellas = s.reduce((n, x) => n + x.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: s.length, rows, umbrellas, types: types.value.length };
});

const selectedSectorId = ref<string | null>(null);
const selectedSector = computed(() => sectors.value.find((s) => s.id === selectedSectorId.value) ?? sectors.value[0] ?? null);
function selectSector(id: string) { selectedSectorId.value = id; }

const ICON_LABEL: Record<string, string> = { umbrella: 'Ombrellone', leaf: 'Paglia', palmtree: 'Palma' };

// --- Tipologie CRUD ---
const create = useCreateUmbrellaType();
const update = useUpdateUmbrellaType();
const remove = useDeleteUmbrellaType();
const typeModalOpen = ref(false);
const editingId = ref<string | null>(null);
const typeName = ref('');
const typeIcon = ref<'umbrella' | 'leaf' | 'palmtree'>('umbrella');

function openNewType() { editingId.value = null; typeName.value = ''; typeIcon.value = 'umbrella'; typeModalOpen.value = true; }
function openEditType(t: UmbrellaTypeDTO) {
  editingId.value = t.id; typeName.value = t.name;
  typeIcon.value = (t.icon as 'umbrella' | 'leaf' | 'palmtree') ?? 'umbrella';
  typeModalOpen.value = true;
}
function submitType() {
  const name = typeName.value.trim();
  if (!name) return;
  const close = { onSuccess: () => { typeModalOpen.value = false; } };
  if (editingId.value) update.mutate({ id: editingId.value, name, icon: typeIcon.value }, close);
  else create.mutate({ name, icon: typeIcon.value }, close);
}
function deleteType(t: UmbrellaTypeDTO) { remove.mutate(t.id); }
const savingType = computed(() => create.isPending.value || update.isPending.value);
</script>

<template>
  <section class="max-w-[1040px] px-[26px] pb-[30px] pt-[22px]">
    <button class="mb-3 flex items-center gap-1 text-[13px] font-semibold text-[var(--color-text-muted)]" @click="router.push('/establishment')">
      <Icon name="chevron-left" :size="15" />Stabilimento
    </button>
    <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">Struttura della spiaggia</h2>
    <p class="mb-4 text-[13px] text-[var(--color-text-muted)]">Settori, file, ombrelloni e tipologie · setup guidato</p>

    <div class="mb-4 grid grid-cols-4 gap-4">
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.sectors }}</div><div class="text-xs text-[var(--color-text-muted)]">Settori</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.rows }}</div><div class="text-xs text-[var(--color-text-muted)]">File</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.umbrellas }}</div><div class="text-xs text-[var(--color-text-muted)]">Ombrelloni</div></div></Card>
      <Card><div class="p-4"><div class="text-[22px] font-bold tabular-nums text-[var(--color-text)]">{{ counts.types }}</div><div class="text-xs text-[var(--color-text-muted)]">Tipologie</div></div></Card>
    </div>

    <div class="grid grid-cols-[300px_1fr] gap-4">
      <div class="flex flex-col gap-4">
        <Card>
          <div class="p-4">
            <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Settori</div>
            <div class="flex flex-col gap-2">
              <button v-for="s in sectors" :key="s.id" data-testid="sector-row"
                class="flex items-center justify-between rounded-[10px] border px-3 py-2 text-left"
                :class="(selectedSector && selectedSector.id === s.id) ? 'border-[var(--color-brand)] bg-[var(--color-accent-tint)]' : 'border-[var(--color-border)]'"
                @click="selectSector(s.id)">
                <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ s.name }}</span>
                <Badge tone="neutral">{{ s.kind === 'special' ? 'Speciali' : 'Griglia' }}</Badge>
              </button>
              <p v-if="sectors.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessun settore.</p>
            </div>
          </div>
        </Card>

        <Card>
          <div class="p-4">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-sm font-bold text-[var(--color-text)]">Tipologie</span>
              <Button v-if="isAdmin" data-testid="add-type" variant="secondary" @click="openNewType"><Icon name="plus" :size="13" />Nuova</Button>
            </div>
            <p class="mb-2 text-xs text-[var(--color-text-muted)]">Classificazione ortogonale alla posizione. Normale = predefinita.</p>
            <div class="flex flex-col">
              <div v-for="t in types" :key="t.id" data-testid="type-row" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-2.5 last:border-0">
                <span class="grid size-8 place-items-center rounded-[9px] bg-[var(--color-raised)] text-[var(--color-text-2nd)]"><Icon :name="t.icon ?? 'umbrella'" :size="16" /></span>
                <span class="flex-1 text-[13px] font-semibold text-[var(--color-text)]">{{ t.name }}</span>
                <template v-if="isAdmin">
                  <Button data-testid="edit-type" variant="secondary" @click="openEditType(t)"><Icon name="edit" :size="13" /></Button>
                  <Button data-testid="delete-type" variant="secondary" @click="deleteType(t)"><Icon name="trash-2" :size="13" /></Button>
                </template>
              </div>
              <p v-if="types.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessuna tipologia.</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div class="p-4">
          <div class="mb-3 flex items-center gap-2">
            <span class="text-sm font-bold text-[var(--color-text)]">Settore {{ selectedSector?.name ?? '—' }}</span>
            <Badge v-if="selectedSector" tone="neutral">{{ selectedSector.kind === 'special' ? 'Speciali' : 'Griglia' }}</Badge>
          </div>
          <div v-if="selectedSector" class="flex flex-col gap-3">
            <div v-for="r in selectedSector.rows" :key="r.id" data-testid="row-block" class="rounded-[12px] border border-[var(--color-border)] p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.label }}</span>
                <span class="text-xs text-[var(--color-text-muted)]">{{ r.umbrellas.length }} {{ r.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <span v-for="u in r.umbrellas" :key="u.id" class="grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[12.5px] font-semibold tabular-nums text-[var(--color-text-2nd)]">{{ u.label }}</span>
              </div>
            </div>
            <p v-if="selectedSector.rows.length === 0" class="py-2 text-sm text-[var(--color-text-muted)]">Nessuna fila in questo settore.</p>
          </div>
          <p v-else class="py-2 text-sm text-[var(--color-text-muted)]">Crea un settore per iniziare.</p>
        </div>
      </Card>
    </div>

    <Modal v-model:open="typeModalOpen" :title="editingId ? 'Modifica tipologia' : 'Nuova tipologia'" eyebrow="Tipologie">
      <form class="flex flex-col gap-4" @submit.prevent="submitType">
        <Field label="Nome">
          <Input name="type-name" data-testid="type-name" v-model="typeName" placeholder="es. Gazebo" />
        </Field>
        <Field label="Icona sulla mappa">
          <Select v-model="typeIcon" data-testid="type-icon">
            <option value="umbrella">Ombrellone</option>
            <option value="leaf">Paglia</option>
            <option value="palmtree">Palma</option>
          </Select>
        </Field>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="typeModalOpen = false">Annulla</Button>
          <Button type="submit" data-testid="type-save" :disabled="savingType">Salva tipologia</Button>
        </div>
      </form>
    </Modal>
  </section>
</template>
```
(Chiavi icona usate — tutte presenti nel registry ui-kit: `chevron-left`, `plus`, `edit`, `trash-2`, `umbrella`, `leaf`, `palmtree`.)

- [ ] **Step 7: Esegui — deve passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: PASS (3/3).

### Rotta + gating + accesso da Stabilimento

- [ ] **Step 8: Rotta admin-gated**

In `apps/web-staff/src/router/index.ts`, aggiungi dopo la rotta `establishment` (usa il `meta.role` già supportato dal `beforeEach`):
```ts
  { path: '/establishment/structure', name: 'establishment-structure', component: () => import('@/features/establishment/EstablishmentStructureView.vue'), meta: { title: 'Struttura', subtitle: 'Settori, file, ombrelloni e tipologie', role: Role.Admin } },
```

- [ ] **Step 9: Bottone «Configura» admin nella vista Stabilimento**

In `apps/web-staff/src/features/establishment/EstablishmentView.vue`, nella card "Struttura della spiaggia" sostituisci il `Badge tone="soon"` "Configura · in arrivo" con il gating admin. Aggiorna lo script per avere il router (se non già presente `useRouter`, è già importato in Fase 1) e sostituisci il badge:
```vue
          <Button v-if="isAdmin" data-testid="configure-structure" variant="secondary" @click="$router.push('/establishment/structure')"><Icon name="settings" :size="13" />Configura</Button>
          <Badge v-else tone="soon">Configura · in arrivo</Badge>
```
(`settings` è nel registry; `isAdmin` esiste già dalla Fase 1.)

- [ ] **Step 10: Typecheck + suite web-staff**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff ≥ 191 + 3 = **194**, verdi.

- [ ] **Step 11: Commit (layer web-staff)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/web-staff/src/features/establishment apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/router/index.ts apps/web-staff/src/mocks/server.ts && git commit -F - <<'EOF'
feat(web-staff): «Configura» struttura — vista albero (read-only) + Tipologie CRUD admin — TDD

Rotta /establishment/structure admin-gated; EstablishmentStructureView rende contatori +
albero settori/file/ombrelloni e una card Tipologie funzionante (crea/modifica/elimina).
Bottone «Configura» attivo solo per admin. Invalida la query struttura.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD Slice 1)
- [ ] Suite verdi: contracts build · api unit (≥140) · api e2e (≥189) · web-staff (≥194) · ui-kit 70 · typecheck pulito.
- [ ] **Verifica LIVE** (Docker `--build api web`): come admin, «Configura» apre «Struttura della spiaggia» che mostra l'albero reale (dal seed) + i contatori; creare/rinominare/eliminare una tipologia funziona e la lista si aggiorna; eliminare una tipologia in uso mostra il toast 409. Come staff, «Configura» resta "in arrivo" e `/establishment/structure` redirige a `/map`. 0 errori console. ⚠️ Se rilanci il seed: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- [ ] **Presenta lo stato all'utente e attendi conferma** prima dello Slice 2 (Settori + File).

## Self-Review (contro la spec, §5.1–§5.2 e §7 Slice 1)
- Migrazione `Sector.kind` → Task 2 Step 1-2. ✓
- Contratti Structure DTO + Create/UpdateUmbrellaTypeInput → Task 1. ✓
- `GET /structure` admin-only, albero ordinato, projection pura → Task 2 Step 3-8 + e2e (403 staff, forma). ✓
- Tipologie CRUD admin-only, nome unico→409, icona @IsIn→400, delete-guard→409 → Task 2 Step 9-16 + unit + e2e. ✓
- FE vista albero read-only + Tipologie CRUD + gating staff read-only + rotta admin-gated + «Configura» → Task 3. ✓
- Fuori Slice 1 (settori/file/ombrelloni scrittura, generatore) NON inclusi — coerente con la decomposizione. ✓
- **Type consistency:** `EstablishmentStructureDTO`/`StructureSectorDTO`/`UmbrellaTypeDTO` coerenti tra projection, service, MSW, FE; `Create/UpdateUmbrellaTypeInput` coerenti tra DTO/servizio/composable; chiavi icona `umbrella|leaf|palmtree` coerenti tra `@IsIn`, Select FE e registry (`palmtree` = tree-palm). ✓
- **Placeholder:** nessuno. Chiavi icona verificate nel registry ui-kit (`chevron-left`/`settings`/`edit`/`plus`/`trash-2`/`umbrella`/`leaf`/`palmtree`).
