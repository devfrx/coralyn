# Overhaul editor Struttura «Cantiere» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'editor a liste+5-modali di `/establishment/structure` con il «Cantiere»: scena Riva a riposo come canvas + ispettore contestuale, bulk operations, multi-select e setup guidato — come da [spec](../specs/2026-07-22-struttura-cantiere-design.md).

**Architecture:** Backend additivo (2 endpoint bulk sugli ombrelloni, semantica «salta i protetti» speculare al generate). ui-kit: `UmbrellaCell.slotStates` diventa opzionale → resa «rest» neutra. FE: il monolite `EstablishmentStructureView` (424 righe) si scompone in shell + `StructureScene`/`StructureRow` + 8 pannelli ispettore; la scena riusa i mattoni CSS di `map-scene.css`.

**Tech Stack:** NestJS+Prisma (RLS `forTenant`), Vue 3 `<script setup>` + TanStack Query (`queryResource`/`mutationResource`), Vitest+MSW (FE) e Jest (API), Tailwind v4 + token Coralyn.

## Global Constraints

- **Baseline da non regredire** (post `3cdb53c`): web-staff **501/501** · web-platform 17/17 · web-customer 25/25 · api unit+e2e verdi · `pnpm -r typecheck` pulito.
- **Regola cross-file**: dopo OGNI task, INTERA suite del pacchetto toccato (`npx vitest run` da `apps/web-staff` include ui-kit; API: `npm test` + `npm run test:e2e` da `apps/api`), mai il solo spec.
- **Zero hex fuori da `theme.css`** (unica eccezione pre-esistente: `#EDE6D2` in map-scene.css). Solo token semantici.
- Vincoli dominio (ADR-0016): label ombrellone unica per stabilimento, buchi ammessi; `null` = Normale; **niente prezzi nell'editor**; guardie delete singole block-409 invariate. Bulk = «salta e riporta», MAI 409 sul batch.
- Tutto admin-only (`@Roles(Role.Admin)` — già a livello controller, invariato).
- Loading: skeleton con `useDelayedLoading`, `aria-busy` su wrapper NON-hidden, contenuto in `v-else-if` (mai `v-else` nudo).
- Contracts additivi; **nessuna migrazione DB**.
- Scratch SDD: prefisso `task-sc-N-*` in `.superpowers/sdd/`; `progress.md` va APPESO.
- Commit convention: `feat(api):` / `feat(ui-kit):` / `feat(web-staff):` / `docs():` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Contracts — tipi bulk

**Files:**
- Modify: `packages/contracts/src/index.ts` (dopo `GenerateUmbrellasResultDTO`, ~riga 602)

**Interfaces:**
- Produces: `BulkDeleteUmbrellasInput { ids: string[] }`, `BulkDeleteUmbrellasResultDTO { deleted: number; skipped: number }`, `BulkAssignUmbrellaTypeInput { ids: string[]; umbrellaTypeId: string | null }`, `BulkAssignUmbrellaTypeResultDTO { updated: number }` — usati da Task 2, 3, 4, 6, 10, 12.

- [ ] **Step 1: Aggiungi i tipi** — in `packages/contracts/src/index.ts`, subito dopo `GenerateUmbrellasResultDTO`:

```ts
/** Bulk-delete ombrelloni (Cantiere): elimina i non-prenotati, salta i protetti. Mai 409 sul batch. */
export interface BulkDeleteUmbrellasInput { ids: string[] }            // 1..200
export interface BulkDeleteUmbrellasResultDTO { deleted: number; skipped: number }
/** Bulk-assegnazione tipologia (null = Normale). */
export interface BulkAssignUmbrellaTypeInput { ids: string[]; umbrellaTypeId: string | null }
export interface BulkAssignUmbrellaTypeResultDTO { updated: number }
```

- [ ] **Step 2: Builda i contracts**

Run: `cd packages/contracts && npm run build`
Expected: exit 0, `dist/` aggiornato.

- [ ] **Step 3: Typecheck monorepo**

Run: `pnpm -r typecheck` (dalla root)
Expected: pulito sui 4 workspace.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): tipi bulk-delete e bulk-assign-type ombrelloni"
```

---

### Task 2: API — `POST /establishment/umbrellas/bulk-delete`

**Files:**
- Create: `apps/api/src/establishment/dto/bulk-delete-umbrellas.dto.ts`
- Modify: `apps/api/src/establishment/umbrellas.service.ts` (aggiungi metodo), `apps/api/src/establishment/umbrellas.controller.ts` (aggiungi route)
- Test: `apps/api/src/establishment/umbrellas.service.spec.ts` (aggiungi describe)

**Interfaces:**
- Consumes: tipi bulk dal Task 1; pattern `forTenant`/`TenantContext` esistenti.
- Produces: `UmbrellasService.bulkDelete(input: BulkDeleteUmbrellasInput): Promise<BulkDeleteUmbrellasResultDTO>`; route `POST /api/establishment/umbrellas/bulk-delete` (201).

- [ ] **Step 1: Scrivi i test che falliscono** — appendi in `umbrellas.service.spec.ts` (il mock `tx` di `makeService` va esteso con `umbrella.deleteMany`, `booking.groupBy`):

```ts
// nel factory makeService, estendi i mock:
//   umbrella: { ..., deleteMany: jest.fn() },
//   booking: { count: jest.fn(), groupBy: jest.fn() },

describe('bulkDelete', () => {
  it('elimina i non prenotati, salta i protetti e gli id estranei', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]); // u-3 estraneo/altro tenant: non trovato
    tx.booking.groupBy.mockResolvedValue([{ umbrellaId: 'u-2' }]);          // u-2 protetto da prenotazioni
    tx.umbrella.deleteMany.mockResolvedValue({ count: 1 });
    const res = await service.bulkDelete({ ids: ['u-1', 'u-2', 'u-3'] });
    expect(tx.umbrella.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1'] } } });
    expect(res).toEqual({ deleted: 1, skipped: 2 });
  });

  it('nessun eliminabile → deleteMany NON viene chiamato', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }]);
    tx.booking.groupBy.mockResolvedValue([{ umbrellaId: 'u-1' }]);
    const res = await service.bulkDelete({ ids: ['u-1'] });
    expect(tx.umbrella.deleteMany).not.toHaveBeenCalled();
    expect(res).toEqual({ deleted: 0, skipped: 1 });
  });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `cd apps/api && npx jest umbrellas.service.spec -t bulkDelete`
Expected: FAIL — `service.bulkDelete is not a function`.

- [ ] **Step 3: Implementa** — in `umbrellas.service.ts` (dopo `generate`), import dei tipi dal contract:

```ts
async bulkDelete(input: BulkDeleteUmbrellasInput): Promise<BulkDeleteUmbrellasResultDTO> {
  const tenantId = this.tenant.require();
  return this.prisma.forTenant(tenantId, async (tx) => {
    const found = await tx.umbrella.findMany({ where: { id: { in: input.ids } }, select: { id: true } });
    const foundIds = found.map((u) => u.id);
    const withBookings = await tx.booking.groupBy({ by: ['umbrellaId'], where: { umbrellaId: { in: foundIds } } });
    const protectedSet = new Set(withBookings.map((b) => b.umbrellaId));
    const deletable = foundIds.filter((id) => !protectedSet.has(id));
    if (deletable.length > 0) await tx.umbrella.deleteMany({ where: { id: { in: deletable } } });
    return { deleted: deletable.length, skipped: input.ids.length - deletable.length };
  });
}
```

DTO `dto/bulk-delete-umbrellas.dto.ts`:

```ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import type { BulkDeleteUmbrellasInput } from '@coralyn/contracts';

export class BulkDeleteUmbrellasDto implements BulkDeleteUmbrellasInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
```

Route in `umbrellas.controller.ts` (dopo `generate`):

```ts
@Post('bulk-delete')
bulkDelete(@Body() body: BulkDeleteUmbrellasDto): Promise<BulkDeleteUmbrellasResultDTO> {
  return this.umbrellas.bulkDelete(body);
}
```

- [ ] **Step 4: Verifica che passino**

Run: `cd apps/api && npx jest umbrellas.service.spec`
Expected: PASS (tutti, inclusi i pre-esistenti).

- [ ] **Step 5: Intera suite unit api**

Run: `cd apps/api && npm test`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/establishment
git commit -m "feat(api): bulk-delete ombrelloni con semantica salta-protetti"
```

---

### Task 3: API — `POST /establishment/umbrellas/bulk-assign-type`

**Files:**
- Create: `apps/api/src/establishment/dto/bulk-assign-umbrella-type.dto.ts`
- Modify: `umbrellas.service.ts`, `umbrellas.controller.ts`
- Test: `umbrellas.service.spec.ts`

**Interfaces:**
- Consumes: `assertType` privato esistente (422 se tipologia estranea); tipi Task 1.
- Produces: `UmbrellasService.bulkAssignType(input): Promise<BulkAssignUmbrellaTypeResultDTO>`; route `POST /api/establishment/umbrellas/bulk-assign-type` (201).

- [ ] **Step 1: Test che falliscono** — appendi (mock `tx.umbrella.updateMany: jest.fn()` nel factory):

```ts
describe('bulkAssignType', () => {
  it('assegna la tipologia agli id del tenant e riporta il conteggio', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue({ id: 'typ-1' });
    tx.umbrella.updateMany.mockResolvedValue({ count: 3 });
    const res = await service.bulkAssignType({ ids: ['u-1', 'u-2', 'u-3'], umbrellaTypeId: 'typ-1' });
    expect(tx.umbrella.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['u-1', 'u-2', 'u-3'] } }, data: { umbrellaTypeId: 'typ-1' },
    });
    expect(res).toEqual({ updated: 3 });
  });

  it('null = Normale: nessuna validazione tipologia, updateMany con null', async () => {
    const { service, tx } = makeService();
    tx.umbrella.updateMany.mockResolvedValue({ count: 2 });
    const res = await service.bulkAssignType({ ids: ['u-1', 'u-2'], umbrellaTypeId: null });
    expect(tx.umbrellaType.findUnique).not.toHaveBeenCalled();
    expect(res).toEqual({ updated: 2 });
  });

  it('422 se la tipologia è estranea', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.bulkAssignType({ ids: ['u-1'], umbrellaTypeId: 'typ-x' }))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.umbrella.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Verifica FAIL** — `npx jest umbrellas.service.spec -t bulkAssignType` → `bulkAssignType is not a function`.

