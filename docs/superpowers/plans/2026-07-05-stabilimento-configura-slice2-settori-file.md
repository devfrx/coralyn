# Stabilimento `Configura` — Slice 2: Settori + File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere **editabile** la vista «Struttura della spiaggia»: l'admin crea/rinomina/elimina **settori** e **file**; il pannello destro diventa un editor. Ombrelloni e generatore restano allo Slice 3.

**Architecture:** CRUD `/api/establishment/sectors` e `/api/establishment/rows` (admin-only, riuso role-guard ADR-0039), guardie block-409 identiche alla convenzione `catalog`/`time-slots` (delete bloccata se il figlio esiste **o** se referenziato da tariffe). Migrazione additiva `@@unique([establishmentId, name])` su `Sector` a supporto della guardia 409 nome-unico (coerente con `UmbrellaType` Slice 1 / `EquipmentType`). FE: la stessa `EstablishmentStructureView` guadagna modali «Nuovo/Modifica settore» e «Nuova/Modifica fila» + affordance rename/elimina, con `ConfirmDialog` generalizzato.

**Tech Stack:** NestJS (guard/reflector/class-validator) · Prisma (RLS FORCE sulle tabelle mappa, migrazione additiva) · `@coralyn/contracts` (compila in `dist/`) · Vue 3 + Pinia + TanStack Query + ui-kit · Vitest + MSW · Jest e2e + supertest.

**Gotcha (handoff + Slice 1):**
- Dopo modifiche a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api/web.
- `Sector`/`Row`/`Umbrella`/`UmbrellaType`/`Rate` girano dentro `prisma.forTenant(tenantId, tx => …)`; i `create` passano **`establishmentId: tenantId` esplicito**. `Rate.sectorId`/`Rate.rowId` sono FK nullable → le guardie di delete le contano.
- Il `RolesGuard` è **globale** → ri-esegui **tutta** la suite api dopo aver aggiunto endpoint.
- `prisma migrate dev` **non gira non-interattivo** in questa harness: genera l'SQL con `prisma migrate diff`, crea a mano la cartella migrazione, applica con `prisma migrate deploy` a `coralyn_dev` **e** `coralyn_test`, rigenera il client (come Slice 1). ⚠️ Verifica che l'SQL non contenga un `DROP INDEX "Rate_signature_key"` spurio (D-039).
- Bash tool Windows = Git Bash/POSIX: heredoc per i commit, path assoluti; per `docker compose exec` con path assoluti usa `MSYS_NO_PATHCONV=1`.

**Baseline da non regredire (post-Slice 1):** ui-kit 70 · web-staff 196 · api unit 140 · api e2e 190 · typecheck pulito.
**Target Slice 2:** api unit **155** (+8 settori +7 file) · api e2e **202** (+12) · web-staff **201** (+5).

---

## File Structure
**Contracts (Task 1):** Modify `packages/contracts/src/index.ts` — `Create/UpdateSectorInput`, `Create/UpdateRowInput`.

**API (Task 2 — un commit):**
- Modify `apps/api/prisma/schema.prisma` — `@@unique([establishmentId, name])` su `model Sector`.
- Create `apps/api/prisma/migrations/<ts>_sector_unique_name/migration.sql`.
- Modify `apps/api/src/establishment/establishment-structure.projection.ts` — estrai `toStructureSector`/`toStructureRow` (puri).
- Create `apps/api/src/establishment/establishment-structure.select.ts` — `SECTOR_SELECT`/`ROW_SELECT`.
- Modify `apps/api/src/establishment/establishment-structure.service.ts` — usa `SECTOR_SELECT` (DRY, comportamento invariato).
- Create `apps/api/src/establishment/dto/create-sector.dto.ts` + `update-sector.dto.ts` + `create-row.dto.ts` + `update-row.dto.ts`.
- Create `apps/api/src/establishment/sectors.service.ts` + `.spec.ts` + `sectors.controller.ts`.
- Create `apps/api/src/establishment/rows.service.ts` + `.spec.ts` + `rows.controller.ts`.
- Modify `apps/api/src/establishment/establishment.module.ts` — registra i 2 controller + 2 service.
- Create `apps/api/test/establishment-sectors-rows.e2e-spec.ts`.

**FE (Task 3 — un commit):**
- Modify `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts` — 6 mutation (sectors + rows).
- Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` — modali + affordance + confirm generalizzato.
- Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts` — +5 test.
- Modify `apps/web-staff/src/mocks/server.ts` — handler CRUD sectors + rows.

---

## Task 1: Contratti (layer `contracts`)

