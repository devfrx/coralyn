# Stabilimento Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare la schermata Stabilimento dal mock statico a dati reali via un unico endpoint read-only `GET /api/establishment/overview`.

**Architecture:** Proiezione read-only tenant-scoped a specchio di `apps/api/src/reports/`: controller sottile → service che compone conteggi/liste dentro `prisma.forTenant` → funzioni **pure** (`pickActiveSeason`, `toEstablishmentOverview`) unit-testate. FE: composable `useEstablishmentOverview` (pattern `useReportSummary`) che alimenta `EstablishmentView.vue`. Nessuna migrazione, nessun nuovo componente ui-kit, nessun nuovo ADR.

**Tech Stack:** NestJS + Prisma (RLS via `forTenant`) · `@coralyn/contracts` (DTO compilati in `dist/`) · Vue 3 + Pinia + TanStack Query · Vitest + MSW · Jest e2e + supertest.

**Gotcha da ricordare (handoff §6):**
- Dopo modifiche a `packages/contracts/src/index.ts`: `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api.
- Il modello **`User` NON ha RLS** → nel service filtra il team con `where: { establishmentId: tenantId }` esplicito (non affidarti a `forTenant`).
- Bash tool su Windows: niente here-string PowerShell; commit multi-riga con `git commit -F -` + heredoc.

---

## File Structure

**Backend (`apps/api/`):**
- Create `src/establishment/establishment.projection.ts` — funzioni pure (season attiva, shaping DTO). Nessuna dipendenza da Nest/Prisma.
- Create `src/establishment/establishment.service.ts` — compone conteggi/liste in `forTenant`, delega lo shaping alla projection.
- Create `src/establishment/establishment.controller.ts` — `@Controller('establishment')`, `@Get('overview')`.
- Create `src/establishment/establishment.module.ts` — dichiara controller+service.
- Modify `src/app.module.ts` — registra `EstablishmentModule`.
- Create `src/establishment/establishment.projection.spec.ts` — unit sulle funzioni pure.
- Create `test/establishment.e2e-spec.ts` — e2e HTTP.

**Contracts (`packages/contracts/`):**
- Modify `src/index.ts` — `EstablishmentMemberDTO` + `EstablishmentOverviewDTO`.

**Frontend (`apps/web-staff/`):**
- Modify `src/lib/queryKeys.ts` — `establishmentOverview`.
- Create `src/features/establishment/useEstablishment.ts` — composable.
- Modify `src/features/establishment/EstablishmentView.vue` — da mock a dati reali.
- Create `src/features/establishment/EstablishmentView.spec.ts` — component test.
- Modify `src/mocks/server.ts` — handler MSW di default per l'overview.

---

## Task 1: Contratto DTO (layer `contracts`)

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i DTO**

In `packages/contracts/src/index.ts`, in coda al file (o vicino agli altri DTO tenant), aggiungi:

```ts
/** Membro del team dello stabilimento (superuser escluso: è di piattaforma). */
export interface EstablishmentMemberDTO {
  id: string;
  email: string;
  role: 'admin' | 'staff';
}

/** Proiezione read-only della schermata Stabilimento (GET /api/establishment/overview). */
export interface EstablishmentOverviewDTO {
  establishment: { id: string; name: string };
  activeSeason: { name: string; startDate: string; endDate: string } | null; // copre oggi, else null
  timeSlots: { id: string; name: string }[]; // fasce operative, ordinate per sortOrder
  structure: {
    sectors: number;
    umbrellas: number;
    types: number;
    packages: number; // solo non archiviati
  };
  team: EstablishmentMemberDTO[]; // admin-first, poi email asc
}
```

- [ ] **Step 2: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK, `packages/contracts/dist/index.d.ts` aggiornato con i due nuovi tipi.

- [ ] **Step 3: Commit (layer contracts)**

```bash
git add packages/contracts/src/index.ts
git commit -F - <<'EOF'
feat(contracts): EstablishmentOverviewDTO + EstablishmentMemberDTO (Stabilimento overview)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Projection pura — `pickActiveSeason` + `toEstablishmentOverview` (layer `api`)

**Files:**
- Create: `apps/api/src/establishment/establishment.projection.ts`
- Test: `apps/api/src/establishment/establishment.projection.spec.ts`

- [ ] **Step 1: Scrivi i test (falliscono)**