- [ ] **Step 3: Implementa** — service:

```ts
async bulkAssignType(input: BulkAssignUmbrellaTypeInput): Promise<BulkAssignUmbrellaTypeResultDTO> {
  const tenantId = this.tenant.require();
  return this.prisma.forTenant(tenantId, async (tx) => {
    await this.assertType(tx, input.umbrellaTypeId);
    const res = await tx.umbrella.updateMany({
      where: { id: { in: input.ids } }, data: { umbrellaTypeId: input.umbrellaTypeId },
    });
    return { updated: res.count };
  });
}
```

DTO `dto/bulk-assign-umbrella-type.dto.ts`:

```ts
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateIf } from 'class-validator';
import type { BulkAssignUmbrellaTypeInput } from '@coralyn/contracts';

export class BulkAssignUmbrellaTypeDto implements BulkAssignUmbrellaTypeInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  @ValidateIf((o: BulkAssignUmbrellaTypeDto) => o.umbrellaTypeId !== null)
  @IsUUID()
  umbrellaTypeId!: string | null;
}
```

Controller:

```ts
@Post('bulk-assign-type')
bulkAssignType(@Body() body: BulkAssignUmbrellaTypeDto): Promise<BulkAssignUmbrellaTypeResultDTO> {
  return this.umbrellas.bulkAssignType(body);
}
```

- [ ] **Step 4: PASS su file + intera suite unit** — `npx jest umbrellas.service.spec` poi `npm test`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/establishment
git commit -m "feat(api): bulk-assign-type ombrelloni (null = Normale)"
```

---

### Task 4: API e2e — matrice bulk

**Files:**
- Create: `apps/api/test/establishment-umbrellas-bulk.e2e-spec.ts`

**Interfaces:**
- Consumes: helpers `createTestApp`, `createUser`, `login` (come `establishment-umbrellas.e2e-spec.ts`); route Task 2/3.

- [ ] **Step 1: Scrivi l'e2e** (stesso stile del file gemello: seed nel beforeAll, cleanup nell'afterAll):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { createTestApp } from './helpers/create-test-app';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['bulk.admin@e2e.test', 'bulk.staff@e2e.test'];

describe('Establishment umbrellas bulk (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let freeId: string;     // eliminabile
  let bookedId: string;   // protetto da booking
  let typeId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await createTestApp(moduleRef);
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'BULK A' } })).id;
    await createUser(prisma, { email: 'bulk.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'bulk.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'bulk.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'bulk.staff@e2e.test', 'pw-staff-1');

    await prisma.forTenant(s1, async (tx) => {
      const sector = await tx.sector.create({ data: { establishmentId: s1, name: 'Bulk', sortOrder: 1 } });
      const row = await tx.row.create({ data: { establishmentId: s1, sectorId: sector.id, label: 'F1', sortOrder: 1 } });
      typeId = (await tx.umbrellaType.create({ data: { establishmentId: s1, name: 'Gazebo', sortOrder: 1 } })).id;
      freeId = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'BK-1', logicalOrder: 1 } })).id;
      bookedId = (await tx.umbrella.create({ data: { establishmentId: s1, rowId: row.id, label: 'BK-2', logicalOrder: 2 } })).id;
    });
    // NOTA per l'implementer: crea una prenotazione minima su bookedId con gli helper/campi
    // usati da bookings.e2e-spec.ts (customer + timeSlot + booking confermata) — copia il seed
    // booking da lì, cambiando solo umbrellaId=bookedId.
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.booking.deleteMany({ where: { establishmentId: s1 } });
      await tx.customer.deleteMany({ where: { establishmentId: s1 } });
      await tx.umbrella.deleteMany({ where: { establishmentId: s1 } });
      await tx.timeSlot.deleteMany({ where: { establishmentId: s1 } });
      await tx.umbrellaType.deleteMany({ where: { establishmentId: s1 } });
      await tx.row.deleteMany({ where: { establishmentId: s1 } });
      await tx.sector.deleteMany({ where: { establishmentId: s1 } });
    });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('bulk-delete senza token → 401', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').send({ ids: [freeId] }).expect(401);
  });

  it('bulk-delete staff → 403', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(staffT)).send({ ids: [freeId] }).expect(403);
  });

  it('bulk-delete ids vuoto → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(adminT)).send({ ids: [] }).expect(400);
  });

  it('bulk-assign-type tipologia estranea → 422', async () => {
    await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-assign-type').set(...bearer(adminT))
      .send({ ids: [freeId], umbrellaTypeId: '00000000-0000-4000-8000-0000000000ff' }).expect(422);
  });

  it('bulk-assign-type admin → 201 { updated }', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-assign-type').set(...bearer(adminT))
      .send({ ids: [freeId, bookedId], umbrellaTypeId: typeId }).expect(201);
    expect(res.body).toEqual({ updated: 2 });
  });

  it('bulk-delete admin → 201: elimina il libero, salta il prenotato', async () => {
    const res = await request(app.getHttpServer()).post('/api/establishment/umbrellas/bulk-delete').set(...bearer(adminT))
      .send({ ids: [freeId, bookedId] }).expect(201);
    expect(res.body).toEqual({ deleted: 1, skipped: 1 });
    const struct = await request(app.getHttpServer()).get('/api/establishment/structure').set(...bearer(adminT)).expect(200);
    const labels = struct.body.sectors.flatMap((s: { rows: { umbrellas: { label: string }[] }[] }) => s.rows.flatMap((r) => r.umbrellas.map((u) => u.label)));
    expect(labels).not.toContain('BK-1');
    expect(labels).toContain('BK-2');
  });
});
```

- [ ] **Step 2: Completa il seed booking** copiando il pattern da `bookings.e2e-spec.ts` (beforeAll: customer + timeSlot + booking su `bookedId`) — il blocco NOTA sopra sparisce.

- [ ] **Step 3: Esegui l'e2e**

Run: `cd apps/api && npm run test:e2e -- establishment-umbrellas-bulk`
Expected: PASS. Poi **intera** e2e: `npm run test:e2e` → verde.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/establishment-umbrellas-bulk.e2e-spec.ts
git commit -m "test(api): e2e matrice bulk-delete/bulk-assign-type"
```

---

### Task 5: ui-kit — `UmbrellaCell` con resa «rest»

**Files:**
- Modify: `packages/ui-kit/src/components/UmbrellaCell.vue`
- Test: `packages/ui-kit/src/components/UmbrellaCell.spec.ts` (aggiungi casi)

**Interfaces:**
- Produces: `slotStates?: readonly SlotState[] | null` (omesso/null → «rest»: fill `var(--color-warm-025)`, ink `var(--color-ink-700)`); expose `rest` computed per i test. API invariata per i chiamanti mappa (che passano sempre `slotStates`).

- [ ] **Step 1: Test che falliscono** — appendi allo spec esistente:

```ts
it('senza slotStates → resa «rest»: fill sabbia neutra e ink editor', () => {
  const w = mount(UmbrellaCell, { props: { label: 'A1', ariaLabel: 'Ombrellone A1' } });
  expect(w.vm.rest).toBe(true);
  expect(w.vm.fills).toEqual(['var(--color-warm-025)']);
});

it('slotStates presente → rest false, resa stato invariata', () => {
  const w = mount(UmbrellaCell, { props: { label: 'A1', ariaLabel: 'x', slotStates: ['free', 'daily'] } });
  expect(w.vm.rest).toBe(false);
  expect(w.vm.fills).toEqual(['var(--color-state-free)', 'var(--color-state-daily)']);
});
```

- [ ] **Step 2: FAIL** — `cd packages/ui-kit && npx vitest run src/components/UmbrellaCell.spec.ts` → type error/`rest` undefined.

- [ ] **Step 3: Implementa** — nello `<script setup>` di `UmbrellaCell.vue` sostituisci props e computed:

```ts
const props = withDefaults(defineProps<{
  label: string;
  ariaLabel: string;
  /** Omesso/null = resa «rest» (editor struttura): niente stati, sabbia neutra. */
  slotStates?: readonly SlotState[] | null;
  typeIcon?: string | null;
  selected?: boolean;
  dimmed?: boolean;
  found?: boolean;
}>(), { slotStates: null, selected: false, dimmed: false, found: false });

const rest = computed(() => props.slotStates == null);
const states = computed<readonly SlotState[]>(() => (props.slotStates?.length ? props.slotStates : ['free']));
const uniform = computed(() => states.value.every((s) => s === states.value[0]));
const fills = computed<string[]>(() =>
  rest.value ? ['var(--color-warm-025)']
  : uniform.value ? [fill[states.value[0]]] : states.value.map((s) => fill[s]),
);
const color = computed(() =>
  rest.value ? 'var(--color-ink-700)' : uniform.value ? ink[states.value[0]] : 'var(--color-text)',
);

defineExpose({ uniform, fills, rest });
```

(Template invariato: le colonne rendono un solo fill in rest; glare/shadow/selezione/badge restano identici.)

- [ ] **Step 4: PASS spec cella, poi intera suite web-staff** (include ui-kit): `cd apps/web-staff && npx vitest run` → 501+ verdi. Typecheck: `npm run typecheck` in ui-kit e web-staff.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/UmbrellaCell.vue packages/ui-kit/src/components/UmbrellaCell.spec.ts
git commit -m "feat(ui-kit): UmbrellaCell resa «rest» per l'editor struttura (slotStates opzionale)"
```

---

### Task 6: FE data-layer — mutation bulk + invalidazione overview

