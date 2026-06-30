# Identità & Auth (modulo `identita`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere autenticazione reale al Core: `Utente` + login con password argon2id → JWT, e una `JwtAuthGuard` globale che ricava il tenant dal token e popola `req.tenantId`, sostituendo il `TenantMiddleware` provvisorio.

**Architecture:** Modulo NestJS `identita` con `PasswordHasher` (argon2id), `TokenService` (wrapper `@nestjs/jwt`), `IdentitaService` (login/lookup), `AuthController` (`login`/`me`), e una `JwtAuthGuard` registrata come `APP_GUARD` globale con decoratore `@Public()`. `TenantContext`, `PrismaService.forTenant` e i moduli di dominio restano invariati: la guard popola lo stesso `req.tenantId` che prima settava il middleware. `Utente` è tabella d'identità senza policy RLS `tenant_isolation` (accesso solo via `IdentitaService`; login pre-tenant).

**Tech Stack:** NestJS 10, `@nestjs/jwt` 10, `argon2`, Prisma 5 + PostgreSQL (enum `Ruolo`, modello `Utente`), Jest + Supertest, class-validator.

**Spec di riferimento:** [docs/specs/2026-06-29-identita-auth-design.md](../specs/2026-06-29-identita-auth-design.md).

---

## File Structure

**Create:**
- `apps/api/src/identita/password-hasher.ts` — wrapper argon2id (`hash`/`verify`).
- `apps/api/src/identita/password-hasher.spec.ts` — unit (TDD).
- `apps/api/src/identita/token.service.ts` — firma/verifica JWT + tipo `TokenClaims`.
- `apps/api/src/identita/token.service.spec.ts` — unit (TDD).
- `apps/api/src/identita/auth-user.ts` — tipo `AuthUser` (forma di `req.user`).
- `apps/api/src/identita/public.decorator.ts` — `@Public()` + `IS_PUBLIC_KEY`.
- `apps/api/src/identita/current-user.decorator.ts` — param decorator `@CurrentUser()`.
- `apps/api/src/identita/jwt-auth.guard.ts` — guard globale.
- `apps/api/src/identita/dto/login.dto.ts` — `LoginDto` (class-validator).
- `apps/api/src/identita/identita.service.ts` — `login`/`me`/`toDTO`.
- `apps/api/src/identita/auth.controller.ts` — `POST login`, `GET me`.
- `apps/api/src/identita/identita.module.ts` — wiring (JwtModule, providers, `APP_GUARD`).
- `apps/api/test/helpers/seed-auth.ts` — helper e2e (`createUtente`, `login`).
- `apps/api/test/auth.e2e-spec.ts` — e2e login/me/guard/superuser.
- `docs/architecture/decisions/0024-strategia-auth.md`, `0025-hashing-password.md`, `0026-identita-rls-utente.md`.

**Modify:**
- `packages/contracts/src/index.ts` — `UtenteDTO`, `LoginInput`, `LoginResponse`.
- `apps/api/prisma/schema.prisma` — enum `Ruolo`, model `Utente`, relazione inversa su `Stabilimento`.
- `apps/api/prisma/seed.ts` — seed admin di sviluppo.
- `apps/api/package.json` — dipendenze `@nestjs/jwt`, `argon2`.
- `.env.example` (committed), `.env`, `.env.test` (gitignored) — `JWT_SECRET`, `JWT_EXPIRES_IN`, credenziali admin dev.
- `apps/api/src/app.module.ts` — importa `IdentitaModule`, rimuove il wiring del middleware.
- `apps/api/src/health/health.controller.ts` — `@Public()`.
- `apps/api/test/clienti.e2e-spec.ts` — autenticazione via Bearer.
- `docs/architecture/deferred.md`, `docs/design/data-model.md`, `MEMORY.md` + `memory/driftly-project-state.md`.

**Delete:**
- `apps/api/src/tenant/tenant.middleware.ts`.

---

## Task 1: Dipendenze e variabili d'ambiente

**Files:**
- Modify: `apps/api/package.json` (via pnpm), `.env`, `.env.test`, `.env.example`

- [ ] **Step 1: Installa `@nestjs/jwt` e `argon2`**

Run (dalla radice):
```bash
pnpm --filter @driftly/api add @nestjs/jwt@^10.2.0 argon2@^0.41.1
```
Expected: `apps/api/package.json` elenca `@nestjs/jwt` e `argon2` in `dependencies`; `pnpm-lock.yaml` aggiornato. (`argon2` scarica un binario prebuilt per Node 24/Windows; se fallisse servirebbero i build tools — vedi nota a fine task.)

- [ ] **Step 2: Aggiungi le chiavi a `.env.example`** (committed, valori placeholder)

Aggiungi in fondo a `.env.example`:
```
JWT_SECRET="change-me-please-32+chars-random-secret"
JWT_EXPIRES_IN="8h"
DEV_ADMIN_EMAIL="admin@driftly.dev"
DEV_ADMIN_PASSWORD="change-me"
```

- [ ] **Step 3: Aggiungi le chiavi a `.env`** (dev, gitignored)