Crea `apps/api/src/establishment/establishment.projection.spec.ts`:

```ts
import { pickActiveSeason, toEstablishmentOverview, type OverviewRaw } from './establishment.projection';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('pickActiveSeason', () => {
  const seasons = [
    { name: 'Estate 2026', startDate: d('2026-06-01'), endDate: d('2026-09-15') },
    { name: 'Estate 2027', startDate: d('2027-06-01'), endDate: d('2027-09-15') },
  ];

  it('ritorna la stagione che contiene oggi (bordi inclusivi)', () => {
    expect(pickActiveSeason(seasons, '2026-07-04')).toEqual({ name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' });
    expect(pickActiveSeason(seasons, '2026-06-01')?.name).toBe('Estate 2026');
    expect(pickActiveSeason(seasons, '2026-09-15')?.name).toBe('Estate 2026');
  });

  it('off-season → null', () => {
    expect(pickActiveSeason(seasons, '2026-10-01')).toBeNull();
    expect(pickActiveSeason([], '2026-07-04')).toBeNull();
  });
});

describe('toEstablishmentOverview', () => {
  const raw: OverviewRaw = {
    establishment: { id: 'e-1', name: 'Lido Maestrale' },
    seasons: [{ name: 'Estate 2026', startDate: d('2026-06-01'), endDate: d('2026-09-15') }],
    timeSlots: [{ id: 't1', name: 'Mattina' }, { id: 't2', name: 'Pomeriggio' }],
    structure: { sectors: 3, umbrellas: 41, types: 3, packages: 3 },
    users: [
      { id: 'u3', email: 'sara@lido.it', role: 'staff' },
      { id: 'u1', email: 'giulia@lido.it', role: 'admin' },
      { id: 'u2', email: 'marco@lido.it', role: 'staff' },
      { id: 'u4', email: 'root@platform.it', role: 'superuser' },
    ],
    todayIso: '2026-07-04',
  };

  it('esclude il superuser e ordina admin-first poi email asc', () => {
    const dto = toEstablishmentOverview(raw);
    expect(dto.team.map((m) => m.email)).toEqual(['giulia@lido.it', 'marco@lido.it', 'sara@lido.it']);
    expect(dto.team.some((m) => (m.role as string) === 'superuser')).toBe(false);
  });

  it('compone establishment, activeSeason, timeSlots e structure', () => {
    const dto = toEstablishmentOverview(raw);
    expect(dto.establishment).toEqual({ id: 'e-1', name: 'Lido Maestrale' });
    expect(dto.activeSeason).toEqual({ name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' });
    expect(dto.timeSlots).toHaveLength(2);
    expect(dto.structure).toEqual({ sectors: 3, umbrellas: 41, types: 3, packages: 3 });
  });
});
```

- [ ] **Step 2: Esegui i test — devono fallire**

Run: `corepack pnpm --filter @coralyn/api test -- establishment.projection`
Expected: FAIL con "Cannot find module './establishment.projection'".

- [ ] **Step 3: Implementa la projection**

Crea `apps/api/src/establishment/establishment.projection.ts`:

```ts
import type { EstablishmentOverviewDTO, EstablishmentMemberDTO } from '@coralyn/contracts';

export interface RawSeason {
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface OverviewRaw {
  establishment: { id: string; name: string };
  seasons: RawSeason[];
  timeSlots: { id: string; name: string }[];
  structure: EstablishmentOverviewDTO['structure'];
  users: { id: string; email: string; role: string }[];
  todayIso: string;
}

const ROLE_RANK: Record<string, number> = { admin: 0, staff: 1 };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function pickActiveSeason(
  seasons: RawSeason[],
  todayIso: string,
): EstablishmentOverviewDTO['activeSeason'] {
  const active = seasons.find((s) => iso(s.startDate) <= todayIso && todayIso <= iso(s.endDate));
  return active ? { name: active.name, startDate: iso(active.startDate), endDate: iso(active.endDate) } : null;
}

export function toEstablishmentOverview(raw: OverviewRaw): EstablishmentOverviewDTO {
  const team: EstablishmentMemberDTO[] = raw.users
    .filter((u) => u.role === 'admin' || u.role === 'staff')
    .map((u) => ({ id: u.id, email: u.email, role: u.role as 'admin' | 'staff' }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.email.localeCompare(b.email));
  return {
    establishment: raw.establishment,
    activeSeason: pickActiveSeason(raw.seasons, raw.todayIso),
    timeSlots: raw.timeSlots,
    structure: raw.structure,
    team,
  };
}
```