**Files:**
- Modify: `apps/web-staff/src/features/establishment/useEstablishmentStructure.ts`

**Interfaces:**
- Consumes: `queryKeys.establishmentOverview(tenantId)` (esiste in `@/lib/queryKeys` riga 23); endpoint Task 2/3.
- Produces: `useBulkDeleteUmbrellas()` → mutation `{ ids }` → `BulkDeleteUmbrellasResultDTO`; `useBulkAssignUmbrellaType()` → mutation `{ ids, umbrellaTypeId }` → `BulkAssignUmbrellaTypeResultDTO`. TUTTE le mutation del file (14 esistenti + 2 nuove) invalidano `[establishmentStructure, establishmentOverview]`.

- [ ] **Step 1: Estrai l'helper e applica a tutte le mutation** — in cima al file:

```ts
function structureKeys(establishmentId: string) {
  return [queryKeys.establishmentStructure(establishmentId), queryKeys.establishmentOverview(establishmentId)];
}
```

Sostituisci in TUTTE le mutation esistenti `invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)]` con `invalidates: () => structureKeys(session.establishmentId)`. Poi aggiungi in coda:

```ts
export function useBulkDeleteUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkDeleteUmbrellasInput) =>
      apiFetch<BulkDeleteUmbrellasResultDTO>('/establishment/umbrellas/bulk-delete', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useBulkAssignUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkAssignUmbrellaTypeInput) =>
      apiFetch<BulkAssignUmbrellaTypeResultDTO>('/establishment/umbrellas/bulk-assign-type', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}
```

(Aggiorna l'import dei tipi dal contract.)

- [ ] **Step 2: Suite + typecheck** — `cd apps/web-staff && npx vitest run && npm run typecheck` → verdi (nessun comportamento osservabile cambia negli spec attuali; l'invalidazione overview è coperta dalla verifica LIVE finale).

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/features/establishment/useEstablishmentStructure.ts
git commit -m "feat(web-staff): mutation bulk + invalidazione overview su tutte le mutation struttura"
```

---

### Task 7: FE — `structure-scene.css` + `StructureScene`/`StructureRow` (presentazionali)

**Files:**
- Create: `apps/web-staff/src/styles/structure-scene.css`, `apps/web-staff/src/features/establishment/StructureScene.vue`, `apps/web-staff/src/features/establishment/StructureRow.vue`
- Modify: `apps/web-staff/src/styles/map-scene.css` (solo il commento di testa: ora la usano MapView E l'editor struttura)
- Test: `apps/web-staff/src/features/establishment/StructureScene.spec.ts`

**Interfaces:**
- Consumes: classi `.map-stage/.map-scroll/.map-sea/.map-sea-veil/.map-shore/.map-toolbar/.map-row-in` da map-scene.css; `UmbrellaCell` rest (Task 5); tipi `StructureSectorDTO/StructureRowDTO` dai contracts.
- Produces (contratto per Task 8-13):

```ts
// StructureScene.vue — props
{ sectors: StructureSectorDTO[]; selectedSectorId: string | null;
  selection: Selection; selectMode: boolean; isAdmin: boolean }
// Selection = { kind: 'beach' } | { kind: 'sector'; id: string } | { kind: 'row'; id: string }
//   | { kind: 'umbrella'; id: string } | { kind: 'multi'; ids: string[] }
//   | { kind: 'create-sector' } | { kind: 'create-row'; sectorId: string } | { kind: 'create-umbrella'; rowId: string }
// (il tipo Selection vive in un nuovo file structureSelection.ts esportato dalla feature)
// StructureScene — emits
'select-sector'(id) · 'create-sector'() · 'select-row'(id) · 'create-row'(sectorId)
'select-umbrella'(id, additive: boolean) · 'create-umbrella'(rowId) · 'select-beach'()
'toggle-select-mode'() · azioni rapide rail: 'row-generate'(id) · 'row-danger'(id)
```

- [ ] **Step 1: Crea `structureSelection.ts`**:

```ts
export type Selection =
  | { kind: 'beach' }
  | { kind: 'sector'; id: string }
  | { kind: 'row'; id: string }
  | { kind: 'umbrella'; id: string }
  | { kind: 'multi'; ids: string[] }
  | { kind: 'create-sector' }
  | { kind: 'create-row'; sectorId: string }
  | { kind: 'create-umbrella'; rowId: string };
```

- [ ] **Step 2: Test che falliscono** — `StructureScene.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StructureScene from './StructureScene.vue';
import type { StructureSectorDTO } from '@coralyn/contracts';

const SECTORS: StructureSectorDTO[] = [
  { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
    { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
      { id: 'u-1', label: 'A1', umbrellaTypeId: null },
      { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' },
    ] },
  ] },
  { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
];
const base = { sectors: SECTORS, types: [], selectedSectorId: 's-1', selection: { kind: 'beach' } as const, selectMode: false, isAdmin: true };

describe('StructureScene', () => {
  it('rende tab settori con conteggio posti e celle della fila', () => {
    const w = mount(StructureScene, { props: base });
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('2 posti');
    expect(w.findAll('[data-testid="scene-cell"]')).toHaveLength(2);
    expect(w.text()).toContain('FILA');
  });

  it('click cella → select-umbrella; shift+click → additive true', async () => {
    const w = mount(StructureScene, { props: base });
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    expect(w.emitted('select-umbrella')![0]).toEqual(['u-1', false]);
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    expect(w.emitted('select-umbrella')![1]).toEqual(['u-2', true]);
  });

  it('ghost: cella + → create-umbrella(rowId); fascia → create-row(sectorId); tab + → create-sector', async () => {
    const w = mount(StructureScene, { props: base });
    await w.find('[data-testid="ghost-cell"]').trigger('click');
    expect(w.emitted('create-umbrella')![0]).toEqual(['r-1']);
    await w.find('[data-testid="ghost-row"]').trigger('click');
    expect(w.emitted('create-row')![0]).toEqual(['s-1']);
    await w.find('[data-testid="ghost-sector"]').trigger('click');
    expect(w.emitted('create-sector')).toBeTruthy();
  });

  it('staff (isAdmin false): niente ghost né toggle Seleziona', () => {
    const w = mount(StructureScene, { props: { ...base, isAdmin: false } });
    expect(w.find('[data-testid="ghost-cell"]').exists()).toBe(false);
    expect(w.find('[data-testid="ghost-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="select-mode"]').exists()).toBe(false);
  });

  it('selezione: cella selected, multi evidenzia tutte le sue celle', () => {
    const w = mount(StructureScene, { props: { ...base, selection: { kind: 'multi', ids: ['u-1', 'u-2'] } } });
    const pressed = w.findAll('[data-testid="scene-cell"] button[aria-pressed="true"]');
    expect(pressed).toHaveLength(2);
  });
});
```

- [ ] **Step 3: FAIL** — `npx vitest run src/features/establishment/StructureScene.spec.ts` → componente inesistente.

- [ ] **Step 4: Implementa `structure-scene.css`** (import in `StructureScene.vue`; SOLO classi editor-specifiche — i mattoni Riva vengono da map-scene.css):

```css
/* Scena «Cantiere» dell'editor struttura (spec 2026-07-22-struttura-cantiere §4).
   Riusa i mattoni Riva di map-scene.css (mare/bagnasciuga/stage/toolbar);
   qui SOLO le classi editor-specifiche. Token Coralyn, nessun hex nuovo. */
.st-sand { padding: 20px 22px 30px; }
.st-sector-cap { display: flex; align-items: center; gap: 10px; margin: 2px 0 14px; }
.st-sector-cap .st-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--color-stage-1); }
.st-sector-cap .st-sub { font-size: 11.5px; color: var(--color-text-muted); }
.st-row { display: grid; grid-template-columns: 92px 1fr; gap: 14px; align-items: start; padding: 10px 8px; margin: 0 -8px; border-radius: var(--radius-md); }
.st-row + .st-row { margin-top: 6px; }
.st-row:hover { background: color-mix(in srgb, var(--color-warm-000) 42%, transparent); }
.st-row-sel { background: color-mix(in srgb, var(--color-warm-000) 62%, transparent); box-shadow: inset 0 0 0 1.5px var(--color-brand); }
.st-rail-name { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--color-stage-1); }
.st-rail-name:hover { color: var(--color-brand-ink); }
.st-rail-count { font-size: 11px; color: var(--color-text-muted); margin-top: 3px; font-variant-numeric: tabular-nums; }
.st-rail-actions { display: flex; gap: 4px; margin-top: 7px; opacity: 0; transition: opacity var(--motion-fast) var(--ease-standard); }
.st-row:hover .st-rail-actions, .st-row-sel .st-rail-actions { opacity: 1; }
.st-cells { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; }
.st-ghost-cell { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; border: 1.5px dashed var(--color-border-input); background: transparent; color: var(--color-placeholder); font-size: 16px; }
.st-ghost-cell:hover { border-color: var(--color-brand); color: var(--color-brand-ink); background: var(--color-coral-050); }
.st-ghost-row { margin: 14px -8px 0; padding: 13px 8px; width: calc(100% + 16px); border: 1.5px dashed var(--color-border-input); border-radius: var(--radius-md); display: flex; align-items: center; gap: 9px; color: var(--color-text-muted); font-size: 12.5px; font-weight: 600; background: transparent; }
.st-ghost-row:hover { border-color: var(--color-brand); color: var(--color-brand-ink); background: color-mix(in srgb, var(--color-coral-050) 65%, transparent); }
@media (prefers-reduced-motion: reduce) { .st-rail-actions { transition: none !important; } }
```

- [ ] **Step 5: Implementa `StructureRow.vue`**:

```vue
<script setup lang="ts">
import { UmbrellaCell, IconButton } from '@coralyn/ui-kit';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import type { Selection } from './structureSelection';

const props = defineProps<{
  row: StructureRowDTO;
  sectorName: string;
  types: UmbrellaTypeDTO[];
  selection: Selection;
  isAdmin: boolean;
}>();
const emit = defineEmits<{
  'select-row': [id: string];
  'select-umbrella': [id: string, additive: boolean];
  'create-umbrella': [rowId: string];
  'row-generate': [id: string];
  'row-danger': [id: string];
}>();

