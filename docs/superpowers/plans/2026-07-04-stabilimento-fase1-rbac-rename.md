# Stabilimento Fase 1 — RBAC foundation + Modifica (rinomina) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introdurre il role-guard riusabile (`@Roles`/`RolesGuard`, ADR-0039) e attivare la **rinomina** dello stabilimento (`PATCH /api/establishment`, admin-only) con editor FE.

**Architecture:** Un `RolesGuard` globale (2° `APP_GUARD` dopo `JwtAuthGuard`) che applica il decoratore `@Roles(...)` letto via `Reflector` — endpoint senza `@Roles` invariati. La rinomina è un metodo `PATCH` sul `EstablishmentController` esistente, gated `@Roles(Role.Admin)`, tenant-scoped. FE: modale ui-kit + `mutationResource` che invalida la query overview; il bottone «Modifica» è attivo solo per l'admin.

**Tech Stack:** NestJS (guard/reflector/class-validator) · Prisma · `@coralyn/contracts` (compila in `dist/`) · Vue 3 + Pinia + TanStack Query · Vitest + MSW · Jest e2e + supertest.

**Gotcha (handoff):** dopo modifiche a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** dei test api. `Establishment` **non ha RLS** (update per PK `id = tenantId` è sicuro). Bash Windows: commit multi-riga con `git commit -F -` + heredoc.

---

## File Structure
**Contracts:** `packages/contracts/src/index.ts` — `UpdateEstablishmentInput`.
**API (RBAC + rename):**
- Create `apps/api/src/identity/roles.decorator.ts` — `@Roles(...roles)` + `ROLES_KEY`.
- Create `apps/api/src/identity/roles.guard.ts` — `RolesGuard`.
- Create `apps/api/src/identity/roles.guard.spec.ts` — unit.
- Modify `apps/api/src/identity/identity.module.ts` — registra `RolesGuard` come 2° `APP_GUARD`.
- Create `apps/api/src/establishment/dto/update-establishment.dto.ts` — body validato.
- Modify `apps/api/src/establishment/establishment.service.ts` — `rename(name)`.
- Modify `apps/api/src/establishment/establishment.controller.ts` — `PATCH` `@Roles(admin)`.
- Create `apps/api/test/establishment-rename.e2e-spec.ts` — e2e.
- Create `docs/architecture/decisions/0039-rbac-role-guard.md` — ADR.
**FE:**
- Modify `apps/web-staff/src/features/establishment/useEstablishment.ts` — `useRenameEstablishment`.
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue` — modale + gating admin.
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts` — test.
- Modify `apps/web-staff/src/mocks/server.ts` — handler `PATCH /api/establishment`.

---

## Task 1: Contratto `UpdateEstablishmentInput` (layer `contracts`)

**Files:** Modify `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi l'input**

In coda a `packages/contracts/src/index.ts` (vicino agli altri Establishment DTO):

```ts
/** Input rinomina stabilimento (admin-only). */
export interface UpdateEstablishmentInput {
  name: string;
}
```

- [ ] **Step 2: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK; `UpdateEstablishmentInput` presente in `packages/contracts/dist/index.d.ts`.

- [ ] **Step 3: Commit (layer contracts)**

```bash
cd /c/Users/Jays/Desktop/new && git add packages/contracts/src/index.ts && git commit -F - <<'EOF'
feat(contracts): UpdateEstablishmentInput (rinomina stabilimento)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Role-guard `@Roles` + `RolesGuard` (layer `api`, TDD)

**Files:**
- Create `apps/api/src/identity/roles.decorator.ts`
- Create `apps/api/src/identity/roles.guard.ts`
- Test `apps/api/src/identity/roles.guard.spec.ts`
- Modify `apps/api/src/identity/identity.module.ts`

- [ ] **Step 1: Scrivi il test (fallisce)**

Crea `apps/api/src/identity/roles.guard.spec.ts`:

```ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@coralyn/contracts';
import { RolesGuard } from './roles.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}
const reflectorWith = (roles: Role[] | undefined) =>
  ({ getAllAndOverride: () => roles }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('passa se nessun @Roles è definito', () => {
    const guard = new RolesGuard(reflectorWith(undefined));
    expect(guard.canActivate(ctx({ role: Role.Staff }))).toBe(true);
  });

  it('passa se il ruolo utente è tra quelli richiesti', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(guard.canActivate(ctx({ role: Role.Admin }))).toBe(true);
  });

  it('403 se il ruolo non è tra quelli richiesti', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(() => guard.canActivate(ctx({ role: Role.Staff }))).toThrow(ForbiddenException);
  });

  it('403 se manca del tutto lo user (difesa)', () => {
    const guard = new RolesGuard(reflectorWith([Role.Admin]));
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- roles.guard`
Expected: FAIL "Cannot find module './roles.guard'".