- [ ] **Step 4: Esegui i test — devono passare**

Run: `corepack pnpm --filter @coralyn/api test -- establishment.projection`
Expected: PASS (tutti i casi).

(Nessun commit qui: il commit del layer `api` è a fine Task 4.)

---

## Task 3: Service + Controller + Module + wiring (layer `api`)

**Files:**
- Create: `apps/api/src/establishment/establishment.service.ts`
- Create: `apps/api/src/establishment/establishment.controller.ts`
- Create: `apps/api/src/establishment/establishment.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Implementa il service**

Crea `apps/api/src/establishment/establishment.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { todayInRome } from '../common/dates';
import { toEstablishmentOverview } from './establishment.projection';

@Injectable()
export class EstablishmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async getOverview(): Promise<EstablishmentOverviewDTO> {
    const tenantId = this.tenant.require();
    const todayIso = todayInRome();
    return this.prisma.forTenant(tenantId, async (tx) => {
      const [establishment, seasons, timeSlots, users, sectors, umbrellas, types, packages] = await Promise.all([
        tx.establishment.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true } }),
        tx.season.findMany({ select: { name: true, startDate: true, endDate: true } }),
        tx.timeSlot.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
        // User NON ha RLS (vedi seed-auth): filtra il team ESPLICITAMENTE per tenant.
        tx.user.findMany({ where: { establishmentId: tenantId }, select: { id: true, email: true, role: true } }),
        tx.sector.count(),
        tx.umbrella.count(),
        tx.umbrellaType.count(),
        tx.package.count({ where: { archivedAt: null } }),
      ]);
      return toEstablishmentOverview({
        establishment,
        seasons,
        timeSlots,
        users: users.map((u) => ({ id: u.id, email: u.email, role: u.role })),
        structure: { sectors, umbrellas, types, packages },
        todayIso,
      });
    });
  }
}
```

- [ ] **Step 2: Implementa il controller**

Crea `apps/api/src/establishment/establishment.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';

@Controller('establishment')
export class EstablishmentController {
  constructor(private readonly establishment: EstablishmentService) {}

  @Get('overview')
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }
}
```

- [ ] **Step 3: Implementa il module**

Crea `apps/api/src/establishment/establishment.module.ts` (PrismaService e TenantContext sono forniti da moduli global, come in `ReportsModule`):

```ts
import { Module } from '@nestjs/common';
import { EstablishmentController } from './establishment.controller';
import { EstablishmentService } from './establishment.service';