function typeIcon(umbrellaTypeId: string | null): string | null {
  if (!umbrellaTypeId) return null;
  return props.types.find((t) => t.id === umbrellaTypeId)?.icon ?? 'umbrella';
}
function isSelected(id: string): boolean {
  const s = props.selection;
  return (s.kind === 'umbrella' && s.id === id) || (s.kind === 'multi' && s.ids.includes(id));
}
const rowSelected = (): boolean => props.selection.kind === 'row' && props.selection.id === props.row.id;
</script>

<template>
  <div class="st-row" :class="rowSelected() ? 'st-row-sel' : ''" data-testid="scene-row">
    <div class="pt-[7px]">
      <button type="button" class="st-rail-name focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :aria-label="`Fila ${row.label}, settore ${sectorName}`" @click="emit('select-row', row.id)">{{ row.label }}</button>
      <div class="st-rail-count">{{ row.umbrellas.length }} {{ row.umbrellas.length === 1 ? 'ombrellone' : 'ombrelloni' }}</div>
      <div v-if="isAdmin" class="st-rail-actions">
        <IconButton icon="zap" label="Genera ombrelloni" variant="ghost" size="sm" data-testid="rail-generate" @click="emit('row-generate', row.id)" />
        <IconButton icon="trash-2" label="Svuota o elimina fila" variant="danger" size="sm" data-testid="rail-danger" @click="emit('row-danger', row.id)" />
      </div>
    </div>
    <div class="st-cells">
      <span v-for="u in row.umbrellas" :key="u.id" data-testid="scene-cell">
        <UmbrellaCell :label="u.label" :aria-label="`Ombrellone ${u.label}, fila ${row.label}, settore ${sectorName}`"
          :type-icon="typeIcon(u.umbrellaTypeId)" :selected="isSelected(u.id)"
          @select="emit('select-umbrella', u.id, ($event as MouseEvent | undefined)?.shiftKey ?? false)" />
      </span>
      <button v-if="isAdmin" type="button" class="st-ghost-cell focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        data-testid="ghost-cell" :aria-label="`Aggiungi ombrellone alla fila ${row.label}`" @click="emit('create-umbrella', row.id)">+</button>
      <p v-if="row.umbrellas.length === 0" class="py-1 text-xs text-[var(--color-text-muted)]">Nessun ombrellone: aggiungi col «+» o genera dalla fila.</p>
    </div>
  </div>
</template>
```

**Nota per l'implementer:** `UmbrellaCell` emette `select` senza payload — per lo shift serve il MouseEvent nativo. Se `$event` risulta `undefined`, aggiungi in `UmbrellaCell.vue` l'inoltro dell'evento (`@click="$emit('select', $event)"` e firma emit `select: [ev?: MouseEvent]`, retro-compatibile) nello stesso task, con un caso di spec in ui-kit.

- [ ] **Step 6: Implementa `StructureScene.vue`**:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { StructureSectorDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import StructureRow from './StructureRow.vue';
import type { Selection } from './structureSelection';
import '@/styles/map-scene.css';
import '@/styles/structure-scene.css';

const props = defineProps<{
  sectors: StructureSectorDTO[];
  types: UmbrellaTypeDTO[];
  selectedSectorId: string | null;
  selection: Selection;
  selectMode: boolean;
  isAdmin: boolean;
}>();
const emit = defineEmits<{
  'select-sector': [id: string]; 'create-sector': [];
  'select-row': [id: string]; 'create-row': [sectorId: string];
  'select-umbrella': [id: string, additive: boolean]; 'create-umbrella': [rowId: string];
  'select-beach': []; 'toggle-select-mode': [];
  'row-generate': [id: string]; 'row-danger': [id: string];
}>();

const current = computed(() => props.sectors.find((s) => s.id === props.selectedSectorId) ?? props.sectors[0] ?? null);
const seats = (s: StructureSectorDTO): number => s.rows.reduce((n, r) => n + r.umbrellas.length, 0);
</script>

<template>
  <div class="map-stage flex min-h-[560px] flex-col overflow-hidden">
    <div class="map-sea" aria-hidden="true">
      <span class="map-sea-veil"></span><span class="map-sea-veil"></span><span class="map-sea-veil"></span>
      <span class="absolute right-3.5 top-2 text-[10px] font-bold tracking-[.14em] text-[var(--color-sea-ink)]">MARE</span>
    </div>
    <div class="map-shore" aria-hidden="true"></div>
    <div class="map-toolbar flex items-center gap-2 px-4 py-2.5" role="tablist" aria-label="Settori">
      <button v-for="s in sectors" :key="s.id" type="button" role="tab" :aria-selected="current?.id === s.id"
        class="rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :class="current?.id === s.id ? 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'border-transparent text-[var(--color-text-2nd)]'"
        @click="emit('select-sector', s.id)">
        {{ s.name }} <span class="ml-1 text-[11.5px] font-semibold text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">{{ seats(s) }} posti</span>
      </button>
      <button v-if="isAdmin" type="button" data-testid="ghost-sector"
        class="rounded-full border-[1.5px] border-dashed border-[var(--color-border-input)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-text-muted)] hover:border-[var(--color-brand)] hover:bg-[var(--color-coral-050)] hover:text-[var(--color-brand-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        @click="emit('create-sector')">+ Settore</button>
      <button v-if="isAdmin" type="button" data-testid="select-mode" :aria-pressed="selectMode"
        class="ml-auto rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        :class="selectMode ? 'border-[var(--color-brand)] bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]' : 'border-[var(--color-border-input)] bg-[var(--color-surface)] text-[var(--color-text-2nd)]'"
        @click="emit('toggle-select-mode')">Seleziona</button>
    </div>
    <div class="st-sand flex-1 overflow-auto" data-testid="scene-sand" @click.self="emit('select-beach')">
      <template v-if="current">
        <div class="st-sector-cap">
          <span class="st-eyebrow">{{ current.name }} · {{ current.kind === 'special' ? 'speciali' : 'griglia' }}</span>
          <span class="st-sub">{{ current.rows.length }} file · {{ seats(current) }} ombrelloni · le file più in alto sono più vicine al mare</span>
        </div>
        <StructureRow v-for="r in current.rows" :key="r.id" class="map-row-in" :row="r" :sector-name="current.name"
          :types="types" :selection="selection" :is-admin="isAdmin"
          @select-row="(id) => emit('select-row', id)" @select-umbrella="(id, add) => emit('select-umbrella', id, add)"
          @create-umbrella="(rid) => emit('create-umbrella', rid)"
          @row-generate="(id) => emit('row-generate', id)" @row-danger="(id) => emit('row-danger', id)" />
        <button v-if="isAdmin" type="button" class="st-ghost-row focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          data-testid="ghost-row" @click="emit('create-row', current.id)">
          <span class="grid size-6 place-items-center rounded-[8px] border-[1.5px] border-dashed border-current text-sm">+</span>
          Nuova fila — etichetta e, se vuoi, genera subito gli ombrelloni
        </button>
      </template>
    </div>
  </div>
</template>
```

Aggiorna il commento di testa di `map-scene.css`: «Feature-scoped: la usano MapView e l'editor Struttura (Cantiere)».

- [ ] **Step 7: PASS spec scena, poi intera suite + typecheck** — `npx vitest run` da `apps/web-staff` → verdi.

- [ ] **Step 8: Commit**

```bash
git add apps/web-staff/src/features/establishment apps/web-staff/src/styles
git commit -m "feat(web-staff): scena Cantiere (StructureScene/StructureRow, riuso mattoni Riva)"
```

---

### Task 8: FE — shell `EstablishmentStructureView` + `BeachPanel` (riscrittura)

> **ATTENZIONE — riscrittura in stadi:** da questo task la vista abbandona il vecchio impianto
> (liste+5 modali). Il vecchio `EstablishmentStructureView.spec.ts` viene SOSTITUITO da spec nuovi
> per stadio; la parità funzionale completa torna col Task 11 e viene verificata nel Task 15.
> Fino ad allora la feature branch NON è mergiabile — è il funzionamento atteso del piano.

**Files:**
- Rewrite: `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`
- Create: `apps/web-staff/src/features/establishment/panels/BeachPanel.vue`, `apps/web-staff/src/features/establishment/structure.fixtures.ts`
- Rewrite: `apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts`

**Interfaces:**
- Consumes: `StructureScene` (Task 7), `Selection` da `structureSelection.ts`, `useMediaQuery` da `@/lib/useMediaQuery` (`'(min-width: 1024px)'`), `Drawer` ui-kit (`title` prop + `v-model:open`), primitivi `Skeleton`, `useDelayedLoading`.
- Produces (contratto per i pannelli, Task 9-13): ogni pannello riceve le prop indicate nel suo task ed emette `close: []` (la shell riporta `selection = { kind: 'beach' }`). La shell espone ai pannelli l'albero `data` (query) e la selezione corrente.

- [ ] **Step 1: Crea le fixture MSW condivise** — `structure.fixtures.ts`:

```ts
import type { EstablishmentStructureDTO } from '@coralyn/contracts';

/** Albero base per gli spec del Cantiere: 2 settori, 1 fila, 2 ombrelloni, 1 tipologia. */
export const STRUCTURE_FIXTURE: EstablishmentStructureDTO = {
  sectors: [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
      { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'u-1', label: 'A1', umbrellaTypeId: null },
        { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' },
      ] },
    ] },
    { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
  ],
  umbrellaTypes: [{ id: 'typ-1', name: 'Gazebo', sortOrder: 1, icon: 'palmtree' }],
};

export const EMPTY_STRUCTURE: EstablishmentStructureDTO = { sectors: [], umbrellaTypes: [] };
```

