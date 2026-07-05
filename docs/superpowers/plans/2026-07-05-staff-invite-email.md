# Invito staff via email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertire la creazione staff all'invito-via-email e aggiungere il reset-password staff tenant-scoped, riusando il meccanismo `CredentialSetupService` (ADR-0042), eliminando ogni password in chiaro dal flusso staff.

**Architecture:** Contracts-first (rimuovi `password` da `CreateStaffUserInput`, aggiungi `ResetStaffPasswordResponse`), allineato nello stesso layer del BE perché la api e2e type-checka l'intero progetto. `EstablishmentUsersService.create` crea con hash inutilizzabile + `issueAndSend('invite')`; nuovo `resetPassword` fa `issueAndSend('reset')` tenant-scoped. FE: form senza password → "invito inviato", azione reset per membro. Nessuna migrazione (token + purpose già esistono). Nessun audit di tenant (deferito D-047).

**Tech Stack:** NestJS + Prisma + class-validator (api), Vue 3 + TanStack Query + Vitest/MSW (web-staff), pnpm monorepo, `@coralyn/contracts` compilato in `dist/`.

**Riferimento spec:** `docs/superpowers/specs/2026-07-05-staff-invite-email-design.md`.

**Baseline test da NON regredire (solo crescere):** ui-kit 70 · web-staff 219 · web-platform 16 · api unit 190 · api e2e 226. Typecheck PULITO ovunque.

**Comandi utili (dalla root):**
- Rebuild contracts: `corepack pnpm --filter @coralyn/contracts build`
- Typecheck api: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
- api unit: `corepack pnpm --filter @coralyn/api test`
- api e2e: `corepack pnpm --filter @coralyn/api test:e2e` (richiede DB `:5433` + `.env.test` con `MAIL_HOST`)
- web-staff: `corepack pnpm --filter @coralyn/web-staff test`

---

## Task 1: Contract + BE — creazione staff all'invito

**Files:**
- Modify: `packages/contracts/src/index.ts` (`CreateStaffUserInput` :404-410; aggiungere `ResetStaffPasswordResponse` dopo `ResetAdminPasswordResponse` :496)
- Modify: `apps/api/src/establishment/dto/create-staff-user.dto.ts`
- Modify: `apps/api/src/establishment/establishment.module.ts`
- Modify: `apps/api/src/establishment/establishment-users.service.ts`
- Modify: `apps/api/src/establishment/establishment-users.controller.ts`
- Test: `apps/api/src/establishment/establishment-users.service.spec.ts`
- Test: `apps/api/test/establishment-users.e2e-spec.ts`

- [ ] **Step 1: Aggiorna il contract**

In `packages/contracts/src/index.ts`, sostituisci `CreateStaffUserInput` (righe ~404-410):

```typescript
/** Input creazione staff (admin-only). Lo staff riceve un invito via email per
 *  impostare la password (ADR-0042); nessuna password in chiaro. Ruolo mai `superuser`. */
export interface CreateStaffUserInput {
  email: string;
  role: 'admin' | 'staff';
}
```

E subito dopo `ResetAdminPasswordResponse` (dopo riga ~496) aggiungi:

```typescript
/** Esito di un reset-password staff avviato dall'admin del lido (tenant-scoped). */
export interface ResetStaffPasswordResponse {
  email: string;
  expiresAt: string; // ISO — scadenza del link di reset
}
```

- [ ] **Step 2: Rebuild dei contracts**

Run: `corepack pnpm --filter @coralyn/contracts build`
Expected: build OK (genera `packages/contracts/dist/`).

- [ ] **Step 3: Aggiorna il DTO (rimuovi password)**

Sostituisci l'intero `apps/api/src/establishment/dto/create-staff-user.dto.ts`:

```typescript
import { IsEmail, IsIn } from 'class-validator';
import type { CreateStaffUserInput } from '@coralyn/contracts';

export class CreateStaffUserDto implements CreateStaffUserInput {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'staff']) // mai 'superuser' → 400
  role!: 'admin' | 'staff';
}
```

