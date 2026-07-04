# Stabilimento Fase 2 — Gestione utenti (D-025 core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attivare la gestione utenti dello Stabilimento (D-025 core): l'admin **crea**, **elenca** e **disabilita/riabilita** lo staff, con invarianti anti-lockout e login che respinge i disabilitati.

**Architecture:** Colonna additiva `User.disabledAt` (soft-disable). Nuovi `POST /api/establishment/users` e `PATCH /api/establishment/users/:id`, entrambi `@Roles(Role.Admin)` (riuso del role-guard ADR-0039 di Fase 1), tenant-scoped con filtro `establishmentId` esplicito (`User` non ha RLS, ADR-0026). Le invarianti (no self-disable; no disabilitazione dell'ultimo admin attivo) vivono nel service e ritornano `422`. Il `login` respinge `disabledAt != null` con lo stesso `401` generico. La projection dell'overview espone `disabledAt` così la card team mostra lo stato. FE: modale «Aggiungi utente» (admin) + azione disabilita/riabilita per riga; lo staff vede la lista read-only.

**Tech Stack:** NestJS (guard/reflector/class-validator) · Prisma (migrazione additiva) · argon2id (`PasswordHasher`, riuso) · `@coralyn/contracts` (compila in `dist/`) · Vue 3 + Pinia + TanStack Query + ui-kit · Vitest + MSW · Jest e2e + supertest.

**Gotcha (handoff):**
- Dopo modifiche a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **PRIMA** di typecheck/test api (l'api consuma il buildato).
- Il `RolesGuard` è **globale** (Fase 1): ri-esegui **tutta** la suite api dopo l'aggiunta degli endpoint.
- `User` **non ha RLS** (ADR-0026): ogni query utenti va filtrata **esplicitamente** per `establishmentId`.
- DB dev = `coralyn_dev`, DB test = `coralyn_test`, entrambi su `localhost:5433`, utente `coralyn_app`. Prisma **non** auto-carica il `.env` di root quando lanciato da `apps/api` → passare `DATABASE_URL` inline (come in Fase 1).
- Bash tool su Windows = Git Bash/POSIX: commit multi-riga con `git commit -F -` + heredoc; niente here-string PowerShell.
- Verifica LIVE: `docker compose --profile full up -d --build api web` (stale = 404). Se rilanci il seed usa `DEV_ADMIN_PASSWORD=coralyn-admin-8473`.

**Baseline da non regredire (fine Fase 1):** ui-kit 70 · web-staff 185 · api unit 126 · api e2e 174 · typecheck pulito.

---

## File Structure

**Contracts (Task 1 — commit `contracts`):**
- Modify `packages/contracts/src/index.ts` — `disabledAt` su `EstablishmentMemberDTO`; nuovi `CreateStaffUserInput`, `UpdateStaffUserInput`.

**API (Task 2 — commit `api`):**
- Modify `apps/api/prisma/schema.prisma` — `User.disabledAt DateTime?`.
- Create `apps/api/prisma/migrations/<ts>_add_user_disabled_at/migration.sql` — generata da `prisma migrate dev`.
- Create `apps/api/src/establishment/dto/create-staff-user.dto.ts` — validazione create.
- Create `apps/api/src/establishment/dto/update-staff-user.dto.ts` — validazione disable/enable.
- Create `apps/api/src/establishment/establishment-users.service.ts` — create + setDisabled + invarianti.
- Create `apps/api/src/establishment/establishment-users.service.spec.ts` — unit (invarianti + 409).
- Create `apps/api/src/establishment/establishment-users.controller.ts` — `POST` + `PATCH /:id`, `@Roles(admin)`.
- Modify `apps/api/src/establishment/establishment.module.ts` — registra controller/service + `PasswordHasher`.
- Modify `apps/api/src/establishment/establishment.service.ts` — `disabledAt` nel select `users` dell'overview.
- Modify `apps/api/src/establishment/establishment.projection.ts` — mapping `disabledAt` nel team.
- Modify `apps/api/src/identity/identity.service.ts` — `login` respinge i disabilitati.
- Create `apps/api/test/establishment-users.e2e-spec.ts` — e2e (matrice HTTP).

**FE (Task 3 — commit `web-staff`):**
- Modify `apps/web-staff/src/features/establishment/useEstablishment.ts` — `useCreateStaffUser`, `useSetStaffUserDisabled`.
- Modify `apps/web-staff/src/mocks/server.ts` — handler `POST`/`PATCH` users + `disabledAt` nel team dell'overview mock.
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue` — «Aggiungi utente» (modale) + azioni riga + stato disabilitato + gating.
- Modify `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts` — test.

---

## Task 1: Contratti `disabledAt` + input gestione utenti (layer `contracts`)

**Files:** Modify `packages/contracts/src/index.ts`

- [ ] **Step 1: Estendi `EstablishmentMemberDTO` con `disabledAt`**

Sostituisci l'interfaccia esistente (vicino a `EstablishmentOverviewDTO`):

```ts
/** Membro del team dello stabilimento (superuser escluso: è di piattaforma). */
export interface EstablishmentMemberDTO {
  id: string;
  email: string;
  role: 'admin' | 'staff';
  disabledAt: string | null; // ISO datetime = disabilitato (soft); null = attivo
}
```

- [ ] **Step 2: Aggiungi gli input di gestione utenti**

In coda a `packages/contracts/src/index.ts` (dopo `UpdateEstablishmentInput`):

```ts
/** Input creazione staff (admin-only). Password iniziale impostata dall'admin;
 *  invito-via-email deferito (D-025). Ruolo mai `superuser`. */
export interface CreateStaffUserInput {
  email: string;
  password: string;
  role: 'admin' | 'staff';
}

/** Input abilita/disabilita utente (admin-only, soft-disable). */
export interface UpdateStaffUserInput {
  disabled: boolean;
}
```

- [ ] **Step 3: Builda i contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK; `CreateStaffUserInput`, `UpdateStaffUserInput` e `EstablishmentMemberDTO.disabledAt` presenti in `packages/contracts/dist/index.d.ts`.

- [ ] **Step 4: Commit (layer contracts)**

```bash
cd /c/Users/Jays/Desktop/new && git add packages/contracts/src/index.ts && git commit -F - <<'EOF'
feat(contracts): gestione utenti stabilimento — disabledAt su member + Create/UpdateStaffUserInput

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: Backend gestione utenti (layer `api`, TDD)

**Files:** vedi File Structure (§ API). Un solo commit a fine task.

### Migrazione + schema

- [ ] **Step 1: Aggiungi `disabledAt` allo schema Prisma**

In `apps/api/prisma/schema.prisma`, dentro `model User { … }`, aggiungi il campo (dopo `role Role`):

```prisma
  disabledAt      DateTime? // null = attivo; valorizzato = disabilitato (soft), il login lo respinge (D-025)
```

- [ ] **Step 2: Genera e applica la migrazione al DB dev**

Run:
```bash
cd /c/Users/Jays/Desktop/new/apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" corepack pnpm exec prisma migrate dev --name add_user_disabled_at
```
Expected: crea `prisma/migrations/<ts>_add_user_disabled_at/migration.sql` con `ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);`, applica al DB `coralyn_dev`, e **rigenera il Prisma Client** (ora `User` ha `disabledAt`).
Fallback (se `migrate dev` fallisce sullo shadow DB per permessi): crea a mano la cartella `prisma/migrations/<YYYYMMDDHHMMSS>_add_user_disabled_at/migration.sql` con quell'unica `ALTER TABLE`, poi `DATABASE_URL="…coralyn_dev…" corepack pnpm exec prisma migrate deploy && corepack pnpm exec prisma generate`.

- [ ] **Step 3: Applica la migrazione anche al DB test**

Run:
```bash
cd /c/Users/Jays/Desktop/new/apps/api && DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_test?schema=public" corepack pnpm exec prisma migrate deploy
```
Expected: `add_user_disabled_at` applicata a `coralyn_test` (necessaria per gli e2e).

### DTO di validazione

- [ ] **Step 4: DTO create**

Crea `apps/api/src/establishment/dto/create-staff-user.dto.ts`:

```ts
import { IsEmail, IsIn, IsNotEmpty, IsString, MinLength } from 'class-validator';
import type { CreateStaffUserInput } from '@coralyn/contracts';

export class CreateStaffUserDto implements CreateStaffUserInput {
  @IsEmail()
  email!: string;

  // MinLength(8): guardia minima di robustezza (non-debito), la password è impostata dall'admin.
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsIn(['admin', 'staff']) // mai 'superuser' → 400
  role!: 'admin' | 'staff';
}
```

- [ ] **Step 5: DTO update (disable/enable)**

Crea `apps/api/src/establishment/dto/update-staff-user.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';
import type { UpdateStaffUserInput } from '@coralyn/contracts';

export class UpdateStaffUserDto implements UpdateStaffUserInput {
  @IsBoolean()
  disabled!: boolean;
}
```

### Service (TDD: test prima)

- [ ] **Step 6: Scrivi il unit test del service (fallisce)**

Crea `apps/api/src/establishment/establishment-users.service.spec.ts`:

```ts
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EstablishmentUsersService } from './establishment-users.service';

const TENANT = 't-1';

function makeService(overrides: {
  user?: Partial<{
    create: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  }>;
} = {}) {
  const user = {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    ...overrides.user,
  };
  const prisma = { user } as any;
  const tenant = { require: () => TENANT } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('HASH') } as any;
  return { service: new EstablishmentUsersService(prisma, tenant, hasher), user, hasher };
}

describe('EstablishmentUsersService', () => {
  describe('create', () => {
    it('hasha la password e ritorna il member attivo', async () => {
      const { service, user, hasher } = makeService();
      user.create.mockResolvedValue({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
      const res = await service.create({ email: 'a@x.it', password: 'password123', role: 'staff' });
      expect(hasher.hash).toHaveBeenCalledWith('password123');
      expect(user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ establishmentId: TENANT, email: 'a@x.it', passwordHash: 'HASH', role: 'staff' }) }),
      );
      expect(res).toEqual({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
    });

    it('mappa la violazione di unicità email (P2002) in 409', async () => {
      const { service, user } = makeService();
      user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.create({ email: 'dup@x.it', password: 'password123', role: 'staff' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('setDisabled', () => {
    it('404 se l’utente non è nel tenant', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue(null);
      await expect(service.setDisabled('u-x', true, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('422 sul self-disable', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-1', email: 'a@x.it', role: 'admin', disabledAt: null });
      await expect(service.setDisabled('admin-1', true, 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('422 se disabilita l’ultimo admin attivo', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: null });
      user.count.mockResolvedValue(1); // un solo admin attivo
      await expect(service.setDisabled('admin-2', true, 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('disabilita un admin non-ultimo → update con disabledAt valorizzato', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: null });
      user.count.mockResolvedValue(2); // altri admin attivi restano
      user.update.mockResolvedValue({ id: 'admin-2', email: 'b@x.it', role: 'admin', disabledAt: new Date('2026-07-04T10:00:00Z') });
      const res = await service.setDisabled('admin-2', true, 'admin-1');
      expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'admin-2' }, data: { disabledAt: expect.any(Date) } }));
      expect(res.disabledAt).toBe('2026-07-04T10:00:00.000Z');
    });

    it('riabilita (disabled=false) senza invarianti → disabledAt null', async () => {
      const { service, user } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', role: 'staff', disabledAt: new Date() });
      user.update.mockResolvedValue({ id: 'u-9', email: 's@x.it', role: 'staff', disabledAt: null });
      const res = await service.setDisabled('u-9', false, 'admin-1');
      expect(user.count).not.toHaveBeenCalled();
      expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { disabledAt: null } }));
      expect(res.disabledAt).toBeNull();
    });
  });
});
```

- [ ] **Step 7: Esegui — deve fallire**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: FAIL "Cannot find module './establishment-users.service'".

- [ ] **Step 8: Implementa il service**

Crea `apps/api/src/establishment/establishment-users.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateStaffUserInput, EstablishmentMemberDTO } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../identity/password-hasher';

type UserRow = { id: string; email: string; role: string; disabledAt: Date | null };
const MEMBER_SELECT = { id: true, email: true, role: true, disabledAt: true } as const;

@Injectable()
export class EstablishmentUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
  ) {}

  /** Riga User → member DTO (mai passwordHash). */
  private toMember(u: UserRow): EstablishmentMemberDTO {
    return {
      id: u.id,
      email: u.email,
      role: u.role as 'admin' | 'staff',
      disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
    };
  }

  /** Crea uno staff/admin nel tenant corrente. Email globale unica → 409. */
  async create(input: CreateStaffUserInput): Promise<EstablishmentMemberDTO> {
    const tenantId = this.tenant.require();
    const passwordHash = await this.hasher.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { establishmentId: tenantId, email: input.email, passwordHash, role: input.role },
        select: MEMBER_SELECT,
      });
      return this.toMember(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
  }

  /**
   * Disabilita (soft) o riabilita un utente del tenant. Invarianti anti-lockout su disable:
   * (a) no self-disable; (b) non azzerare gli admin attivi. User non ha RLS (ADR-0026):
   * filtro esplicito per establishmentId.
   */
  async setDisabled(id: string, disabled: boolean, currentUserId: string): Promise<EstablishmentMemberDTO> {
    const tenantId = this.tenant.require();
    const target = await this.prisma.user.findFirst({
      where: { id, establishmentId: tenantId },
      select: MEMBER_SELECT,
    });
    if (!target) throw new NotFoundException('Utente non trovato');

    if (disabled) {
      if (id === currentUserId) {
        throw new UnprocessableEntityException('Non puoi disabilitare te stesso');
      }
      if (target.role === 'admin' && target.disabledAt === null) {
        const activeAdmins = await this.prisma.user.count({
          where: { establishmentId: tenantId, role: 'admin', disabledAt: null },
        });
        if (activeAdmins <= 1) {
          throw new UnprocessableEntityException('Deve restare almeno un amministratore attivo');
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { disabledAt: disabled ? new Date() : null },
      select: MEMBER_SELECT,
    });
    return this.toMember(updated);
  }
}
```

- [ ] **Step 9: Esegui — deve passare**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: PASS (7/7).

### Controller + wiring

- [ ] **Step 10: Controller**

Crea `apps/api/src/establishment/establishment-users.controller.ts`:

```ts
import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@coralyn/contracts';
import type { EstablishmentMemberDTO } from '@coralyn/contracts';
import { Roles } from '../identity/roles.decorator';
import { CurrentUser } from '../identity/current-user.decorator';
import type { AuthUser } from '../identity/auth-user';
import { EstablishmentUsersService } from './establishment-users.service';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateStaffUserDto } from './dto/update-staff-user.dto';

@Controller('establishment/users')
export class EstablishmentUsersController {
  constructor(private readonly users: EstablishmentUsersService) {}

  @Post()
  @Roles(Role.Admin)
  create(@Body() body: CreateStaffUserDto): Promise<EstablishmentMemberDTO> {
    return this.users.create(body);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  setDisabled(
    @Param('id') id: string,
    @Body() body: UpdateStaffUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<EstablishmentMemberDTO> {
    return this.users.setDisabled(id, body.disabled, user.id);
  }
}
```

- [ ] **Step 11: Registra controller + service + PasswordHasher nel modulo**

Sostituisci `apps/api/src/establishment/establishment.module.ts` con:

```ts
import { Module } from '@nestjs/common';
import { EstablishmentController } from './establishment.controller';
import { EstablishmentService } from './establishment.service';
import { EstablishmentUsersController } from './establishment-users.controller';
import { EstablishmentUsersService } from './establishment-users.service';
import { PasswordHasher } from '../identity/password-hasher';

@Module({
  controllers: [EstablishmentController, EstablishmentUsersController],
  // PasswordHasher è stateless (argon2): fornirlo qui evita di accoppiare i moduli.
  providers: [EstablishmentService, EstablishmentUsersService, PasswordHasher],
})
export class EstablishmentModule {}
```

### Login respinge i disabilitati

- [ ] **Step 12: `login` rifiuta gli utenti disabilitati**

In `apps/api/src/identity/identity.service.ts`, dentro `login`, subito **dopo** il blocco che valida le credenziali (dopo il `throw new UnauthorizedException('Credenziali non valide');` del check `!user || !verify`) e **prima** di `const dto = this.toDTO(user);`, aggiungi:

```ts
    if (user.disabledAt) {
      // Utente disabilitato (soft-disable, D-025): stesso 401 generico, nessuna enumerazione.
      // La revoca immediata di un token già emesso resta a D-026 (il token scade a 8h).
      throw new UnauthorizedException('Credenziali non valide');
    }
```

### Projection espone `disabledAt`

- [ ] **Step 13: Aggiungi `disabledAt` al team dell'overview**

In `apps/api/src/establishment/establishment.projection.ts`:

(a) nell'interfaccia `OverviewRaw`, cambia il tipo di `users`:
```ts
  users: { id: string; email: string; role: string; disabledAt: Date | null }[];
```
(b) nel `.map(...)` che costruisce `team`, includi `disabledAt` (ISO datetime o null):
```ts
    .map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role as 'admin' | 'staff',
      disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
    }))
```

- [ ] **Step 14: Seleziona `disabledAt` nell'overview service**

In `apps/api/src/establishment/establishment.service.ts`, nella query `tx.user.findMany`, aggiungi `disabledAt` al `select`:
```ts
        tx.user.findMany({ where: { establishmentId: tenantId }, select: { id: true, email: true, role: true, disabledAt: true } }),
```

### e2e (TDD: test prima)

- [ ] **Step 15: Scrivi l'e2e (fallisce)**

Crea `apps/api/test/establishment-users.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['u.admin@e2e.test', 'u.admin2@e2e.test', 'u.staff@e2e.test', 'u.new@e2e.test'];

describe('Establishment users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let adminId: string;
  let admin2Id: string;
  let staffId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    s1 = (await prisma.establishment.create({ data: { name: 'USERS A' } })).id;
    await createUser(prisma, { email: 'u.admin@e2e.test', password: 'pw-admin-1', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'u.admin2@e2e.test', password: 'pw-admin-2', role: Role.admin, establishmentId: s1 });
    await createUser(prisma, { email: 'u.staff@e2e.test', password: 'pw-staff-1', role: Role.staff, establishmentId: s1 });
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.admin@e2e.test' } })).id;
    admin2Id = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.admin2@e2e.test' } })).id;
    staffId = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.staff@e2e.test' } })).id;
    adminT = await login(app, 'u.admin@e2e.test', 'pw-admin-1');
    staffT = await login(app, 'u.staff@e2e.test', 'pw-staff-1');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('staff → 403 sulla create (role-guard)', async () => {
    await request(app.getHttpServer())
      .post('/api/establishment/users').set(...bearer(staffT))
      .send({ email: 'u.new@e2e.test', password: 'password123', role: 'staff' }).expect(403);
  });

  it('role "superuser" → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/establishment/users').set(...bearer(adminT))
      .send({ email: 'u.new@e2e.test', password: 'password123', role: 'superuser' }).expect(400);
  });

  it('password troppo corta → 400', async () => {
    await request(app.getHttpServer())
      .post('/api/establishment/users').set(...bearer(adminT))
      .send({ email: 'u.new@e2e.test', password: 'short', role: 'staff' }).expect(400);
  });

  it('admin crea uno staff → 201 e compare nell’overview (attivo)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/establishment/users').set(...bearer(adminT))
      .send({ email: 'u.new@e2e.test', password: 'password123', role: 'staff' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ email: 'u.new@e2e.test', role: 'staff', disabledAt: null }));
    const overview = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(adminT)).expect(200);
    const member = overview.body.team.find((m: { email: string }) => m.email === 'u.new@e2e.test');
    expect(member).toEqual(expect.objectContaining({ role: 'staff', disabledAt: null }));
  });

  it('email duplicata → 409', async () => {
    await request(app.getHttpServer())
      .post('/api/establishment/users').set(...bearer(adminT))
      .send({ email: 'u.staff@e2e.test', password: 'password123', role: 'staff' }).expect(409);
  });

  it('self-disable → 422', async () => {
    await request(app.getHttpServer())
      .patch(`/api/establishment/users/${adminId}`).set(...bearer(adminT))
      .send({ disabled: true }).expect(422);
  });

  it('admin disabilita lo staff → 200, disabledAt valorizzato, e quello staff non fa più login (401)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT))
      .send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(401);
    // riabilita → login di nuovo OK
    await request(app.getHttpServer()).patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(200);
  });

  it('disabilitare un admin non-ultimo → 200 (l’altro admin resta)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT))
      .send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 16: Builda contracts, esegui l'e2e**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api test:e2e -- establishment-users`
Expected: PASS (8/8). Se il DB test è indietro con le migrazioni, riesegui lo Step 3 e ripeti.

- [ ] **Step 17: Verifica NESSUNA regressione (guard globale + login modificato + projection)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: api unit ≥ 126 + 7 (service) = **133** · api e2e ≥ 174 + 8 (users) = **182**, tutti verdi. ⚠️ Se qualche e2e va in 403 inatteso, controlla che i nuovi endpoint abbiano `@Roles(Role.Admin)` e che gli altri restino senza `@Roles`. Se un test login pre-esistente rompe, verifica il check `user.disabledAt` (gli utenti seed non hanno `disabledAt`).

- [ ] **Step 18: Commit (layer api)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/establishment/dto apps/api/src/establishment/establishment-users.service.ts apps/api/src/establishment/establishment-users.service.spec.ts apps/api/src/establishment/establishment-users.controller.ts apps/api/src/establishment/establishment.module.ts apps/api/src/establishment/establishment.service.ts apps/api/src/establishment/establishment.projection.ts apps/api/src/identity/identity.service.ts apps/api/test/establishment-users.e2e-spec.ts && git commit -F - <<'EOF'
feat(api): gestione utenti stabilimento (D-025) — create/disable admin-only + soft-disable

Migrazione additiva User.disabledAt. POST/PATCH /establishment/users @Roles(admin):
crea staff (email unica → 409, ruolo != superuser → 400), disabilita/riabilita (soft)
con invarianti anti-lockout (no self-disable, no ultimo admin → 422). Il login respinge
i disabilitati (401 generico). L'overview espone disabledAt. Unit + e2e.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: FE gestione utenti (layer `web-staff`, TDD)

**Files:** vedi File Structure (§ FE). Un solo commit a fine task.

- [ ] **Step 1: Mutations create/disable nel composable**

In `apps/web-staff/src/features/establishment/useEstablishment.ts`, aggiorna gli import e aggiungi in coda (accanto a `useRenameEstablishment`):

```ts
import type {
  EstablishmentOverviewDTO,
  UpdateEstablishmentInput,
  CreateStaffUserInput,
  EstablishmentMemberDTO,
} from '@coralyn/contracts';
// ...(useEstablishmentOverview e useRenameEstablishment restano)...

export function useCreateStaffUser() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateStaffUserInput) =>
      apiFetch<EstablishmentMemberDTO>('/establishment/users', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}

export function useSetStaffUserDisabled() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; disabled: boolean }) =>
      apiFetch<EstablishmentMemberDTO>(`/establishment/users/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ disabled: vars.disabled }) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}