- [ ] **Step 2: Riscrivi lo spec della vista** (stadio 1 — shell+beach). Sostituisci l'intero file con:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import EstablishmentStructureView from './EstablishmentStructureView.vue';
import { STRUCTURE_FIXTURE } from './structure.fixtures';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const useFixture = () => server.use(http.get('/api/establishment/structure', () => HttpResponse.json(STRUCTURE_FIXTURE)));

describe('EstablishmentStructureView — shell Cantiere', () => {
  it('rende scena + ispettore Spiaggia di default (contatori e tipologie)', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle();
    expect(w.find('[data-testid="scene-sand"]').exists()).toBe(true);
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('Spiaggia');
    expect(insp.text()).toContain('Gazebo');
    expect(w.text()).toContain('2 settori');
    expect(w.text()).toContain('2 ombrelloni');
  });

  it('click su una cella → pannello Ombrellone col crumb; click sabbia → torna a Spiaggia', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    expect(w.find('[data-testid="inspector"]').text()).toContain('A1');
    await w.find('[data-testid="scene-sand"]').trigger('click');
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia');
  });

  it('tipologie: crea inline dal pannello Spiaggia (POST + refetch)', async () => {
    useFixture();
    let posted: unknown = null;
    server.use(http.post('/api/establishment/umbrella-types', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ id: 'typ-2', name: 'Lettino', sortOrder: 2, icon: 'umbrella' });
    }));
    const w = mountApp(EstablishmentStructureView);
    await settle();
    await w.find('[data-testid="type-new"]').trigger('click');
    await w.find('[data-testid="type-name"]').setValue('Lettino');
    await w.find('[data-testid="type-save"]').trigger('submit');
    await settle();
    expect(posted).toEqual({ name: 'Lettino', icon: 'umbrella' });
  });
});
```

- [ ] **Step 3: FAIL** — `npx vitest run src/features/establishment/EstablishmentStructureView.spec.ts`.

- [ ] **Step 4: Implementa `BeachPanel.vue`** (stats + tipologie CRUD inline; usa le mutation tipologie esistenti):

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, IconButton, Icon, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { EstablishmentStructureDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType } from '../useEstablishmentStructure';

const props = defineProps<{ data: EstablishmentStructureDTO; isAdmin: boolean }>();

const counts = computed(() => {
  const rows = props.data.sectors.reduce((n, s) => n + s.rows.length, 0);
  const umbrellas = props.data.sectors.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: props.data.sectors.length, rows, umbrellas, types: props.data.umbrellaTypes.length };
});

const createType = useCreateUmbrellaType();
const updateType = useUpdateUmbrellaType();
const removeType = useDeleteUmbrellaType();

const editing = ref<'new' | string | null>(null); // null = lista; 'new' | id = form inline
const name = ref('');
const icon = ref<'umbrella' | 'leaf' | 'palmtree'>('umbrella');
function openNew() { editing.value = 'new'; name.value = ''; icon.value = 'umbrella'; }
function openEdit(t: UmbrellaTypeDTO) { editing.value = t.id; name.value = t.name; icon.value = (t.icon as typeof icon.value) ?? 'umbrella'; }
function submit() {
  const n = name.value.trim();
  if (!n) return;
  const done = { onSuccess: () => { pushToast(editing.value === 'new' ? 'Tipologia creata.' : 'Tipologia aggiornata.'); editing.value = null; } };
  if (editing.value === 'new') createType.mutate({ name: n, icon: icon.value }, done);
  else if (editing.value) updateType.mutate({ id: editing.value, name: n, icon: icon.value }, done);
}
const saving = computed(() => createType.isPending.value || updateType.isPending.value);

const deleting = ref<UmbrellaTypeDTO | null>(null);
function confirmDelete() {
  if (!deleting.value) return;
  removeType.mutate(deleting.value.id, { onSuccess: () => pushToast('Tipologia eliminata.') });
  deleting.value = null;
}
</script>

<template>
  <div>
    <div class="px-[18px] pb-3 pt-3.5 border-b border-[var(--color-border-row)]">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ispettore</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">Spiaggia</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <div class="grid grid-cols-2 gap-2">
        <div v-for="(v, k) in { Settori: counts.sectors, File: counts.rows, Ombrelloni: counts.umbrellas, Tipologie: counts.types }" :key="k"
          class="rounded-[var(--radius-md)] border border-[var(--color-border-row)] bg-[var(--color-surface)] px-3 py-2.5">
          <b class="block text-[18px] font-extrabold [font-variant-numeric:tabular-nums]">{{ v }}</b>
          <span class="text-[11px] text-[var(--color-text-muted)]">{{ k }}</span>
        </div>
      </div>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Tipologie</span>
          <Button v-if="isAdmin && editing === null" data-testid="type-new" variant="secondary" size="sm" @click="openNew"><Icon name="plus" :size="13" />Nuova</Button>
        </div>
        <form v-if="editing !== null" data-testid="type-save" class="flex flex-col gap-3" @submit.prevent="submit">
          <Field label="Nome"><Input name="type-name" data-testid="type-name" v-model="name" placeholder="es. Gazebo" /></Field>
          <Field label="Icona sulla mappa">
            <Select v-model="icon" data-testid="type-icon">
              <option value="umbrella">Ombrellone</option><option value="leaf">Paglia</option><option value="palmtree">Palma</option>
            </Select>
          </Field>
          <div class="flex justify-end gap-2">
            <Button variant="secondary" type="button" size="sm" @click="editing = null">Annulla</Button>
            <Button type="submit" size="sm" :loading="saving">Salva</Button>
          </div>
        </form>
        <div v-else class="flex flex-col">
          <div v-for="t in data.umbrellaTypes" :key="t.id" data-testid="type-row" class="flex items-center gap-2.5 border-b border-[var(--color-border-row)] py-2 last:border-0">
            <span class="grid size-7 place-items-center rounded-[9px] bg-[var(--color-raised)] text-[var(--color-text-2nd)]"><Icon :name="t.icon ?? 'umbrella'" :size="14" /></span>
            <span class="flex-1 text-[12.5px] font-bold">{{ t.name }}</span>
            <template v-if="isAdmin">
              <IconButton icon="edit" label="Modifica tipologia" variant="ghost" size="sm" data-testid="type-edit" @click="openEdit(t)" />
              <IconButton icon="trash-2" label="Elimina tipologia" variant="danger" size="sm" data-testid="type-delete" @click="deleting = t" />
            </template>
          </div>
          <p v-if="data.umbrellaTypes.length === 0" class="py-1.5 text-[12px] text-[var(--color-text-muted)]">Nessuna tipologia.</p>
        </div>
        <p class="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Classificano l'ombrellone (icona sulla Mappa), non ne fissano il prezzo. «Normale» è la predefinita.</p>
      </div>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <p class="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Clicca un settore, una fila o un ombrellone nella scena per modificarlo. Le forme tratteggiate creano.</p>
    </div>
    <ConfirmDialog :open="deleting !== null" @update:open="(v: boolean) => { if (!v) deleting = null; }"
      title="Eliminare definitivamente?" :description="`«${deleting?.name}» verrà rimossa dal catalogo. Se è in uso da ombrelloni non sarà eliminata.`"
      confirm-label="Elimina" tone="danger" @confirm="confirmDelete" />
  </div>
</template>
```

- [ ] **Step 5: Riscrivi la shell `EstablishmentStructureView.vue`**:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, Drawer, Skeleton, EmptyState, useDelayedLoading } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useEstablishmentStructure } from './useEstablishmentStructure';
import StructureScene from './StructureScene.vue';
import BeachPanel from './panels/BeachPanel.vue';
import type { Selection } from './structureSelection';

const session = useSessionStore();
const router = useRouter();
const isAdmin = computed(() => session.role === Role.Admin);
const { data, isLoading } = useEstablishmentStructure();
const skeletonVisible = useDelayedLoading(() => isLoading.value);

const selection = ref<Selection>({ kind: 'beach' });
const selectMode = ref(false);
const selectedSectorId = ref<string | null>(null);
watch(() => data.value?.sectors, (sectors) => {
  if (!selectedSectorId.value && sectors?.length) selectedSectorId.value = sectors[0].id;
}, { immediate: true });

const counts = computed(() => {
  const s = data.value?.sectors ?? [];
  const rows = s.reduce((n, x) => n + x.rows.length, 0);
  const umbrellas = s.reduce((n, x) => n + x.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: s.length, rows, umbrellas, types: data.value?.umbrellaTypes.length ?? 0 };
});

const isDesktop = useMediaQuery('(min-width: 1024px)');
const drawerOpen = computed({
  get: () => !isDesktop.value && selection.value.kind !== 'beach',
  set: (v: boolean) => { if (!v) selection.value = { kind: 'beach' }; },
});

function onSelectSector(id: string) { selectedSectorId.value = id; selection.value = { kind: 'sector', id }; }
function onSelectUmbrella(id: string, additive: boolean) {
  if (selectMode.value || additive) {
    const ids = selection.value.kind === 'multi' ? [...selection.value.ids] : selection.value.kind === 'umbrella' ? [selection.value.id] : [];
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    selection.value = next.length === 0 ? { kind: 'beach' } : next.length === 1 ? { kind: 'umbrella', id: next[0] } : { kind: 'multi', ids: next };
    if (additive && !selectMode.value) selectMode.value = true;
  } else selection.value = { kind: 'umbrella', id };
}
function reset() { selection.value = { kind: 'beach' }; selectMode.value = false; }
function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value && selection.value.kind === 'multi') selection.value = { kind: 'beach' };
}
</script>