Aggiungi in fondo a `.env`:
```
JWT_SECRET="dev-only-insecure-secret-please-change-in-prod"
JWT_EXPIRES_IN="8h"
DEV_ADMIN_EMAIL="admin@driftly.dev"
DEV_ADMIN_PASSWORD="driftly-admin"
```

- [ ] **Step 4: Aggiungi le chiavi a `.env.test`** (test, gitignored)

Aggiungi in fondo a `.env.test` (gli e2e creano i propri utenti; servono solo le chiavi JWT):
```
JWT_SECRET="test-only-secret-for-e2e"
JWT_EXPIRES_IN="8h"
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml .env.example
git commit -m "chore(api): add @nestjs/jwt + argon2 and JWT/admin env keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
> `.env` e `.env.test` sono gitignored: non vengono committati, ma DEVONO contenere `JWT_SECRET` o l'avvio/e2e falliranno (`getOrThrow('JWT_SECRET')`).

---

## Task 2: Contracts additivi (`UtenteDTO`, `LoginInput`, `LoginResponse`)

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Aggiungi i tipi in fondo a `packages/contracts/src/index.ts`**

```ts
/** Profilo dell'utente staff. `stabilimentoId` null = superuser di piattaforma. */
export interface UtenteDTO {
  id: string;
  email: string;
  ruolo: Ruolo;
  stabilimentoId: string | null;
}

/** Credenziali di login. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Risposta del login: token di accesso + profilo. */
export interface LoginResponse {
  accessToken: string;
  utente: UtenteDTO;
}
```

- [ ] **Step 2: Builda i contracts**

Run (dalla radice):
```bash
pnpm --filter @driftly/contracts build
```
Expected: `packages/contracts/dist/index.d.ts` include `UtenteDTO`, `LoginInput`, `LoginResponse`; nessun errore TS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): UtenteDTO, LoginInput, LoginResponse (auth)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Schema Prisma `Utente` + migrazione (senza RLS) + seed admin

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/<ts>_utente/migration.sql` (generata)

- [ ] **Step 1: Aggiungi enum e modello in `apps/api/prisma/schema.prisma`**

Aggiungi `utenti Utente[]` a `Stabilimento` e in fondo al file l'enum + modello:
```prisma
model Stabilimento {
  id      String    @id @default(uuid()) @db.Uuid
  nome    String
  clienti Cliente[]
  utenti  Utente[]
}

enum Ruolo {
  admin
  staff
  superuser
}

model Utente {
  id             String        @id @default(uuid()) @db.Uuid
  stabilimentoId String?       @db.Uuid // null = superuser di piattaforma (cross-tenant)
  email          String        @unique // unica globale: identifica l'utente al login
  passwordHash   String // argon2id; mai esposto nei DTO
  ruolo          Ruolo
  stabilimento   Stabilimento? @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```
> Nota: `Utente` **non** riceve la policy RLS `tenant_isolation` (a differenza di `Cliente`). È una scelta deliberata (login pre-tenant, `stabilimentoId` nullable) documentata in ADR-0026 (Task 10).

- [ ] **Step 2: Genera e applica la migrazione su dev**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma migrate dev --name utente
```
Expected: crea `apps/api/prisma/migrations/<ts>_utente/migration.sql` con `CreateEnum "Ruolo"` e `CreateTable "Utente"` (+ FK verso `Stabilimento`, indice, unique su `email`); applica al DB dev; rigenera il client Prisma (ora include `prisma.utente` e l'enum `Ruolo`).

- [ ] **Step 3: Verifica che la migrazione NON contenga RLS, e annota la scelta**

Apri `apps/api/prisma/migrations/<ts>_utente/migration.sql` e verifica che **non** contenga `ENABLE ROW LEVEL SECURITY` né `CREATE POLICY`. Prependi in cima al file questo commento:
```sql
-- NOTA (ADR-0026): "Utente" è una tabella d'identità e NON abilita la policy RLS
-- tenant_isolation. Il login interroga Utente prima di conoscere il tenant e
-- stabilimentoId è nullable (superuser). L'accesso è mediato solo da IdentitaService.
```

- [ ] **Step 4: Applica la migrazione al DB di test**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api exec prisma migrate deploy
```
Expected: la migrazione `utente` risulta applicata anche su `driftly_test`.

- [ ] **Step 5: Estendi il seed in `apps/api/prisma/seed.ts`**

Sostituisci l'intero contenuto con:
```ts
import { PrismaClient, Ruolo } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Stabilimento di sviluppo con id fisso, allineato all'header X-Stabilimento-Id
// di dev del frontend, così potrà girare contro il backend reale.
const DEV_STABILIMENTO_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  await prisma.stabilimento.upsert({
    where: { id: DEV_STABILIMENTO_ID },
    update: {},
    create: { id: DEV_STABILIMENTO_ID, nome: 'Lido di Sviluppo' },
  });

  // Primo admin di sviluppo (per login locale). Password hashata con argon2id.
  const email = process.env.DEV_ADMIN_EMAIL ?? 'admin@driftly.dev';
  const password = process.env.DEV_ADMIN_PASSWORD ?? 'driftly-admin';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.utente.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, ruolo: Ruolo.admin, stabilimentoId: DEV_STABILIMENTO_ID },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 6: Esegui il seed su dev e verifica**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma db seed
```
Expected: nessun errore; l'admin di sviluppo è creato/aggiornato (idempotente).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts
git commit -m "feat(api): modello Utente + enum Ruolo (no RLS, identity table) + seed admin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `PasswordHasher` (argon2id) — TDD