```
(La `mutationResource` mostra di default un toast globale con il `message` d'errore del server → 409 "Email già in uso" e 422 invarianti compaiono come toast, senza codice extra.)

- [ ] **Step 2: Handler MSW users + `disabledAt` nel team dell'overview mock**

In `apps/web-staff/src/mocks/server.ts`:

(a) Nel body del handler `GET /api/establishment/overview`, aggiungi `disabledAt: null` a ciascun membro di `team`:
```ts
      team: [
        { id: 'u-1', email: 'admin@coralyn.dev', role: 'admin', disabledAt: null },
        { id: 'u-2', email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: null },
      ],
```

(b) Subito **dopo** quel handler, aggiungi i due handler users:
```ts
  http.post('/api/establishment/users', async ({ request }) => {
    const b = (await request.json()) as { email: string; role: 'admin' | 'staff' };
    return HttpResponse.json({ id: `u-${b.email}`, email: b.email, role: b.role, disabledAt: null }, { status: 201 });
  }),
  http.patch('/api/establishment/users/:id', async ({ params, request }) => {
    const b = (await request.json()) as { disabled: boolean };
    return HttpResponse.json({ id: params.id as string, email: 'x@x.it', role: 'staff', disabledAt: b.disabled ? '2026-07-04T10:00:00.000Z' : null });
  }),