<template>
  <section class="flex h-full flex-col px-[26px] pb-[30px] pt-[22px]">
    <button class="mb-3 flex items-center gap-1 self-start text-[13px] font-semibold text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="router.push('/establishment')">
      <Icon name="chevron-left" :size="15" />Stabilimento
    </button>
    <div class="mb-4 flex items-baseline gap-3.5">
      <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">Struttura della spiaggia</h2>
      <span v-if="data" class="text-[12.5px] text-[var(--color-text-muted)] [font-variant-numeric:tabular-nums]">
        {{ counts.sectors }} settori · {{ counts.rows }} file · {{ counts.umbrellas }} ombrelloni · {{ counts.types }} tipologie
      </span>
    </div>

    <div v-if="skeletonVisible" aria-busy="true" class="flex flex-col gap-3">
      <Skeleton variant="block" height="56px" />
      <Skeleton variant="block" height="380px" />
    </div>

    <EmptyState v-else-if="!isLoading && !data" message="Struttura non disponibile." />

    <div v-else-if="data" class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] lg:grid-cols-[1fr_320px]">
      <StructureScene :sectors="data.sectors" :types="data.umbrellaTypes" :selected-sector-id="selectedSectorId"
        :selection="selection" :select-mode="selectMode" :is-admin="isAdmin"
        @select-sector="onSelectSector" @create-sector="selection = { kind: 'create-sector' }"
        @select-row="(id) => selection = { kind: 'row', id }" @create-row="(sid) => selection = { kind: 'create-row', sectorId: sid }"
        @select-umbrella="onSelectUmbrella" @create-umbrella="(rid) => selection = { kind: 'create-umbrella', rowId: rid }"
        @select-beach="reset" @toggle-select-mode="toggleSelectMode"
        @row-generate="(id) => selection = { kind: 'row', id }" @row-danger="(id) => selection = { kind: 'row', id }" />

      <aside v-if="isDesktop" data-testid="inspector" class="min-w-0 overflow-auto border-l border-[var(--color-border)] bg-[var(--color-raised)]" aria-label="Ispettore">
        <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
        <!-- I pannelli Settore/Fila/Ombrellone/Multi/Create arrivano nei Task 9-12 -->
        <div v-else class="p-[18px] text-[12.5px] text-[var(--color-text-muted)]" data-testid="panel-placeholder">{{ selection.kind }}</div>
      </aside>
      <Drawer v-else v-model:open="drawerOpen" title="Ispettore">
        <div data-testid="inspector">
          <BeachPanel v-if="selection.kind === 'beach'" :data="data" :is-admin="isAdmin" />
          <div v-else class="p-[18px] text-[12.5px] text-[var(--color-text-muted)]" data-testid="panel-placeholder">{{ selection.kind }}</div>
        </div>
      </Drawer>
    </div>
  </section>
</template>
```

**Nota:** il placeholder `panel-placeholder` è temporaneo e sparisce col Task 12; il crumb «A1» del test dello Step 2 passa perché il placeholder mostra `selection.kind`… NO — il test chiede «A1»: per lo stadio 1 il placeholder mostra `selection.kind === 'umbrella' ? etichetta : selection.kind` — implementa così:

```ts
const placeholderLabel = computed(() => {
  const s = selection.value;
  if (s.kind !== 'umbrella' || !data.value) return s.kind;
  for (const sec of data.value.sectors) for (const r of sec.rows) { const u = r.umbrellas.find((x) => x.id === s.id); if (u) return u.label; }
  return s.kind;
});
```

e nel template `{{ placeholderLabel }}` al posto di `{{ selection.kind }}` (in entrambi i rami).

- [ ] **Step 6: PASS** — spec vista, poi INTERA suite web-staff + typecheck. Il vecchio spec è stato sostituito: la suite cala di numero — è atteso; annota il delta nel ledger.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): shell Cantiere + BeachPanel (tipologie inline), riscrittura stadio 1"
```

---

### Task 9: FE — `SectorPanel` + `SectorCreatePanel`

**Files:**
- Create: `panels/SectorPanel.vue`, `panels/SectorCreatePanel.vue`
- Modify: `EstablishmentStructureView.vue` (monta i pannelli al posto del placeholder per `sector`/`create-sector`)
- Test: appendi a `EstablishmentStructureView.spec.ts`

**Interfaces:**
- Consumes: mutation `useUpdateSector/useDeleteSector/useCreateSector` (Task 6 le fa già invalidare overview).
- Produces: `SectorPanel` props `{ sector: StructureSectorDTO; isAdmin: boolean }`, emits `close: []`; `SectorCreatePanel` props `{}`, emits `close: []` e `created: [id: string]` (la shell seleziona il settore nuovo).

- [ ] **Step 1: Test che falliscono** — appendi:

```ts
it('tab settore → pannello Settore; rename → PATCH e toast', async () => {
  useFixture();
  let patched: unknown = null;
  server.use(http.patch('/api/establishment/sectors/s-1', async ({ request }) => {
    patched = await request.json();
    return HttpResponse.json({ id: 's-1', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
  }));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.findAll('[role="tab"]')[0].trigger('click');
  expect(w.find('[data-testid="inspector"]').text()).toContain('Settore');
  await w.find('[data-testid="sector-name"]').setValue('Centro Mare');
  await w.find('[data-testid="sector-form"]').trigger('submit');
  await settle();
  expect(patched).toEqual({ name: 'Centro Mare', kind: 'grid' });
});

it('tab «+ Settore» → pannello di creazione → POST e selezione del nuovo', async () => {
  useFixture();
  server.use(http.post('/api/establishment/sectors', () =>
    HttpResponse.json({ id: 's-3', name: 'Nord', sortOrder: 3, kind: 'grid', rows: [] })));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.find('[data-testid="ghost-sector"]').trigger('click');
  await w.find('[data-testid="sector-name"]').setValue('Nord');
  await w.find('[data-testid="sector-form"]').trigger('submit');
  await settle();
  expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // close → beach
});
```

- [ ] **Step 2: FAIL, poi implementa `SectorPanel.vue`**:

```vue
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Button, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureSectorDTO, SectorKind } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateSector, useDeleteSector } from '../useEstablishmentStructure';

const props = defineProps<{ sector: StructureSectorDTO; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateSector();
const remove = useDeleteSector();

const name = ref(props.sector.name);
const kind = ref<SectorKind>(props.sector.kind);
watch(() => props.sector, (s) => { name.value = s.name; kind.value = s.kind; });

function submit() {
  const n = name.value.trim();
  if (!n) return;
  update.mutate({ id: props.sector.id, name: n, kind: kind.value }, { onSuccess: () => pushToast('Settore aggiornato.') });
}
const confirmOpen = ref(false);
function onDelete() {
  remove.mutate(props.sector.id, { onSuccess: () => { pushToast('Settore eliminato.'); emit('close'); } });
  confirmOpen.value = false;
}
const seats = computed(() => props.sector.rows.reduce((n, r) => n + r.umbrellas.length, 0));
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Settore</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ sector.name }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">{{ sector.rows.length }} file · {{ seats }} ombrelloni</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <form v-if="isAdmin" data-testid="sector-form" class="flex flex-col gap-3.5" @submit.prevent="submit">
        <Field label="Nome"><Input name="sector-name" data-testid="sector-name" v-model="name" /></Field>
        <Field label="Disposizione">
          <Select v-model="kind" data-testid="sector-kind">
            <option value="grid">Griglia — file regolari verso il mare</option>
            <option value="special">Speciali — posti fuori griglia</option>
          </Select>
        </Field>
        <Button type="submit" data-testid="sector-save" :loading="update.isPending.value">Salva settore</Button>
      </form>
      <div v-if="isAdmin" class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Se contiene file o è usato da tariffe non sarà eliminato.</p>
        <Button variant="danger" data-testid="sector-delete" class="w-full" :loading="remove.isPending.value" @click="confirmOpen = true">Elimina settore</Button>
      </div>
    </div>
    <ConfirmDialog v-model:open="confirmOpen" title="Eliminare il settore?"
      :description="`«${sector.name}». Se contiene file o è usato da tariffe non sarà eliminato.`"
      confirm-label="Elimina" tone="danger" @confirm="onDelete" />
  </div>
</template>
```

`SectorCreatePanel.vue` (stesso guscio, form `name`+`kind` vuoti, `useCreateSector`; su success: `pushToast('Settore creato.'); emit('created', res.id); emit('close')`; usa gli stessi `data-testid` `sector-name`/`sector-kind`/`sector-form`/`sector-save`). Nella shell: `SectorPanel` per `selection.kind === 'sector'` (risolvi il settore dall'albero; se sparito → fallback beach), `SectorCreatePanel` per `create-sector` con `@created="(id) => selectedSectorId = id"` e `@close="reset"`.

- [ ] **Step 3: PASS + intera suite + typecheck. Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): pannelli Settore e Nuovo settore nell'ispettore"
```

---

### Task 10: FE — `RowPanel` (generatore + svuota) + `RowCreatePanel`

**Files:**
- Create: `panels/RowPanel.vue`, `panels/RowCreatePanel.vue`
- Modify: shell (monta per `row`/`create-row`)
- Test: appendi allo spec vista

**Interfaces:**
- Consumes: `useUpdateRow/useDeleteRow/useCreateRow/useGenerateUmbrellas` + `useBulkDeleteUmbrellas` (Task 6).
- Produces: `RowPanel` props `{ row: StructureRowDTO; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }`, emits `close`; `RowCreatePanel` props `{ sectorId: string; sectorName: string; types: UmbrellaTypeDTO[] }`, emits `close`.

- [ ] **Step 1: Test che falliscono**:

```ts
it('rail fila → pannello Fila; generatore con anteprima; genera → POST generate + toast', async () => {
  useFixture();
  let generated: unknown = null;
  server.use(http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
    generated = await request.json();
    return HttpResponse.json({ created: 3, skipped: 1, umbrellas: [] });
  }));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
  const insp = w.find('[data-testid="inspector"]');
  expect(insp.text()).toContain('Genera');
  await insp.find('[data-testid="gen-prefix"]').setValue('A');
  await insp.find('[data-testid="gen-start"]').setValue(3);
  await insp.find('[data-testid="gen-count"]').setValue(4);
  expect(insp.text()).toContain('A3'); // anteprima live
  await insp.find('[data-testid="gen-form"]').trigger('submit');
  await settle();
  expect(generated).toEqual({ rowId: 'r-1', prefix: 'A', start: 3, count: 4, umbrellaTypeId: null });
});