**Files:**
- Create: `apps/api/src/identita/password-hasher.ts`, `apps/api/src/identita/password-hasher.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce — `apps/api/src/identita/password-hasher.spec.ts`**

```ts
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produce un hash diverso dal plaintext e lo verifica', async () => {
    const hash = await hasher.hash('s3cret-password');
    expect(hash).not.toBe('s3cret-password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 's3cret-password')).toBe(true);
  });

  it('rifiuta una password errata', async () => {
    const hash = await hasher.hash('s3cret-password');
    expect(await hasher.verify(hash, 'password-sbagliata')).toBe(false);
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run (dalla radice):
```bash
pnpm --filter @driftly/api test -- password-hasher
```
Expected: FAIL — `Cannot find module './password-hasher'`.

- [ ] **Step 3: Implementa `apps/api/src/identita/password-hasher.ts`**

```ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Hashing/verifica password con argon2id (ADR-0025). */
@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run (dalla radice):
```bash
pnpm --filter @driftly/api test -- password-hasher
```
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/identita/password-hasher.ts apps/api/src/identita/password-hasher.spec.ts
git commit -m "feat(api): PasswordHasher con argon2id (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `TokenService` (JWT) — TDD

**Files:**
- Create: `apps/api/src/identita/token.service.ts`, `apps/api/src/identita/token.service.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce — `apps/api/src/identita/token.service.spec.ts`**

```ts
import { JwtService } from '@nestjs/jwt';
import { Ruolo } from '@driftly/contracts';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '8h' } });
  const service = new TokenService(jwt);

  it('firma e riverifica i claim (round-trip)', () => {
    const token = service.sign({ sub: 'u1', stabilimentoId: 's1', ruolo: Ruolo.Admin });
    const claims = service.verify(token);
    expect(claims).toMatchObject({ sub: 'u1', stabilimentoId: 's1', ruolo: 'admin' });
  });

  it('preserva stabilimentoId null (superuser)', () => {
    const token = service.sign({ sub: 'u2', stabilimentoId: null, ruolo: Ruolo.Superuser });
    expect(service.verify(token).stabilimentoId).toBeNull();
  });

  it('rifiuta un token manomesso/non valido', () => {
    expect(() => service.verify('non.un.token')).toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisce**

Run (dalla radice):
```bash
pnpm --filter @driftly/api test -- token.service
```
Expected: FAIL — `Cannot find module './token.service'`.

- [ ] **Step 3: Implementa `apps/api/src/identita/token.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Ruolo } from '@driftly/contracts';

/** Claim applicativi del JWT (oltre a iat/exp standard). */
export interface TokenClaims {
  sub: string; // id dell'utente
  stabilimentoId: string | null; // null = superuser
  ruolo: Ruolo;
}

/** Firma/verifica del JWT di accesso (ADR-0024). */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(claims: TokenClaims): string {
    return this.jwt.sign(claims);
  }

  verify(token: string): TokenClaims {
    const payload = this.jwt.verify<TokenClaims & { iat: number; exp: number }>(token);
    return { sub: payload.sub, stabilimentoId: payload.stabilimentoId, ruolo: payload.ruolo };
  }
}
```

- [ ] **Step 4: Esegui il test e verifica che passa**

Run (dalla radice):
```bash
pnpm --filter @driftly/api test -- token.service
```
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/identita/token.service.ts apps/api/src/identita/token.service.spec.ts
git commit -m "feat(api): TokenService firma/verifica JWT (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Guard globale, `@Public()`, `@CurrentUser()`, tipo `AuthUser`

**Files:**
- Create: `apps/api/src/identita/auth-user.ts`, `apps/api/src/identita/public.decorator.ts`, `apps/api/src/identita/current-user.decorator.ts`, `apps/api/src/identita/jwt-auth.guard.ts`

> La guard è coperta dagli e2e (Task 8/9): qui si scrivono i file di supporto, verificati dalla compilazione e dai test successivi.

- [ ] **Step 1: Crea `apps/api/src/identita/auth-user.ts`**

```ts
import { Ruolo } from '@driftly/contracts';

/** Forma di `req.user` dopo la guard. */
export interface AuthUser {
  id: string;
  ruolo: Ruolo;
  stabilimentoId: string | null;
}
```

- [ ] **Step 2: Crea `apps/api/src/identita/public.decorator.ts`**

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una rotta come pubblica: la JwtAuthGuard la lascia passare. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 3: Crea `apps/api/src/identita/current-user.decorator.ts`**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';

/** Inietta `req.user` (popolato dalla JwtAuthGuard) in un handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return req.user;
  },
);
```