```

- [ ] **Step 3: Scrivi i test della view (falliscono)**

In `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`, aggiungi dentro il `describe('EstablishmentView', …)` (dopo l'ultimo `it`):

```ts
  it('admin: «Aggiungi utente» apre il modale e invia la create', async () => {
    const seen: Array<{ email: string; role: string }> = [];
    server.use(http.post('/api/establishment/users', async ({ request }) => {
      const b = (await request.json()) as { email: string; password: string; role: 'admin' | 'staff' };
      seen.push({ email: b.email, role: b.role });
      return HttpResponse.json({ id: 'u-new', email: b.email, role: b.role, disabledAt: null }, { status: 201 });
    }));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-user"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).value = 'nuovo@lido.it';
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="new-user-password"]') as HTMLInputElement).value = 'password123';
    (document.querySelector('[data-testid="new-user-password"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="new-user-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ email: 'nuovo@lido.it', role: 'staff' }]);
    w.unmount();
  });

  it('admin: disabilita una riga del team', async () => {
    const seen: Array<{ id: string; disabled: boolean }> = [];
    server.use(http.patch('/api/establishment/users/:id', async ({ params, request }) => {
      const b = (await request.json()) as { disabled: boolean };
      seen.push({ id: params.id as string, disabled: b.disabled });
      return HttpResponse.json({ id: params.id as string, email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: '2026-07-04T10:00:00.000Z' });
    }));
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    await row.find('[data-testid="toggle-user-disabled"]').trigger('click');
    await settle();
    expect(seen).toEqual([{ id: 'u-2', disabled: true }]);
  });

  it('staff: lista team read-only (nessun bottone gestione)', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="add-user"]').exists()).toBe(false);
    expect(w.find('[data-testid="toggle-user-disabled"]').exists()).toBe(false);
  });

  it('mostra lo stato "Disabilitato" per i membri disabilitati', async () => {
    server.use(http.get('/api/establishment/overview', () =>
      HttpResponse.json({
        establishment: { id: 'e-1', name: 'Lido Maestrale' },
        activeSeason: null,
        timeSlots: [{ id: 'ts-1', name: 'Giornata' }],
        structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
        team: [
          { id: 'u-1', email: 'admin@coralyn.dev', role: 'admin', disabledAt: null },
          { id: 'u-2', email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: '2026-07-04T10:00:00.000Z' },
        ],
      })));
    const w = mountApp(EstablishmentView);
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    expect(row.text()).toContain('Disabilitato');
  });