- [ ] **Step 4: Importa CredentialModule nell'EstablishmentModule**

In `apps/api/src/establishment/establishment.module.ts`, aggiungi l'import in cima:

```typescript
import { CredentialModule } from '../credential/credential.module';
```

e aggiungi la proprietà `imports` al decoratore `@Module` (prima di `controllers`):

```typescript
@Module({
  imports: [CredentialModule],
  controllers: [
```

- [ ] **Step 5: Scrivi i test unit di `create` (falliscono)**

In `apps/api/src/establishment/establishment-users.service.spec.ts`, aggiorna `makeService` per iniettare il mock `credentials`:

```typescript
function makeService(overrides: {
  user?: Partial<{ create: jest.Mock; findFirst: jest.Mock; count: jest.Mock; update: jest.Mock }>;
} = {}) {
  const user = { create: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), ...overrides.user };
  const prisma = { user } as any;
  const tenant = { require: () => TENANT } as any;
  const hasher = { hash: jest.fn().mockResolvedValue('HASH') } as any;
  const credentials = { issueAndSend: jest.fn().mockResolvedValue({ expiresAt: new Date('2026-07-08T10:00:00Z') }) } as any;
  return { service: new EstablishmentUsersService(prisma, tenant, hasher, credentials), user, hasher, credentials };
}
```

e sostituisci il `describe('create', …)` con:

```typescript
  describe('create', () => {
    it('crea con hash inutilizzabile ed emette un invito (issueAndSend invite)', async () => {
      const { service, user, hasher, credentials } = makeService();
      user.create.mockResolvedValue({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
      const res = await service.create({ email: 'a@x.it', role: 'staff' }, 'admin-1');
      expect(hasher.hash).toHaveBeenCalledTimes(1); // hash di entropia casuale, non di una password nota
      expect(user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ establishmentId: TENANT, email: 'a@x.it', passwordHash: 'HASH', role: 'staff' }) }),
      );
      expect(credentials.issueAndSend).toHaveBeenCalledWith('u-1', 'a@x.it', 'invite', 'admin-1');
      expect(res).toEqual({ id: 'u-1', email: 'a@x.it', role: 'staff', disabledAt: null });
    });

    it('mappa la violazione di unicità email (P2002) in 409 e NON invita', async () => {
      const { service, user, credentials } = makeService();
      user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
      await expect(service.create({ email: 'dup@x.it', role: 'staff' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 6: Esegui i test unit → falliscono (compile error: `create` firma vecchia)**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: FAIL (la firma `create(input)` non accetta `adminId`; constructor senza `credentials`).

- [ ] **Step 7: Implementa la conversione di `create` nel service**

In `apps/api/src/establishment/establishment-users.service.ts`, aggiorna gli import di testa:

```typescript
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { CreateStaffUserInput, EstablishmentMemberDTO, ResetStaffPasswordResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../identity/password-hasher';
import { CredentialSetupService } from '../credential/credential-setup.service';
```

Aggiungi `credentials` al constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
    private readonly credentials: CredentialSetupService,
  ) {}
```

Sostituisci il metodo `create` con:

```typescript
  async create(input: CreateStaffUserInput, adminId: string): Promise<EstablishmentMemberDTO> {
    const tenantId = this.tenant.require();
    // Hash INUTILIZZABILE: lo staff imposta la password via link d'invito (ADR-0042); nessuna
    // password in chiaro esiste finché non fa redeem. Speculare a platform-provisioning.create.
    const unusableHash = await this.hasher.hash(randomBytes(32).toString('base64url'));
    let user: UserRow;
    try {
      user = await this.prisma.user.create({
        data: { establishmentId: tenantId, email: input.email, passwordHash: unusableHash, role: input.role },
        select: MEMBER_SELECT,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email già in uso');
      }
      throw e;
    }
    // persist-then-best-effort-send (issueAndSend ha la propria transazione + gestione errori mail).
    await this.credentials.issueAndSend(user.id, input.email, 'invite', adminId);
    return this.toMember(user);
  }
```

(`ResetStaffPasswordResponse` è importato ma usato nel Task 2 — l'import può stare qui da subito; se il linter segnala unused, aggiungilo nel Task 2.)

- [ ] **Step 8: Passa `@CurrentUser` alla create nel controller**

In `apps/api/src/establishment/establishment-users.controller.ts`, sostituisci il metodo `create`:

```typescript
  @Post()
  @Roles(Role.Admin)
  create(@Body() body: CreateStaffUserDto, @CurrentUser() user: AuthUser): Promise<EstablishmentMemberDTO> {
    return this.users.create(body, user.id);
  }
```

(`CurrentUser`, `AuthUser`, `Post` sono già importati.)

- [ ] **Step 9: Esegui i test unit → passano**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: PASS.

- [ ] **Step 10: Riscrivi la e2e establishment-users (override mailer + flusso invito)**

Sostituisci l'intero `apps/api/test/establishment-users.e2e-spec.ts` con:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailerService } from '../src/mail/mailer.service';
import { FakeMailerService } from './helpers/fake-mailer';
import { createUser, login } from './helpers/seed-auth';

const bearer = (t: string): [string, string] => ['Authorization', `Bearer ${t}`];
const EMAILS = ['u.admin@e2e.test', 'u.admin2@e2e.test', 'u.staff@e2e.test', 'u.new@e2e.test', 'u.other@e2e.test'];

describe('Establishment users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: FakeMailerService;
  let s1: string;
  let adminT: string;
  let staffT: string;
  let adminId: string;
  let admin2Id: string;
  let staffId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue(new FakeMailerService())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    mailer = app.get(MailerService);

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
    const created = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true } });
    await prisma.credentialSetupToken.deleteMany({ where: { userId: { in: created.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.establishment.deleteMany({ where: { name: { in: ['USERS A', 'USERS B'] } } });
    await app.close();
  });

  it('staff → 403 sulla create (role-guard)', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(staffT)).send({ email: 'u.new@e2e.test', role: 'staff' }).expect(403);
  });

  it('role "superuser" → 400', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.new@e2e.test', role: 'superuser' }).expect(400);
  });

  it('admin invita uno staff → 201, compare nell’overview, NON fa login finché non fa redeem', async () => {
    mailer.reset();
    const res = await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.new@e2e.test', role: 'staff' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ email: 'u.new@e2e.test', role: 'staff', disabledAt: null }));

    const overview = await request(app.getHttpServer()).get('/api/establishment/overview').set(...bearer(adminT)).expect(200);
    expect(overview.body.team.find((m: { email: string }) => m.email === 'u.new@e2e.test')).toEqual(expect.objectContaining({ role: 'staff', disabledAt: null }));

    // Invito emesso (purpose invite); nessun login possibile prima del redeem.
    expect(mailer.last().purpose).toBe('invite');
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.new@e2e.test', password: 'staff-scelta-1' }).expect(401);

    // Redeem del token catturato → poi login ok.
    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: mailer.last().rawToken, password: 'staff-scelta-1' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.new@e2e.test', password: 'staff-scelta-1' }).expect(200);
  });

  it('email duplicata → 409', async () => {
    await request(app.getHttpServer()).post('/api/establishment/users').set(...bearer(adminT)).send({ email: 'u.staff@e2e.test', role: 'staff' }).expect(409);
  });

  it('self-disable → 422', async () => {
    await request(app.getHttpServer()).patch(`/api/establishment/users/${adminId}`).set(...bearer(adminT)).send({ disabled: true }).expect(422);
  });

  it('admin disabilita lo staff → 200, disabledAt valorizzato, e quello staff non fa più login (401)', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT)).send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(401);
    await request(app.getHttpServer()).patch(`/api/establishment/users/${staffId}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(200);
  });

  it('disabilitare un admin non-ultimo → 200 (l’altro admin resta)', async () => {
    const res = await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: true }).expect(200);
    expect(res.body.disabledAt).toEqual(expect.any(String));
    await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
  });
});
```

- [ ] **Step 11: Esegui la e2e establishment-users → passa (senza i test reset, aggiunti nel Task 2)**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- establishment-users`
Expected: PASS (7 test). Se fallisce per `MAIL_HOST` mancante, verifica `.env.test`.

- [ ] **Step 12: Typecheck completo api (la e2e type-checka tutto)**

Run: `corepack pnpm --filter @coralyn/api exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 13: Commit**

```bash
git add packages/contracts/src/index.ts apps/api/src/establishment/ apps/api/test/establishment-users.e2e-spec.ts
git commit -m "feat(api): creazione staff via invito email (issueAndSend invite), rimuove password dal contract"
```

---

## Task 2: BE — reset password staff (tenant-scoped)

**Files:**
- Modify: `apps/api/src/establishment/establishment-users.service.ts`
- Modify: `apps/api/src/establishment/establishment-users.controller.ts`
- Test: `apps/api/src/establishment/establishment-users.service.spec.ts`
- Test: `apps/api/test/establishment-users.e2e-spec.ts`

- [ ] **Step 1: Scrivi i test unit di `resetPassword` (falliscono)**

In `apps/api/src/establishment/establishment-users.service.spec.ts`, aggiungi dopo il `describe('setDisabled', …)` (ancora dentro il `describe` esterno):

```typescript
  describe('resetPassword', () => {
    it('404 se il target non è nel tenant', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('u-x', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });

    it('422 se il target è disabilitato', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', disabledAt: new Date() });
      await expect(service.resetPassword('u-9', 'admin-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(credentials.issueAndSend).not.toHaveBeenCalled();
    });

    it('emette un reset (issueAndSend reset) e ritorna email+expiresAt', async () => {
      const { service, user, credentials } = makeService();
      user.findFirst.mockResolvedValue({ id: 'u-9', email: 's@x.it', disabledAt: null });
      const res = await service.resetPassword('u-9', 'admin-1');
      expect(credentials.issueAndSend).toHaveBeenCalledWith('u-9', 's@x.it', 'reset', 'admin-1');
      expect(res).toEqual({ email: 's@x.it', expiresAt: '2026-07-08T10:00:00.000Z' });
    });
  });
```

- [ ] **Step 2: Esegui i test unit → falliscono**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: FAIL (`resetPassword` non esiste).

- [ ] **Step 3: Implementa `resetPassword` nel service**

In `apps/api/src/establishment/establishment-users.service.ts`, aggiungi il metodo dopo `create` (prima di `setDisabled`):

```typescript
  /** Reset password di un membro del tenant: emette un invito `reset` via email. Tenant-scoped
   *  (il target deve appartenere al lido dell'admin). issueAndSend NON tocca l'hash corrente →
   *  nessun rischio di lockout: il target mantiene la password finché non fa redeem. */
  async resetPassword(id: string, adminId: string): Promise<ResetStaffPasswordResponse> {
    const tenantId = this.tenant.require();
    const target = await this.prisma.user.findFirst({
      where: { id, establishmentId: tenantId },
      select: { id: true, email: true, disabledAt: true },
    });
    if (!target) throw new NotFoundException('Utente non trovato');
    if (target.disabledAt !== null) {
      throw new UnprocessableEntityException('Non puoi resettare la password di un utente disabilitato');
    }
    const { expiresAt } = await this.credentials.issueAndSend(target.id, target.email, 'reset', adminId);
    return { email: target.email, expiresAt: expiresAt.toISOString() };
  }
```

(Gli import `NotFoundException`/`UnprocessableEntityException`/`ResetStaffPasswordResponse` sono già presenti dal Task 1.)

- [ ] **Step 4: Aggiungi la rotta nel controller**

In `apps/api/src/establishment/establishment-users.controller.ts`, aggiorna gli import type:

```typescript
import type { EstablishmentMemberDTO, ResetStaffPasswordResponse } from '@coralyn/contracts';
```

e aggiungi il metodo dopo `setDisabled`:

```typescript
  @Post(':id/reset-password')
  @Roles(Role.Admin)
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<ResetStaffPasswordResponse> {
    return this.users.resetPassword(id, user.id);
  }
```

- [ ] **Step 5: Esegui i test unit → passano**

Run: `corepack pnpm --filter @coralyn/api test -- establishment-users.service`
Expected: PASS.

- [ ] **Step 6: Aggiungi i test e2e del reset**

In `apps/api/test/establishment-users.e2e-spec.ts`, aggiungi questi test PRIMA della chiusura del `describe` (l'ordine conta: il reset happy-path cambia la password dello staff, quindi va per ULTIMO):

```typescript
  it('reset da non-admin → 403; anonimo → 401', async () => {
    await request(app.getHttpServer()).post(`/api/establishment/users/${staffId}/reset-password`).set(...bearer(staffT)).expect(403);
    await request(app.getHttpServer()).post(`/api/establishment/users/${staffId}/reset-password`).expect(401);
  });

  it('reset di un id fuori tenant → 404', async () => {
    const otherEst = await prisma.establishment.create({ data: { name: 'USERS B' } });
    await createUser(prisma, { email: 'u.other@e2e.test', password: 'pw-o-1', role: Role.staff, establishmentId: otherEst.id });
    const otherId = (await prisma.user.findUniqueOrThrow({ where: { email: 'u.other@e2e.test' } })).id;
    await request(app.getHttpServer()).post(`/api/establishment/users/${otherId}/reset-password`).set(...bearer(adminT)).expect(404);
  });

  it('reset di un utente disabilitato → 422', async () => {
    await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: true }).expect(200);
    await request(app.getHttpServer()).post(`/api/establishment/users/${admin2Id}/reset-password`).set(...bearer(adminT)).expect(422);
    await request(app.getHttpServer()).patch(`/api/establishment/users/${admin2Id}`).set(...bearer(adminT)).send({ disabled: false }).expect(200);
  });

  it('admin resetta lo staff → 201; dopo redeem la nuova pw funziona e la vecchia dà 401', async () => {
    mailer.reset();
    const res = await request(app.getHttpServer()).post(`/api/establishment/users/${staffId}/reset-password`).set(...bearer(adminT)).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ email: 'u.staff@e2e.test', expiresAt: expect.any(String) }));
    expect(mailer.last().purpose).toBe('reset');

    // Prima del redeem la vecchia password è ancora valida (issueAndSend non tocca l'hash).
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(200);

    await request(app.getHttpServer()).post('/api/auth/credential-setup').send({ token: mailer.last().rawToken, password: 'pw-staff-2' }).expect(204);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-2' }).expect(200);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'u.staff@e2e.test', password: 'pw-staff-1' }).expect(401);
  });
```

- [ ] **Step 7: Esegui la e2e establishment-users → passa**

Run: `corepack pnpm --filter @coralyn/api test:e2e -- establishment-users`
Expected: PASS (11 test).

- [ ] **Step 8: Esegui l'INTERA suite api (RolesGuard globale → rotte nuove)**

Run: `corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e`
Expected: PASS. api unit ~193 (190 + 3 di `resetPassword`; i test `create` restano 2), api e2e ~229 (226 − 1 test `password troppo corta` rimosso + 4 test reset).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/establishment/ apps/api/test/establishment-users.e2e-spec.ts
git commit -m "feat(api): reset-password staff tenant-scoped (issueAndSend reset), admin-only"
```

---

## Task 3: FE web-staff — form invito + azione reset

**Files:**
- Modify: `apps/web-staff/src/features/establishment/useEstablishment.ts`
- Modify: `apps/web-staff/src/features/establishment/EstablishmentView.vue`
- Test: `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`

- [ ] **Step 1: Aggiungi `useResetStaffPassword` al composable**

In `apps/web-staff/src/features/establishment/useEstablishment.ts`, aggiungi `ResetStaffPasswordResponse` all'import da `@coralyn/contracts`:

```typescript
import type {
  EstablishmentOverviewDTO,
  UpdateEstablishmentInput,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  EstablishmentMemberDTO,
  ResetStaffPasswordResponse,
} from '@coralyn/contracts';
```

e aggiungi in fondo al file:

```typescript
export function useResetStaffPassword() {
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<ResetStaffPasswordResponse>(`/establishment/users/${id}/reset-password`, { method: 'POST' }),
    // Nessun invalidates: il reset non modifica l'overview.
  });
}
```

(Nessun cambio a `useCreateStaffUser`: il tipo `CreateStaffUserInput` perde `password` da solo.)

- [ ] **Step 2: Aggiorna lo script di `EstablishmentView.vue`**

In `apps/web-staff/src/features/establishment/EstablishmentView.vue`:

Aggiungi `ConfirmDialog` all'import ui-kit e `pushToast`/`useResetStaffPassword`:

```typescript
import { Card, StatTile, Badge, Button, Avatar, Icon, Modal, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
```
```typescript
import { useEstablishmentOverview, useRenameEstablishment, useCreateStaffUser, useSetStaffUserDisabled, useResetStaffPassword } from './useEstablishment';
import { pushToast } from '@/lib/toasts';
```

Rimuovi il ref `newPassword` e aggiornane l'uso. Sostituisci il blocco add-user (righe ~71-97) con:

```typescript
const addOpen = ref(false);
const newEmail = ref('');
const newRole = ref<'admin' | 'staff'>('staff');
const createUser = useCreateStaffUser();
const setDisabled = useSetStaffUserDisabled();
const resetStaff = useResetStaffPassword();
const creating = computed(() => createUser.isPending.value);
const togglingDisabled = computed(() => setDisabled.isPending.value);

function openAddUser() {
  newEmail.value = '';
  newRole.value = 'staff';
  addOpen.value = true;
}
function submitAddUser() {
  const email = newEmail.value.trim();
  if (!email) return;
  createUser.mutate(
    { email, role: newRole.value },
    { onSuccess: () => { addOpen.value = false; pushToast(`Invito inviato a ${email}.`); } },
  );
}
function toggleDisabled(u: { id: string; disabled: boolean }) {
  setDisabled.mutate({ id: u.id, disabled: !u.disabled });
}

const resetOpen = ref(false);
const resetTarget = ref<{ id: string; email: string } | null>(null);
function askReset(u: { id: string; email: string }) {
  resetTarget.value = { id: u.id, email: u.email };
  resetOpen.value = true;
}
function onConfirmReset() {
  const t = resetTarget.value;
  if (!t) return;
  resetOpen.value = false;
  resetStaff.mutate(t.id, { onSuccess: () => pushToast(`Link di reset inviato a ${t.email}.`) });
}
```

- [ ] **Step 3: Aggiorna il template di `EstablishmentView.vue`**

Nel `<div v-for="u in team" …>` (riga ~154), aggiungi il bottone reset dopo il bottone toggle-disabled:

```html
            <Button v-if="isAdmin && !u.you" data-testid="toggle-user-disabled" variant="secondary" :disabled="togglingDisabled" @click="toggleDisabled(u)">{{ u.disabled ? 'Riabilita' : 'Disabilita' }}</Button>
            <Button v-if="isAdmin && !u.you && !u.disabled" data-testid="reset-user-password" variant="secondary" :disabled="resetStaff.isPending.value" @click="askReset(u)">Reset password</Button>
```

Nella modale "Aggiungi utente" (righe ~191-210), rimuovi il `Field` "Password iniziale", aggiungi una riga-hint e cambia la label del bottone. Sostituisci il contenuto della `<form>`:

```html
      <form class="flex flex-col gap-4" @submit.prevent="submitAddUser">
        <Field label="Email">
          <Input name="new-user-email" data-testid="new-user-email" v-model="newEmail" type="email" placeholder="nome@stabilimento.it" />
        </Field>
        <Field label="Ruolo">
          <Select v-model="newRole" data-testid="new-user-role">
            <option value="staff">Staff</option>
            <option value="admin">Amministratore</option>
          </Select>
        </Field>
        <p class="text-xs leading-relaxed text-[var(--color-text-muted)]">Riceverà un'email per impostare la propria password.</p>
        <div class="flex justify-end gap-2">
          <Button variant="secondary" type="button" @click="addOpen = false">Annulla</Button>
          <Button type="submit" data-testid="new-user-save" :disabled="creating">Invia invito</Button>
        </div>
      </form>
```

Aggiungi il `ConfirmDialog` per il reset prima della chiusura `</section>` (dopo la modale add-user):

```html
    <ConfirmDialog
      v-model:open="resetOpen"
      title="Reset password?"
      :description="`Invieremo a ${resetTarget?.email ?? ''} un'email per impostare una nuova password. La password attuale resta valida finché non ne imposta una nuova.`"
      confirm-label="Invia link di reset"
      @confirm="onConfirmReset"
    />
```

- [ ] **Step 4: Aggiorna il test create nel `.spec.ts` (falliva: campo password rimosso)**

In `apps/web-staff/src/features/establishment/EstablishmentView.spec.ts`, sostituisci il test `'admin: «Aggiungi utente» apre il modale e invia la create'` (righe ~109-130) con:

```typescript
  it('admin: «Aggiungi utente» invia l\'invito (senza password) e mostra il toast', async () => {
    const seen: Array<{ email: string; role: string; hasPassword: boolean }> = [];
    server.use(http.post('/api/establishment/users', async ({ request }) => {
      const b = (await request.json()) as { email: string; role: 'admin' | 'staff'; password?: string };
      seen.push({ email: b.email, role: b.role, hasPassword: 'password' in b });
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
    (document.querySelector('[data-testid="new-user-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ email: 'nuovo@lido.it', role: 'staff', hasPassword: false }]);
    expect(useToasts().items.map((t) => t.message)).toContain('Invito inviato a nuovo@lido.it.');
    w.unmount();
  });
```

Aggiungi l'import `useToasts` in cima al file:

```typescript
import { useToasts } from '@/lib/toasts';
```

E nel test `'admin: il modale create resta aperto in caso di 409'` (righe ~205-222), rimuovi le due righe che valorizzano `new-user-password` (il campo non esiste più):

```typescript
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).value = 'esistente@lido.it';
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="new-user-save"]') as HTMLElement).click();
```

- [ ] **Step 5: Aggiungi il test dell'azione reset**

Aggiungi questo test dentro il `describe('EstablishmentView', …)`:

```typescript
  it('admin: «Reset password» su un membro apre la conferma e invia il reset con toast', async () => {
    const seen: string[] = [];
    server.use(http.post('/api/establishment/users/:id/reset-password', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ email: 'marco@lidomaestrale.it', expiresAt: '2026-07-08T10:00:00.000Z' });
    }));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    await row.find('[data-testid="reset-user-password"]').trigger('click');
    await settle();
    // ConfirmDialog teleportato: conferma via testo del bottone.
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Invia link di reset')!.click();
    await settle();
    expect(seen).toEqual(['u-2']);
    expect(useToasts().items.map((t) => t.message)).toContain('Link di reset inviato a marco@lidomaestrale.it.');
    w.unmount();
  });

  it('staff: nessun bottone «Reset password»', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="reset-user-password"]').exists()).toBe(false);
  });