**Files:** Modify `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi gli input Settori + File**

In coda a `packages/contracts/src/index.ts` (dopo `UpdateUmbrellaTypeInput` aggiunto nello Slice 1):
```ts
/** Settori (editor struttura, admin-only). */
export interface CreateSectorInput { name: string; kind: SectorKind; }
export interface UpdateSectorInput { name?: string; kind?: SectorKind; }
/** File (editor struttura, admin-only). Slice 2 = create-fila (label); il generatore è Slice 3. */
export interface CreateRowInput { sectorId: string; label: string; }
export interface UpdateRowInput { label?: string; }
```
(`SectorKind` esiste già dallo Slice 1.)

- [ ] **Step 2: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK; `CreateSectorInput`/`UpdateSectorInput`/`CreateRowInput`/`UpdateRowInput` presenti in `packages/contracts/dist/index.d.ts`.

- [ ] **Step 3: Commit (layer contracts)**

```bash
cd /c/Users/Jays/Desktop/new && git add packages/contracts/src/index.ts && git commit -F - <<'EOF'
feat(contracts): struttura stabilimento — Create/UpdateSectorInput + Create/UpdateRowInput (Slice 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Backend — migrazione + CRUD Settori/File (layer `api`, TDD)

### Migrazione (Sector nome unico)

- [ ] **Step 1: Aggiungi il vincolo allo schema**

In `apps/api/prisma/schema.prisma`, in `model Sector { … }`, accanto a `@@index([establishmentId])` aggiungi:
```prisma
  @@unique([establishmentId, name])
```

- [ ] **Step 2: Genera + applica la migrazione (dev + test)**

`prisma migrate dev` non gira non-interattivo: genera l'SQL con `diff`, crea la cartella a mano, applica con `deploy`.
```bash
cd /c/Users/Jays/Desktop/new/apps/api
TS=$(node -e "process.stdout.write(new Date(1751750000000).toISOString().replace(/[-:TZ.]/g,'').slice(0,14))")
# ↑ usa un timestamp AFTER 20260704212542; in alternativa scegli manualmente es. 20260705120000
mkdir -p "prisma/migrations/20260705120000_sector_unique_name"
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/sector_unique.sql 2>/dev/null || true
```
Il modo robusto (identico allo Slice 1): scrivi tu il `migration.sql` con l'unica istruzione attesa, poi `deploy`. Contenuto di `apps/api/prisma/migrations/20260705120000_sector_unique_name/migration.sql`:
```sql
-- CreateIndex
CREATE UNIQUE INDEX "Sector_establishmentId_name_key" ON "Sector"("establishmentId", "name");
```
⚠️ Deve contenere **solo** questa `CREATE UNIQUE INDEX` — nessun `DROP INDEX "Rate_signature_key"`. Poi applica e rigenera:
```bash
cd /c/Users/Jays/Desktop/new/apps/api
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public"  corepack pnpm exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy
DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public"  corepack pnpm exec prisma generate
```
Expected: entrambe le migrate deploy applicano `20260705120000_sector_unique_name`; client rigenerato. (Se `coralyn_dev` avesse due settori omonimi la CREATE fallirebbe: il seed ha `Centro`/`Speciali`, nessun conflitto.)

### Projection: estrai i mapper puri + select condivisi

- [ ] **Step 3: Estrai `toStructureSector`/`toStructureRow` (projection resta pura)**

Sostituisci `apps/api/src/establishment/establishment-structure.projection.ts` con:
```ts
import type { EstablishmentStructureDTO, SectorKind, StructureRowDTO, StructureSectorDTO, UmbrellaTypeDTO } from '@coralyn/contracts';

type RawUmbrella = { id: string; label: string; umbrellaTypeId: string | null; logicalOrder: number };
type RawRow = { id: string; label: string; sortOrder: number; umbrellas: RawUmbrella[] };
type RawSector = { id: string; name: string; sortOrder: number; kind: string; rows: RawRow[] };
type RawType = { id: string; name: string; sortOrder: number; icon: string | null };

export function toStructureRow(r: RawRow): StructureRowDTO {
  return {
    id: r.id, label: r.label, sortOrder: r.sortOrder,
    umbrellas: r.umbrellas.map((u) => ({ id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId })),
  };
}

export function toStructureSector(s: RawSector): StructureSectorDTO {
  return { id: s.id, name: s.name, sortOrder: s.sortOrder, kind: s.kind as SectorKind, rows: s.rows.map(toStructureRow) };
}

export function toEstablishmentStructure(raw: { sectors: RawSector[]; umbrellaTypes: RawType[] }): EstablishmentStructureDTO {
  const umbrellaTypes: UmbrellaTypeDTO[] = raw.umbrellaTypes.map((t) => ({
    id: t.id, name: t.name, sortOrder: t.sortOrder, ...(t.icon ? { icon: t.icon } : {}),
  }));
  return { sectors: raw.sectors.map(toStructureSector), umbrellaTypes };
}
```

- [ ] **Step 4: Il test projection esistente deve restare verde**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-structure.projection`
Expected: PASS (1/1) — il refactor è comportamentalmente identico.

- [ ] **Step 5: Select Prisma condivisi**

Crea `apps/api/src/establishment/establishment-structure.select.ts`:
```ts
import { Prisma } from '@prisma/client';

export const ROW_SELECT = Prisma.validator<Prisma.RowSelect>()({
  id: true,
  label: true,
  sortOrder: true,
  umbrellas: {
    orderBy: { logicalOrder: 'asc' },
    select: { id: true, label: true, umbrellaTypeId: true, logicalOrder: true },
  },
});

export const SECTOR_SELECT = Prisma.validator<Prisma.SectorSelect>()({
  id: true,
  name: true,
  sortOrder: true,
  kind: true,
  rows: { orderBy: { sortOrder: 'asc' }, select: ROW_SELECT },
});
```

- [ ] **Step 6: `establishment-structure.service.ts` usa `SECTOR_SELECT` (DRY)**

In `apps/api/src/establishment/establishment-structure.service.ts` importa il select e sostituisci il `select` inline dei settori. Aggiungi in cima:
```ts
import { SECTOR_SELECT } from './establishment-structure.select';
```
e sostituisci la `tx.sector.findMany({ … })` con:
```ts
        tx.sector.findMany({ orderBy: { sortOrder: 'asc' }, select: SECTOR_SELECT }),
```
(La query `umbrellaType.findMany({ … })` resta invariata.)

- [ ] **Step 7: Struttura invariata — projection + e2e Slice 1 verdi**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- establishment-structure`
Expected: PASS (8/8) — la forma dell'albero è identica.

### DTO Settori/File

- [ ] **Step 8: DTO**

Crea `apps/api/src/establishment/dto/create-sector.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { CreateSectorInput, SectorKind } from '@coralyn/contracts';

const KINDS = ['grid', 'special'] as const;

export class CreateSectorDto implements CreateSectorInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsIn(KINDS)
  kind!: SectorKind;
}
```
Crea `apps/api/src/establishment/dto/update-sector.dto.ts`:
```ts
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { SectorKind, UpdateSectorInput } from '@coralyn/contracts';

const KINDS = ['grid', 'special'] as const;

export class UpdateSectorDto implements UpdateSectorInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(KINDS)
  kind?: SectorKind;
}
```
Crea `apps/api/src/establishment/dto/create-row.dto.ts`:
```ts
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import type { CreateRowInput } from '@coralyn/contracts';

export class CreateRowDto implements CreateRowInput {
  @IsUUID()
  sectorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;
}
```
Crea `apps/api/src/establishment/dto/update-row.dto.ts`:
```ts
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdateRowInput } from '@coralyn/contracts';

export class UpdateRowDto implements UpdateRowInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label?: string;
}
```

### SectorsService (TDD)

- [ ] **Step 9: Unit test del service (fallisce)**

Crea `apps/api/src/establishment/sectors.service.spec.ts`:
```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SectorsService } from './sectors.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    sector: {
      findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    row: { count: jest.fn() },
    rate: { count: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new SectorsService(prisma, tenant), tx };
}

describe('SectorsService', () => {
  it('create: 409 se il nome esiste già (case-insensitive)', async () => {
    const { service, tx } = makeService();
    tx.sector.findFirst.mockResolvedValue({ id: 'x' });
    await expect(service.create({ name: 'Centro', kind: 'grid' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sector.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId, kind e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.sector.findFirst
      .mockResolvedValueOnce(null)            // clash check
      .mockResolvedValueOnce({ sortOrder: 4 }); // nextSortOrder
    tx.sector.create.mockResolvedValue({ id: 'n', name: 'Centro', sortOrder: 5, kind: 'grid', rows: [] });
    const res = await service.create({ name: '  Centro  ', kind: 'grid' });
    expect(tx.sector.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, name: 'Centro', kind: 'grid', sortOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', name: 'Centro', sortOrder: 5, kind: 'grid', rows: [] });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: rinomina e ritorna il DTO proiettato', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid' });
    tx.sector.findFirst.mockResolvedValue(null); // no clash
    tx.sector.update.mockResolvedValue({ id: 's', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
    const res = await service.update('s', { name: 'Centro Mare' });
    expect(res).toEqual({ id: 's', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se contiene file', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(2);
    tx.rate.count.mockResolvedValue(0);
    await expect(service.remove('s')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sector.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 se referenziato da tariffe', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(3);
    await expect(service.remove('s')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sector.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se vuoto e senza tariffe, ritorna il DTO', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(0);
    const res = await service.remove('s');
    expect(tx.sector.delete).toHaveBeenCalledWith({ where: { id: 's' } });
    expect(res).toEqual({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
  });
});
```

- [ ] **Step 10: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- sectors.service`
Expected: FAIL "Cannot find module './sectors.service'".

- [ ] **Step 11: Implementa `SectorsService`**

Crea `apps/api/src/establishment/sectors.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateSectorInput, StructureSectorDTO, UpdateSectorInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { SECTOR_SELECT } from './establishment-structure.select';
import { toStructureSector } from './establishment-structure.projection';

@Injectable()
export class SectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private normalizeName(name: string): string {
    return name.trim();
  }

  private async nextSortOrder(tx: Prisma.TransactionClient): Promise<number> {
    const last = await tx.sector.findFirst({ orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateSectorInput): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const name = this.normalizeName(input.name);
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const clash = await tx.sector.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (clash) throw new ConflictException('Esiste già un settore con questo nome.');
      const sortOrder = await this.nextSortOrder(tx);
      return tx.sector.create({
        data: { establishmentId: tenantId, name, kind: input.kind, sortOrder },
        select: SECTOR_SELECT,
      });
    });
    return toStructureSector(created);
  }

  async update(id: string, input: UpdateSectorInput): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.sector.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.SectorUncheckedUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.normalizeName(input.name);
        const clash = await tx.sector.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un settore con questo nome.');
        data.name = name;
      }
      if (input.kind !== undefined) data.kind = input.kind;
      return tx.sector.update({ where: { id }, data, select: SECTOR_SELECT });
    });
    if (!result) throw new NotFoundException('Settore non trovato');
    return toStructureSector(result);
  }

  async remove(id: string): Promise<StructureSectorDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.sector.findUnique({ where: { id }, select: SECTOR_SELECT });
      if (!existing) return null;
      const [rowCount, rateCount] = await Promise.all([
        tx.row.count({ where: { sectorId: id } }),
        tx.rate.count({ where: { sectorId: id } }),
      ]);
      if (rowCount > 0 || rateCount > 0) {
        throw new ConflictException('Settore non vuoto o in uso da tariffe: svuotalo o rimuovi le tariffe prima.');
      }
      await tx.sector.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Settore non trovato');
    return toStructureSector(removed);
  }
}
```

- [ ] **Step 12: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- sectors.service`
Expected: PASS (8/8).