@Module({
  controllers: [EstablishmentController],
  providers: [EstablishmentService],
})
export class EstablishmentModule {}
```

- [ ] **Step 4: Registra il module in `app.module.ts`**

In `apps/api/src/app.module.ts`: aggiungi l'import in cima e la voce nell'array `imports`, accanto a `ReportsModule`:

```ts
import { EstablishmentModule } from './establishment/establishment.module';
```
e nell'array `imports: [...]` aggiungi `EstablishmentModule` subito dopo `ReportsModule`.

- [ ] **Step 5: Verifica compilazione + unit non regrediti**

Run: `corepack pnpm --filter @coralyn/api test -- establishment.projection`
Expected: PASS (nessuna regressione; il service è coperto dall'e2e in Task 4).

---

## Task 4: e2e endpoint (layer `api`, chiude il commit api)

**Files:**
- Create: `apps/api/test/establishment.e2e-spec.ts`

- [ ] **Step 1: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';
import { seedMapTenant, cleanMapTenant } from './helpers/seed-map';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const isoPlus = (delta: number): string => {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

describe('Establishment overview (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let t1: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // Tenant 1: struttura via seedMapTenant (1 settore, 2 ombrelloni, 1 tipo, 2 fasce) + 1 pacchetto + stagione che copre oggi.
    s1 = (await prisma.establishment.create({ data: { name: 'EST A' } })).id;
    await seedMapTenant(prisma, s1);
    await prisma.forTenant(s1, async (tx) => {
      await tx.package.create({ data: { establishmentId: s1, name: 'Standard' } });
      await tx.season.create({ data: { establishmentId: s1, name: 'Stagione Corrente', startDate: new Date(`${isoPlus(-10)}T00:00:00Z`), endDate: new Date(`${isoPlus(10)}T00:00:00Z`) } });
    });
    await createUser(prisma, { email: 'est.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'est.staff@e2e.test', password: 'pw2', role: Role.staff, establishmentId: s1 });
    await createUser(prisma, { email: 'est.super@e2e.test', password: 'pw3', role: Role.superuser, establishmentId: null });
    t1 = await login(app, 'est.admin@e2e.test', 'pw1');

    // Tenant 2: dati propri, per verificare l'isolamento dei conteggi/team.
    s2 = (await prisma.establishment.create({ data: { name: 'EST B' } })).id;
    await seedMapTenant(prisma, s2);
    await createUser(prisma, { email: 'est.b@e2e.test', password: 'pw4', role: Role.admin, establishmentId: s2 });
  });

  afterAll(async () => {
    await cleanMapTenant(prisma, s1);
    await cleanMapTenant(prisma, s2);
    await prisma.forTenant(s1, async (tx) => { await tx.package.deleteMany({}); await tx.season.deleteMany({}); });
    await prisma.user.deleteMany({ where: { email: { in: ['est.admin@e2e.test', 'est.staff@e2e.test', 'est.super@e2e.test', 'est.b@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).get('/api/establishment/overview').expect(401);
  });

  it('200 con nome, stagione attiva, conteggi struttura isolati, fasce ordinate', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t1)).expect(200);
    expect(res.body.establishment).toEqual({ id: s1, name: 'EST A' });
    expect(res.body.activeSeason).toMatchObject({ name: 'Stagione Corrente' });
    expect(res.body.structure).toEqual({ sectors: 1, umbrellas: 2, types: 1, packages: 1 }); // isolato da s2
    expect(res.body.timeSlots.map((t: { name: string }) => t.name)).toEqual(['Mattina', 'Pomeriggio']);
  });

  it('team: solo utenti del tenant (superuser escluso), admin-first', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t1)).expect(200);
    const emails = res.body.team.map((m: { email: string }) => m.email);
    expect(emails).toEqual(['est.admin@e2e.test', 'est.staff@e2e.test']); // no superuser, no tenant B
    expect(res.body.team[0].role).toBe('admin');
  });
});

describe('Establishment overview — off-season → activeSeason null (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3: string;
  let t3: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    s3 = (await prisma.establishment.create({ data: { name: 'EST C' } })).id;
    await prisma.forTenant(s3, async (tx) => {
      await tx.season.create({ data: { establishmentId: s3, name: 'Stagione Passata', startDate: new Date(`${isoPlus(-60)}T00:00:00Z`), endDate: new Date(`${isoPlus(-30)}T00:00:00Z`) } });
    });
    await createUser(prisma, { email: 'est.c@e2e.test', password: 'pw5', role: Role.admin, establishmentId: s3 });
    t3 = await login(app, 'est.c@e2e.test', 'pw5');
  });

  afterAll(async () => {
    await prisma.forTenant(s3, async (tx) => { await tx.season.deleteMany({}); });
    await prisma.user.deleteMany({ where: { email: 'est.c@e2e.test' } });
    await prisma.establishment.deleteMany({ where: { id: s3 } });
    await app.close();
  });

  it('nessuna stagione copre oggi → activeSeason null', async () => {
    const res = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(t3)).expect(200);
    expect(res.body.activeSeason).toBeNull();
  });
});
```

- [ ] **Step 2: Assicurati che i contracts siano buildati (gotcha), poi esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment`
Expected: PASS. Se fallisce con tabelle mancanti nel DB test, applica le migrazioni:
`cd apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy` e ri-esegui.

- [ ] **Step 3: Suite api completa (nessuna regressione)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: unit ≥ 118+ (nuovi projection) · e2e ≥ 165+ (nuovi establishment) verdi.

- [ ] **Step 4: Commit (layer api)**

```bash
git add apps/api/src/establishment apps/api/test/establishment.e2e-spec.ts apps/api/src/app.module.ts
git commit -F - <<'EOF'
feat(api): GET /establishment/overview read-only (proiezione pura + service + e2e)