```

- [ ] **Step 4: Esegui — deve fallire**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: FAIL (mancano `data-testid` e la logica utenti).

- [ ] **Step 5: Implementa la view**

In `apps/web-staff/src/features/establishment/EstablishmentView.vue`:

(a) **script** — aggiungi `Select` all'import ui-kit e le mutation/stato. Aggiorna l'import ui-kit:
```ts
import { Card, StatTile, Badge, Button, Avatar, Icon, Modal, Field, Input, Select } from '@coralyn/ui-kit';
```
aggiungi all'import del composable `useCreateStaffUser, useSetStaffUserDisabled`:
```ts
import { useEstablishmentOverview, useRenameEstablishment, useCreateStaffUser, useSetStaffUserDisabled } from './useEstablishment';
```
Nel blocco `team` computed, includi `disabledAt` nel proiettato (così il template può marcarlo):
```ts
const team = computed(() =>
  (data.value?.team ?? []).map((m) => ({
    id: m.id,
    email: m.email,
    roleLabel: ROLE_LABEL[m.role],
    tone: m.role === 'admin' ? ('brand' as const) : ('neutral' as const),
    ini: m.email.slice(0, 2).toUpperCase(),
    you: session.userEmail === m.email,
    disabled: m.disabledAt !== null,
  })),
);
```
In coda allo script (dopo il blocco rename di Fase 1) aggiungi:
```ts
const addOpen = ref(false);
const newEmail = ref('');
const newPassword = ref('');
const newRole = ref<'admin' | 'staff'>('staff');
const createUser = useCreateStaffUser();
const setDisabled = useSetStaffUserDisabled();