- [ ] **Step 13: Controller Settori (admin-only)**

Crea `apps/api/src/establishment/sectors.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { StructureSectorDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';

@Controller('establishment/sectors')
@Roles(Role.Admin)
export class SectorsController {
  constructor(private readonly sectors: SectorsService) {}

  @Post()
  create(@Body() body: CreateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateSectorDto): Promise<StructureSectorDTO> {
    return this.sectors.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<StructureSectorDTO> {
    return this.sectors.remove(id);
  }
}
```

### RowsService (TDD)

- [ ] **Step 14: Unit test del service (fallisce)**

Crea `apps/api/src/establishment/rows.service.spec.ts`:
```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RowsService } from './rows.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    sector: { findUnique: jest.fn() },
    row: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    umbrella: { count: jest.fn() },
    rate: { count: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new RowsService(prisma, tenant), tx };
}

describe('RowsService', () => {
  it('create: 404 se il settore non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.create({ sectorId: 's-x', label: 'Fila 1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.row.create).not.toHaveBeenCalled();
  });

  it('create: append nel settore con establishmentId e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's-1' });
    tx.row.findFirst.mockResolvedValue({ sortOrder: 2 }); // nextSortOrder nel settore
    tx.row.create.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 3, umbrellas: [] });
    const res = await service.create({ sectorId: 's-1', label: '  Fila 1  ' });
    expect(tx.row.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, sectorId: 's-1', label: 'Fila 1', sortOrder: 3 },
    }));
    expect(res).toEqual({ id: 'r', label: 'Fila 1', sortOrder: 3, umbrellas: [] });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se contiene ombrelloni', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(4);
    tx.rate.count.mockResolvedValue(0);
    await expect(service.remove('r')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.row.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 se referenziata da tariffe', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(1);
    await expect(service.remove('r')).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove: elimina se vuota e senza tariffe', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(0);
    const res = await service.remove('r');
    expect(tx.row.delete).toHaveBeenCalledWith({ where: { id: 'r' } });
    expect(res).toEqual({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
  });
});
```