- [ ] **Step 3: Implementa decoratore e guard**

Crea `apps/api/src/identity/roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import type { Role } from '@coralyn/contracts';

export const ROLES_KEY = 'roles';

/** Restringe una rotta ai ruoli indicati; il RolesGuard applica il check. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
```

Crea `apps/api/src/identity/roles.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@coralyn/contracts';
import { ROLES_KEY } from './roles.decorator';
import type { AuthUser } from './auth-user';

/**
 * Guard globale dei ruoli: gira DOPO JwtAuthGuard (che popola req.user). Se la rotta
 * non ha @Roles → passa (endpoint solo-auth invariati). Altrimenti richiede che
 * req.user.role sia tra quelli indicati, altrimenti 403. Vedi ADR-0039.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const role = req.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Ruolo non autorizzato');
    }
    return true;
  }
}
```

- [ ] **Step 4: Registra il guard come 2° APP_GUARD**

In `apps/api/src/identity/identity.module.ts`: importa `RolesGuard` e aggiungilo ai `providers` **subito dopo** la riga `{ provide: APP_GUARD, useClass: JwtAuthGuard }`:

```ts
import { RolesGuard } from './roles.guard';
// ...providers:
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
```
(L'ordine conta: `JwtAuthGuard` popola `req.user` prima che `RolesGuard` lo legga.)

- [ ] **Step 5: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- roles.guard`
Expected: PASS (4/4).

(Nessun commit qui: il commit del layer `api` è a fine Task 4.)

---

## Task 3: `PATCH /api/establishment` (rinomina) + e2e + ADR-0039 (layer `api`, chiude il commit)

**Files:**
- Create `apps/api/src/establishment/dto/update-establishment.dto.ts`
- Modify `apps/api/src/establishment/establishment.service.ts`
- Modify `apps/api/src/establishment/establishment.controller.ts`
- Create `apps/api/test/establishment-rename.e2e-spec.ts`
- Create `docs/architecture/decisions/0039-rbac-role-guard.md`

- [ ] **Step 1: Implementa il DTO di validazione**

Crea `apps/api/src/establishment/dto/update-establishment.dto.ts`:

```ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import type { UpdateEstablishmentInput } from '@coralyn/contracts';

export class UpdateEstablishmentDto implements UpdateEstablishmentInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
```

- [ ] **Step 2: Aggiungi `rename` al service**

In `apps/api/src/establishment/establishment.service.ts`, aggiungi il metodo alla classe (l'`Establishment` **non ha RLS**: update per PK `id = tenantId`):

```ts
  async rename(name: string): Promise<{ id: string; name: string }> {
    const tenantId = this.tenant.require();
    return this.prisma.establishment.update({
      where: { id: tenantId },
      data: { name },
      select: { id: true, name: true },
    });
  }
```

- [ ] **Step 3: Aggiungi il `PATCH` al controller**

In `apps/api/src/establishment/establishment.controller.ts`: aggiorna gli import e aggiungi il metodo:

```ts
import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { EstablishmentService } from './establishment.service';
import { Roles } from '../identity/roles.decorator';
import { UpdateEstablishmentDto } from './dto/update-establishment.dto';

@Controller('establishment')
export class EstablishmentController {
  constructor(private readonly establishment: EstablishmentService) {}

  @Get('overview')
  overview(): Promise<EstablishmentOverviewDTO> {
    return this.establishment.getOverview();
  }

  @Patch()
  @Roles(Role.Admin)
  rename(@Body() body: UpdateEstablishmentDto): Promise<{ id: string; name: string }> {
    return this.establishment.rename(body.name);
  }
}
```

- [ ] **Step 4: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment-rename.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];

describe('Establishment rename (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let adminT: string;
  let staffT: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'REN A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'REN B' } })).id;
    await createUser(prisma, { email: 'ren.admin@e2e.test', password: 'pw1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'ren.staff@e2e.test', password: 'pw2', role: Role.staff, establishmentId: s1 });
    adminT = await login(app, 'ren.admin@e2e.test', 'pw1');
    staffT = await login(app, 'ren.staff@e2e.test', 'pw2');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ['ren.admin@e2e.test', 'ren.staff@e2e.test'] } } });
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('401 senza Bearer', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').send({ name: 'X' }).expect(401);
  });

  it('staff → 403 (role-guard)', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(staffT)).send({ name: 'Hack' }).expect(403);
  });

  it('nome vuoto → 400', async () => {
    await request(app.getHttpServer()).patch('/api/establishment').set(...bearer(adminT)).send({ name: '' }).expect(400);
  });

  it('admin rinomina → 200 e persiste (isolato da s2)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/establishment').set(...bearer(adminT)).send({ name: 'Lido Rinominato' }).expect(200);
    expect(res.body).toEqual({ id: s1, name: 'Lido Rinominato' });
    const overview = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(adminT)).expect(200);
    expect(overview.body.establishment.name).toBe('Lido Rinominato');
    const b = await prisma.establishment.findUniqueOrThrow({ where: { id: s2 } });
    expect(b.name).toBe('REN B'); // s2 intatto
  });
});
```

- [ ] **Step 5: Builda contracts, esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment-rename`
Expected: PASS (4/4). Se DB test stale: `cd apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy` e ripeti.

- [ ] **Step 6: Verifica NESSUNA regressione (il nuovo RolesGuard è globale)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: api unit ≥ 122 + 4 (roles.guard) · api e2e ≥ 169 + 4 (rename), **tutti verdi**. ⚠️ Se qualche e2e pre-esistente va in 403, il `RolesGuard` sta bloccando rotte che prima passavano → verifica che gli endpoint senza `@Roles` ritornino `true` (Step guard: `!required → true`).

- [ ] **Step 7: Scrivi l'ADR-0039**

Crea `docs/architecture/decisions/0039-rbac-role-guard.md` (adegua l'intestazione al formato degli ADR vicini in `docs/architecture/decisions/`):

```markdown
# ADR-0039 — RBAC: role-guard applicativo (`@Roles`/`RolesGuard`)

Status: Accepted — 2026-07-04

## Contesto
Finora l'API aveva un solo guard globale (`JwtAuthGuard`, ADR-0024): autenticazione sì,
**autorizzazione per ruolo no**. Le scritture dello Stabilimento (rinomina; poi gestione
utenti, D-025) devono essere **admin-only**. Serviva un primitivo di autorizzazione riusabile.

## Decisione
Introdurre un decoratore `@Roles(...roles: Role[])` (metadato via `SetMetadata`) e un
`RolesGuard` registrato come **secondo `APP_GUARD`** dopo `JwtAuthGuard`. Il guard legge i
ruoli richiesti col `Reflector`; **se assenti passa** (endpoint solo-auth invariati),
altrimenti richiede `req.user.role ∈ roles` (→ `403`). L'ordine di registrazione garantisce
che `req.user` sia già popolato. Il **superuser** (piattaforma) non ha i ruoli tenant → `403`
sulle scritture tenant (la sua console cross-tenant è fuori scope, ADR-0015).

## Conseguenze
- (+) Autorizzazione dichiarativa e riusabile; sblocca D-025 (gestione utenti).
- (+) Zero impatto sugli endpoint esistenti (nessun `@Roles` = comportamento invariato).
- (−) La revoca *immediata* dei permessi su un token già emesso resta legata alla scadenza
  (8h) finché non si affronta la revoca token (D-026).
```

- [ ] **Step 8: Commit (layer api)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/api/src/identity/roles.decorator.ts apps/api/src/identity/roles.guard.ts apps/api/src/identity/roles.guard.spec.ts apps/api/src/identity/identity.module.ts apps/api/src/establishment/dto apps/api/src/establishment/establishment.service.ts apps/api/src/establishment/establishment.controller.ts apps/api/test/establishment-rename.e2e-spec.ts docs/architecture/decisions/0039-rbac-role-guard.md && git commit -F - <<'EOF'
feat(api): role-guard @Roles/RolesGuard (ADR-0039) + PATCH /establishment (rinomina admin-only)

RolesGuard come 2° APP_GUARD: endpoint senza @Roles invariati, con @Roles(admin)
richiede ruolo admin (403 altrimenti). Rinomina stabilimento gated + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: FE — modale rinomina + gating admin (layer `web-staff`)

**Files:**
- Modify `apps/web-staff/src/features/establishment/useEstablishment.ts`
- Modify `apps/web-staff/src/mocks/server.ts`
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue`
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`

- [ ] **Step 1: Aggiungi la mutation al composable**

In `apps/web-staff/src/features/establishment/useEstablishment.ts`, aggiorna gli import e aggiungi in coda:

```ts
import type { EstablishmentOverviewDTO, UpdateEstablishmentInput } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@/lib/useQueryResource';
// ...(l'export useEstablishmentOverview resta invariato)...

export function useRenameEstablishment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateEstablishmentInput) =>
      apiFetch<{ id: string; name: string }>('/establishment', { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}
```

- [ ] **Step 2: Aggiungi l'handler MSW `PATCH /api/establishment`**

In `apps/web-staff/src/mocks/server.ts`, accanto all'handler `GET /api/establishment/overview`, aggiungi:

```ts
  http.patch('/api/establishment', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json({ id: 'e-1', name: body.name });
  }),