- [ ] **Step 4: Crea `apps/api/src/identita/jwt-auth.guard.ts`**

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from './token.service';
import type { AuthUser } from './auth-user';

type AuthedRequest = Request & { user?: AuthUser; tenantId?: string };

/**
 * Guard globale: lascia passare le rotte @Public(); altrimenti valida il Bearer
 * JWT e popola req.user + req.tenantId (= stabilimentoId del token). Sostituisce
 * il TenantMiddleware del Plan 1. Vedi ADR-0024.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const auth = req.header('authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token mancante');
    }

    try {
      const claims = this.tokens.verify(auth.slice('Bearer '.length));
      req.user = { id: claims.sub, ruolo: claims.ruolo, stabilimentoId: claims.stabilimentoId };
      req.tenantId = claims.stabilimentoId ?? undefined;
      return true;
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
  }
}
```

- [ ] **Step 5: Verifica la compilazione (typecheck)**

Run (dalla radice):
```bash
pnpm --filter @driftly/api exec tsc --noEmit -p tsconfig.json
```
Expected: nessun errore TS (i file compilano; non vengono usati finché non li registra il modulo nel Task 7).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/identita/auth-user.ts apps/api/src/identita/public.decorator.ts apps/api/src/identita/current-user.decorator.ts apps/api/src/identita/jwt-auth.guard.ts
git commit -m "feat(api): JwtAuthGuard globale + @Public/@CurrentUser + AuthUser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `IdentitaService`, `LoginDto`, `AuthController`, modulo; wiring in AppModule; rimozione middleware

**Files:**
- Create: `apps/api/src/identita/dto/login.dto.ts`, `apps/api/src/identita/identita.service.ts`, `apps/api/src/identita/auth.controller.ts`, `apps/api/src/identita/identita.module.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`
- Delete: `apps/api/src/tenant/tenant.middleware.ts`

- [ ] **Step 1: Crea `apps/api/src/identita/dto/login.dto.ts`**

```ts
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import type { LoginInput } from '@driftly/contracts';

export class LoginDto implements LoginInput {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
```

- [ ] **Step 2: Crea `apps/api/src/identita/identita.service.ts`**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Utente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';
import { LoginInput, LoginResponse, Ruolo, UtenteDTO } from '@driftly/contracts';

@Injectable()
export class IdentitaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /** Proietta una riga Utente nel DTO condiviso (mai passwordHash). */
  private toDTO(u: Utente): UtenteDTO {
    // I valori dell'enum Ruolo del DB coincidono con quelli dei contracts.
    return { id: u.id, email: u.email, ruolo: u.ruolo as Ruolo, stabilimentoId: u.stabilimentoId };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    // Lookup fuori da forTenant: Utente non ha RLS (login pre-tenant). ADR-0026.
    const utente = await this.prisma.utente.findUnique({ where: { email: input.email } });
    if (!utente || !(await this.hasher.verify(utente.passwordHash, input.password))) {
      // 401 generico identico: niente user-enumeration.
      throw new UnauthorizedException('Credenziali non valide');
    }
    const dto = this.toDTO(utente);
    const accessToken = this.tokens.sign({
      sub: dto.id,
      stabilimentoId: dto.stabilimentoId,
      ruolo: dto.ruolo,
    });
    return { accessToken, utente: dto };
  }

  async me(userId: string): Promise<UtenteDTO> {
    const utente = await this.prisma.utente.findUnique({ where: { id: userId } });
    if (!utente) throw new UnauthorizedException('Utente non trovato');
    return this.toDTO(utente);
  }
}
```

- [ ] **Step 3: Crea `apps/api/src/identita/auth.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdentitaService } from './identita.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { LoginResponse, UtenteDTO } from '@driftly/contracts';