- [ ] **Step 15: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- rows.service`
Expected: FAIL "Cannot find module './rows.service'".

- [ ] **Step 16: Implementa `RowsService`**

Crea `apps/api/src/establishment/rows.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateRowInput, StructureRowDTO, UpdateRowInput } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ROW_SELECT } from './establishment-structure.select';
import { toStructureRow } from './establishment-structure.projection';

@Injectable()
export class RowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private async nextSortOrder(tx: Prisma.TransactionClient, sectorId: string): Promise<number> {
    const last = await tx.row.findFirst({ where: { sectorId }, orderBy: { sortOrder: 'desc' } });
    return (last?.sortOrder ?? 0) + 1;
  }

  async create(input: CreateRowInput): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const label = input.label.trim();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      const sector = await tx.sector.findUnique({ where: { id: input.sectorId } });
      if (!sector) throw new NotFoundException('Settore non trovato');
      const sortOrder = await this.nextSortOrder(tx, input.sectorId);
      return tx.row.create({
        data: { establishmentId: tenantId, sectorId: input.sectorId, label, sortOrder },
        select: ROW_SELECT,
      });
    });
    return toStructureRow(created);
  }

  async update(id: string, input: UpdateRowInput): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.row.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.RowUncheckedUpdateInput = {};
      if (input.label !== undefined) data.label = input.label.trim();
      return tx.row.update({ where: { id }, data, select: ROW_SELECT });
    });
    if (!result) throw new NotFoundException('Fila non trovata');
    return toStructureRow(result);
  }

  async remove(id: string): Promise<StructureRowDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.row.findUnique({ where: { id }, select: ROW_SELECT });
      if (!existing) return null;
      const [umbrellaCount, rateCount] = await Promise.all([
        tx.umbrella.count({ where: { rowId: id } }),
        tx.rate.count({ where: { rowId: id } }),
      ]);
      if (umbrellaCount > 0 || rateCount > 0) {
        throw new ConflictException('Fila non vuota o in uso da tariffe: svuotala o rimuovi le tariffe prima.');
      }
      await tx.row.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Fila non trovata');
    return toStructureRow(removed);
  }
}
```

- [ ] **Step 17: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- rows.service`
Expected: PASS (7/7).

- [ ] **Step 18: Controller File (admin-only)**

Crea `apps/api/src/establishment/rows.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { StructureRowDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { RowsService } from './rows.service';
import { CreateRowDto } from './dto/create-row.dto';
import { UpdateRowDto } from './dto/update-row.dto';

@Controller('establishment/rows')
@Roles(Role.Admin)
export class RowsController {
  constructor(private readonly rows: RowsService) {}

  @Post()
  create(@Body() body: CreateRowDto): Promise<StructureRowDTO> {
    return this.rows.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRowDto): Promise<StructureRowDTO> {
    return this.rows.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<StructureRowDTO> {
    return this.rows.remove(id);
  }
}
```

- [ ] **Step 19: Registra nel modulo**

In `apps/api/src/establishment/establishment.module.ts` aggiungi gli import e inseriscili in `controllers`/`providers` (mantieni tutti gli esistenti):
```ts
import { SectorsController } from './sectors.controller';
import { SectorsService } from './sectors.service';
import { RowsController } from './rows.controller';
import { RowsService } from './rows.service';
```
`controllers: [ …esistenti…, SectorsController, RowsController]`
`providers: [ …esistenti…, SectorsService, RowsService]`

### e2e

- [ ] **Step 20: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment-sectors-rows.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['sr.admin@e2e.test', 'sr.staff@e2e.test'];
const MISSING = '00000000-0000-0000-0000-0000000000ff';