```

- [ ] **Step 3: Scrivi il test (fallisce)**

In `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`, aggiungi dentro il `describe('EstablishmentView', …)` (dopo l'ultimo `it`):

```ts
  it('admin: apre il modale «Modifica» e invia la rinomina', async () => {
    const seen: string[] = [];
    server.use(http.patch('/api/establishment', async ({ request }) => {
      const b = (await request.json()) as { name: string };
      seen.push(b.name);
      return HttpResponse.json({ id: 'e-1', name: b.name });
    }));
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="edit-establishment"]').trigger('click');
    await settle();
    const input = w.find('[data-testid="establishment-name-input"]');
    await input.setValue('Nuovo Nome Lido');
    await w.find('[data-testid="establishment-name-save"]').trigger('click');
    await settle();
    expect(seen).toContain('Nuovo Nome Lido');
  });

  it('staff: nessun bottone «Modifica» attivo (resta "in arrivo")', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="edit-establishment"]').exists()).toBe(false);
    expect(w.text()).toContain('Modifica · in arrivo');
  });
```

- [ ] **Step 4: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: FAIL (mancano `data-testid` e la logica admin).

- [ ] **Step 5: Implementa modale + gating nella view**

In `apps/web-staff/src/features/establishment/EstablishmentView.vue`:

(a) **script** — aggiorna import e aggiungi stato/gating. Sostituisci il blocco import + `const { data … }` e aggiungi in coda allo script:

```ts
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Card, StatTile, Badge, Button, Avatar, Icon, Modal, Field, Input } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useEstablishmentOverview, useRenameEstablishment } from './useEstablishment';
```
e, dopo `const team = computed(...)` (fine script), aggiungi:

```ts
const isAdmin = computed(() => session.role === Role.Admin);
const renameOpen = ref(false);
const nameDraft = ref('');
const rename = useRenameEstablishment();