```

- [ ] **Step 6: Esegui i test web-staff → passano**

Run: `corepack pnpm --filter @coralyn/web-staff test -- EstablishmentView`
Expected: PASS.

- [ ] **Step 7: Typecheck web-staff**

Run: `corepack pnpm --filter @coralyn/web-staff exec vue-tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Suite web-staff completa**

Run: `corepack pnpm --filter @coralyn/web-staff test`
Expected: PASS, ~221 test (baseline 219 + 2 nuovi: azione reset e "staff nessun reset"; i test create/409 sono modificati in-place).

- [ ] **Step 9: Commit**

```bash
git add apps/web-staff/src/features/establishment/
git commit -m "feat(web-staff): form staff = invito (no password) + azione reset password per membro"
```

---

## Task 4: Registro deferred — D-047

**Files:**
- Modify: `docs/architecture/deferred.md`

- [ ] **Step 1: Aggiungi la voce D-047 nella tabella**

In `docs/architecture/deferred.md`, aggiungi una riga nella tabella (dopo D-046, prima della riga `~~D-039~~`):

```markdown
| D-047 | **Audit di tenant per le azioni admin-in-tenant** (invito/reset credenziali staff, create/disable/enable staff, futuro cambio-ruolo) | `reset-admin-password` usa `PlatformAuditLog` che è scope **superuser**; non esiste un audit-log **di tenant**. Introdurlo per coprire *solo* invito/reset staff creerebbe una nuova incoerenza (le altre mutazioni admin resterebbero non auditate): l'audit di tenant è una slice a sé, non un bolt-on alla storia credenziali. Traccia tecnica parziale già presente: `CredentialSetupToken.createdByUserId` + `purpose` + timestamp per invito/reset. | Esposizione multi-operatore, o richiesta di tracciabilità/compliance a livello lido. | Bassa: la traccia token esiste per le azioni credenziali; le altre mutazioni restano non auditate. Additivo: tabella dominio RLS-FORCE tenant-scoped + service + scrittura atomica nella tx dell'azione + eventuale **ADR-0043**, coprendo **tutte** le mutazioni admin. |
```

