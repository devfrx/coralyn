# Stabilimento `Configura` — Slice 3: Ombrelloni + Genera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare l'editor «Struttura della spiaggia»: l'admin gestisce i **singoli ombrelloni** (crea/modifica/elimina) e li **genera in blocco** con numerazione automatica (skip dei duplicati); la modale «Nuova fila» crea la fila e genera i suoi ombrelloni in un colpo.

**Architecture:** CRUD `/api/establishment/umbrellas` + `POST /api/establishment/umbrellas/generate` (admin-only, ADR-0039). Nessuna migrazione: `Umbrella` ha già `@@unique([establishmentId, label])` (etichetta unica → 409) e `Booking.umbrellaId` è la FK che la guardia di cancellazione conta. Tipologia estranea al tenant → **422**. Il generatore calcola le etichette `prefix+n`, salta quelle esistenti (una query), crea le nuove in transazione con `logicalOrder` progressivo, ritorna `{created, skipped, umbrellas}`. FE: chip ombrellone cliccabili (edit), «+ Aggiungi»/«Genera» per fila, modali «Nuovo/Modifica ombrellone» e «Genera» (con anteprima), e «Nuova fila» che compone create-fila + generate.

**Tech Stack:** NestJS (guard/reflector/class-validator) · Prisma (RLS FORCE, nessuna migrazione) · `@coralyn/contracts` · Vue 3 + Pinia + TanStack Query + ui-kit · Vitest + MSW · Jest e2e + supertest.

**Gotcha (handoff + Slice 1/2):**
- Dopo modifiche a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api/web.
- `Umbrella`/`Row`/`UmbrellaType`/`Booking` girano dentro `prisma.forTenant(tenantId, tx => …)`; i `create` passano **`establishmentId: tenantId` esplicito**.
- **Nessuna migrazione in questo slice.** `Umbrella.@@unique([establishmentId, label])` e `Booking.umbrellaId` esistono già.
- Il `RolesGuard` è **globale** → ri-esegui **tutta** la suite api dopo aver aggiunto endpoint.
- Etichetta ombrellone = codice fisico: clash **esatto** (case-sensitive, coerente con il `@@unique` del DB), non case-insensitive come i nomi. Tipologia estranea → **422** (`UnprocessableEntityException`).
- Bash tool Windows = Git Bash/POSIX: heredoc per i commit, path assoluti; per `docker compose exec` usa `MSYS_NO_PATHCONV=1`.

**Baseline da non regredire (post-Slice 2):** ui-kit 70 · web-staff 203 · api unit 155 · api e2e 203 · typecheck pulito.
**Target Slice 3:** api unit **167** (+12) · api e2e **215** (+12) · web-staff **209** (+6).

---

## File Structure
**Contracts (Task 1):** Modify `packages/contracts/src/index.ts` — `Create/UpdateUmbrellaInput`, `GenerateUmbrellasInput`, `GenerateUmbrellasResultDTO`.

**API (Task 2 — un commit):**
- Modify `apps/api/src/establishment/establishment-structure.projection.ts` — estrai `toStructureUmbrella` (puro), usalo in `toStructureRow`.
- Modify `apps/api/src/establishment/establishment-structure.select.ts` — `UMBRELLA_SELECT`.
- Create `apps/api/src/establishment/dto/create-umbrella.dto.ts` + `update-umbrella.dto.ts` + `generate-umbrellas.dto.ts`.
- Create `apps/api/src/establishment/umbrellas.service.ts` + `.spec.ts` + `umbrellas.controller.ts`.
- Modify `apps/api/src/establishment/establishment.module.ts` — registra controller + service.
- Create `apps/api/test/establishment-umbrellas.e2e-spec.ts`.

**FE (Task 3 — un commit):**
- Modify `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts` — 4 mutation (umbrella CRUD + generate).
- Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` — chip cliccabili, «+ Aggiungi»/«Genera», modali ombrellone/genera, «Nuova fila» compone create+generate, ConfirmDialog kind `umbrella`.
- Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts` — +6 test.
- Modify `apps/web-staff/src/mocks/server.ts` — handler umbrellas + generate.

---

## Task 1: Contratti (layer `contracts`)