function openRename() {
  nameDraft.value = data.value?.establishment.name ?? '';
  renameOpen.value = true;
}
function submitRename() {
  const name = nameDraft.value.trim();
  if (!name) return;
  rename.mutate(
    { name },
    { onSuccess: () => { renameOpen.value = false; } },
  );
}
```

(b) **template header** — sostituisci il blocco delle azioni «Modifica» (il `<div class="flex items-center gap-2">…Modifica…</div>`) con:

```vue
        <Button v-if="isAdmin" data-testid="edit-establishment" variant="secondary" @click="openRename"><Icon name="edit" :size="15" />Modifica</Button>
        <div v-else class="flex items-center gap-2">
          <Badge tone="soon">Modifica · in arrivo</Badge>
          <Button variant="secondary" disabled><Icon name="edit" :size="15" />Modifica</Button>
        </div>
```

(c) **template** — subito prima della chiusura `</section>`, aggiungi il modale:

```vue
    <Modal v-model:open="renameOpen" title="Rinomina stabilimento" eyebrow="Modifica">
      <form class="flex flex-col gap-4" @submit.prevent="submitRename">
        <Field label="Nome">
          <Input name="establishment-name" data-testid="establishment-name-input" v-model="nameDraft" placeholder="Nome del lido" />
        </Field>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="renameOpen = false">Annulla</Button>
          <Button type="submit" data-testid="establishment-name-save">Salva</Button>
        </div>
      </form>
    </Modal>
```

- [ ] **Step 6: Esegui il test — deve passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: PASS.

- [ ] **Step 7: Typecheck + suite web-staff**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff ≥ 183 + 2 nuovi, verdi.

- [ ] **Step 8: Commit (layer web-staff)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts && git commit -F - <<'EOF'
feat(web-staff): «Modifica» stabilimento — modale rinomina admin-only (gating) — TDD

useRenameEstablishment + modale ui-kit; bottone attivo solo per admin, staff resta
"in arrivo". Invalida la query overview.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD Fase 1)
- [ ] Suite verdi: contracts build · api unit (≥122+4) · api e2e (≥169+4) · web-staff (≥183+2) · ui-kit 70 · typecheck pulito.
- [ ] **Verifica LIVE** (Docker `--build api web`): come admin, «Modifica» apre il modale, la rinomina persiste e la pagina si aggiorna; come staff il bottone resta "in arrivo". 0 errori console. ⚠️ Se rilanci il seed: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.
- [ ] **Presenta lo stato all'utente e attendi conferma** prima della Fase 2 (gestione utenti).