it('svuota fila → ConfirmDialog → bulk-delete con gli id della fila → toast eliminati/saltati', async () => {
  useFixture();
  let bulk: unknown = null;
  server.use(http.post('/api/establishment/umbrellas/bulk-delete', async ({ request }) => {
    bulk = await request.json();
    return HttpResponse.json({ deleted: 1, skipped: 1 });
  }));
  const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
  await settle();
  await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
  await w.find('[data-testid="row-clear"]').trigger('click');
  await flushPromises();
  expect(document.body.textContent).toContain('Svuotare la fila?');
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Svuota')!.click();
  await settle();
  expect(bulk).toEqual({ ids: ['u-1', 'u-2'] });
  const { useToasts } = await import('@/lib/toasts');
  expect(useToasts().items.some((t) => t.message.includes('Eliminati 1') && t.message.includes('saltati 1'))).toBe(true);
  w.unmount();
});
```

- [ ] **Step 2: FAIL, poi implementa `RowPanel.vue`**:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { StructureRowDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useUpdateRow, useDeleteRow, useGenerateUmbrellas, useBulkDeleteUmbrellas } from '../useEstablishmentStructure';

const props = defineProps<{ row: StructureRowDTO; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }>();
const emit = defineEmits<{ close: [] }>();
const update = useUpdateRow();
const removeRow = useDeleteRow();
const generate = useGenerateUmbrellas();
const bulkDelete = useBulkDeleteUmbrellas();

const label = ref(props.row.label);
watch(() => props.row, (r) => { label.value = r.label; });
function rename() {
  const l = label.value.trim();
  if (!l) return;
  update.mutate({ id: props.row.id, label: l }, { onSuccess: () => pushToast('Fila aggiornata.') });
}

const genPrefix = ref('');
const genStart = ref(1);
const genCount = ref(10);
const genTypeId = ref('');
const genPreview = computed(() => {
  const s = Number(genStart.value) || 0;
  const c = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  return Array.from({ length: c }, (_v, i) => `${genPrefix.value}${s + i}`);
});
function doGenerate() {
  const count = Math.max(0, Math.min(60, Number(genCount.value) || 0));
  if (count <= 0) return;
  generate.mutate(
    { rowId: props.row.id, prefix: genPrefix.value, start: Number(genStart.value) || 0, count, umbrellaTypeId: genTypeId.value === '' ? null : genTypeId.value },
    { onSuccess: (res) => pushToast(`Creati ${res.created} · saltati ${res.skipped}`) },
  );
}

const confirm = ref<'clear' | 'delete' | null>(null);
function onConfirm() {
  if (confirm.value === 'clear') {
    bulkDelete.mutate({ ids: props.row.umbrellas.map((u) => u.id) },
      { onSuccess: (res) => pushToast(`Eliminati ${res.deleted} · saltati ${res.skipped} (con prenotazioni)`) });
  } else if (confirm.value === 'delete') {
    removeRow.mutate(props.row.id, { onSuccess: () => { pushToast('Fila eliminata.'); emit('close'); } });
  }
  confirm.value = null;
}
const confirmCopy = computed(() => confirm.value === 'clear'
  ? { title: 'Svuotare la fila?', description: `Elimina in blocco gli ombrelloni di «${props.row.label}» senza prenotazioni; i protetti restano.`, label: 'Svuota' }
  : { title: 'Eliminare la fila?', description: `«${props.row.label}». Se contiene ombrelloni o è usata da tariffe non sarà eliminata.`, label: 'Elimina' });
</script>

<template>
  <div>
    <div class="border-b border-[var(--color-border-row)] px-[18px] pb-3 pt-3.5">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Fila</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">{{ row.label }}</div>
      <div class="mt-0.5 text-[11.5px] font-semibold text-[var(--color-text-muted)]">Settore {{ sectorName }} · {{ row.umbrellas.length }} ombrelloni</div>
    </div>
    <div v-if="isAdmin" class="flex flex-col gap-3.5 p-[18px]">
      <form class="flex flex-col gap-3" @submit.prevent="rename">
        <Field label="Etichetta"><Input name="row-label" data-testid="row-label" v-model="label" /></Field>
        <Button type="submit" size="sm" data-testid="row-save" :loading="update.isPending.value">Salva</Button>
      </form>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <form data-testid="gen-form" class="flex flex-col gap-3" @submit.prevent="doGenerate">
        <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Genera ombrelloni</span>
        <div class="grid grid-cols-3 gap-2">
          <Field label="Prefisso"><Input name="gen-prefix" data-testid="gen-prefix" v-model="genPrefix" placeholder="es. A" /></Field>
          <Field label="Da numero"><Input name="gen-start" data-testid="gen-start" v-model.number="genStart" type="number" step="1" min="0" /></Field>
          <Field label="Quantità"><Input name="gen-count" data-testid="gen-count" v-model.number="genCount" type="number" step="1" min="1" /></Field>
        </div>
        <Field label="Tipologia">
          <Select v-model="genTypeId" data-testid="gen-type">
            <option value="">Normale</option>
            <option v-for="t in types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </Select>
        </Field>
        <p class="text-[11.5px] text-[var(--color-text-muted)]">Anteprima: {{ genPreview.slice(0, 6).join(', ') }}{{ genPreview.length > 6 ? '…' : '' }} ({{ genPreview.length }}). Le etichette già esistenti vengono saltate.</p>
        <Button type="submit" data-testid="gen-save" :loading="generate.isPending.value">Genera {{ genPreview.length }} ombrelloni</Button>
      </form>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[color-mix(in_srgb,var(--color-danger-bg)_45%,transparent)] p-3">
        <p class="mb-1.5 text-[11.5px] font-extrabold text-[var(--color-danger-ink)]">Zona rischiosa</p>
        <p class="mb-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">«Svuota» elimina in blocco gli ombrelloni senza prenotazioni; quelli con prenotazioni restano.</p>
        <div class="flex gap-2">
          <Button variant="danger" class="flex-1" data-testid="row-clear" :disabled="row.umbrellas.length === 0" :loading="bulkDelete.isPending.value" @click="confirm = 'clear'">Svuota fila ({{ row.umbrellas.length }})</Button>
          <Button variant="danger" class="flex-1" data-testid="row-delete" :loading="removeRow.isPending.value" @click="confirm = 'delete'">Elimina fila</Button>
        </div>
      </div>
    </div>
    <ConfirmDialog :open="confirm !== null" @update:open="(v: boolean) => { if (!v) confirm = null; }"
      :title="confirmCopy.title" :description="confirmCopy.description" :confirm-label="confirmCopy.label" tone="danger" @confirm="onConfirm" />
  </div>
</template>
```

`RowCreatePanel.vue`: guscio identico, form etichetta + blocco generatore (stessi testid), `useCreateRow` poi compose col generate come oggi (chiudi il pannello su create-fila riuscito PRIMA del generate — guardia anti doppio-create invariata: su success `emit('close')` subito, poi `generate.mutate` se `count > 0`, toast `Fila creata · N ombrelloni`).

- [ ] **Step 3: PASS + intera suite + typecheck. Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): pannelli Fila (generatore, svuota bulk) e Nuova fila"
```

---

### Task 11: FE — `UmbrellaPanel` + `UmbrellaCreatePanel`

**Files:**
- Create: `panels/UmbrellaPanel.vue`, `panels/UmbrellaCreatePanel.vue`
- Modify: shell (monta per `umbrella`/`create-umbrella`; rimuovi la parte umbrella del placeholder)
- Test: appendi allo spec vista

**Interfaces:**
- Consumes: `useUpdateUmbrella/useDeleteUmbrella/useCreateUmbrella`.
- Produces: `UmbrellaPanel` props `{ umbrella: StructureUmbrellaDTO; rowLabel: string; sectorName: string; types: UmbrellaTypeDTO[]; isAdmin: boolean }`, emits `close`; `UmbrellaCreatePanel` props `{ rowId: string; rowLabel: string; types: UmbrellaTypeDTO[] }`, emits `close`.

- [ ] **Step 1: Test che falliscono**:

```ts
it('cella → pannello Ombrellone: salva etichetta+tipologia → PATCH e toast', async () => {
  useFixture();
  let patched: unknown = null;
  server.use(http.patch('/api/establishment/umbrellas/u-1', async ({ request }) => {
    patched = await request.json();
    return HttpResponse.json({ id: 'u-1', label: 'A1-bis', umbrellaTypeId: 'typ-1' });
  }));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  const insp = w.find('[data-testid="inspector"]');
  await insp.find('[data-testid="umbrella-label"]').setValue('A1-bis');
  await insp.find('[data-testid="umbrella-form"]').trigger('submit');
  await settle();
  expect(patched).toEqual({ label: 'A1-bis', umbrellaTypeId: null });
});

it('ghost cella → pannello Nuovo ombrellone → POST sulla fila giusta', async () => {
  useFixture();
  let posted: unknown = null;
  server.use(http.post('/api/establishment/umbrellas', async ({ request }) => {
    posted = await request.json();
    return HttpResponse.json({ id: 'u-9', label: 'A9', umbrellaTypeId: null });
  }));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.find('[data-testid="ghost-cell"]').trigger('click');
  const insp = w.find('[data-testid="inspector"]');
  await insp.find('[data-testid="umbrella-label"]').setValue('A9');
  await insp.find('[data-testid="umbrella-form"]').trigger('submit');
  await settle();
  expect(posted).toEqual({ rowId: 'r-1', label: 'A9', umbrellaTypeId: null });
});
```

- [ ] **Step 2: FAIL, poi implementa** — `UmbrellaPanel.vue` (stesso guscio dei pannelli precedenti): header eyebrow «Ombrellone» + titolo etichetta + crumb `Settore X · Fila Y`; form `umbrella-form` con `Field Etichetta` (`data-testid="umbrella-label"`, hint «Numero fisico reale, unico in tutta la spiaggia») + `Field Tipologia` (`data-testid="umbrella-type"`, option ''=Normale + tipi) + `Button submit :loading` («Salva»); hint «Maiusc+clic su altre celle per agire in blocco»; `Button danger` «Elimina ombrellone» con ConfirmDialog («Eliminare l'ombrellone?» / «Se ha prenotazioni non sarà eliminato.») → `useDeleteUmbrella` → toast + `emit('close')`. `UmbrellaCreatePanel.vue`: form identico vuoto → `useCreateUmbrella({ rowId, label, umbrellaTypeId })` → toast «Ombrellone creato.» + `emit('close')`. Nella shell risolvi `umbrella`+`rowLabel`+`sectorName` dall'albero (helper `findUmbrella(data, id)` in `structureSelection.ts`, che ritorna `{ umbrella, row, sector } | null`); se null → fallback beach. Rimuovi `placeholderLabel` se non serve più per `umbrella`.

- [ ] **Step 3: PASS + intera suite + typecheck. Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): pannelli Ombrellone e Nuovo ombrellone; parità CRUD raggiunta"
```