@Controller('auth')
export class AuthController {
  constructor(private readonly identita: IdentitaService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.identita.login(body);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UtenteDTO> {
    return this.identita.me(user.id);
  }
}
```

- [ ] **Step 4: Crea `apps/api/src/identita/identita.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { IdentitaService } from './identita.service';
import { PasswordHasher } from './password-hasher';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    IdentitaService,
    PasswordHasher,
    TokenService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class IdentitaModule {}
```

- [ ] **Step 5: Sostituisci `apps/api/src/app.module.ts`** (rimuovi middleware, aggiungi `IdentitaModule`)

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { ClientiModule } from './clienti/clienti.module';
import { IdentitaModule } from './identita/identita.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    IdentitaModule,
    ClientiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Marca `/health` come pubblico — `apps/api/src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../identita/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 7: Elimina il middleware provvisorio**

Run (dalla radice):
```bash
git rm apps/api/src/tenant/tenant.middleware.ts
```
Expected: il file è rimosso. (`TenantContext` e `TenantModule` restano.)

- [ ] **Step 8: Typecheck e build**

Run (dalla radice):
```bash
pnpm --filter @driftly/api exec tsc --noEmit -p tsconfig.json
```
Expected: nessun errore TS; nessun riferimento residuo a `TenantMiddleware`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/identita apps/api/src/app.module.ts apps/api/src/health/health.controller.ts
git commit -m "feat(api): login + /me + JwtAuthGuard globale; rimuove TenantMiddleware

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: e2e auth (login / me / guard / superuser) + helper

**Files:**
- Create: `apps/api/test/helpers/seed-auth.ts`, `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Crea l'helper `apps/api/test/helpers/seed-auth.ts`**

```ts
import type { INestApplication } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../../src/prisma/prisma.service';

/** Crea un Utente con password hashata (accesso diretto: Utente non ha RLS). */
export async function createUtente(
  prisma: PrismaService,
  params: { email: string; password: string; ruolo: Ruolo; stabilimentoId: string | null },
): Promise<void> {
  const passwordHash = await argon2.hash(params.password, { type: argon2.argon2id });
  await prisma.utente.create({
    data: {
      email: params.email,
      passwordHash,
      ruolo: params.ruolo,
      stabilimentoId: params.stabilimentoId,
    },
  });
}

/** Fa login via API e ritorna l'accessToken. */
export async function login(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.accessToken as string;
}
```

- [ ] **Step 2: Crea `apps/api/test/auth.e2e-spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUtente, login } from './helpers/seed-auth';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stabId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    stabId = (await prisma.stabilimento.create({ data: { nome: 'Auth E2E' } })).id;
    await createUtente(prisma, {
      email: 'admin.auth@e2e.test',
      password: 'segreto-1',
      ruolo: Ruolo.admin,
      stabilimentoId: stabId,
    });
    await createUtente(prisma, {
      email: 'super.auth@e2e.test',
      password: 'segreto-2',
      ruolo: Ruolo.superuser,
      stabilimentoId: null,
    });
  });

  afterAll(async () => {
    await prisma.utente.deleteMany({
      where: { email: { in: ['admin.auth@e2e.test', 'super.auth@e2e.test'] } },
    });
    await prisma.stabilimento.deleteMany({ where: { id: stabId } });
    await app.close();
  });

  it('login valido → 200 con accessToken e utente senza passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin.auth@e2e.test', password: 'segreto-1' })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.utente).toMatchObject({
      email: 'admin.auth@e2e.test',
      ruolo: 'admin',
      stabilimentoId: stabId,
    });
    expect(res.body.utente.passwordHash).toBeUndefined();
  });

  it('password errata → 401 generico', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin.auth@e2e.test', password: 'sbagliata' })
      .expect(401);
  });

  it('email sconosciuta → 401 (stesso esito)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nessuno@e2e.test', password: 'qualsiasi' })
      .expect(401);
  });

  it('email malformata → 400 (validazione)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'non-una-email', password: 'qualsiasi' })
      .expect(400);
  });

  it('GET /me con Bearer valido → profilo; senza/invalid token → 401', async () => {
    const token = await login(app, 'admin.auth@e2e.test', 'segreto-1');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ email: 'admin.auth@e2e.test', ruolo: 'admin' }));

    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer non.valido')
      .expect(401);
  });

  it('superuser: token con stabilimentoId null; endpoint tenant-scoped → 400', async () => {
    const token = await login(app, 'super.auth@e2e.test', 'segreto-2');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((r) => expect(r.body.stabilimentoId).toBeNull());

    await request(app.getHttpServer())
      .get('/api/clienti')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
```

- [ ] **Step 3: Esegui gli e2e auth**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e -- auth
```
Expected: PASS (6 test). Login, /me, guard e superuser funzionano end-to-end.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/helpers/seed-auth.ts apps/api/test/auth.e2e-spec.ts
git commit -m "test(api): e2e auth (login/me/guard/superuser) + helper seed-auth

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Migrazione di `clienti.e2e-spec.ts` al Bearer

**Files:**
- Modify: `apps/api/test/clienti.e2e-spec.ts`

- [ ] **Step 1: Sostituisci l'intero `apps/api/test/clienti.e2e-spec.ts`** (header via JWT al posto di `X-Stabilimento-Id`)

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Ruolo } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createUtente, login } from './helpers/seed-auth';