function openAddUser() {
  newEmail.value = '';
  newPassword.value = '';
  newRole.value = 'staff';
  addOpen.value = true;
}
function submitAddUser() {
  const email = newEmail.value.trim();
  const password = newPassword.value;
  if (!email || !password) return;
  createUser.mutate(
    { email, password, role: newRole.value },
    { onSuccess: () => { addOpen.value = false; } },
  );
}
function toggleDisabled(u: { id: string; disabled: boolean }) {
  setDisabled.mutate({ id: u.id, disabled: !u.disabled });
}
```

(b) **template — header card Utenti** — sostituisci il `Badge` "Inviti e gestione · in arrivo" (dentro la card "Utenti e ruoli", nel `div.flex.items-center.justify-between`) con il bottone admin + fallback:
```vue
          <Button v-if="isAdmin" data-testid="add-user" variant="secondary" @click="openAddUser"><Icon name="plus" :size="13" />Aggiungi utente</Button>
          <Badge v-else tone="soon"><Icon name="plus" :size="13" />Inviti e gestione · in arrivo</Badge>
```

(c) **template — riga team** — sostituisci il contenuto del `v-for="u in team"` per marcare i disabilitati e aggiungere l'azione admin. Sostituisci l'intero blocco riga con:
```vue
          <div v-for="u in team" :key="u.id" data-testid="team-row" class="flex items-center gap-3 border-b border-[var(--color-border-row)] py-3 last:border-0" :class="u.disabled && 'opacity-55'">
            <Avatar :initials="u.ini" size="md" :tone="u.tone === 'brand' ? 'brand' : 'accent'" />
            <div class="flex flex-1 items-center gap-2">
              <span class="text-[13.5px] font-semibold text-[var(--color-text)]">{{ u.email }}</span>
              <Badge v-if="u.you" tone="accent">Tu</Badge>
              <Badge v-if="u.disabled" tone="neutral">Disabilitato</Badge>
            </div>
            <Badge :tone="u.tone">{{ u.roleLabel }}</Badge>
            <Button v-if="isAdmin && !u.you" data-testid="toggle-user-disabled" variant="secondary" @click="toggleDisabled(u)">{{ u.disabled ? 'Riabilita' : 'Disabilita' }}</Button>
          </div>