---

### Task 12: FE — multi-select + `MultiPanel` (bulk)

**Files:**
- Create: `panels/MultiPanel.vue`
- Modify: shell (monta per `multi`; Esc; aria-live; rimuovi il placeholder residuo)
- Test: appendi allo spec vista

**Interfaces:**
- Consumes: `useBulkDeleteUmbrellas/useBulkAssignUmbrellaType` (Task 6); logica additive già nella shell (Task 8).
- Produces: `MultiPanel` props `{ ids: string[]; labels: string[]; types: UmbrellaTypeDTO[] }`, emits `close`.

- [ ] **Step 1: Test che falliscono**:

```ts
it('shift+clic su due celle → pannello multi; assegna tipologia → bulk-assign-type', async () => {
  useFixture();
  let assigned: unknown = null;
  server.use(http.post('/api/establishment/umbrellas/bulk-assign-type', async ({ request }) => {
    assigned = await request.json();
    return HttpResponse.json({ updated: 2 });
  }));
  const w = mountApp(EstablishmentStructureView);
  await settle();
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
  const insp = w.find('[data-testid="inspector"]');
  expect(insp.text()).toContain('2 ombrelloni');
  await insp.find('[data-testid="multi-type"]').setValue('typ-1');
  await insp.find('[data-testid="multi-assign"]').trigger('click');
  await settle();
  expect(assigned).toEqual({ ids: ['u-1', 'u-2'], umbrellaTypeId: 'typ-1' });
});

it('toggle Seleziona: click semplici accumulano; elimina bulk → conferma → bulk-delete + toast', async () => {
  useFixture();
  server.use(http.post('/api/establishment/umbrellas/bulk-delete', () => HttpResponse.json({ deleted: 2, skipped: 0 })));
  const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
  await settle();
  await w.find('[data-testid="select-mode"]').trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
  await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click');
  await w.find('[data-testid="multi-delete"]').trigger('click');
  await flushPromises();
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
  await settle();
  const { useToasts } = await import('@/lib/toasts');
  expect(useToasts().items.some((t) => t.message.includes('Eliminati 2'))).toBe(true);
  w.unmount();
});
```

- [ ] **Step 2: FAIL, poi implementa `MultiPanel.vue`**: header «Selezione multipla» + titolo «N ombrelloni» + `aria-live="polite"` sul conteggio; chip etichette (`labels.join(' · ')` in un box `--color-brand-tint`); `Field` Select `data-testid="multi-type"` (option ''=scegli, ''+Normale? — usa `'__none__'` sentinel per «Normale» e '' per «scegli»); `Button data-testid="multi-assign"` («Applica a N») → `useBulkAssignUmbrellaType({ ids, umbrellaTypeId })` → toast «Tipologia assegnata a N ombrelloni.»; `Button danger data-testid="multi-delete"` («Elimina N») con ConfirmDialog («Eliminare N ombrelloni?» / «Quelli con prenotazioni non verranno eliminati.») → `useBulkDeleteUmbrellas` → toast `Eliminati X · saltati Y` → `emit('close')`. Nella shell: keydown Esc globale (listener su `window` con cleanup in `onUnmounted`) → `reset()`; risolvi `labels` dall'albero.

- [ ] **Step 3: PASS + intera suite + typecheck. Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): multi-select con modalità Seleziona e bulk (tipologia, elimina)"
```

---

### Task 13: FE — setup guidato (spiaggia vuota)

**Files:**
- Create: `StructureGuidedSetup.vue` (feature folder)
- Modify: `StructureScene.vue` (rende il guidato quando `sectors.length === 0`)
- Test: appendi a `StructureScene.spec.ts`

**Interfaces:**
- Consumes: emits esistenti della scena (`create-sector`); prop nuova `guided: { hasSectors: boolean; hasRows: boolean; hasUmbrellas: boolean }` calcolata dalla shell.
- Produces: `StructureGuidedSetup` props `{ step: 1 | 2 | 3 }`, emits `advance: []` (la scena lo traduce: step 1 → `create-sector`; 2 → `create-row` sul primo settore; 3 → apre il pannello Fila del primo settore/fila per generare).

- [ ] **Step 1: Test che falliscono** (in `StructureScene.spec.ts`):

```ts
it('spiaggia vuota → 3 passi; il passo attivo emette create-sector', async () => {
  const w = mount(StructureScene, { props: { ...base, sectors: [], selectedSectorId: null } });
  expect(w.text()).toContain('Costruiamo la tua spiaggia');
  expect(w.findAll('[data-testid="guided-step"]')).toHaveLength(3);
  await w.find('[data-testid="guided-step-active"]').trigger('click');
  expect(w.emitted('create-sector')).toBeTruthy();
});
```

- [ ] **Step 2: FAIL, poi implementa** `StructureGuidedSetup.vue` (3 card-passo: titolo `Costruiamo la tua spiaggia`, sottotitolo «Tre passi e la struttura è pronta: si riflette subito sulla Mappa.»; card numerata `k` in `--color-brand-tint`, attiva = `data-testid="guided-step-active"` cliccabile, future = `opacity-55`; testi passo: «Crea un settore» / «Aggiungi una fila» / «Genera gli ombrelloni» con le stesse descrizioni del mockup). In `StructureScene.vue`: `v-if="sectors.length === 0"` al posto del corpo sabbia → `<StructureGuidedSetup :step="1" @advance="emit('create-sector')" />` (con `sectors.length>0 && !rows` la scena mostra già ghost-fila: i passi 2-3 guidano via ghost esistenti — il guidato pieno serve solo a spiaggia vuota).

- [ ] **Step 3: PASS + intera suite + typecheck. Commit**

```bash
git add apps/web-staff/src/features/establishment
git commit -m "feat(web-staff): setup guidato a 3 passi per la spiaggia vuota"
```

---

### Task 14: Docs — ADR-0052 + design-system

**Files:**
- Create: `docs/architecture/decisions/0052-editor-struttura-cantiere.md`
- Modify: `docs/design/design-system.md` (§13.1 nota resa «rest»; nuova sezione «14. L'editor Struttura — il Cantiere»)

- [ ] **Step 1: Scrivi ADR-0052** (formato dei gemelli 0044/0045: Contesto / Decisione / Conseguenze): decisione = editor struttura come «canvas + ispettore» sulla scena Riva a riposo; il paradigma resta per-form con numerazione automatica (ADR-0014 confermato); bulk con semantica «salta e riporta» (mai 409 sul batch, speculare al generate); multi-select esplicita + shift; tipologie nell'ispettore-radice; ConfirmDialog solo distruttivo. Conseguenze: `UmbrellaCell.slotStates` opzionale (resa rest), 2 endpoint bulk, riuso map-scene.css cross-feature, D-005/D-038 restano deferiti.

- [ ] **Step 2: design-system.md**: in §13.1 aggiungi la variante «rest» della Tessera (fill `--color-warm-025`, ink `--color-ink-700`, senza stati — usata SOLO dall'editor); nuova sezione **14** con: scena Cantiere (riuso mattoni Riva, tab settori con posti, toggle Seleziona), ghost-affordance, ispettore (pannelli e regole: salvataggio esplicito, toast su ogni esito, ConfirmDialog solo distruttivo), multi-select, setup guidato, riferimento a spec e ADR-0052.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/decisions/0052-editor-struttura-cantiere.md docs/design/design-system.md
git commit -m "docs: ADR-0052 editor Cantiere + design-system (Tessera rest, sezione editor struttura)"
```

---

### Task 15: Verifica finale — parità, suite complete, gate visivo

- [ ] **Step 1: Checklist di parità funzionale** (contro il vecchio editor — spunta ogni voce navigando il codice): CRUD tipologie ✓ (Task 8) · CRUD settori ✓ (9) · CRUD file + generate + compose nuova-fila ✓ (10) · CRUD ombrelloni ✓ (11) · guardie 409 → toast ✓ (mutationResource default) · gating staff read-only ✓ (isAdmin su ghost/azioni/form — verifica che i pannelli in sola lettura mostrino i dati senza form).
- [ ] **Step 2: Suite complete**: `cd apps/api && npm test && npm run test:e2e` · `cd apps/web-staff && npx vitest run` · `cd apps/web-platform && npx vitest run` · `cd apps/web-customer && npx vitest run` · `pnpm -r typecheck`. Tutte verdi; conta finale ≥ baseline (501 sostituiti da spec nuovi: annota il numero nel ledger).
- [ ] **Step 3: Gate visivo (utente)**: backend live (health check `GET http://127.0.0.1:3000/health`, DB :5433), preview web-staff, login utente, verifica: scena (mare/sabbia/tab), selezioni, ispettore, drawer <1024px, multi-select, svuota fila, guidato (cliente seed ricco: `c-1`; per il guidato serve tenant vuoto o mock). Skeleton: DevTools Slow 3G.
- [ ] **Step 4: STOP — niente merge senza ok esplicito dell'utente.** Poi handoff di sessione in `docs/handoff/`.