- [ ] **Step 2: Aggiorna la nota residua di D-025**

Nella riga D-025, nel testo "**Restano deferiti** (increment futuri di D-025): **cambio-ruolo** … e **reset/invito self-service dello staff** …", aggiorna per riflettere che l'invito/reset staff è ora **fatto**:

```markdown
**Aggiornamento 2026-07-05 (slice invito staff):** l'invito staff (creazione via link set-password) e il reset-password staff tenant-scoped sono ora **realizzati** (spec [2026-07-05-staff-invite-email-design](../superpowers/specs/2026-07-05-staff-invite-email-design.md), riusa [ADR-0042](decisions/0042-trasporto-email-e-consegna-credenziali.md)). **Resta deferito** solo il **cambio-ruolo** di un utente esistente. L'audit delle azioni admin-in-tenant è tracciato in **D-047**.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/deferred.md
git commit -m "docs(deferred): D-047 audit di tenant; aggiorna D-025 (invito/reset staff fatti)"
```

---

## Verifica finale (dopo tutti i task)

- [ ] **Rebuild contracts + suite complete**

Run:
```bash
corepack pnpm --filter @coralyn/contracts build
corepack pnpm --filter @coralyn/api test && corepack pnpm --filter @coralyn/api test:e2e
corepack pnpm --filter @coralyn/web-staff test
corepack pnpm --filter @coralyn/web-platform test
corepack pnpm --filter @coralyn/ui-kit test
```
Expected: tutte PASS; nessuna regressione sotto baseline (ui-kit 70 · web-staff 219 · web-platform 16 · api unit 190 · api e2e 226; i totali crescono).

- [ ] **Typecheck ovunque**

Run:
```bash
corepack pnpm --filter @coralyn/api exec tsc --noEmit
corepack pnpm --filter @coralyn/web-staff exec vue-tsc --noEmit
corepack pnpm --filter @coralyn/web-platform exec vue-tsc --noEmit
```
Expected: exit 0 ovunque.

- [ ] **Verifica LIVE** (container + Mailpit) — vedi spec §9: admin invita staff → email in Mailpit `:8025` → set-password → login staff ok; reset → vecchia pw 401 / nuova ok; non-admin 403. Rebuild container + clear SW cache prima.