```

(d) **template — modale «Aggiungi utente»** — subito **dopo** il modale di rinomina (prima della chiusura `</section>`), aggiungi:
```vue
    <Modal v-model:open="addOpen" title="Aggiungi utente" eyebrow="Team">
      <form class="flex flex-col gap-4" @submit.prevent="submitAddUser">
        <Field label="Email">
          <Input name="new-user-email" data-testid="new-user-email" v-model="newEmail" type="email" placeholder="nome@stabilimento.it" />
        </Field>
        <Field label="Password iniziale">
          <Input name="new-user-password" data-testid="new-user-password" v-model="newPassword" type="password" placeholder="Almeno 8 caratteri" />
        </Field>
        <Field label="Ruolo">
          <Select v-model="newRole" data-testid="new-user-role">
            <option value="staff">Staff</option>
            <option value="admin">Amministratore</option>
          </Select>
        </Field>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="addOpen = false">Annulla</Button>
          <Button type="submit" data-testid="new-user-save">Crea utente</Button>
        </div>
      </form>
    </Modal>
```

- [ ] **Step 6: Esegui i test — devono passare**

Run: `corepack pnpm --filter web-staff test -- EstablishmentView`
Expected: PASS (tutti i test della view, inclusi i 4 nuovi).

- [ ] **Step 7: Typecheck + suite web-staff**

Run: `corepack pnpm --filter web-staff typecheck && corepack pnpm --filter web-staff test`
Expected: typecheck pulito; web-staff ≥ 185 + 4 = **189**, verdi.

- [ ] **Step 8: Commit (layer web-staff)**

```bash
cd /c/Users/Jays/Desktop/new && git add apps/web-staff/src/features/establishment apps/web-staff/src/mocks/server.ts && git commit -F - <<'EOF'
feat(web-staff): gestione utenti stabilimento — «Aggiungi utente» + disabilita/riabilita (admin) — TDD