describe('Establishment sectors + rows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let sectorId: string;
  let rowId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'SR A' } })).id;
    await createUser(prisma, { email: 'sr.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'sr.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'sr.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'sr.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.umbrella.deleteMany({ where: { establishmentId: s1 } });
      await tx.row.deleteMany({ where: { establishmentId: s1 } });
      await tx.sector.deleteMany({ where: { establishmentId: s1 } });
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  // --- Settori ---
  it('POST /sectors staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(staffT)).send({ name: 'X', kind: 'grid' }).expect(403);
  });

  it('POST /sectors kind non valido → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'X', kind: 'bogus' }).expect(400);
  });

  it('POST /sectors admin → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'Centro', kind: 'grid' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ name: 'Centro', kind: 'grid', rows: [] }));
    sectorId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    expect(struct.body.sectors.map((s: { name: string }) => s.name)).toContain('Centro');
  });

  it('POST /sectors nome duplicato (case-insensitive) → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/sectors').set(...bearer(adminT)).send({ name: 'centro', kind: 'special' }).expect(409);
  });

  it('PATCH /sectors/:id rinomina → 200', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).send({ name: 'Centro Mare' }).expect(200);
    expect(res.body.name).toBe('Centro Mare');
  });

  it('DELETE /sectors/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  // --- File ---
  it('POST /rows staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(staffT)).send({ sectorId, label: 'Fila 1' }).expect(403);
  });

  it('POST /rows sectorId inesistente → 404', async () => {
    await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(adminT)).send({ sectorId: MISSING, label: 'Fila 1' }).expect(404);
  });

  it('POST /rows admin → 201 e appare nel settore', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/rows').set(...bearer(adminT)).send({ sectorId, label: 'Fila 1' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ label: 'Fila 1', umbrellas: [] }));
    rowId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const sec = struct.body.sectors.find((s: { id: string }) => s.id === sectorId);
    expect(sec.rows.map((r: { label: string }) => r.label)).toContain('Fila 1');
  });

  it('DELETE /sectors con file → 409', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).expect(409);
  });

  it('DELETE /rows/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  it('DELETE /rows con ombrelloni → 409, poi vuota → 200', async () => {
    const umb = await prisma.forTenant(s1, (tx) =>
      tx.umbrella.create({ data: { establishmentId: s1, rowId, umbrellaTypeId: null, label: 'SR-1', logicalOrder: 1 } }),
    );
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${rowId}`).set(...bearer(adminT)).expect(409);
    await prisma.forTenant(s1, (tx) => tx.umbrella.delete({ where: { id: umb.id } }));
    await request(app.getHttpServer()).delete(`/api/establishment/rows/${rowId}`).set(...bearer(adminT)).expect(200);
  });

  it('DELETE /sectors vuoto → 200', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/sectors/${sectorId}`).set(...bearer(adminT)).expect(200);
  });
});
```

- [ ] **Step 21: Builda contracts + esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment-sectors-rows`
Expected: PASS (12/12). Se il DB test è indietro: riesegui lo Step 2 (deploy su `coralyn_test`).

- [ ] **Step 22: NESSUNA regressione (guard globale)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: api unit **155** (140 + 8 settori + 7 file) · api e2e **202** (190 + 12), tutti verdi.

- [ ] **Step 23: Commit (layer api)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/establishment/establishment-structure.projection.ts apps/api/src/establishment/establishment-structure.select.ts apps/api/src/establishment/establishment-structure.service.ts apps/api/src/establishment/dto apps/api/src/establishment/sectors.service.ts apps/api/src/establishment/sectors.service.spec.ts apps/api/src/establishment/sectors.controller.ts apps/api/src/establishment/rows.service.ts apps/api/src/establishment/rows.service.spec.ts apps/api/src/establishment/rows.controller.ts apps/api/src/establishment/establishment.module.ts apps/api/test/establishment-sectors-rows.e2e-spec.ts && git commit -F - <<'EOF'
feat(api): struttura stabilimento — CRUD Settori + File admin-only con guardie 409 (Slice 2)

CRUD /establishment/sectors e /establishment/rows @Roles(admin): nome settore unico per
stabilimento (@@unique + migrazione, clash case-insensitive), delete-guard 409 se il figlio
esiste o se referenziato da tariffe (Rate.sectorId/rowId). Projection: mapper puri estratti
+ SECTOR_SELECT/ROW_SELECT condivisi. Unit (settori+file) + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Frontend — editor Settori + File (layer `web-staff`, TDD)

### Data-layer + MSW

- [ ] **Step 1: Mutation nel composable**