describe('Clienti (e2e) isolamento per tenant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;
  let token1: string;
  let token2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] }); // allineato a main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // allineato a main.ts
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.stabilimento.create({ data: { nome: 'E2E A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'E2E B' } })).id;
    await createUtente(prisma, {
      email: 'admin.s1@e2e.test',
      password: 'pw-s1',
      ruolo: Ruolo.admin,
      stabilimentoId: s1,
    });
    await createUtente(prisma, {
      email: 'admin.s2@e2e.test',
      password: 'pw-s2',
      ruolo: Ruolo.admin,
      stabilimentoId: s2,
    });
    token1 = await login(app, 'admin.s1@e2e.test', 'pw-s1');
    token2 = await login(app, 'admin.s2@e2e.test', 'pw-s2');
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.cliente.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.cliente.deleteMany({}));
    await prisma.utente.deleteMany({
      where: { email: { in: ['admin.s1@e2e.test', 'admin.s2@e2e.test'] } },
    });
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  const bearer = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

  it('richiede autenticazione: senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/clienti').expect(401);
  });

  it('crea un cliente per s1 e non lo mostra a s2', async () => {
    await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Mario', cognome: 'Rossi' })
      .expect(201);

    const resS1 = await request(app.getHttpServer())
      .get('/api/clienti')
      .set(...bearer(token1))
      .expect(200);
    expect(resS1.body).toHaveLength(1);

    const resS2 = await request(app.getHttpServer())
      .get('/api/clienti')
      .set(...bearer(token2))
      .expect(200);
    expect(resS2.body).toHaveLength(0);
  });

  it('crea un cliente coi contatti e li ritorna nel DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({
        nome: 'Anna',
        cognome: 'Bianchi',
        telefono: '+39 333 1234567',
        email: 'anna.bianchi@email.it',
        note: 'Cliente storica',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      nome: 'Anna',
      cognome: 'Bianchi',
      telefono: '+39 333 1234567',
      email: 'anna.bianchi@email.it',
      note: 'Cliente storica',
    });
    expect(res.body.id).toBeDefined();
  });

  it('GET /:id ritorna il cliente al proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Carlo', cognome: 'Verdi' })
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/clienti/${id}`)
      .set(...bearer(token1))
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ id, nome: 'Carlo', cognome: 'Verdi' }));

    await request(app.getHttpServer())
      .get(`/api/clienti/${id}`)
      .set(...bearer(token2))
      .expect(404);
  });

  it('PATCH /:id aggiorna i contatti del proprietario e 404 ad altro tenant', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Dora', cognome: 'Neri' })
      .expect(201);
    const id = created.body.id as string;

    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${id}`)
      .set(...bearer(token1))
      .send({ telefono: '+39 340 0000000', note: 'preferisce prima fila' })
      .expect(200);
    expect(patched.body).toMatchObject({
      id,
      telefono: '+39 340 0000000',
      note: 'preferisce prima fila',
    });

    await request(app.getHttpServer())
      .patch(`/api/clienti/${id}`)
      .set(...bearer(token2))
      .send({ telefono: '+39 111' })
      .expect(404);
  });

  it('rifiuta email malformata con 400', async () => {
    await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Eva', cognome: 'Gialli', email: 'non-una-email' })
      .expect(400);
  });

  it('tratta i contatti vuoti come assenti (come fa il form della scheda)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Senza', cognome: 'Contatti', telefono: '', email: '', note: '' })
      .expect(201);
    expect(created.body.telefono).toBeUndefined();
    expect(created.body.email).toBeUndefined();
    expect(created.body.note).toBeUndefined();

    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${created.body.id}`)
      .set(...bearer(token1))
      .send({ telefono: '  +39 333 1212121  ', email: '', note: '' })
      .expect(200);
    expect(patched.body.telefono).toBe('+39 333 1212121');
    expect(patched.body.email).toBeUndefined();
  });

  it('cancella un contatto esistente svuotando il campo', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/clienti')
      .set(...bearer(token1))
      .send({ nome: 'Aveva', cognome: 'Email', email: 'aveva@email.it' })
      .expect(201);
    expect(created.body.email).toBe('aveva@email.it');

    const patched = await request(app.getHttpServer())
      .patch(`/api/clienti/${created.body.id}`)
      .set(...bearer(token1))
      .send({ email: '' })
      .expect(200);
    expect(patched.body.email).toBeUndefined();
  });
});
```

- [ ] **Step 2: Esegui tutta la suite e2e**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e
```
Expected: PASS — `auth.e2e` e `clienti.e2e` verdi; l'isolamento per tenant continua a valere col Bearer; senza token → 401.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/clienti.e2e-spec.ts
git commit -m "test(api): clienti e2e autenticati via Bearer JWT (sostituisce X-Stabilimento-Id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: ADR 0024/0025/0026 + deferred + data-model

**Files:**
- Create: `docs/architecture/decisions/0024-strategia-auth.md`, `0025-hashing-password.md`, `0026-identita-rls-utente.md`
- Modify: `docs/architecture/deferred.md`, `docs/design/data-model.md`

- [ ] **Step 1: Crea `docs/architecture/decisions/0024-strategia-auth.md`**

```markdown
# ADR-0024: Strategia di autenticazione (JWT stateless + guard)

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0015](0015-osservabilita-e-console-superuser.md), [0025](0025-hashing-password.md), [0026](0026-identita-rls-utente.md)

## Context
Il Core deve autenticare lo staff e ricavare il tenant (e il ruolo) per ogni richiesta,
sostituendo l'header provvisorio `X-Stabilimento-Id` del Plan 1 senza toccare i moduli di dominio.

## Decision
- **JWT stateless** (niente sessione server), un solo **access token** a vita breve
  (`JWT_EXPIRES_IN`, default `8h`); claim: `sub` (id utente), `stabilimentoId` (null = superuser),
  `ruolo`. Firma HS256 con `JWT_SECRET` da ambiente.