**Files:** Modify `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi gli input Ombrelloni + Genera**

In coda a `packages/contracts/src/index.ts` (dopo `UpdateRowInput` dello Slice 2):
```ts
/** Ombrelloni singoli (editor struttura, admin-only). umbrellaTypeId null = Normale. */
export interface CreateUmbrellaInput { rowId: string; label: string; umbrellaTypeId: string | null; }
export interface UpdateUmbrellaInput { label?: string; umbrellaTypeId?: string | null; }
/** Generatore a numerazione automatica in una fila (admin-only). */
export interface GenerateUmbrellasInput {
  rowId: string;
  prefix: string;                // '' = solo numero
  start: number;                 // "Da numero"
  count: number;                 // "Quantità" (1..60)
  umbrellaTypeId: string | null; // tipologia predefinita del batch
}
export interface GenerateUmbrellasResultDTO { created: number; skipped: number; umbrellas: StructureUmbrellaDTO[]; }
```
(`StructureUmbrellaDTO` esiste già dallo Slice 1.)

- [ ] **Step 2: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK; `CreateUmbrellaInput`/`UpdateUmbrellaInput`/`GenerateUmbrellasInput`/`GenerateUmbrellasResultDTO` in `packages/contracts/dist/index.d.ts`.

- [ ] **Step 3: Commit (layer contracts)**

```bash
cd /c/Users/Jays/Desktop/new && git add packages/contracts/src/index.ts && git commit -F - <<'EOF'
feat(contracts): struttura stabilimento — Create/UpdateUmbrellaInput + GenerateUmbrellas (Slice 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Backend — CRUD Ombrelloni + Generatore (layer `api`, TDD)

### Projection + select

- [ ] **Step 1: Estrai `toStructureUmbrella` (projection resta pura)**

In `apps/api/src/establishment/establishment-structure.projection.ts`, aggiungi il mapper e usalo in `toStructureRow`. Aggiungi l'import di tipo `StructureUmbrellaDTO` e:
```ts
export function toStructureUmbrella(u: RawUmbrella): StructureUmbrellaDTO {
  return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId };
}
```
e sostituisci il corpo di `toStructureRow` con:
```ts
export function toStructureRow(r: RawRow): StructureRowDTO {
  return { id: r.id, label: r.label, sortOrder: r.sortOrder, umbrellas: r.umbrellas.map(toStructureUmbrella) };
}
```
Aggiorna la riga di import in cima aggiungendo `StructureUmbrellaDTO`:
```ts
import type { EstablishmentStructureDTO, SectorKind, StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
```

- [ ] **Step 2: La projection esistente resta verde**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-structure.projection`
Expected: PASS (1/1) — refactor comportamentalmente identico.

- [ ] **Step 3: `UMBRELLA_SELECT`**

In `apps/api/src/establishment/establishment-structure.select.ts`, aggiungi in coda:
```ts
export const UMBRELLA_SELECT = Prisma.validator<Prisma.UmbrellaSelect>()({
  id: true,
  label: true,
  umbrellaTypeId: true,
  logicalOrder: true,
});
```

### DTO

- [ ] **Step 4: DTO Ombrelloni + Genera**

Crea `apps/api/src/establishment/dto/create-umbrella.dto.ts`:
```ts
import { IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import type { CreateUmbrellaInput } from '@coralyn/contracts';

export class CreateUmbrellaDto implements CreateUmbrellaInput {
  @IsUUID()
  rowId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label!: string;

  // null = Normale; se valorizzato dev'essere un UUID (l'appartenenza al tenant → 422 nel service).
  @ValidateIf((o: CreateUmbrellaDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
```
Crea `apps/api/src/establishment/dto/update-umbrella.dto.ts`:
```ts
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { UpdateUmbrellaInput } from '@coralyn/contracts';

export class UpdateUmbrellaDto implements UpdateUmbrellaInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  label?: string;

  // @IsOptional accetta null (→ Normale) e undefined (→ non toccare); un non-UUID → 400.
  @IsOptional()
  @IsUUID()
  umbrellaTypeId?: string | null;
}
```
Crea `apps/api/src/establishment/dto/generate-umbrellas.dto.ts`:
```ts
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { GenerateUmbrellasInput } from '@coralyn/contracts';

export class GenerateUmbrellasDto implements GenerateUmbrellasInput {
  @IsUUID()
  rowId!: string;

  @IsString()
  @MaxLength(20)
  prefix!: string; // '' ammesso

  @IsInt()
  @Min(0)
  start!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  count!: number;

  @ValidateIf((o: GenerateUmbrellasDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
```

### UmbrellasService (TDD)

- [ ] **Step 5: Unit test del service (fallisce)**

Crea `apps/api/src/establishment/umbrellas.service.spec.ts`:
```ts
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UmbrellasService } from './umbrellas.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    row: { findUnique: jest.fn() },
    umbrellaType: { findUnique: jest.fn() },
    umbrella: {
      findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    booking: { count: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new UmbrellasService(prisma, tenant), tx };
}

describe('UmbrellasService', () => {
  it('create: 404 se la fila non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.create({ rowId: 'r-x', label: '1', umbrellaTypeId: null })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: 422 se la tipologia è estranea', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.create({ rowId: 'r-1', label: '1', umbrellaTypeId: 'typ-x' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: 409 se l’etichetta esiste già', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findFirst.mockResolvedValueOnce({ id: 'dup' }); // clash label
    await expect(service.create({ rowId: 'r-1', label: '1', umbrellaTypeId: null })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId e logicalOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findFirst
      .mockResolvedValueOnce(null)              // clash label
      .mockResolvedValueOnce({ logicalOrder: 4 }); // last in row
    tx.umbrella.create.mockResolvedValue({ id: 'n', label: '  5  ', umbrellaTypeId: null, logicalOrder: 5 });
    const res = await service.create({ rowId: 'r-1', label: '  5  ', umbrellaTypeId: null });
    expect(tx.umbrella.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, rowId: 'r-1', umbrellaTypeId: null, label: '5', logicalOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', label: '  5  ', umbrellaTypeId: null });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: 409 etichetta duplicata', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.umbrella.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.update('u', { label: '2' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('update: 422 tipologia estranea', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.update('u', { umbrellaTypeId: 'typ-x' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se ha prenotazioni', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.booking.count.mockResolvedValue(2);
    await expect(service.remove('u')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrella.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se senza prenotazioni', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: 't1', logicalOrder: 1 });
    tx.booking.count.mockResolvedValue(0);
    const res = await service.remove('u');
    expect(tx.umbrella.delete).toHaveBeenCalledWith({ where: { id: 'u' } });
    expect(res).toEqual({ id: 'u', label: '1', umbrellaTypeId: 't1' });
  });

  it('generate: salta le esistenti e crea le nuove con logicalOrder progressivo', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findMany.mockResolvedValue([{ label: '1' }, { label: '2' }]); // esistenti fra i candidati
    tx.umbrella.findFirst.mockResolvedValue({ logicalOrder: 5 });               // last in row
    tx.umbrella.create
      .mockResolvedValueOnce({ id: 'n3', label: '3', umbrellaTypeId: null, logicalOrder: 6 })
      .mockResolvedValueOnce({ id: 'n4', label: '4', umbrellaTypeId: null, logicalOrder: 7 })
      .mockResolvedValueOnce({ id: 'n5', label: '5', umbrellaTypeId: null, logicalOrder: 8 });
    const res = await service.generate({ rowId: 'r-1', prefix: '', start: 1, count: 5, umbrellaTypeId: null });
    expect(res).toEqual({ created: 3, skipped: 2, umbrellas: [
      { id: 'n3', label: '3', umbrellaTypeId: null },
      { id: 'n4', label: '4', umbrellaTypeId: null },
      { id: 'n5', label: '5', umbrellaTypeId: null },
    ] });
    expect(tx.umbrella.create).toHaveBeenCalledTimes(3);
    expect(tx.umbrella.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ establishmentId: TENANT, rowId: 'r-1', label: '3', logicalOrder: 6 }),
    }));
  });

  it('generate: 404 se la fila non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.generate({ rowId: 'r-x', prefix: '', start: 1, count: 3, umbrellaTypeId: null })).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 6: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- umbrellas.service`
Expected: FAIL "Cannot find module './umbrellas.service'".

- [ ] **Step 7: Implementa `UmbrellasService`**

Crea `apps/api/src/establishment/umbrellas.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, StructureUmbrellaDTO, UpdateUmbrellaInput,
} from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { UMBRELLA_SELECT } from './establishment-structure.select';
import { toStructureUmbrella } from './establishment-structure.projection';

@Injectable()
export class UmbrellasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private async assertRow(tx: Prisma.TransactionClient, rowId: string): Promise<void> {
    const row = await tx.row.findUnique({ where: { id: rowId } });
    if (!row) throw new NotFoundException('Fila non trovata');
  }

  private async assertType(tx: Prisma.TransactionClient, umbrellaTypeId: string | null): Promise<void> {
    if (umbrellaTypeId === null) return;
    const type = await tx.umbrellaType.findUnique({ where: { id: umbrellaTypeId } });
    if (!type) throw new UnprocessableEntityException('Tipologia non valida per questo stabilimento.');
  }

  private async nextLogicalOrder(tx: Prisma.TransactionClient, rowId: string): Promise<number> {
    const last = await tx.umbrella.findFirst({ where: { rowId }, orderBy: { logicalOrder: 'desc' } });
    return (last?.logicalOrder ?? 0) + 1;
  }

  async create(input: CreateUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const label = input.label.trim();
    const created = await this.prisma.forTenant(tenantId, async (tx) => {
      await this.assertRow(tx, input.rowId);
      await this.assertType(tx, input.umbrellaTypeId);
      const clash = await tx.umbrella.findFirst({ where: { label } });
      if (clash) throw new ConflictException('Esiste già un ombrellone con questa etichetta.');
      const logicalOrder = await this.nextLogicalOrder(tx, input.rowId);
      return tx.umbrella.create({
        data: { establishmentId: tenantId, rowId: input.rowId, umbrellaTypeId: input.umbrellaTypeId, label, logicalOrder },
        select: UMBRELLA_SELECT,
      });
    });
    return toStructureUmbrella(created);
  }

  async update(id: string, input: UpdateUmbrellaInput): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({ where: { id } });
      if (!existing) return null;
      const data: Prisma.UmbrellaUncheckedUpdateInput = {};
      if (input.label !== undefined) {
        const label = input.label.trim();
        const clash = await tx.umbrella.findFirst({ where: { label, id: { not: id } } });
        if (clash) throw new ConflictException('Esiste già un ombrellone con questa etichetta.');
        data.label = label;
      }
      if (input.umbrellaTypeId !== undefined) {
        await this.assertType(tx, input.umbrellaTypeId);
        data.umbrellaTypeId = input.umbrellaTypeId;
      }
      return tx.umbrella.update({ where: { id }, data, select: UMBRELLA_SELECT });
    });
    if (!result) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(result);
  }

  async remove(id: string): Promise<StructureUmbrellaDTO> {
    const tenantId = this.tenant.require();
    const removed = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.umbrella.findUnique({ where: { id }, select: UMBRELLA_SELECT });
      if (!existing) return null;
      const bookings = await tx.booking.count({ where: { umbrellaId: id } });
      if (bookings > 0) throw new ConflictException('Ombrellone con prenotazioni: non eliminabile.');
      await tx.umbrella.delete({ where: { id } });
      return existing;
    });
    if (!removed) throw new NotFoundException('Ombrellone non trovato');
    return toStructureUmbrella(removed);
  }

  async generate(input: GenerateUmbrellasInput): Promise<GenerateUmbrellasResultDTO> {
    const tenantId = this.tenant.require();
    return this.prisma.forTenant(tenantId, async (tx) => {
      await this.assertRow(tx, input.rowId);
      await this.assertType(tx, input.umbrellaTypeId);
      const candidates: string[] = [];
      for (let i = 0; i < input.count; i++) candidates.push(`${input.prefix}${input.start + i}`);
      const existing = await tx.umbrella.findMany({ where: { label: { in: candidates } }, select: { label: true } });
      const existingSet = new Set(existing.map((e) => e.label));
      const toCreate = candidates.filter((label) => !existingSet.has(label));
      let order = await this.nextLogicalOrder(tx, input.rowId);
      const umbrellas: StructureUmbrellaDTO[] = [];
      for (const label of toCreate) {
        const u = await tx.umbrella.create({
          data: { establishmentId: tenantId, rowId: input.rowId, umbrellaTypeId: input.umbrellaTypeId, label, logicalOrder: order },
          select: UMBRELLA_SELECT,
        });
        umbrellas.push(toStructureUmbrella(u));
        order += 1;
      }
      return { created: umbrellas.length, skipped: candidates.length - toCreate.length, umbrellas };
    });
  }
}
```
Nota: `nextLogicalOrder` in `generate` è chiamata una volta e incrementata in loop (una sola query di lettura), a differenza del create singolo.

- [ ] **Step 8: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- umbrellas.service`
Expected: PASS (12/12).

- [ ] **Step 9: Controller (admin-only)**

Crea `apps/api/src/establishment/umbrellas.controller.ts`:
```ts
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { GenerateUmbrellasResultDTO, StructureUmbrellaDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { UmbrellasService } from './umbrellas.service';
import { CreateUmbrellaDto } from './dto/create-umbrella.dto';
import { UpdateUmbrellaDto } from './dto/update-umbrella.dto';
import { GenerateUmbrellasDto } from './dto/generate-umbrellas.dto';

@Controller('establishment/umbrellas')
@Roles(Role.Admin)
export class UmbrellasController {
  constructor(private readonly umbrellas: UmbrellasService) {}

  @Post()
  create(@Body() body: CreateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.create(body);
  }

  @Post('generate')
  generate(@Body() body: GenerateUmbrellasDto): Promise<GenerateUmbrellasResultDTO> {
    return this.umbrellas.generate(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUmbrellaDto): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<StructureUmbrellaDTO> {
    return this.umbrellas.remove(id);
  }
}
```

- [ ] **Step 10: Registra nel modulo**

In `apps/api/src/establishment/establishment.module.ts` aggiungi gli import e inseriscili in `controllers`/`providers` (mantieni tutti gli esistenti):
```ts
import { UmbrellasController } from './umbrellas.controller';
import { UmbrellasService } from './umbrellas.service';
```
`controllers: [ …esistenti…, UmbrellasController]`
`providers: [ …esistenti…, UmbrellasService]`

### e2e

- [ ] **Step 11: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment-umbrellas.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['umb.admin@e2e.test', 'umb.staff@e2e.test'];
const MISSING = '00000000-0000-4000-8000-0000000000ff';

describe('Establishment umbrellas + generate (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let rowId: string;
  let umbId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'UMB A' } })).id;
    await createUser(prisma, { email: 'umb.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'umb.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'umb.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'umb.staff@e2e.test', 'pw-staff-1');

    rowId = await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Centro', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'Fila 1', sortOrder: 1 } });
      return row.id;
    });
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

  // --- Ombrelloni ---
  it('POST /umbrellas staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(staffT)).send({ rowId, label: 'X', umbrellaTypeId: null }).expect(403);
  });

  it('POST /umbrellas rowId inesistente → 404', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId: MISSING, label: 'X', umbrellaTypeId: null }).expect(404);
  });

  it('POST /umbrellas tipologia estranea → 422', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: 'X', umbrellaTypeId: MISSING }).expect(422);
  });

  it('POST /umbrellas admin → 201 e appare in /structure', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: '1', umbrellaTypeId: null }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ label: '1', umbrellaTypeId: null }));
    umbId = res.body.id;
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const labels = struct.body.sectors.flatMap((s: { rows: { umbrellas: { label: string }[] }[] }) => s.rows.flatMap((r) => r.umbrellas.map((u) => u.label)));
    expect(labels).toContain('1');
  });

  it('POST /umbrellas etichetta duplicata → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas').set(...bearer(adminT)).send({ rowId, label: '1', umbrellaTypeId: null }).expect(409);
  });

  it('PATCH /umbrellas rinomina etichetta → 200', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/umbrellas/${umbId}`).set(...bearer(adminT)).send({ label: '1-bis' }).expect(200);
    expect(res.body.label).toBe('1-bis');
  });

  it('DELETE /umbrellas/:missing → 404', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${MISSING}`).set(...bearer(adminT)).expect(404);
  });

  it('DELETE /umbrellas admin → 200', async () => {
    await request(app.getHttpServer()).delete(`/api/establishment/umbrellas/${umbId}`).set(...bearer(adminT)).expect(200);
  });

  // --- Generatore ---
  it('POST /umbrellas/generate staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(staffT)).send({ rowId, prefix: 'A', start: 1, count: 3, umbrellaTypeId: null }).expect(403);
  });

  it('POST /umbrellas/generate count fuori range → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 0, umbrellaTypeId: null }).expect(400);
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 61, umbrellaTypeId: null }).expect(400);
  });

  it('POST /umbrellas/generate admin → crea, poi salta le esistenti', async () => {
    const r1 = await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 3, umbrellaTypeId: null }).expect(201);
    expect(r1.body).toEqual(expect.objectContaining({ created: 3, skipped: 0 }));
    const r2 = await request(app.getHttpServer()).post('/api/establishment/umbrellas/generate').set(...bearer(adminT)).send({ rowId, prefix: 'A', start: 1, count: 5, umbrellaTypeId: null }).expect(201);
    expect(r2.body).toEqual(expect.objectContaining({ created: 2, skipped: 3 }));
  });
});
```

- [ ] **Step 12: Builda contracts + esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment-umbrellas`
Expected: PASS (12/12).

- [ ] **Step 13: NESSUNA regressione (guard globale)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: api unit **167** (155 + 12) · api e2e **215** (203 + 12), tutti verdi.

- [ ] **Step 14: Commit (layer api)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/api/src/establishment/establishment-structure.projection.ts apps/api/src/establishment/establishment-structure.select.ts apps/api/src/establishment/dto apps/api/src/establishment/umbrellas.service.ts apps/api/src/establishment/umbrellas.service.spec.ts apps/api/src/establishment/umbrellas.controller.ts apps/api/src/establishment/establishment.module.ts apps/api/test/establishment-umbrellas.e2e-spec.ts && git commit -F - <<'EOF'
feat(api): struttura stabilimento — CRUD Ombrelloni + generatore admin-only (Slice 3)

CRUD /establishment/umbrellas e POST /umbrellas/generate @Roles(admin): etichetta unica per
stabilimento → 409, tipologia estranea → 422, delete-guard 409 se con prenotazioni. Generatore:
salta le etichette esistenti, crea le nuove con logicalOrder progressivo, ritorna created/skipped.
Projection: toStructureUmbrella estratto + UMBRELLA_SELECT. Unit + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: Frontend — editor Ombrelloni + Genera (layer `web-staff`, TDD)

### Data-layer + MSW

- [ ] **Step 1: Mutation nel composable**

In `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`, estendi l'import di tipo con `StructureUmbrellaDTO, CreateUmbrellaInput, UpdateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO` e aggiungi in coda:
```ts
export function useCreateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>('/establishment/umbrellas', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label, umbrellaTypeId: vars.umbrellaTypeId }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useGenerateUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: GenerateUmbrellasInput) =>
      apiFetch<GenerateUmbrellasResultDTO>('/establishment/umbrellas/generate', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}
```
Nota: `vars.umbrellaTypeId` può essere `null` (→ Normale). Il body lo invia esplicito solo se `!== undefined`; per PATCH label-only, `umbrellaTypeId` resta `undefined` e `JSON.stringify` lo omette.

- [ ] **Step 2: Handler MSW**

In `apps/web-staff/src/mocks/server.ts`, dopo gli handler `rows` (dopo `http.delete('/api/establishment/rows/:id', …)`), aggiungi:
```ts
  http.post('/api/establishment/umbrellas', async ({ request }) => {
    const b = (await request.json()) as { rowId: string; label: string; umbrellaTypeId: string | null };
    return HttpResponse.json({ id: `omb-${b.label}`, label: b.label, umbrellaTypeId: b.umbrellaTypeId }, { status: 201 });
  }),
  http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
    const b = (await request.json()) as { prefix: string; start: number; count: number };
    const umbrellas = Array.from({ length: b.count }, (_v, i) => ({ id: `omb-${b.prefix}${b.start + i}`, label: `${b.prefix}${b.start + i}`, umbrellaTypeId: null }));
    return HttpResponse.json({ created: b.count, skipped: 0, umbrellas }, { status: 201 });
  }),
  http.patch('/api/establishment/umbrellas/:id', async ({ params, request }) => {
    const b = (await request.json()) as { label?: string; umbrellaTypeId?: string | null };
    return HttpResponse.json({ id: params.id as string, label: b.label ?? '1', umbrellaTypeId: b.umbrellaTypeId ?? null });
  }),
  http.delete('/api/establishment/umbrellas/:id', ({ params }) =>
    HttpResponse.json({ id: params.id as string, label: '1', umbrellaTypeId: null })),
```
⚠️ Il generate handler deve essere registrato **prima** del `patch('/:id')` non è necessario (metodi diversi), ma tieni il `post('/umbrellas/generate')` **prima** o **dopo** `post('/umbrellas')` indifferentemente (MSW match per path esatto).

### Vista + test

- [ ] **Step 3: Aggiungi i test della vista (falliscono sui nuovi casi)**

In `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`, aggiungi questi 6 test dentro il `describe`, riusando `settle`/`mountApp`/`server`/`http`/`HttpResponse`/`Role`/`useSessionStore` già importati. Il GET `/structure` di default rende `sec-1` «Centro» → `row-1` «Fila 1» con ombrelloni `omb-1` (label '1', typ-1) e `omb-2` (label '2', null):
```ts
  it('admin: aggiunge un ombrellone alla fila', async () => {
    const seen: Array<{ rowId: string; label: string; umbrellaTypeId: string | null }> = [];
    server.use(http.post('/api/establishment/umbrellas', async ({ request }) => {
      const b = (await request.json()) as { rowId: string; label: string; umbrellaTypeId: string | null };
      seen.push(b);
      return HttpResponse.json({ id: 'omb-new', label: b.label, umbrellaTypeId: b.umbrellaTypeId }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-umbrella"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).value = '3';
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="umbrella-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ rowId: 'row-1', label: '3', umbrellaTypeId: null }]);
    w.unmount();
  });

  it('admin: modifica un ombrellone (click sul chip)', async () => {
    const seen: Array<{ id: string; label?: string }> = [];
    server.use(http.patch('/api/establishment/umbrellas/:id', async ({ params, request }) => {
      const b = (await request.json()) as { label?: string };
      seen.push({ id: params.id as string, label: b.label });
      return HttpResponse.json({ id: params.id as string, label: b.label ?? '1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.findAll('[data-testid="umbrella-chip"]')[0].trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).value = '9';
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="umbrella-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ id: 'omb-1', label: '9' }]);
    w.unmount();
  });

  it('admin: elimina un ombrellone solo dopo conferma', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/umbrellas/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, label: '1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.findAll('[data-testid="umbrella-chip"]')[0].trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-delete"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([]);
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['omb-1']);
    w.unmount();
  });

  it('admin: genera ombrelloni su una fila', async () => {
    const seen: Array<{ rowId: string; prefix: string; start: number; count: number }> = [];
    server.use(http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
      const b = (await request.json()) as { rowId: string; prefix: string; start: number; count: number };
      seen.push(b);
      return HttpResponse.json({ created: b.count, skipped: 0, umbrellas: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="generate-umbrellas"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="gen-prefix"]') as HTMLInputElement).value = 'P';
    (document.querySelector('[data-testid="gen-prefix"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).value = '4';
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ rowId: 'row-1', prefix: 'P', start: 1, count: 4, umbrellaTypeId: null }]);
    w.unmount();
  });

  it('admin: «Nuova fila» crea la fila e genera gli ombrelloni', async () => {
    const rows: Array<{ sectorId: string; label: string }> = [];
    const gens: Array<{ rowId: string; count: number }> = [];
    server.use(
      http.post('/api/establishment/rows', async ({ request }) => {
        const b = (await request.json()) as { sectorId: string; label: string };
        rows.push(b);
        return HttpResponse.json({ id: 'row-new', label: b.label, sortOrder: 9, umbrellas: [] }, { status: 201 });
      }),
      http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
        const b = (await request.json()) as { rowId: string; count: number };
        gens.push({ rowId: b.rowId, count: b.count });
        return HttpResponse.json({ created: b.count, skipped: 0, umbrellas: [] }, { status: 201 });
      }),
    );
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila Nuova';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).value = '6';
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(rows).toEqual([{ sectorId: 'sec-1', label: 'Fila Nuova' }]);
    expect(gens).toEqual([{ rowId: 'row-new', count: 6 }]);
    w.unmount();
  });

  it('staff: ombrelloni non editabili (nessun chip cliccabile né Genera/Aggiungi)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="umbrella-chip"]').exists()).toBe(false);
    expect(w.find('[data-testid="add-umbrella"]').exists()).toBe(false);
    expect(w.find('[data-testid="generate-umbrellas"]').exists()).toBe(false);
  });
```

- [ ] **Step 4: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: FAIL (mancano `add-umbrella`/`umbrella-chip`/`generate-umbrellas`/`gen-*`).

- [ ] **Step 5: Implementa la vista aggiornata**

Sostituisci **interamente** `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue` con:
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, Badge, Button, Icon, Modal, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import type { StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO, UmbrellaTypeDTO, SectorKind } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { pushToast } from '@/lib/toasts';
import {
  useEstablishmentStructure,
  useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType,
  useCreateSector, useUpdateSector, useDeleteSector,
  useCreateRow, useUpdateRow, useDeleteRow,
  useCreateUmbrella, useUpdateUmbrella, useDeleteUmbrella, useGenerateUmbrellas,
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

// --- Generatore (condiviso da «Nuova fila» e «Genera») ---
const genPrefix = ref('');
const genStart = ref(1);
const genCount = ref(10);
const genTypeId = ref<string>(''); // '' = Normale
function resetGen() { genPrefix.value = ''; genStart.value = 1; genCount.value = 10; genTypeId.value = ''; }
const genPreview = computed(() => {
  const s = Number(genStart.value) || 0;
  const c = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  return Array.from({ length: c }, (_v, i) => `${genPrefix.value}${s + i}`);
});
function genTypeArg(): string | null { return genTypeId.value === '' ? null : genTypeId.value; }

// --- File CRUD (create compone create-fila + generate) ---
const createRow = useCreateRow();
const updateRow = useUpdateRow();
const removeRow = useDeleteRow();
const generateUmbrellas = useGenerateUmbrellas();
const rowModalOpen = ref(false);
const editingRowId = ref<string | null>(null);
const rowLabel = ref('');
function openNewRow() { editingRowId.value = null; rowLabel.value = ''; resetGen(); rowModalOpen.value = true; }
function openEditRow(r: StructureRowDTO) { editingRowId.value = r.id; rowLabel.value = r.label; rowModalOpen.value = true; }
function submitRow() {
  const label = rowLabel.value.trim();
  if (!label) return;
  if (editingRowId.value) {
    updateRow.mutate({ id: editingRowId.value, label }, { onSuccess: () => { rowModalOpen.value = false; } });
    return;
  }
  const sector = selectedSector.value;
  if (!sector) return;
  createRow.mutate({ sectorId: sector.id, label }, {
    onSuccess: (row: StructureRowDTO) => {
      const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
      if (count <= 0) { rowModalOpen.value = false; return; }
      generateUmbrellas.mutate(
        { rowId: row.id, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeArg() },
        { onSuccess: (res) => { rowModalOpen.value = false; pushToast(`Fila creata · ${res.created} ombrelloni`); } },
      );
    },
  });
}
const savingRow = computed(() => createRow.isPending.value || updateRow.isPending.value || generateUmbrellas.isPending.value);

// --- Genera (su fila esistente) ---
const genModalOpen = ref(false);
const genRowId = ref<string | null>(null);
function openGenerate(rowId: string) { genRowId.value = rowId; resetGen(); genModalOpen.value = true; }
function submitGenerate() {
  const rowId = genRowId.value;
  const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  if (!rowId || count <= 0) return;
  generateUmbrellas.mutate(
    { rowId, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeArg() },
    { onSuccess: (res) => { genModalOpen.value = false; pushToast(`Creati ${res.created} · saltati ${res.skipped}`); } },
  );
}
const savingGenerate = computed(() => generateUmbrellas.isPending.value);

// --- Ombrelloni CRUD (singolo) ---
const createUmbrella = useCreateUmbrella();
const updateUmbrella = useUpdateUmbrella();
const removeUmbrella = useDeleteUmbrella();
const umbModalOpen = ref(false);
const editingUmbId = ref<string | null>(null);
const umbRowId = ref<string | null>(null);
const umbLabel = ref('');
const umbTypeId = ref<string>(''); // '' = Normale
function openNewUmbrella(rowId: string) { editingUmbId.value = null; umbRowId.value = rowId; umbLabel.value = ''; umbTypeId.value = ''; umbModalOpen.value = true; }
function openEditUmbrella(u: StructureUmbrellaDTO, rowId: string) {
  editingUmbId.value = u.id; umbRowId.value = rowId; umbLabel.value = u.label; umbTypeId.value = u.umbrellaTypeId ?? '';
  umbModalOpen.value = true;
}
function submitUmbrella() {
  const label = umbLabel.value.trim();
  if (!label) return;
  const typeArg: string | null = umbTypeId.value === '' ? null : umbTypeId.value;
  const close = { onSuccess: () => { umbModalOpen.value = false; } };
  if (editingUmbId.value) updateUmbrella.mutate({ id: editingUmbId.value, label, umbrellaTypeId: typeArg }, close);
  else if (umbRowId.value) createUmbrella.mutate({ rowId: umbRowId.value, label, umbrellaTypeId: typeArg }, close);
}
const savingUmb = computed(() => createUmbrella.isPending.value || updateUmbrella.isPending.value);
function deleteFromUmbModal() {
  if (!editingUmbId.value) return;
  askDeleteUmbrella({ id: editingUmbId.value, label: umbLabel.value });
  umbModalOpen.value = false;
}

// --- Elimina (ConfirmDialog generalizzato) ---
const pendingDelete = ref<{ kind: 'type' | 'sector' | 'row' | 'umbrella'; id: string; name: string } | null>(null);
const confirmDeleteOpen = ref(false);
function askDeleteType(t: UmbrellaTypeDTO) { pendingDelete.value = { kind: 'type', id: t.id, name: t.name }; confirmDeleteOpen.value = true; }
function askDeleteSector(s: StructureSectorDTO) { pendingDelete.value = { kind: 'sector', id: s.id, name: s.name }; confirmDeleteOpen.value = true; }
function askDeleteRow(r: StructureRowDTO) { pendingDelete.value = { kind: 'row', id: r.id, name: r.label }; confirmDeleteOpen.value = true; }
function askDeleteUmbrella(u: { id: string; name: string }) { pendingDelete.value = { kind: 'umbrella', id: u.id, name: u.name }; confirmDeleteOpen.value = true; }
const confirmCopy = computed(() => {
  const p = pendingDelete.value;
  if (p?.kind === 'sector') return { title: 'Eliminare il settore?', description: `«${p.name}». Se contiene file o è usato da tariffe non sarà eliminato.` };
  if (p?.kind === 'row') return { title: 'Eliminare la fila?', description: `«${p.name}». Se contiene ombrelloni o è usata da tariffe non sarà eliminata.` };
  if (p?.kind === 'umbrella') return { title: 'Eliminare l’ombrellone?', description: `«${p.name}». Se ha prenotazioni non sarà eliminato.` };
  if (p?.kind === 'type') return { title: 'Eliminare definitivamente?', description: `«${p.name}» verrà rimossa in modo irreversibile dal catalogo. Se è in uso da ombrelloni non sarà eliminata.` };
  return { title: '', description: '' };
});
function onConfirmDelete() {
  const p = pendingDelete.value;
  if (!p) return;
  if (p.kind === 'type') removeType.mutate(p.id);
  else if (p.kind === 'sector') removeSector.mutate(p.id);
  else if (p.kind === 'row') removeRow.mutate(p.id);
  else removeUmbrella.mutate(p.id);
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
                    <Button data-testid="generate-umbrellas" variant="secondary" @click="openGenerate(r.id)">Genera</Button>
                    <Button data-testid="add-umbrella" variant="secondary" @click="openNewUmbrella(r.id)"><Icon name="plus" :size="12" />Aggiungi</Button>
                    <Button data-testid="edit-row" variant="secondary" @click="openEditRow(r)"><Icon name="edit" :size="12" /></Button>
                    <Button data-testid="delete-row" variant="secondary" @click="askDeleteRow(r)"><Icon name="trash-2" :size="12" /></Button>
                  </template>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <template v-if="isAdmin">
                  <button v-for="u in r.umbrellas" :key="u.id" data-testid="umbrella-chip" type="button"
                    class="grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[12.5px] font-semibold tabular-nums text-[var(--color-text-2nd)] hover:border-[var(--color-brand)]"
                    @click="openEditUmbrella(u, r.id)">{{ u.label }}</button>
                </template>
                <template v-else>
                  <span v-for="u in r.umbrellas" :key="u.id" class="grid size-9 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[12.5px] font-semibold tabular-nums text-[var(--color-text-2nd)]">{{ u.label }}</span>
                </template>
                <p v-if="r.umbrellas.length === 0" class="py-1 text-xs text-[var(--color-text-muted)]">Nessun ombrellone. Usa «Aggiungi» o «Genera».</p>
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
        <Field label="Nome"><Input name="sector-name" data-testid="sector-name" v-model="sectorName" placeholder="es. Prima fila mare" /></Field>
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
        <Field label="Etichetta"><Input name="row-label" data-testid="row-label" v-model="rowLabel" placeholder="es. Fila 1" /></Field>
        <template v-if="!editingRowId">
          <div class="grid grid-cols-3 gap-3">
            <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
            <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" /></Field>
            <Field label="Quantità"><Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" /></Field>
          </div>
          <Field label="Tipologia">
            <Select v-model="genTypeId" data-testid="gen-type">
              <option value="">Normale</option>
              <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
            </Select>
          </Field>
          <p class="text-xs text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }} ombrelloni). Quantità 0 = crea solo la fila.</p>
        </template>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="rowModalOpen = false">Annulla</Button>
          <Button type="submit" data-testid="row-save" :disabled="savingRow">Salva fila</Button>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="genModalOpen" title="Genera ombrelloni" eyebrow="File">
      <form class="flex flex-col gap-4" @submit.prevent="submitGenerate">
        <div class="grid grid-cols-3 gap-3">
          <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
          <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" /></Field>
          <Field label="Quantità"><Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" /></Field>
        </div>
        <Field label="Tipologia">
          <Select v-model="genTypeId" data-testid="gen-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <p class="text-xs text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }} ombrelloni). Le etichette già esistenti vengono saltate.</p>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="genModalOpen = false">Annulla</Button>
          <Button type="submit" data-testid="gen-save" :disabled="savingGenerate">Genera</Button>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="umbModalOpen" :title="editingUmbId ? 'Modifica ombrellone' : 'Nuovo ombrellone'" eyebrow="Ombrelloni">
      <form class="flex flex-col gap-4" @submit.prevent="submitUmbrella">
        <Field label="Etichetta"><Input name="umbrella-label" data-testid="umbrella-label" v-model="umbLabel" placeholder="es. 12 o P1" /></Field>
        <Field label="Tipologia">
          <Select v-model="umbTypeId" data-testid="umbrella-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <div class="flex items-center justify-between gap-2">
          <Button v-if="editingUmbId" data-testid="umbrella-delete" variant="secondary" type="button" @click="deleteFromUmbModal"><Icon name="trash-2" :size="13" />Elimina</Button>
          <div class="ml-auto flex gap-2">
            <Button variant="secondary" type="button" @click="umbModalOpen = false">Annulla</Button>
            <Button type="submit" data-testid="umbrella-save" :disabled="savingUmb">Salva ombrellone</Button>
          </div>
        </div>
      </form>
    </Modal>

    <Modal v-model:open="typeModalOpen" :title="editingTypeId ? 'Modifica tipologia' : 'Nuova tipologia'" eyebrow="Tipologie">
      <form class="flex flex-col gap-4" @submit.prevent="submitType">
        <Field label="Nome"><Input name="type-name" data-testid="type-name" v-model="typeName" placeholder="es. Gazebo" /></Field>
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
(Chiavi icona usate: `chevron-left`, `plus`, `edit`, `trash-2`, `umbrella`, `leaf`, `palmtree` — tutte già nel registry. «Genera» è un bottone testuale senza icona.)

- [ ] **Step 6: Esegui — deve passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentStructureView`
Expected: PASS (11 test Slice 1/2 + 6 nuovi = 17/17 nel file).

- [ ] **Step 7: Typecheck + suite web-staff**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff **209** (203 + 6), verdi.

- [ ] **Step 8: Commit (layer web-staff)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts && git commit -F - <<'EOF'
feat(web-staff): «Configura» struttura — editor Ombrelloni + Genera (CRUD admin) — TDD (Slice 3)

Chip ombrellone cliccabili (modifica), «+ Aggiungi»/«Genera» per fila, modali
«Nuovo/Modifica ombrellone» e «Genera» con anteprima; «Nuova fila» compone create-fila +
generate. ConfirmDialog esteso a kind 'umbrella'. Invalida la query struttura.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD Slice 3)
- [ ] Suite verdi: contracts build · api unit (≥167) · api e2e (≥215) · web-staff (≥209) · ui-kit 70 · typecheck pulito.
- [ ] **Verifica LIVE** (Docker `--build api web`): come admin, «Configura» → seleziona un settore/fila: «Aggiungi» crea un ombrellone (etichetta duplicata → toast 409; tipologia estranea non è raggiungibile dal Select); click su un chip → modifica etichetta/tipologia o elimina (con prenotazioni → toast 409); «Genera» su una fila crea la numerazione e mostra toast «Creati X · saltati Y» (rieseguendo con overlap, X<totale); «Nuova fila» crea fila + ombrelloni in un colpo; i contatori si aggiornano. Come staff, ombrelloni non cliccabili e nessun «Aggiungi/Genera». 0 errori console. ⚠️ Se rilanci il seed: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- [ ] **Presenta lo stato all'utente e attendi conferma.** Configura è **completo**: proponi FF-merge su `main` + push (ok esplicito) e aggiornamento handoff.

## Self-Review (contro la spec §5.5 e §7 Slice 3)
- CRUD `/umbrellas` (rowId del tenant→404, tipologia estranea→422, etichetta unica→409, delete-guard 409 prenotazioni) → Task 2 Step 5-9 + unit + e2e. ✓
- `POST /umbrellas/generate` (skip esistenti, logicalOrder progressivo, created/skipped, count 1..60→400) → Task 2 Step 7/11 + unit + e2e. ✓
- Contratti `Create/UpdateUmbrellaInput` + `GenerateUmbrellasInput/ResultDTO` → Task 1. ✓
- FE: chip cliccabili, «Aggiungi»/«Genera»/modali, «Nuova fila» compone create+generate, ConfirmDialog kind 'umbrella', gating staff → Task 3. ✓
- Nessuna migrazione (Umbrella `@@unique` e `Booking.umbrellaId` già esistono). ✓
- **Type consistency:** `StructureUmbrellaDTO` coerente tra projection/select/service/MSW/FE; `Create/UpdateUmbrellaInput`/`GenerateUmbrellasInput` coerenti tra DTO/servizio/composable; `umbrellaTypeId` null=Normale coerente (Select value '' → null). ✓
- **Placeholder:** nessuno. Generatore, guardie e anteprima con codice completo. Chiavi icona verificate.
- **Nota debito (tracciata):** la vista `EstablishmentStructureView.vue` ora ospita 4 entità CRUD + 5 modali (~grande ma con sezioni chiare); l'estrazione in composabili per-entità è un follow-up **D-040** insieme alla union `SECTOR_KINDS`/icone condivise — non fatto qui per coerenza con la spec e per non mescolare refactor e feature.