Modale create (email/password/ruolo) + azione disabilita/riabilita per riga, righe
disabilitate distinte (badge "Disabilitato"). Staff vede la lista read-only. Invalida
l'overview; errori 409/422 mostrati via toast del server.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Verifica finale (DoD Fase 2)
- [ ] Suite verdi: contracts build · api unit (≥133) · api e2e (≥182) · web-staff (≥189) · ui-kit 70 · typecheck pulito.
- [ ] **Verifica LIVE** (Docker `--build api web`): come admin, «Aggiungi utente» crea uno staff che compare nel team; disabilitare quello staff lo rende "Disabilitato" e ne blocca il login (401); self-disable e ultimo-admin danno un toast d'errore (422); email duplicata → toast (409). Come staff, la lista è read-only (nessun bottone). 0 errori console. ⚠️ Se rilanci il seed: `DEV_ADMIN_PASSWORD=coralyn-admin-8473`. Pulisci gli utenti di test creati LIVE.
- [ ] **Presenta lo stato all'utente e attendi conferma.** A Stabilimento completo (Fase 1 + Fase 2): FF-merge del branch su `main` + push (ok esplicito), aggiorna l'handoff.

---

## Self-Review (contro lo spec §5.2/§6.2)

**Copertura spec:**
- Migrazione `disabledAt` additiva/nullable → Task 2 Step 1-3. ✓
- `POST /establishment/users` `@Roles(admin)`, `role @IsIn` (no superuser→400), email unica→409, hash argon2, ritorna member → Task 2 Step 4/8/10 + e2e Step 15. ✓
- `PATCH /establishment/users/:id` `{disabled}`, setta/azzera `disabledAt`, invarianti (a) self-disable e (b) ultimo admin attivo → 422 → Task 2 Step 8/10 + unit Step 6 + e2e Step 15. ✓
- `login` respinge disabilitati (401 generico) → Task 2 Step 12 + e2e (login 401 dopo disable). ✓
- Projection espone `disabledAt` (mapping additivo) → Task 2 Step 13-14 + e2e (team disabledAt). ✓
- FE «Aggiungi utente» (admin) + 409 toast → Task 3 Step 1/5 + test. ✓
- FE disabilita/riabilita per riga, righe disabilitate distinte, 422 toast → Task 3 Step 1/5 + test. ✓
- FE gating: staff read-only → Task 3 Step 3/5 (test "staff read-only"). ✓
- Fuori scope rispettato: nessun invito-email, nessun reset password, nessun `Configura` (D-005). ✓

**Placeholder:** nessuno — ogni step ha codice/comando completo.

**Type consistency:** `EstablishmentMemberDTO.disabledAt: string|null` coerente tra contratti, projection (`toISOString()`), service (`toMember`), FE (`disabled: m.disabledAt !== null`). `CreateStaffUserInput`/`UpdateStaffUserInput` coerenti tra DTO class-validator, service e FE mutation. `setDisabled(id, disabled, currentUserId)` firma identica tra service, spec unit e controller (`user.id`).