- Libreria **`@nestjs/jwt`** + **`JwtAuthGuard` custom** registrata come `APP_GUARD` globale
  (no passport: meno dipendenze, controllo diretto su `req.tenantId`). Decoratore `@Public()`
  per `POST /api/auth/login` e `/health`.
- La guard popola `req.user` e `req.tenantId = stabilimentoId ?? undefined`: `TenantContext` e
  `forTenant` restano invariati. Login → 401 generico su credenziali errate (no user-enumeration).

## Consequences
- **Positive:** auth conforme alle convenzioni NestJS; sostituzione trasparente del middleware;
  superficie minima.
- **Negative / Trade-off:** un access token stateless non è revocabile prima della scadenza;
  refresh/revoca e rate-limiting sono rimandati (vedi deferred).

## Alternatives considered
- **Sessioni server + cookie:** scartata (stato server, meno adatta ad API-first/PWA).
- **passport-jwt:** valida ma aggiunge dipendenze e indirezione non necessarie per il nostro caso.

## Rubric check
1. **Professionalità** — JWT stateless + guard globale è prassi senior per API-first.
2. **Convenzioni** — `@nestjs/jwt`, `APP_GUARD`, `@Public()` sono pattern NestJS standard.
3. **Modularità** — modulo `identita` isolato; `TenantContext`/dominio invariati.
4. **Zero debito** — i limiti (revoca, rate-limit) sono tracciati nei deferred, non silenziosi.
```

- [ ] **Step 2: Crea `docs/architecture/decisions/0025-hashing-password.md`**

```markdown
# ADR-0025: Hashing delle password con argon2id

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0024](0024-strategia-auth.md)

## Context
Le password degli `Utente` vanno memorizzate con un algoritmo di hashing resistente.

## Decision
**argon2id** (pacchetto `argon2`), parametri di default della libreria. `PasswordHasher` espone
`hash`/`verify`; il `passwordHash` non è mai serializzato nei DTO.

## Consequences
- **Positive:** argon2id è la raccomandazione OWASP corrente (memory-hard, resistente a GPU/ASIC).
- **Negative / Trade-off:** dipendenza con binario nativo (prebuilds per Node 24; build tools solo
  in fallback). Costo CPU/memoria per hash (accettabile, e desiderato).

## Alternatives considered
- **bcrypt:** valido e diffuso, ma limite 72 byte e meno resistente di argon2id.
- **bcryptjs (puro JS):** nessun nativo ma più lento e meno raccomandato.

## Rubric check
1. **Professionalità** — algoritmo raccomandato OWASP.
2. **Convenzioni** — `argon2` è lo standard de facto su Node per nuovi progetti.
3. **Modularità** — incapsulato in `PasswordHasher`, sostituibile.
4. **Zero debito** — nessuna scelta legacy da rifare.
```

- [ ] **Step 3: Crea `docs/architecture/decisions/0026-identita-rls-utente.md`**

```markdown
# ADR-0026: Trattamento RLS della tabella d'identità `Utente`

- **Status:** Accepted
- **Data:** 2026-06-29
- **ADR correlati:** [0010](0010-isolamento-multi-tenant.md), [0024](0024-strategia-auth.md)

## Context
Il Plan 1 stabilisce che ogni tabella tenant-scoped abbia `stabilimentoId` + policy RLS
`tenant_isolation` + accesso via `forTenant`. `Utente` ha però due caratteristiche che rompono lo
schema: (a) il **login avviene prima** di conoscere il tenant (la policy che nega senza GUC
renderebbe il login impossibile); (b) `stabilimentoId` è **nullable** (superuser di piattaforma).

## Decision
`Utente` **non** abilita la policy `tenant_isolation`. È una **tabella d'identità/infrastruttura**,
il cui **unico accessore** è `IdentitaService`, che filtra sempre per `email` (unica globale). La
protezione è al **livello applicativo** (choke point unico), non via RLS.

Scartata l'alternativa "policy che permette quando nessun tenant è impostato": farebbe trapelare
tutti gli utenti a qualunque query non scoped.

## Consequences
- **Positive:** login pre-tenant possibile; nessuna eccezione fragile nella policy RLS; superuser
  (stabilimentoId null) gestito naturalmente.
- **Negative / Trade-off:** `Utente` perde la rete di sicurezza RLS; mitigato dall'accesso mediato
  da un solo servizio. Un percorso privilegiato per ripristinare difesa-in-profondità è tracciato
  nei deferred.