Conteggi struttura + fasce + stagione attiva (copre-oggi|null) + team tenant
(superuser escluso, admin-first). User filtrato esplicitamente per tenant (no RLS).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: queryKey + composable FE (layer `web-staff`)

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`
- Create: `apps/web-staff/src/features/establishment/useEstablishment.ts`

- [ ] **Step 1: Aggiungi la query key**

In `apps/web-staff/src/lib/queryKeys.ts`, dentro l'oggetto `queryKeys`, dopo `reportSummary`:

```ts
  establishmentOverview: (tenantId: string) => ['establishment', tenantId, 'overview'] as const,
```

- [ ] **Step 2: Scrivi il composable**

Crea `apps/web-staff/src/features/establishment/useEstablishment.ts`:

```ts
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
  });
}
```

(Nessun commit qui: chiude col Task 6.)

---

## Task 6: `EstablishmentView` reale + MSW + component test (layer `web-staff`)

**Files:**
- Modify: `apps/web-staff/src/mocks/server.ts`
- Modify: `apps/web-staff/src/features/establishment/EstablishmentView.vue`
- Create: `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`

- [ ] **Step 1: Aggiungi l'handler MSW di default**

In `apps/web-staff/src/mocks/server.ts`, dentro `setupServer(...)` (accanto all'handler `/api/reports/summary`), aggiungi:

```ts
  http.get('/api/establishment/overview', () =>
    HttpResponse.json({
      establishment: { id: 'e-1', name: 'Lido Maestrale' },
      activeSeason: { name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' },
      timeSlots: [
        { id: 'ts-1', name: 'Giornata' },
        { id: 'ts-2', name: 'Mattina' },
        { id: 'ts-3', name: 'Pomeriggio' },
      ],
      structure: { sectors: 3, umbrellas: 41, types: 3, packages: 3 },
      team: [
        { id: 'u-1', email: 'admin@coralyn.dev', role: 'admin' },
        { id: 'u-2', email: 'marco@lidomaestrale.it', role: 'staff' },
      ],
    }),
  ),
```

- [ ] **Step 2: Scrivi il component test (fallisce)**

Crea `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentView from './EstablishmentView.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('EstablishmentView', () => {
  afterEach(() => server.resetHandlers());

  it('rende nome, conteggi struttura, fasce e righe team dai dati reali', async () => {
    const w = mountApp(EstablishmentView);
    await settle();
    expect(w.text()).toContain('Lido Maestrale');
    expect(w.text()).toContain('41'); // ombrelloni
    expect(w.text()).toContain('Giornata · Mattina · Pomeriggio');
    expect(w.text()).toContain('marco@lidomaestrale.it');
    expect(w.text()).toContain('Estate 2026');
  });

  it('marca "Tu" solo sull\'utente corrente', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    const rows = w.findAll('[data-testid="team-row"]');
    const mine = rows.find((r) => r.text().includes('admin@coralyn.dev'));
    const other = rows.find((r) => r.text().includes('marco@lidomaestrale.it'));
    expect(mine!.text()).toContain('Tu');
    expect(other!.text()).not.toContain('Tu');
  });

  it('senza stagione attiva mostra l\'empty-state', async () => {
    server.use(http.get('/api/establishment/overview', () =>
      HttpResponse.json({
        establishment: { id: 'e-1', name: 'Lido Maestrale' },
        activeSeason: null,
        timeSlots: [{ id: 'ts-1', name: 'Giornata' }],
        structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
        team: [],
      })));
    const w = mountApp(EstablishmentView);
    await settle();
    expect(w.text()).toContain('Nessuna stagione attiva');
  });

  it('espone le affordance "in arrivo" e il logout', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    expect(w.text()).toContain('in arrivo'); // Modifica/Configura/Inviti
    await w.find('[data-testid="sign-out"]').trigger('click');
    expect(session.authenticated).toBe(false);
  });
});
```

- [ ] **Step 3: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: FAIL (la view è ancora mock: mancano i dati reali, i `data-testid`, l'empty-state stagione).

- [ ] **Step 4: Riscrivi `EstablishmentView.vue` su dati reali**

Sostituisci **interamente** `apps/web-staff/src/features/establishment/EstablishmentView.vue` con:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Card, StatTile, Badge, Button, Avatar, Icon } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useEstablishmentOverview } from './useEstablishment';

const session = useSessionStore();
const router = useRouter();
const { data, isPending, isError } = useEstablishmentOverview();

function signOut() {
  session.logout();
  router.push('/login');
}

const MONTH_DAY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDay = (iso: string) => MONTH_DAY.format(new Date(`${iso}T00:00:00Z`));

const seasonLabel = computed(() => {
  const s = data.value?.activeSeason;
  return s ? `${s.name} · ${fmtDay(s.startDate)} – ${fmtDay(s.endDate)}` : 'Nessuna stagione attiva';
});
const seasonName = computed(() => data.value?.activeSeason?.name ?? 'Nessuna stagione attiva');
const slotsLabel = computed(() => (data.value?.timeSlots ?? []).map((t) => t.name).join(' · ') || '—');
const structureTiles = computed(() => {
  const s = data.value?.structure;
  return [
    { value: String(s?.sectors ?? 0), label: 'Settori' },
    { value: String(s?.umbrellas ?? 0), label: 'Ombrelloni' },
    { value: String(s?.types ?? 0), label: 'Tipologie' },
    { value: String(s?.packages ?? 0), label: 'Pacchetti' },
  ];
});

const ROLE_LABEL: Record<'admin' | 'staff', string> = { admin: 'Amministratore', staff: 'Staff' };
const currentUserRoleLabel = computed(() => (session.role === Role.Admin ? 'Amministratore' : 'Staff'));
const team = computed(() =>
  (data.value?.team ?? []).map((m) => ({
    id: m.id,
    email: m.email,
    role: m.role,
    roleLabel: ROLE_LABEL[m.role],
    tone: m.role === 'admin' ? ('brand' as const) : ('neutral' as const),
    ini: m.email.slice(0, 2).toUpperCase(),
    you: session.userEmail === m.email,
  })),
);
</script>

<template>
  <section class="max-w-[940px] px-[26px] pb-[30px] pt-[22px]">
    <Card class="mb-4">
      <div class="flex items-center gap-[18px] p-[22px]">
        <img src="/coralyn-logo.png" alt="Stabilimento" class="size-14 rounded-[14px] object-cover" style="box-shadow:0 2px 8px rgba(15,60,73,.18);" />
        <div class="min-w-0 flex-1">
          <h2 class="text-[23px] font-bold tracking-[-.015em] text-[var(--color-text)]">{{ data?.establishment.name ?? '…' }}</h2>
          <div class="mt-1 text-[13px] text-[var(--color-text-muted)]">{{ currentUserRoleLabel }} · {{ session.userEmail }} · <span class="tabular-nums">{{ seasonName }}</span></div>
        </div>
        <div class="flex items-center gap-2">
          <Badge tone="soon">Modifica · in arrivo</Badge>
          <Button variant="secondary" disabled><Icon name="edit" :size="15" />Modifica</Button>
        </div>
      </div>
    </Card>

    <p v-if="isError" class="mb-4 text-sm text-[var(--color-danger)]">Impossibile caricare i dati dello stabilimento.</p>

    <div class="mb-4 grid grid-cols-2 gap-4">
      <Card>
        <div class="p-5">
          <span class="text-sm font-bold text-[var(--color-text)]">Informazioni stabilimento</span>
          <div class="mt-4 flex flex-col gap-3.5">
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ data?.establishment.name ?? '…' }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Stagione attiva</div><div class="text-sm font-medium tabular-nums text-[var(--color-text)]">{{ seasonLabel }}</div></div>
            <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Fasce operative</div><div class="text-sm font-medium text-[var(--color-text)]">{{ slotsLabel }}</div></div>
          </div>
        </div>
      </Card>
      <Card>
        <div class="p-5">
          <div class="mb-4 flex items-center justify-between"><span class="text-sm font-bold text-[var(--color-text)]">Struttura della spiaggia</span><Badge tone="soon">Configura · in arrivo</Badge></div>
          <div class="grid grid-cols-2 gap-3.5">
            <StatTile v-for="s in structureTiles" :key="s.label" :value="s.value" :label="s.label" />
          </div>
        </div>
      </Card>
    </div>

    <Card class="mb-4">
      <div class="p-5">
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-sm font-bold text-[var(--color-text)]">Utenti e ruoli</span>
          <Badge tone="soon"><Icon name="plus" :size="13" />Inviti e gestione · in arrivo</Badge>
        </div>
        <p class="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">Il team dello stabilimento ha ruoli <strong class="text-[var(--color-text-2nd)]">Amministratore</strong> e <strong class="text-[var(--color-text-2nd)]">Staff</strong>. Il ruolo <strong class="text-[var(--color-text-2nd)]">Superuser</strong> è di piattaforma (console cross-stabilimento) e non appartiene al team del lido.</p>
        <p v-if="!isPending && team.length === 0" class="py-3 text-sm text-[var(--color-text-muted)]">Nessun utente nel team.</p>
        <div class="flex flex-col">
          <div v-for="u in team" :key="u.id" data-testid="team-row" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-3 last:border-0">
            <Avatar :initials="u.ini" size="md" :tone="u.tone === 'brand' ? 'brand' : 'accent'" />
            <div class="flex flex-1 items-center gap-2">
              <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ u.email }}</span>
              <Badge v-if="u.you" tone="accent">Tu</Badge>
            </div>
            <Badge :tone="u.tone">{{ u.roleLabel }}</Badge>
          </div>
        </div>
      </div>
    </Card>

    <Card>
      <div class="flex items-center gap-3.5 p-5">
        <span class="grid size-10 flex-none place-items-center rounded-[11px] bg-[var(--color-accent-tint)] text-[var(--color-accent)]"><Icon name="shield" :size="20" /></span>
        <div class="min-w-0 flex-1">
          <div class="text-[13.5px] font-bold text-[var(--color-text)]">Sessione</div>
          <div class="mt-0.5 text-xs text-[var(--color-text-muted)]">Accesso protetto · la sessione scade dopo 8 ore.</div>
        </div>
        <Button variant="danger" data-testid="sign-out" @click="signOut"><Icon name="logout" :size="16" />Esci</Button>
      </div>
    </Card>
  </section>
</template>
```