In `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`, aggiorna l'import dei tipi e aggiungi in coda le 6 mutation. Aggiungi ai type import: `StructureSectorDTO, StructureRowDTO, CreateSectorInput, UpdateSectorInput, CreateRowInput, UpdateRowInput`. Poi:
```ts
export function useCreateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSectorInput) =>
      apiFetch<StructureSectorDTO>('/establishment/sectors', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateSectorInput) =>
      apiFetch<StructureSectorDTO>(`/establishment/sectors/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, kind: vars.kind }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureSectorDTO>(`/establishment/sectors/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useCreateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRowInput) =>
      apiFetch<StructureRowDTO>('/establishment/rows', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateRowInput) =>
      apiFetch<StructureRowDTO>(`/establishment/rows/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureRowDTO>(`/establishment/rows/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}
```

- [ ] **Step 2: Handler MSW**

In `apps/web-staff/src/mocks/server.ts`, subito dopo gli handler `umbrella-types` (dopo `http.delete('/api/establishment/umbrella-types/:id', …)`), aggiungi:
```ts
  http.post('/api/establishment/sectors', async ({ request }) => {
    const b = (await request.json()) as { name: string; kind: string };
    return HttpResponse.json({ id: `sec-${b.name}`, name: b.name, sortOrder: 9, kind: b.kind, rows: [] }, { status: 201 });
  }),
  http.patch('/api/establishment/sectors/:id', async ({ params, request }) => {
    const b = (await request.json()) as { name?: string; kind?: string };
    return HttpResponse.json({ id: params.id as string, name: b.name ?? 'Centro', sortOrder: 1, kind: b.kind ?? 'grid', rows: [] });
  }),
  http.delete('/api/establishment/sectors/:id', ({ params }) =>
    HttpResponse.json({ id: params.id as string, name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] })),
  http.post('/api/establishment/rows', async ({ request }) => {
    const b = (await request.json()) as { sectorId: string; label: string };
    return HttpResponse.json({ id: `row-${b.label}`, label: b.label, sortOrder: 9, umbrellas: [] }, { status: 201 });
  }),
  http.patch('/api/establishment/rows/:id', async ({ params, request }) => {
    const b = (await request.json()) as { label?: string };
    return HttpResponse.json({ id: params.id as string, label: b.label ?? 'Fila 1', sortOrder: 1, umbrellas: [] });
  }),
  http.delete('/api/establishment/rows/:id', ({ params }) =>
    HttpResponse.json({ id: params.id as string, label: 'Fila 1', sortOrder: 1, umbrellas: [] })),
```

### Vista + test

- [ ] **Step 3: Aggiorna il test della vista (fallisce sui nuovi casi)**

In `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`, aggiungi questi 5 test dentro il `describe` (dopo i test esistenti). Riusa l'helper `settle` già presente nel file:
```ts
  it('admin: crea un settore (nome + disposizione)', async () => {
    const seen: Array<{ name: string; kind: string }> = [];
    server.use(http.post('/api/establishment/sectors', async ({ request }) => {
      const b = (await request.json()) as { name: string; kind: string };
      seen.push(b);
      return HttpResponse.json({ id: 'sec-new', name: b.name, sortOrder: 9, kind: b.kind, rows: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-sector"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).value = 'Ponente';
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    const kind = document.querySelector('[data-testid="sector-kind"]') as HTMLSelectElement;
    kind.value = 'special';
    kind.dispatchEvent(new Event('change'));
    (document.querySelector('[data-testid="sector-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ name: 'Ponente', kind: 'special' }]);
    w.unmount();
  });

  it('admin: rinomina un settore', async () => {
    const seen: Array<{ id: string; name?: string }> = [];
    server.use(http.patch('/api/establishment/sectors/:id', async ({ params, request }) => {
      const b = (await request.json()) as { name?: string };
      seen.push({ id: params.id as string, name: b.name });
      return HttpResponse.json({ id: params.id as string, name: b.name ?? 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="edit-sector"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).value = 'Centro Mare';
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="sector-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ id: 'sec-1', name: 'Centro Mare' }]);
    w.unmount();
  });

  it('admin: elimina un settore solo dopo conferma', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/sectors/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="delete-sector"]').trigger('click');
    await settle();
    expect(seen).toEqual([]);
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['sec-1']);
    w.unmount();
  });

  it('admin: crea una fila nel settore selezionato', async () => {
    const seen: Array<{ sectorId: string; label: string }> = [];
    server.use(http.post('/api/establishment/rows', async ({ request }) => {
      const b = (await request.json()) as { sectorId: string; label: string };
      seen.push(b);
      return HttpResponse.json({ id: 'row-new', label: b.label, sortOrder: 9, umbrellas: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila 2';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ sectorId: 'sec-1', label: 'Fila 2' }]);
    w.unmount();
  });

  it('staff: editor read-only (nessun add/edit/delete di settori e file)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="add-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="add-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="edit-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="delete-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="edit-row"]').exists()).toBe(false);
  });
```
(Il MSW GET `/structure` già restituisce `sec-1` «Centro» come primo settore, selezionato di default → `add-row`/`edit-sector` agiscono su di esso.)

- [ ] **Step 4: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: FAIL (mancano `add-sector`/`add-row`/modali).

- [ ] **Step 5: Implementa la vista aggiornata**

Sostituisci **interamente** `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` con:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Badge, Button, Icon, Modal, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import type { StructureRowDTO, StructureSectorDTO, UmbrellaTypeDTO, SectorKind } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import {
  useEstablishmentStructure,
  useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType,
  useCreateSector, useUpdateSector, useDeleteSector,
  useCreateRow, useUpdateRow, useDeleteRow,
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

// --- Tipologie CRUD ---
const createType = useCreateUmbrellaType();
const updateType = useUpdateUmbrellaType();
const removeType = useDeleteUmbrellaType();
const typeModalOpen = ref(false);
const editingTypeId = ref<string | null>(null);
const typeName = ref('');
const typeIcon = ref<'umbrella' | 'leaf' | 'palmtree'>('umbrella');
function openNewType() { editingTypeId.value = null; typeName.value = ''; typeIcon.value = 'umbrella'; typeModalOpen.value = true; }
function openEditType(t: UmbrellaTypeDTO) {
  editingTypeId.value = t.id; typeName.value = t.name;
  typeIcon.value = (t.icon as 'umbrella' | 'leaf' | 'palmtree') ?? 'umbrella';
  typeModalOpen.value = true;
}
function submitType() {
  const name = typeName.value.trim();
  if (!name) return;
  const close = { onSuccess: () => { typeModalOpen.value = false; } };
  if (editingTypeId.value) updateType.mutate({ id: editingTypeId.value, name, icon: typeIcon.value }, close);
  else createType.mutate({ name, icon: typeIcon.value }, close);
}
const savingType = computed(() => createType.isPending.value || updateType.isPending.value);

// --- Settori CRUD ---
const createSector = useCreateSector();
const updateSector = useUpdateSector();
const removeSector = useDeleteSector();
const sectorModalOpen = ref(false);
const editingSectorId = ref<string | null>(null);
const sectorName = ref('');
const sectorKind = ref<SectorKind>('grid');
function openNewSector() { editingSectorId.value = null; sectorName.value = ''; sectorKind.value = 'grid'; sectorModalOpen.value = true; }
function openEditSector(s: StructureSectorDTO) { editingSectorId.value = s.id; sectorName.value = s.name; sectorKind.value = s.kind; sectorModalOpen.value = true; }
function submitSector() {
  const name = sectorName.value.trim();
  if (!name) return;
  if (editingSectorId.value) {
    updateSector.mutate({ id: editingSectorId.value, name, kind: sectorKind.value }, { onSuccess: () => { sectorModalOpen.value = false; } });
  } else {
    createSector.mutate({ name, kind: sectorKind.value }, {
      onSuccess: (res: StructureSectorDTO) => { sectorModalOpen.value = false; selectedSectorId.value = res.id; },
    });
  }
}
const savingSector = computed(() => createSector.isPending.value || updateSector.isPending.value);

// --- File CRUD ---
const createRow = useCreateRow();
const updateRow = useUpdateRow();
const removeRow = useDeleteRow();
const rowModalOpen = ref(false);
const editingRowId = ref<string | null>(null);
const rowLabel = ref('');
function openNewRow() { editingRowId.value = null; rowLabel.value = ''; rowModalOpen.value = true; }
function openEditRow(r: StructureRowDTO) { editingRowId.value = r.id; rowLabel.value = r.label; rowModalOpen.value = true; }
function submitRow() {
  const label = rowLabel.value.trim();
  if (!label) return;
  const sector = selectedSector.value;
  const close = { onSuccess: () => { rowModalOpen.value = false; } };
  if (editingRowId.value) updateRow.mutate({ id: editingRowId.value, label }, close);
  else if (sector) createRow.mutate({ sectorId: sector.id, label }, close);
}
const savingRow = computed(() => createRow.isPending.value || updateRow.isPending.value);

// --- Elimina (ConfirmDialog generalizzato) ---
const pendingDelete = ref<{ kind: 'type' | 'sector' | 'row'; id: string; name: string } | null>(null);
const confirmDeleteOpen = ref(false);
function askDeleteType(t: UmbrellaTypeDTO) { pendingDelete.value = { kind: 'type', id: t.id, name: t.name }; confirmDeleteOpen.value = true; }
function askDeleteSector(s: StructureSectorDTO) { pendingDelete.value = { kind: 'sector', id: s.id, name: s.name }; confirmDeleteOpen.value = true; }
function askDeleteRow(r: StructureRowDTO) { pendingDelete.value = { kind: 'row', id: r.id, name: r.label }; confirmDeleteOpen.value = true; }
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'sector') return { title: 'Eliminare il settore?', description: `«${p.name}». Se contiene file o è usato da tariffe non sarà eliminato.` };
  if (p?.kind === 'row') return { title: 'Eliminare la fila?', description: `«${p.name}». Se contiene ombrelloni o è usata da tariffe non sarà eliminata.` };
  if (p?.kind === 'type') return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimossa in modo irreversibile dal catalogo. Se è in uso da ombrelloni non sarà eliminata.` };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'type') removeType.mutate(p.id);
  else if (p.kind === 'sector') removeSector.mutate(p.id);
  else removeRow.mutate(p.id);
  confirmDeleteOpen.value = false;
  pendingDelete.value = null;
}
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
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-bold text-[var(--color-text)]">Settori</span>
              <Button v-if="isAdmin" data-testid="add-sector" variant="secondary" @click="openNewSector"><Icon name="plus" :size="13" />Nuovo</Button>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="s in sectors" :key="s.id" data-testid="sector-row"
                class="flex items-center gap-1 rounded-[10px] border px-2 py-1"
                :class="(selectedSector && selectedSector.id === s.id) ? 'border-[var(--color-brand)] bg-[var(--color-accent-tint)]' : 'border-[var(--color-border)]'">
                <button class="flex flex-1 items-center justify-between gap-2 py-1 text-left" @click="selectSector(s.id)">
                  <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ s.name }}</span>
                  <Badge tone="neutral">{{ s.kind === 'special' ? 'Speciali' : 'Griglia' }}</Badge>
                </button>
                <template v-if="isAdmin">
                  <Button data-testid="edit-sector" variant="secondary" @click="openEditSector(s)"><Icon name="edit" :size="12" /></Button>
                  <Button data-testid="delete-sector" variant="secondary" @click="askDeleteSector(s)"><Icon name="trash-2" :size="12" /></Button>
                </template>
              </div>
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
                  <Button data-testid="delete-type" variant="secondary" @click="askDeleteType(t)"><Icon name="trash-2" :size="13" /></Button>
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
            <Button v-if="isAdmin && selectedSector" data-testid="add-row" variant="secondary" class="ml-auto" @click="openNewRow"><Icon name="plus" :size="13" />Nuova fila</Button>
          </div>
          <div v-if="selectedSector" class="flex flex-col gap-3">
            <div v-for="r in selectedSector.rows" :key="r.id" data-testid="row-block" class="rounded-[12px] border border-[var(--color-border)] p-3">
              <div class="mb-2 flex items-center justify-between gap-2">
                <span class="text-[13px] font-semibold text-[var(--color-text)]">{{ r.label }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-[var(--color-text-muted)]">{{ r.umbrellas.length }} {{ r.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</span>
                  <template v-if="isAdmin">
                    <Button data-testid="edit-row" variant="secondary" @click="openEditRow(r)"><Icon name="edit" :size="12" /></Button>
                    <Button data-testid="delete-row" variant="secondary" @click="askDeleteRow(r)"><Icon name="trash-2" :size="12" /></Button>
                  </template>
                </div>
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

    <Modal v-model:open="sectorModalOpen" :title="editingSectorId ? 'Modifica settore' : 'Nuovo settore'" eyebrow="Settori">
      <form class="flex flex-col gap-4" @submit.prevent="submitSector">
        <Field label="Nome">
          <Input name="sector-name" data-testid="sector-name" v-model="sectorName" placeholder="es. Prima fila mare" />
        </Field>
        <Field label="Disposizione">
          <Select v-model="sectorKind" data-testid="sector-kind">
            <option value="grid">Griglia</option>
            <option value="special">Speciali</option>
          </Select>
        </Field>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="sectorModalOpen = false">Annulla</Button>
          <Button type="submit" data-testid="sector-save" :disabled="savingSector">Salva settore</Button>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="rowModalOpen" :title="editingRowId ? 'Modifica fila' : 'Nuova fila'" eyebrow="File">
      <form class="flex flex-col gap-4" @submit.prevent="submitRow">
        <Field label="Etichetta">
          <Input name="row-label" data-testid="row-label" v-model="rowLabel" placeholder="es. Fila 1" />
        </Field>
        <p class="text-xs text-[var(--color-text-muted)]">Gli ombrelloni si aggiungono dopo aver creato la fila.</p>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="rowModalOpen = false">Annulla</Button>
          <Button type="submit" data-testid="row-save" :disabled="savingRow">Salva fila</Button>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="typeModalOpen" :title="editingTypeId ? 'Modifica tipologia' : 'Nuova tipologia'" eyebrow="Tipologie">
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

    <ConfirmDialog
      v-model:open="confirmDeleteOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      confirm-label="Elimina"
      tone="danger"
      @confirm="onConfirmDelete"
    />
  </section>
</template>
```
(Chiavi icona usate: `chevron-left`, `plus`, `edit`, `trash-2`, `umbrella`, `leaf`, `palmtree` — tutte già nel registry, usate nello Slice 1.)

- [ ] **Step 6: Esegui — deve passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: PASS (i 4 test Slice 1 + i 5 nuovi = 9/9 nel file).

- [ ] **Step 7: Typecheck + suite web-staff**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff **201** (196 + 5), verdi.

- [ ] **Step 8: Commit (layer web-staff)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts && git commit -F - <<'EOF'
feat(web-staff): «Configura» struttura — editor Settori + File (CRUD admin) — TDD (Slice 2)

Modali «Nuovo/Modifica settore» (nome + disposizione) e «Nuova/Modifica fila» (etichetta);
rename/elimina di settori e file con ConfirmDialog generalizzato (toast 409 su guardie).
Il pannello destro diventa editabile. Invalida la query struttura.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD Slice 2)
- [ ] Suite verdi: contracts build · api unit (≥155) · api e2e (≥202) · web-staff (≥201) · ui-kit 70 · typecheck pulito.
- [ ] **Verifica LIVE** (Docker `--build api web`): come admin, «Configura» → «Struttura della spiaggia»: creare un settore (Griglia/Speciali) lo aggiunge alla lista e lo seleziona; rinominarlo aggiorna la lista; «Nuova fila» aggiunge una fila al settore selezionato; eliminare un settore con file → toast 409; eliminare una fila con ombrelloni → toast 409; svuotare e poi eliminare → ok; i contatori si aggiornano. Come staff, nessuna affordance di modifica su settori/file. 0 errori console. ⚠️ Se rilanci il seed: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- [ ] **Presenta lo stato all'utente e attendi conferma** prima dello Slice 3 (Ombrelloni + Genera).

## Self-Review (contro la spec §5.3–§5.4 e §7 Slice 2)
- CRUD `/sectors` (nome unico→409, kind @IsIn→400, delete-guard 409 file/tariffe) → Task 2 Step 8-13 + unit + e2e. ✓
- CRUD `/rows` (sector del tenant→404, delete-guard 409 ombrelloni/tariffe) → Task 2 Step 14-18 + unit + e2e. ✓
- Migrazione `Sector @@unique([establishmentId, name])` a supporto del 409 (coerente con Slice 1/EquipmentType) → Task 2 Step 1-2. ✓
- Contratti `Create/UpdateSectorInput` + `Create/UpdateRowInput` → Task 1. ✓
- FE: modali «Nuovo/Modifica settore» + «Nuova/Modifica fila» + rename/elimina + ConfirmDialog generalizzato + gating staff → Task 3. ✓
- Fuori Slice 2 (ombrelloni CRUD, generatore, «Nuova fila» che compone create+generate) NON inclusi — la modale «Nuova fila» qui crea solo la fila (coerente con la decomposizione §7; nota FE esplicita). ✓
- **Type consistency:** `StructureSectorDTO`/`StructureRowDTO` coerenti tra projection/select/service/MSW/FE; `Create/Update{Sector,Row}Input` coerenti tra DTO/servizio/composable; `kind` union `grid|special` coerente tra `@IsIn`, Select FE e schema. ✓
- **Placeholder:** nessuno. Select/mapper/guardie con codice completo.
```