## Rubric check
1. **Professionalità** — riconosce il problema "login pre-tenant" e lo risolve in modo esplicito.
2. **Convenzioni** — separare l'auth/identity store dal dato di dominio è prassi comune.
3. **Modularità** — `Utente` toccato solo da `identita`; i moduli di dominio non lo vedono.
4. **Zero debito** — eccezione **documentata** alla regola RLS, con trigger di hardening tracciato.
```

- [ ] **Step 4: Aggiorna `docs/architecture/deferred.md`** (aggiungi righe alla tabella, prima della sezione "Risolte")

```markdown
| D-025 | Gestione utenti & RBAC sugli endpoint (admin crea/elenca/disabilita staff) | Lo slice `identita` fa solo auth core (login + guard); il provisioning oltre al seed e i decoratori di ruolo sono un increment a parte. | Serve creare utenti staff dall'app oltre al seed. | Bassa: additivo (endpoint + colonne `attivo`/`creatoIl`), su modello `Utente` già presente. |
| D-026 | Refresh & revoca dei token (refresh token, rotazione/blacklist) | L'MVP usa un access token JWT stateless a vita breve ([ADR-0024](decisions/0024-strategia-auth.md)). | Sessioni lunghe o necessità di logout immediato. | Media: il token resta valido fino a scadenza; mitigato dalla durata breve. |
| D-027 | Rate-limiting / protezione brute-force sul login | Non necessario sul deploy interno dell'MVP; va aggiunto all'esposizione pubblica. | Endpoint di login esposto pubblicamente. | Media: senza throttling il login è attaccabile a forza bruta. |
| D-028 | Percorso privilegiato RLS per `Utente` (difesa-in-profondità oltre il choke point) | `Utente` non ha RLS per scelta ([ADR-0026](decisions/0026-identita-rls-utente.md)); l'accesso è mediato solo a livello applicativo. | Più accessori della tabella identità o requisito di hardening formale. | Bassa: oggi unico accessore `IdentitaService`; additivo in futuro. |
```

- [ ] **Step 5: Aggiorna `docs/design/data-model.md`** (nota sotto "Invarianti e regole")

Aggiungi in fondo alla lista delle invarianti:
```markdown
- **Identità & RLS**: `Utente` porta `stabilimento_id` **nullable** (null = superuser di
  piattaforma) e il `ruolo` è un **enum DB** (`admin|staff|superuser`). A differenza delle altre
  tabelle tenant-scoped, `Utente` **non** abilita la policy RLS `tenant_isolation`: il login è
  pre-tenant e l'accesso è mediato solo da `IdentitaService`
  ([ADR-0026](../architecture/decisions/0026-identita-rls-utente.md)). Il tenant delle richieste
  è ricavato dal **JWT** dalla `JwtAuthGuard`, che popola `req.tenantId`
  ([ADR-0024](../architecture/decisions/0024-strategia-auth.md)).
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/decisions/0024-strategia-auth.md docs/architecture/decisions/0025-hashing-password.md docs/architecture/decisions/0026-identita-rls-utente.md docs/architecture/deferred.md docs/design/data-model.md
git commit -m "docs(adr): 0024 auth, 0025 argon2id, 0026 RLS Utente; deferred + data-model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Verifica finale + aggiornamento memoria

**Files:**
- Modify: `MEMORY.md`, `memory/driftly-project-state.md` (cartella memoria utente, fuori dal repo)

- [ ] **Step 1: Verifica completa (verification-before-completion)**

Run (dalla radice), e conferma l'output verde di ciascuno:
```bash
pnpm --filter @driftly/contracts build
pnpm lint
pnpm --filter @driftly/api exec tsc --noEmit -p tsconfig.json
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e
```
Expected: build contracts ok; lint pulito; typecheck senza errori; unit verdi (incl. `password-hasher`, `token.service`); e2e verdi (`auth`, `clienti`). Nessun "fatto" senza questo output.

- [ ] **Step 2: Aggiorna la memoria utente** (`C:\Users\Jays\.claude\projects\C--Users-Jays-Desktop-new\memory\driftly-project-state.md` e la riga indice in `MEMORY.md`)

Aggiorna lo stato di progetto: modulo `identita` (auth) MERGIATO su main — `Utente` + enum `Ruolo`,
login argon2id + JWT, `JwtAuthGuard` globale che sostituisce `TenantMiddleware`, ADR-0024/0025/0026,
nuovi deferred D-025..D-028; prossimo ADR libero **0027**; prossimo modulo per dipendenza: **`mappa`**.

- [ ] **Step 3: Integra la branch e pulisci** (superpowers:finishing-a-development-branch)

Segui la skill per decidere merge/PR; al merge su `main` di `feat/api-identita-auth`, verifica
working tree pulita.

---

## Definition of Done

- `pnpm lint` pulito; typecheck senza errori; build `contracts` ok.
- Migrazione `utente` applicata a dev e test; `Utente` **senza** policy `tenant_isolation`.
- `POST /api/auth/login` → 200 con JWT; credenziali errate → 401 generico; email malformata → 400.
- `GET /api/auth/me` → profilo; senza/invalid Bearer → 401.
- `JwtAuthGuard` globale; `@Public()` su login e health; **`TenantMiddleware` rimosso**;
  `TenantContext`/`forTenant`/`clienti` invariati.
- e2e: isolamento per tenant via Bearer verde; senza token → 401; superuser → endpoint
  tenant-scoped → 400.
- Seed crea Stabilimento + admin; unit (`password-hasher`, `token.service`) verdi.
- ADR 0024/0025/0026 scritti; `deferred.md`/`data-model.md`/`MEMORY.md` aggiornati.
- Tutti i commit atomici col trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
```