- [ ] **Step 5: Esegui il component test — deve passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: PASS (tutti i casi).

- [ ] **Step 6: Typecheck + suite web-staff completa**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff ≥ 178 + nuovi test verdi.

- [ ] **Step 7: Commit (layer web-staff)**

```bash
git add apps/web-staff/src/lib/queryKeys.ts apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts
git commit -F - <<'EOF'
feat(web-staff): EstablishmentView su dati reali (overview) — TDD

Composable useEstablishmentOverview + view che consuma GET /establishment/overview:
nome/stagione/fasce/struttura/team con "Tu", empty-state stagione, azioni "in arrivo".

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 7: Doc — nota su D-025 (layer `docs`)

**Files:**
- Modify: `docs/architecture/deferred.md`

- [ ] **Step 1: Annota lo stato di D-025**

In `docs/architecture/deferred.md`, nella riga/sezione **D-025**, aggiungi una nota che l'overview read-only dello Stabilimento (elenco utenti/ruoli in sola lettura) è **consegnato**, mentre resta deferita la **gestione** (inviti/creazione/cambio-ruolo/rimozione) + i role-guard sugli endpoint. Esempio di frase da inserire nella colonna note o come riga di aggiornamento:

> Aggiornamento 2026-07-04: la schermata Stabilimento espone il team in **sola lettura** (`GET /api/establishment/overview`). Resta deferita la **gestione** utenti (inviti/creazione/disabilitazione/cambio-ruolo) e i decoratori di ruolo sugli endpoint.

- [ ] **Step 2: Commit (layer docs)**

```bash
git add docs/architecture/deferred.md
git commit -F - <<'EOF'
docs(deferred): D-025 — overview Stabilimento read-only consegnato; gestione utenti ancora deferita

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD)

- [ ] **Suite complete verdi:**
  - `corepack pnpm --filter @coralyn/contracts build`
  - `corepack pnpm --filter @coralyn/api test` (≥ 118 + projection)
  - `corepack pnpm --filter @coralyn/api test:e2e` (≥ 165 + establishment)
  - `corepack pnpm --filter web-staff test` (≥ 178 + EstablishmentView)
  - `corepack pnpm --filter @coralyn/ui-kit test` (70, invariato)
  - `corepack pnpm --filter web-staff typecheck` (pulito)
- [ ] **Verifica LIVE** (Docker): `docker compose --profile full up -d --build api web`, poi login e apri Stabilimento → nome/stagione/fasce/struttura reali, team popolato con "Tu", azioni "in arrivo", 0 errori console.
- [ ] **Presenta lo stato all'utente e attendi conferma** prima del merge FF su `main` (richiede ok esplicito).
```
