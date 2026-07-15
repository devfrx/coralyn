# Canale cliente — Fondazione auth (D-035 S3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la fondazione di auth del canale cliente self-service — accesso *provisioned dal lido* via token opaco + PIN, sessione device-bound rotante, tenant-routing pubblico derivato dal token — senza ancora la feature release (S4).

**Architecture:** Nuovo modulo isolato `apps/api/src/customer-auth/` (accessore unico di due tabelle **fuori-RLS** `CustomerEnrollmentToken`/`CustomerSession`, mirror di `CredentialSetupToken`/ADR-0026). Tre strati di credenziali: enrollment one-time (QR/link) → refresh device-bound rotante (D-026) → access JWT cliente 30m (`kind:'customer'`). Il tenant è derivato dal token (denormalizzato sulle tabelle fuori-RLS) e popolato in `req.tenantId` da un `CustomerJwtGuard` dedicato, così `forTenant`/RLS restano invariati a valle. Provisioning e revoca sono endpoint operatore admin-only accanto al consenso (ADR-0048).

**Tech Stack:** NestJS, Prisma (Postgres + RLS), `@nestjs/jwt`, `argon2` (PIN, riuso `PasswordHasher`/ADR-0025), `@nestjs/throttler` (nuovo), Jest (unit + e2e con `createTestApp`), `@coralyn/contracts`.

## Global Constraints

- **Spec di riferimento:** `docs/superpowers/specs/2026-07-10-canale-cliente-self-service-d035-s3-s4-design.md`. Questo piano copre **solo S3** (fondazione auth). S4 (feature release `source='customer'` + app `web-customer`) è un piano separato dopo il merge-gate.
- **Baseline da NON regredire:** api unit **232** · api e2e **330** · web-staff **375** · ui-kit **111** · web-platform **16** · typecheck `tsc -p tsconfig.json --noEmit` pulito.
- **Sicurezza = vincolo dominante** (direttiva utente). Nessun raw token/PIN persistito (solo hash). Fallimenti auth = **401 generico** (no enumeration, D-029). Ownership: RLS isola il *tenant*, non il *cliente nel tenant* → i futuri endpoint cliente (S4) vincolano `customerId`; in S3 il `CustomerJwtGuard` isola tenant+cliente nel principal.
- **Tabelle token = FUORI-RLS** (dato d'identità pre-tenant, ADR-0026): CREATE TABLE senza `ENABLE ROW LEVEL SECURITY`, accessore unico applicativo, `establishmentId` denormalizzato come sorgente tenant.
- **Comandi test (forma esatta, dal brief):** unit `corepack pnpm --filter @coralyn/api test --runInBand -t '<pattern>'`; e2e `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t '<pattern>'` — **NON** ri-passare `--config` (già bakeato nello script → duplica → errore). Full-run e2e senza `-t`. Non lanciare web-staff test e api test:e2e in parallelo.
- **Deferiti risolti in-scope:** D-026 (refresh/revoca), D-027 (rate-limit), D-029 (anti-enumeration). D-028 (RLS `User`) resta tracciato (non-trigger).
- **Env nuove:** `CUSTOMER_JWT_EXPIRES_IN` (default `30m`), `CUSTOMER_ENROLLMENT_TTL_HOURS` (default `2160` = 90g), `CUSTOMER_REFRESH_TTL_DAYS` (default `120`), `CUSTOMER_APP_URL` (base per `activationUrl`), `CUSTOMER_PIN_MAX_ATTEMPTS` (default `5`), `CUSTOMER_THROTTLE_LIMIT` (default `10`, finestra 60s; rate-limit `/customer/*`).
- **DoD ([ADR-0009]):** ogni cambio a modello/flusso/macchina-a-stati → aggiorna `docs/design/` nello stesso slice (Task 12). Ogni debito consapevole → riga in `deferred.md`.
- **Commit:** frequenti, uno per task. Branch corrente `feat/customer-channel-d035-s3`. **Nessun merge/push** senza OK esplicito utente.

---

### Task 1: Schema + migration tabelle token (fuori-RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (aggiungi 2 model + 2 relazioni inverse su `Customer` e `Establishment`)
- Create (generata): `apps/api/prisma/migrations/<timestamp>_customer_auth_tokens/migration.sql`

**Interfaces:**
- Produces: model Prisma `CustomerEnrollmentToken` (campi: `id, customerId, establishmentId, tokenHash @unique, pinHash, pinAttempts, expiresAt, activatedAt?, revokedAt?, createdByUserId, createdAt`) e `CustomerSession` (`id, customerId, establishmentId, enrollmentTokenId, refreshTokenHash @unique, rotatedFromId?, expiresAt, revokedAt?, lastUsedAt?, createdAt`).

- [ ] **Step 1: Aggiungi i due model a `schema.prisma`** (dopo il model `Customer`, prima di `enum Role`):

```prisma
// Accesso self-service del cliente (D-035 S3). Token OPACO provisioned dal lido: enrollment one-time
// nel QR/link. FUORI-RLS (dato d'identità pre-tenant, come CredentialSetupToken/ADR-0026): il tenant
// è derivato da establishmentId denormalizzato. Raw del token/PIN mai persistito (solo hash).
model CustomerEnrollmentToken {
  id              String    @id @default(uuid()) @db.Uuid
  customerId      String    @db.Uuid
  establishmentId String    @db.Uuid // denorm: SORGENTE DEL TENANT (tabella fuori-RLS)
  tokenHash       String    @unique   // sha256(raw); raw solo nel link consegnato
  pinHash         String              // argon2id(PIN); secondo fattore, mai in chiaro
  pinAttempts     Int       @default(0)
  expiresAt       DateTime
  activatedAt     DateTime? // one-time: valorizzato alla 1ª attivazione riuscita
  revokedAt       DateTime? // revoca operatore / lock PIN
  createdByUserId String    @db.Uuid
  createdAt       DateTime  @default(now())

  customer      Customer      @relation(fields: [customerId], references: [id], onDelete: Cascade)
  establishment Establishment @relation(fields: [establishmentId], references: [id])

  @@index([customerId])
  @@index([establishmentId])
}

// Sessione cliente = refresh token DEVICE-BOUND, ROTANTE, revocabile (D-026). Raw solo sul device.
// La catena rotatedFromId dà theft-detection (riuso di un refresh già ruotato → revoca catena).
model CustomerSession {
  id                String    @id @default(uuid()) @db.Uuid
  customerId        String    @db.Uuid
  establishmentId   String    @db.Uuid
  enrollmentTokenId String    @db.Uuid
  refreshTokenHash  String    @unique // sha256(raw); raw solo sul device
  rotatedFromId     String?   @db.Uuid
  expiresAt         DateTime
  revokedAt         DateTime?
  lastUsedAt        DateTime?
  createdAt         DateTime  @default(now())

  customer        Customer                @relation(fields: [customerId], references: [id], onDelete: Cascade)
  establishment   Establishment           @relation(fields: [establishmentId], references: [id])
  enrollmentToken CustomerEnrollmentToken @relation(fields: [enrollmentTokenId], references: [id], onDelete: Cascade)
  rotatedFrom     CustomerSession?        @relation("CustomerSessionRotation", fields: [rotatedFromId], references: [id], onDelete: SetNull)
  rotatedInto     CustomerSession[]       @relation("CustomerSessionRotation")

  @@index([customerId])
  @@index([enrollmentTokenId])
}
```
> **Integrità referenziale (review Task 1):** `CustomerSession` porta FK reali su `establishmentId` (Establishment), `enrollmentTokenId` (CustomerEnrollmentToken, `onDelete: Cascade`) e la self-relation `rotatedFromId` (`onDelete: SetNull`) — non colonne nude. Coerente con `CustomerEnrollmentToken`; nessuna session orfana né tenant che deriva.

- [ ] **Step 2: Aggiungi le relazioni inverse.** Nel model `Customer` (dopo `transfersIn`):

```prisma
  enrollmentTokens CustomerEnrollmentToken[]
  customerSessions CustomerSession[]
```

Nel model `Establishment` (dopo `absenceReleases    AbsenceRelease[]`, riga 33):

```prisma
  customerEnrollmentTokens CustomerEnrollmentToken[]
  customerSessions         CustomerSession[]
```

Nel model `CustomerEnrollmentToken` (relazione inversa verso le sessioni):

```prisma
  sessions CustomerSession[]
```

- [ ] **Step 3: Genera la migration** (senza reseed che clobbera l'admin — passa la password nota):

Run: `cd apps/api && DEV_ADMIN_PASSWORD=coralyn-admin-8473 corepack pnpm exec prisma migrate dev --name customer_auth_tokens`
Expected: crea `migration.sql` con `CREATE TABLE "CustomerEnrollmentToken"` e `"CustomerSession"` + gli indici unici/normali + le 3 FK. **Verifica che NON contenga** `ENABLE ROW LEVEL SECURITY` né `CREATE POLICY` (tabelle fuori-RLS, mirror `20260705140000_credential_setup_token`).

- [ ] **Step 4: Verifica typecheck + client generato:**

Run: `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0. Il client Prisma espone `prisma.customerEnrollmentToken` / `prisma.customerSession`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): tabelle CustomerEnrollmentToken/CustomerSession (fuori-RLS) per canale cliente [D-035 S3]"
```

---

### Task 2: Contracts (DTO/input canale cliente)

**Files:**
- Modify: `packages/contracts/src/index.ts` (append, dopo `ReleaseAbsenceInput`/riga ~342)

**Interfaces:**
- Produces: `CustomerActivateInput`, `CustomerRefreshInput`, `CustomerAuthResponse`, `CustomerMeDTO`, `CustomerProvisionResponse`, `CustomerAccessStatusDTO`, `CustomerAccessState`.

- [ ] **Step 1: Aggiungi i tipi** a `packages/contracts/src/index.ts`:

```typescript
// --- Canale cliente self-service (D-035 S3) ---

/** Attivazione: enrollment token (dal link) + PIN operatore. */
export interface CustomerActivateInput {
  enrollmentToken: string;
  pin: string;
}

/** Rotazione della sessione: refresh token corrente (dal device). */
export interface CustomerRefreshInput {
  refreshToken: string;
}

/** Risposta auth cliente. I raw NON vanno mai loggati/persistiti lato server. */
export interface CustomerAuthResponse {
  accessToken: string;  // JWT cliente, breve (kind:'customer')
  refreshToken: string; // opaco, device-bound, rotante
}

/** Session-check del cliente autenticato (mirror di /auth/me). */
export interface CustomerMeDTO {
  customerId: string;
  firstName: string;
  lastName: string;
  establishmentName: string;
}

/** Ritorno del provisioning operatore. Il PIN e l'URL sono mostrati UNA volta. */
export interface CustomerProvisionResponse {
  activationUrl: string; // CUSTOMER_APP_URL + token opaco
  pin: string;
  expiresAt: string;     // ISO datetime
}

/** Stato dell'accesso cliente per la Scheda cliente (nessun segreto). */
export type CustomerAccessState = 'none' | 'issued' | 'active' | 'revoked';
export interface CustomerAccessStatusDTO {
  state: CustomerAccessState;
  lastActivatedAt: string | null; // ISO datetime | null
}
```

- [ ] **Step 2: Build dei contracts + typecheck**

Run: `corepack pnpm --filter @coralyn/contracts build && corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit`
Expected: exit 0 su entrambi.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): DTO/input canale cliente [D-035 S3]"
```

---

### Task 3: `customer-auth` module + `CustomerTokenService` (JWT cliente 30m)

**Files:**
- Create: `apps/api/src/customer-auth/customer-token.service.ts`
- Create: `apps/api/src/customer-auth/customer-token.service.spec.ts`
- Create: `apps/api/src/customer-auth/customer-auth.module.ts`

**Interfaces:**
- Produces:
  - `interface CustomerTokenClaims { sub: string; establishmentId: string; kind: 'customer' }`
  - `CustomerTokenService.sign(claims: CustomerTokenClaims): string`
  - `CustomerTokenService.verify(token: string): CustomerTokenClaims` (throw se `kind !== 'customer'`)
  - `CustomerAuthModule` (registra un `JwtModule` proprio con `CUSTOMER_JWT_EXPIRES_IN`).

- [ ] **Step 1: Write the failing test** — `customer-token.service.spec.ts`:

```typescript
import { JwtService } from '@nestjs/jwt';
import { CustomerTokenService } from './customer-token.service';

describe('CustomerTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '30m' } });
  const service = new CustomerTokenService(jwt);

  it('firma e verifica un token cliente con kind=customer', () => {
    const token = service.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    expect(service.verify(token)).toEqual({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
  });

  it('rifiuta un token privo di kind=customer (es. token staff)', () => {
    const staffish = jwt.sign({ sub: 'u1', establishmentId: 'est-1', role: 'admin' });
    expect(() => service.verify(staffish)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'CustomerTokenService'`
Expected: FAIL ("Cannot find module './customer-token.service'").

- [ ] **Step 3: Implementa `customer-token.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Claim del JWT cliente (oltre iat/exp). Distinto dal token staff: kind='customer'. */
export interface CustomerTokenClaims {
  sub: string;             // customerId
  establishmentId: string; // tenant (dal token di enrollment)
  kind: 'customer';
}

/** Firma/verifica del JWT d'accesso cliente (D-035 S3). Breve (CUSTOMER_JWT_EXPIRES_IN). */
@Injectable()
export class CustomerTokenService {
  constructor(private readonly jwt: JwtService) {}

  sign(claims: CustomerTokenClaims): string {
    return this.jwt.sign(claims);
  }

  verify(token: string): CustomerTokenClaims {
    const p = this.jwt.verify<CustomerTokenClaims & { iat: number; exp: number }>(token);
    if (p.kind !== 'customer') throw new UnauthorizedException('Token non valido');
    return { sub: p.sub, establishmentId: p.establishmentId, kind: 'customer' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'CustomerTokenService'`
Expected: PASS (2 test).

- [ ] **Step 5: Crea il modulo** — `customer-auth.module.ts` (per ora solo JwtModule + TokenService; controller/service aggiunti nei task successivi):

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CustomerTokenService } from './customer-token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('CUSTOMER_JWT_EXPIRES_IN') ?? '30m' },
      }),
    }),
  ],
  providers: [CustomerTokenService],
  exports: [CustomerTokenService],
})
export class CustomerAuthModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-auth
git commit -m "feat(api): CustomerAuthModule + CustomerTokenService (JWT cliente kind=customer) [D-035 S3]"
```

---

### Task 4: Helper PIN (`pin.ts`) + hashing riuso `PasswordHasher`

**Files:**
- Create: `apps/api/src/customer-auth/pin.ts`
- Create: `apps/api/src/customer-auth/pin.spec.ts`

**Interfaces:**
- Produces: `generatePin(): string` (6 cifre, zero-padded, da `crypto.randomInt`). L'hashing del PIN riusa `PasswordHasher.hash/verify` (argon2id) — nessun nuovo hasher.

- [ ] **Step 1: Write the failing test** — `pin.spec.ts`:

```typescript
import { generatePin } from './pin';

describe('generatePin', () => {
  it('genera 6 cifre numeriche', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'generatePin'`
Expected: FAIL ("Cannot find module './pin'").

- [ ] **Step 3: Implementa `pin.ts`**

```typescript
import { randomInt } from 'node:crypto';

/** PIN operatore (secondo fattore): 6 cifre uniformi, zero-padded. randomInt = CSPRNG. */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'generatePin'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customer-auth/pin.ts apps/api/src/customer-auth/pin.spec.ts
git commit -m "feat(api): helper generatePin (6 cifre CSPRNG) [D-035 S3]"
```

---

### Task 5: `CustomerJwtGuard` + principal + `@CurrentCustomer`

**Files:**
- Create: `apps/api/src/customer-auth/customer-principal.ts`
- Create: `apps/api/src/customer-auth/current-customer.decorator.ts`
- Create: `apps/api/src/customer-auth/customer-jwt.guard.ts`
- Create: `apps/api/src/customer-auth/customer-jwt.guard.spec.ts`

**Interfaces:**
- Consumes: `CustomerTokenService.verify` (Task 3).
- Produces:
  - `interface CustomerPrincipal { id: string; establishmentId: string }` (forma di `req.customer`).
  - `CustomerJwtGuard` (controller-guard: valida Bearer JWT cliente, setta `req.customer` + `req.tenantId = establishmentId`).
  - `@CurrentCustomer()` param decorator → `CustomerPrincipal`.

- [ ] **Step 1: Write the failing test** — `customer-jwt.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerTokenService } from './customer-token.service';
import { CustomerJwtGuard } from './customer-jwt.guard';

function ctxWith(header?: string) {
  const req: Record<string, unknown> = { header: (_: string) => header };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as unknown as ExecutionContext & { _req: Record<string, unknown> };
}

describe('CustomerJwtGuard', () => {
  const jwt = new JwtService({ secret: 's', signOptions: { expiresIn: '30m' } });
  const tokens = new CustomerTokenService(jwt);
  const guard = new CustomerJwtGuard(tokens);

  it('popola req.customer e req.tenantId da un token cliente valido', () => {
    const token = tokens.sign({ sub: 'cust-1', establishmentId: 'est-1', kind: 'customer' });
    const ctx = ctxWith(`Bearer ${token}`);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(ctx._req.customer).toEqual({ id: 'cust-1', establishmentId: 'est-1' });
    expect(ctx._req.tenantId).toBe('est-1');
  });

  it('rifiuta header mancante', () => {
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(UnauthorizedException);
  });

  it('rifiuta un token staff (senza kind=customer)', () => {
    const staff = jwt.sign({ sub: 'u1', establishmentId: 'est-1', role: 'admin' });
    expect(() => guard.canActivate(ctxWith(`Bearer ${staff}`))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'CustomerJwtGuard'`
Expected: FAIL ("Cannot find module './customer-jwt.guard'").

- [ ] **Step 3: Implementa i tre file**

`customer-principal.ts`:

```typescript
/** Forma di `req.customer` dopo il CustomerJwtGuard. */
export interface CustomerPrincipal {
  id: string;             // customerId
  establishmentId: string; // = req.tenantId
}
```

`customer-jwt.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CustomerTokenService } from './customer-token.service';
import type { CustomerPrincipal } from './customer-principal';

type CustomerRequest = Request & { customer?: CustomerPrincipal; tenantId?: string };

/**
 * Guard di rotta (controller-level) del canale cliente. Le rotte cliente sono @Public() per
 * bypassare la JwtAuthGuard globale (staff); questo guard fa l'auth cliente vera: valida il
 * Bearer JWT (kind='customer') e popola req.customer + req.tenantId (= establishmentId dal
 * token). Così TenantContext/forTenant/RLS restano invariati a valle. Vedi ADR-0049.
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private readonly tokens: CustomerTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CustomerRequest>();
    const header = req.header('authorization');
    if (!header) throw new UnauthorizedException('Token mancante');
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Token non valido');
    try {
      const claims = this.tokens.verify(token);
      req.customer = { id: claims.sub, establishmentId: claims.establishmentId };
      req.tenantId = claims.establishmentId;
      return true;
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
  }
}
```

`current-customer.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CustomerPrincipal } from './customer-principal';

/** Inietta `req.customer` (popolato dal CustomerJwtGuard) in un handler. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal => {
    const req = ctx.switchToHttp().getRequest<Request & { customer: CustomerPrincipal }>();
    return req.customer;
  },
);
```

- [ ] **Step 4: Registra il guard come provider** in `customer-auth.module.ts` (aggiungi `CustomerJwtGuard` a `providers` e `exports`).

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test --runInBand -t 'CustomerJwtGuard'`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-auth
git commit -m "feat(api): CustomerJwtGuard + principal + @CurrentCustomer (tenant da token) [D-035 S3]"
```

---

### Task 6: `CustomerAccessService` — provisioning + revoca (operatore)

**Files:**
- Create: `apps/api/src/customer-auth/customer-access.service.ts`
- Create: `apps/api/test/customer-access.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService.forTenant` (legge la booking tenant-scoped), `PasswordHasher.hash`, `generateRawToken`/`hashToken` (`../credential/token-hash`), `generatePin` (Task 4), `TenantContext.require`.
- Produces:
  - `CustomerAccessService.provisionAccess(bookingId: string): Promise<CustomerProvisionResponse>`
  - `CustomerAccessService.revokeAccess(bookingId: string): Promise<void>`
  - `CustomerAccessService.accessStatus(customerId: string): Promise<CustomerAccessStatusDTO>` (per Scheda cliente; usata dal projection in S4, esportata ora)

- [ ] **Step 1: Write the failing test (e2e)** — `apps/api/test/customer-access.e2e-spec.ts`. Segui il pattern di bootstrap di `apps/api/test/*.e2e-spec.ts` (import `AppModule`, `createTestApp`, crea tenant+admin+customer+booking-subscription via helper esistenti). Casi minimi:

```typescript
// NB: riusa gli helper di seed e2e già presenti nelle altre suite (createTenantWithAdmin,
// createSubscriptionBooking o equivalenti). Qui lo pseudocodice dei 3 asserti chiave:
describe('Customer access provisioning (D-035 S3)', () => {
  it('POST /bookings/:id/customer-access ritorna activationUrl+pin+expiresAt (admin)', async () => {
    // arrange: tenant T, admin token, customer C, subscription booking B (customerId=C)
    const res = await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.activationUrl).toMatch(/\/attiva\?token=.+/); // url contiene il raw token
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // e nel DB esiste 1 CustomerEnrollmentToken vivo per C con activatedAt=null
  });

  it('ri-provisioning invalida l\'enrollment precedente (revokedAt) e ne crea uno nuovo', async () => {
    // due POST successivi → il primo enrollment ha revokedAt!=null, l'ultimo è l'unico vivo
  });

  it('nega a un non-admin (staff) → 403', async () => {
    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/customer-access`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access provisioning'`
Expected: FAIL (rotta `/bookings/:id/customer-access` inesistente → 404).

- [ ] **Step 3: Implementa `customer-access.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CustomerAccessStatusDTO, CustomerProvisionResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { PasswordHasher } from '../identity/password-hasher';
import { generateRawToken, hashToken } from '../credential/token-hash';
import { generatePin } from './pin';

@Injectable()
export class CustomerAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly hasher: PasswordHasher,
    private readonly config: ConfigService,
    // createdByUserId arriva dal controller (admin corrente)
  ) {}

  private ttlHours(): number {
    return Number(this.config.get<string>('CUSTOMER_ENROLLMENT_TTL_HOURS') || '2160');
  }

  /** Provisiona l'accesso del cliente titolare della booking. Invalida enrollment/sessioni vivi
   *  precedenti (rotazione pulita) e crea un nuovo enrollment one-time. admin-only (controller). */
  async provisionAccess(bookingId: string, createdByUserId: string): Promise<CustomerProvisionResponse> {
    const tenantId = this.tenant.require();
    // 1. Risolvi il customer titolare, tenant-scoped (RLS).
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');

    const raw = generateRawToken();
    const pin = generatePin();
    const [tokenHash, pinHash] = [hashToken(raw), await this.hasher.hash(pin)];
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);

    // 2. Tabelle fuori-RLS → prisma diretto (no forTenant). establishmentId denorm = tenantId.
    await this.prisma.$transaction(async (tx) => {
      await tx.customerEnrollmentToken.updateMany({
        where: { customerId: booking.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.customerSession.updateMany({
        where: { customerId: booking.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.customerEnrollmentToken.create({
        data: { customerId: booking.customerId, establishmentId: tenantId, tokenHash, pinHash, expiresAt, createdByUserId },
      });
    });

    const base = (this.config.get<string>('CUSTOMER_APP_URL') || '').replace(/\/$/, '');
    return { activationUrl: `${base}/attiva?token=${raw}`, pin, expiresAt: expiresAt.toISOString() };
  }

  /** Revoca l'accesso del cliente titolare della booking (enrollment + sessioni). admin-only. */
  async revokeAccess(bookingId: string): Promise<void> {
    const tenantId = this.tenant.require();
    const booking = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.booking.findFirst({ where: { id: bookingId }, select: { customerId: true } });
    });
    if (!booking) throw new NotFoundException('Prenotazione non trovata');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.customerEnrollmentToken.updateMany({ where: { customerId: booking.customerId, revokedAt: null }, data: { revokedAt: now } });
      await tx.customerSession.updateMany({ where: { customerId: booking.customerId, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  /** Stato accesso per la Scheda cliente (nessun segreto). */
  async accessStatus(customerId: string): Promise<CustomerAccessStatusDTO> {
    const latest = await this.prisma.customerEnrollmentToken.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { state: 'none', lastActivatedAt: null };
    const state = latest.revokedAt ? 'revoked' : latest.activatedAt ? 'active' : 'issued';
    return { state, lastActivatedAt: latest.activatedAt ? latest.activatedAt.toISOString() : null };
  }
}
```

- [ ] **Step 4: Aggiungi il provider + i due endpoint operatore.** In `customer-auth.module.ts`: aggiungi `CustomerAccessService` a `providers` + `exports`; importa `TenantModule` (per `TenantContext`) e provvedi `PasswordHasher` (come fa `CredentialModule`). In `apps/api/src/bookings/bookings.controller.ts` aggiungi (mirror di `@Post(':id/absence-consent')`, con `@Roles(Role.Admin)` e `@CurrentUser`):

```typescript
  @Post(':id/customer-access')
  @Roles(Role.Admin)
  provisionCustomerAccess(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<CustomerProvisionResponse> {
    return this.customerAccess.provisionAccess(id, user.id);
  }

  @Post(':id/customer-access/revoke')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeCustomerAccess(@Param('id') id: string): Promise<void> {
    return this.customerAccess.revokeAccess(id);
  }
```

Iniettando `CustomerAccessService` nel costruttore di `BookingsController` e importando `CustomerAuthModule` in `BookingsModule`. (Aggiungi gli import mancanti: `CustomerProvisionResponse` da `@coralyn/contracts`, `HttpCode`/`HttpStatus` da `@nestjs/common`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer access provisioning'`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-auth apps/api/src/bookings apps/api/test/customer-access.e2e-spec.ts
git commit -m "feat(api): provisioning/revoca accesso cliente (admin-only) [D-035 S3]"
```

---

### Task 7: `CustomerSessionService.activate` (public, one-time, PIN, lock, tenant da token)

**Files:**
- Create: `apps/api/src/customer-auth/customer-session.service.ts`
- Create: `apps/api/src/customer-auth/session-token-hash.ts` (helper: refresh token opaco = riusa `generateRawToken`/`hashToken`)
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (aggiungi blocco `activate`)

**Interfaces:**
- Consumes: `PasswordHasher.verify`, `hashToken`/`generateRawToken`, `CustomerTokenService.sign`, `PrismaService`.
- Produces: `CustomerSessionService.activate(input: CustomerActivateInput): Promise<CustomerAuthResponse>`.

- [ ] **Step 1: Write the failing test (e2e)** — aggiungi a `customer-access.e2e-spec.ts`:

```typescript
describe('Customer activate (D-035 S3)', () => {
  it('token+PIN corretti → { accessToken, refreshToken }, consuma il one-time', async () => {
    // arrange: provisiona (Task 6); estrai il raw token da
    //   new URL(prov.activationUrl).searchParams.get('token')  e il pin da prov.pin
    const res = await request(app.getHttpServer())
      .post('/api/customer/activate')
      .send({ enrollmentToken: rawToken, pin })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    // seconda attivazione con lo stesso token → 401 (già consumato)
    await request(app.getHttpServer()).post('/api/customer/activate').send({ enrollmentToken: rawToken, pin }).expect(401);
  });

  it('PIN errato → 401 generico e incrementa i tentativi; oltre soglia → lock (revokedAt)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/api/customer/activate').send({ enrollmentToken: rawToken, pin: '000000' }).expect(401);
    }
    // ora anche col PIN GIUSTO → 401 (lock)
    await request(app.getHttpServer()).post('/api/customer/activate').send({ enrollmentToken: rawToken, pin }).expect(401);
  });

  it('token inesistente → 401 generico', async () => {
    await request(app.getHttpServer()).post('/api/customer/activate').send({ enrollmentToken: 'nope', pin: '123456' }).expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer activate'`
Expected: FAIL (rotta `/customer/activate` inesistente → 404).

- [ ] **Step 3: Implementa `customer-session.service.ts` (metodo `activate`)**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CustomerActivateInput, CustomerAuthResponse } from '@coralyn/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordHasher } from '../identity/password-hasher';
import { generateRawToken, hashToken } from '../credential/token-hash';
import { CustomerTokenService } from './customer-token.service';

const INVALID = 'Credenziali non valide';

@Injectable()
export class CustomerSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: CustomerTokenService,
    private readonly config: ConfigService,
  ) {}

  private refreshTtlMs(): number {
    return Number(this.config.get<string>('CUSTOMER_REFRESH_TTL_DAYS') || '120') * 86_400_000;
  }
  private maxPinAttempts(): number {
    return Number(this.config.get<string>('CUSTOMER_PIN_MAX_ATTEMPTS') || '5');
  }

  /** Attivazione one-time + PIN. Consuma l'enrollment, crea la sessione device-bound, emette
   *  access JWT + refresh. Fallimenti = 401 generico (no enumeration, D-029). */
  async activate(input: CustomerActivateInput): Promise<CustomerAuthResponse> {
    const token = await this.prisma.customerEnrollmentToken.findUnique({ where: { tokenHash: hashToken(input.enrollmentToken) } });
    if (!token || token.revokedAt || token.activatedAt || token.expiresAt <= new Date()) throw new UnauthorizedException(INVALID);

    const pinOk = await this.hasher.verify(token.pinHash, input.pin);
    if (!pinOk) {
      const attempts = token.pinAttempts + 1;
      const lock = attempts >= this.maxPinAttempts();
      await this.prisma.customerEnrollmentToken.update({
        where: { id: token.id },
        data: { pinAttempts: attempts, revokedAt: lock ? new Date() : null },
      });
      throw new UnauthorizedException(INVALID);
    }

    const refreshRaw = generateRawToken();
    const auth = await this.prisma.$transaction(async (tx) => {
      // Claim atomico del one-time: la updateMany con activatedAt:null è race-safe (row-lock).
      const claim = await tx.customerEnrollmentToken.updateMany({
        where: { id: token.id, activatedAt: null, revokedAt: null },
        data: { activatedAt: new Date() },
      });
      if (claim.count !== 1) throw new UnauthorizedException(INVALID);
      await tx.customerSession.create({
        data: {
          customerId: token.customerId, establishmentId: token.establishmentId, enrollmentTokenId: token.id,
          refreshTokenHash: hashToken(refreshRaw), expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      });
      const accessToken = this.tokens.sign({ sub: token.customerId, establishmentId: token.establishmentId, kind: 'customer' });
      return { accessToken, refreshToken: refreshRaw };
    });
    return auth;
  }
}
```

- [ ] **Step 4: Registra `CustomerSessionService`** in `customer-auth.module.ts` (`providers` + `exports`) e provvedi `PasswordHasher` nel modulo se non già presente (Task 6).

- [ ] **Step 5: Aggiungi il controller pubblico** — crea `apps/api/src/customer-auth/customer-auth.controller.ts`:

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../identity/public.decorator';
import { CustomerActivateInput, CustomerAuthResponse } from '@coralyn/contracts';
import { CustomerSessionService } from './customer-session.service';
import { CustomerActivateDto } from './dto/customer-activate.dto';

@Controller('customer')
export class CustomerAuthController {
  constructor(private readonly sessions: CustomerSessionService) {}

  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() body: CustomerActivateDto): Promise<CustomerAuthResponse> {
    return this.sessions.activate(body);
  }
}
```

Crea `apps/api/src/customer-auth/dto/customer-activate.dto.ts` (class-validator, come `login.dto.ts`):

```typescript
import { IsString, MinLength } from 'class-validator';

export class CustomerActivateDto {
  @IsString() @MinLength(1)
  enrollmentToken!: string;

  @IsString() @MinLength(1)
  pin!: string;
}
```

Registra `CustomerAuthController` in `customer-auth.module.ts` (`controllers: [CustomerAuthController]`) e importa `CustomerAuthModule` in `AppModule` (`imports`).

- [ ] **Step 6: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer activate'`
Expected: PASS (3 test).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customer-auth apps/api/src/app.module.ts apps/api/test/customer-access.e2e-spec.ts
git commit -m "feat(api): attivazione cliente one-time+PIN con lock (401 generico, D-029) [D-035 S3]"
```

---

### Task 8: `CustomerSessionService.refresh` (rotazione + theft-detection)

**Files:**
- Modify: `apps/api/src/customer-auth/customer-session.service.ts` (aggiungi `refresh`)
- Modify: `apps/api/src/customer-auth/customer-auth.controller.ts` (endpoint `refresh`)
- Create: `apps/api/src/customer-auth/dto/customer-refresh.dto.ts`
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (blocco `refresh`)

**Interfaces:**
- Produces: `CustomerSessionService.refresh(input: CustomerRefreshInput): Promise<CustomerAuthResponse>`.

- [ ] **Step 1: Write the failing test (e2e)** — aggiungi:

```typescript
describe('Customer refresh (D-035 S3)', () => {
  it('refresh valido → ruota (nuovo refresh) e nuovo accessToken', async () => {
    const first = /* activate → { accessToken, refreshToken } */;
    const r = await request(app.getHttpServer()).post('/api/customer/refresh').send({ refreshToken: first.refreshToken }).expect(200);
    expect(r.body.refreshToken).not.toBe(first.refreshToken); // ruotato
    expect(typeof r.body.accessToken).toBe('string');
  });

  it('riuso di un refresh già ruotato → 401 e REVOCA l\'intera catena della sessione', async () => {
    const first = /* activate */;
    const rotated = await request(app.getHttpServer()).post('/api/customer/refresh').send({ refreshToken: first.refreshToken }).expect(200);
    // riuso del vecchio (già ruotato) → furto
    await request(app.getHttpServer()).post('/api/customer/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    // ora anche il refresh nuovo è morto (catena revocata)
    await request(app.getHttpServer()).post('/api/customer/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer refresh'`
Expected: FAIL (rotta `/customer/refresh` inesistente → 404).

- [ ] **Step 3: Implementa `refresh`** in `customer-session.service.ts`:

```typescript
  /** Rotazione del refresh (D-026). Theft-detection: se il refresh presentato risulta GIÀ
   *  ruotato (revokedAt!=null ma presente), è un riuso sospetto → revoca l'intera catena della
   *  sessione (enrollmentTokenId) e 401. */
  async refresh(input: import('@coralyn/contracts').CustomerRefreshInput): Promise<CustomerAuthResponse> {
    const presentedHash = hashToken(input.refreshToken);
    const session = await this.prisma.customerSession.findUnique({ where: { refreshTokenHash: presentedHash } });
    if (!session) throw new UnauthorizedException(INVALID);

    // Riuso di un refresh già ruotato/revocato → furto: brucia tutta la catena della sessione.
    if (session.revokedAt) {
      await this.prisma.customerSession.updateMany({
        where: { enrollmentTokenId: session.enrollmentTokenId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(INVALID);
    }
    if (session.expiresAt <= new Date()) throw new UnauthorizedException(INVALID);

    const refreshRaw = generateRawToken();
    const auth = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.customerSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (claim.count !== 1) throw new UnauthorizedException(INVALID);
      await tx.customerSession.create({
        data: {
          customerId: session.customerId, establishmentId: session.establishmentId, enrollmentTokenId: session.enrollmentTokenId,
          refreshTokenHash: hashToken(refreshRaw), rotatedFromId: session.id,
          expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        },
      });
      const accessToken = this.tokens.sign({ sub: session.customerId, establishmentId: session.establishmentId, kind: 'customer' });
      return { accessToken, refreshToken: refreshRaw };
    });
    return auth;
  }
```

(Sposta l'import di `CustomerRefreshInput` in cima al file insieme agli altri, invece dell'inline `import(...)`.)

- [ ] **Step 4: Aggiungi l'endpoint + DTO.** `customer-refresh.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class CustomerRefreshDto {
  @IsString() @MinLength(1)
  refreshToken!: string;
}
```

In `customer-auth.controller.ts`:

```typescript
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: CustomerRefreshDto): Promise<CustomerAuthResponse> {
    return this.sessions.refresh(body);
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer refresh'`
Expected: PASS (2 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-auth apps/api/test/customer-access.e2e-spec.ts
git commit -m "feat(api): refresh rotante + theft-detection (D-026) [D-035 S3]"
```

---

### Task 9: `logout` + `GET /customer/me` (chiude il loop auth end-to-end)

**Files:**
- Modify: `apps/api/src/customer-auth/customer-session.service.ts` (aggiungi `logout`, `getMe`)
- Modify: `apps/api/src/customer-auth/customer-auth.controller.ts` (endpoint `logout` public + `me` con `CustomerJwtGuard`)
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (blocco `me`+`logout`)

**Interfaces:**
- Consumes: `CustomerJwtGuard`, `@CurrentCustomer` (Task 5).
- Produces: `CustomerSessionService.logout(refreshToken: string): Promise<void>`, `CustomerSessionService.getMe(customerId: string): Promise<CustomerMeDTO>`.

- [ ] **Step 1: Write the failing test (e2e)** — aggiungi:

```typescript
describe('Customer me + logout (D-035 S3)', () => {
  it('GET /customer/me con access JWT → profilo del cliente', async () => {
    const { accessToken } = /* activate */;
    const r = await request(app.getHttpServer()).get('/api/customer/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(r.body).toMatchObject({ customerId: expect.any(String), firstName: expect.any(String), establishmentName: expect.any(String) });
  });

  it('GET /customer/me senza token → 401', async () => {
    await request(app.getHttpServer()).get('/api/customer/me').expect(401);
  });

  it('logout revoca la sessione: il refresh non ruota più', async () => {
    const { refreshToken } = /* activate */;
    await request(app.getHttpServer()).post('/api/customer/logout').send({ refreshToken }).expect(204);
    await request(app.getHttpServer()).post('/api/customer/refresh').send({ refreshToken }).expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer me'`
Expected: FAIL (rotte `/customer/me`, `/customer/logout` inesistenti → 404).

- [ ] **Step 3: Implementa `logout` e `getMe`** in `customer-session.service.ts`:

```typescript
  /** Revoca la sessione corrente (idempotente). Public: identifica la sessione dal refresh. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.customerSession.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Profilo del cliente autenticato (session-check). Legge Customer + Establishment name.
   *  Tenant-scoped via forTenant (RLS): il customerId proviene dal claim, il tenant pure. */
  async getMe(customerId: string, tenantId: string): Promise<import('@coralyn/contracts').CustomerMeDTO> {
    const c = await this.prisma.forTenant(tenantId, async (tx) => {
      return tx.customer.findFirst({
        where: { id: customerId },
        select: { id: true, firstName: true, lastName: true, establishment: { select: { name: true } } },
      });
    });
    if (!c) throw new UnauthorizedException(INVALID);
    return { customerId: c.id, firstName: c.firstName, lastName: c.lastName, establishmentName: c.establishment.name };
  }
```

(Sposta gli import `CustomerMeDTO` in cima al file. Verifica il nome del campo `name` su `Establishment` in `schema.prisma`; se diverso, usalo.)

- [ ] **Step 4: Aggiungi gli endpoint** in `customer-auth.controller.ts`:

```typescript
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: CustomerRefreshDto): Promise<void> {
    return this.sessions.logout(body.refreshToken);
  }

  @Public()
  @UseGuards(CustomerJwtGuard)
  @Get('me')
  me(@CurrentCustomer() customer: CustomerPrincipal): Promise<CustomerMeDTO> {
    return this.sessions.getMe(customer.id, customer.establishmentId);
  }
```

(Import mancanti: `Get`, `UseGuards` da `@nestjs/common`; `CustomerJwtGuard`, `CurrentCustomer`, `CustomerPrincipal`, `CustomerMeDTO`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer me'`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-auth apps/api/test/customer-access.e2e-spec.ts
git commit -m "feat(api): GET /customer/me (CustomerJwtGuard) + logout [D-035 S3]"
```

---

### Task 10: Isolamento cross-tenant / cross-customer (test di sicurezza)

**Files:**
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (blocco sicurezza)

**Interfaces:**
- Consumes: tutto il canale (Task 6-9). Nessun nuovo codice se i test passano; se falliscono, il fix è nel guard/service.

- [ ] **Step 1: Write the failing test (e2e)** — aggiungi il blocco che prova l'isolamento:

```typescript
describe('Customer channel isolation (D-035 S3, sicurezza)', () => {
  it('un access JWT del tenant A non risolve dati del tenant B', async () => {
    // arrange: due tenant A,B ciascuno con customer+subscription; attiva il cliente di A.
    // GET /customer/me con il token di A → establishmentName = A (mai B).
    const r = await request(app.getHttpServer()).get('/api/customer/me').set('Authorization', `Bearer ${aAccess}`).expect(200);
    expect(r.body.establishmentName).toBe(nomeTenantA);
  });

  it('l\'enrollment del tenant A non è attivabile con dati/pin del tenant B', async () => {
    // provisiona A e B; l'attivazione col token di A e PIN di B → 401.
    await request(app.getHttpServer()).post('/api/customer/activate').send({ enrollmentToken: aToken, pin: bPin }).expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (o guida il fix)**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer channel isolation'`
Expected: PASS. Se `me` di A restituisse dati di B → bug nel guard (tenant dal claim) o in `getMe` (manca `forTenant`) → correggi lì e ri-esegui.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/customer-access.e2e-spec.ts
git commit -m "test(api): isolamento cross-tenant/cross-customer del canale cliente [D-035 S3]"
```

---

### Task 11: Rate-limiting endpoint pubblici cliente (`@nestjs/throttler`, D-027)

**Files:**
- Modify: `apps/api/package.json` (dep `@nestjs/throttler`)
- Modify: `apps/api/src/app.module.ts` (`ThrottlerModule.forRootAsync` — storage + default; **NESSUN** `APP_GUARD` globale)
- Modify: `apps/api/src/customer-auth/customer-auth.controller.ts` (`@UseGuards(ThrottlerGuard)` a livello classe → throttle SOLO `/customer/*`)
- Modify: `apps/api/test/customer-access.e2e-spec.ts` (nel `beforeAll`, prima di costruire l'app, alza il limite per non far scattare 429 nei test funzionali)
- Create: `apps/api/test/customer-throttle.e2e-spec.ts` (file dedicato, limite basso, prova il 429)

**Interfaces:**
- Produces: rate-limit per-IP su `POST /customer/*` (429 oltre soglia). Limite = env `CUSTOMER_THROTTLE_LIMIT` (default `10`), finestra 60s.

**Perché controller-scoped + env-configurabile (non un `APP_GUARD` globale):** un guard globale con keying per-IP farebbe scattare 429 spuri nell'intera suite e2e (tutte le richieste supertest vengono da 127.0.0.1) → regressione della baseline. Lo scope è solo il canale pubblico cliente (spec §5.5). Il limite è env-driven così la suite funzionale lo alza e resta strict in prod.

- [ ] **Step 1: Installa la dipendenza**

Run: `cd apps/api && corepack pnpm add @nestjs/throttler`
Expected: aggiunta a `dependencies`. (Se pnpm chiede purge: `CI=true corepack pnpm install`.)

- [ ] **Step 2: Write the failing test (e2e)** — crea `apps/api/test/customer-throttle.e2e-spec.ts`. Nel `beforeAll`, **prima** di `Test.createTestingModule`, imposta un limite basso così il test è deterministico:

```typescript
// beforeAll: process.env.CUSTOMER_THROTTLE_LIMIT = '5'; POI costruisci app con createTestApp.
describe('Customer channel rate-limit (D-027)', () => {
  it('oltre soglia ravvicinata su /customer/activate → 429', async () => {
    let got429 = false;
    for (let i = 0; i < 8; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/customer/activate')
        .send({ enrollmentToken: 'nope', pin: '000000' });
      if (res.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true); // le prime ~5 → 401, poi 429
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer channel rate-limit'`
Expected: FAIL (nessun 429, tutte 401 — throttler non ancora attivo).

- [ ] **Step 4: Configura il throttler.** In `app.module.ts` (storage + default env-driven; **niente** APP_GUARD):

```typescript
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
// ...nelle imports, dopo ConfigModule.forRoot:
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: Number(config.get<string>('CUSTOMER_THROTTLE_LIMIT') || '10') },
      ],
    }),
    CustomerAuthModule,
```

In `customer-auth.controller.ts` applica il guard **solo** a questo controller (a livello classe):

```typescript
import { ThrottlerGuard } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';

@UseGuards(ThrottlerGuard)
@Controller('customer')
export class CustomerAuthController { /* ... */ }
```

- [ ] **Step 5: Evita 429 spuri nella suite funzionale.** In `apps/api/test/customer-access.e2e-spec.ts`, nel `beforeAll` **prima** di costruire l'app, aggiungi:

```typescript
process.env.CUSTOMER_THROTTLE_LIMIT = '1000'; // suite funzionale: limite alto, niente 429 spuri
```

- [ ] **Step 6: Run test to verify it passes**

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand -t 'Customer channel rate-limit'`
Expected: PASS. Poi il **full-run e2e** per confermare zero regressioni (il throttler tocca solo `/customer/*`):

Run: `corepack pnpm --filter @coralyn/api test:e2e --runInBand`
Expected: **330 + i nuovi** passed (nessuna regressione).

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/app.module.ts apps/api/src/customer-auth apps/api/test/customer-access.e2e-spec.ts apps/api/test/customer-throttle.e2e-spec.ts
git commit -m "feat(api): rate-limiting @nestjs/throttler controller-scoped su /customer/* (D-027) [D-035 S3]"
```

---

### Task 12: Documentazione (DoD ADR-0009) + full verde

**Files:**
- Create: `docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md`
- Modify: `docs/design/data-model.md` (ER: `CustomerEnrollmentToken`, `CustomerSession`)
- Modify: `docs/design/flows.md` (macchina a stati accesso, spec §7)
- Modify: `docs/architecture/deferred.md` (D-026/D-027/D-029 → «Risolte»; D-028 nota; D-035 avanzamento; D-037 nota)

**Interfaces:** nessuna (documentazione).

- [ ] **Step 1: Scrivi ADR-0049** con la struttura standard degli ADR del repo (Status/Data/Decisori/ADR correlati; Context; Decision; Consequences; Alternatives considered; Rubric check). Contenuti (dalla spec §3, §5, §11): token opaco provisioned dal lido vs account/OTP (perché più sicuro), i tre strati, PIN come 2° fattore, tenant derivato dal token (fuori-RLS), risoluzione in-scope di D-026/027/029 e perché D-028 resta tracciato. Correlati: [ADR-0024], [ADR-0026], [ADR-0028], [ADR-0042], [ADR-0041], [ADR-0048].

- [ ] **Step 2: Aggiorna `data-model.md`** — aggiungi le due entità al diagramma ER Mermaid con le relazioni verso `Customer`/`Establishment`, marcandole "fuori-RLS (identità pre-tenant)".

- [ ] **Step 3: Aggiorna `flows.md`** — aggiungi la macchina a stati dell'accesso cliente (dalla spec §7): `(nessuno) → ENROLLMENT_EMESSO → ATTIVO → REVOCATO`, con lock PIN, expire, rotazione refresh, theft-detection.

- [ ] **Step 4: Aggiorna `deferred.md`** — sposta **D-026**, **D-027**, **D-029** in `## Risolte` con riferimento a questo slice/ADR-0049; su **D-028** aggiungi nota "valutato in D-035 S3, non-trigger, tracciato"; su **D-035** aggiorna lo stato (S3 fatta, S4 resta); su **D-037** nota "chiuso su web-customer in S4, applicabile web-staff".

- [ ] **Step 5: Verifica finale REALE — le baseline non regrediscono**

Run (in serie, mai web-staff+e2e in parallelo):
```
corepack pnpm --filter @coralyn/api test --runInBand
corepack pnpm --filter @coralyn/api test:e2e --runInBand
corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit
```
Expected: api unit ≥ **232 + i nuovi unit** (CustomerTokenService 2, CustomerJwtGuard 3, generatePin 1); api e2e ≥ **330 + i nuovi e2e**; typecheck exit 0. Annota i numeri reali per l'handoff.

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/decisions/0049-auth-cliente-provisioned-tenant-pubblico.md docs/design/data-model.md docs/design/flows.md docs/architecture/deferred.md
git commit -m "docs: ADR-0049 auth cliente + tenant pubblico; data-model/flows; chiudi D-026/027/029 [D-035 S3]"
```

---

## Self-Review

**1. Spec coverage** (spec §§ → task):
- §2/§4.1 provisioning-by-lido, fuori-RLS → T1 (tabelle), T6 (provisionAccess).
- §4.2 tre strati (enrollment/refresh/access JWT) → T1 (tabelle), T3 (JWT), T7 (activate emette i tre), T8 (refresh).
- §4.3 access JWT `kind:'customer'` claim ridotti → T3, T5.
- §5.1 activate one-time + PIN + lock + tempo-costante → T7. §5.2 refresh rotante + theft-detection (D-026) → T8. §5.3 revoca operatore (D-026) → T6. §5.4 ownership (RLS tenant + cliente nel principal) → T5 (principal), T10 (isolamento). §5.5 rate-limit (D-027) → T11. §5.6 scope JWT / guard separato → T5.
- §6.1 endpoint operatore → T6. §6.2 activate/refresh/logout → T7/T8/T9. §6.3 (release cliente) = **S4, fuori da questo piano** (corretto). `GET /customer/me` (session-check S3) → T9.
- §7 macchina a stati → T12. §8 FE `web-customer` = **S4**. §9 contracts → T2. §10 testing → T6-T11. §11 docs/ADR-0049 + deferred → T12.
- **Gap voluti (S4, non qui):** `GET /me/subscriptions`, endpoint release `source='customer'`, parametrizzazione `ReleaseAbsenceInput.source` + ownership su `releaseAbsence`/`cancelAbsenceRelease`, app `web-customer`. Confermato: S3 NON tocca `bookings.service.ts` (release), solo `bookings.controller.ts` (provisioning).

**2. Placeholder scan:** i blocchi test e2e usano commenti `/* activate */` come segnaposto degli helper di seed **già esistenti** nelle altre suite (non codice mancante di produzione): l'implementatore riusa `createTenantWithAdmin`/seed booking come le suite vicine. Nessun TODO/TBD nel codice di produzione; ogni step di produzione ha codice reale completo.

**3. Type consistency:** `CustomerTokenClaims`/`CustomerPrincipal`/`CustomerAuthResponse`/`CustomerActivateInput`/`CustomerRefreshInput`/`CustomerMeDTO`/`CustomerProvisionResponse`/`CustomerAccessStatusDTO` usati coerentemente tra T2→T9. Metodi: `provisionAccess(bookingId, createdByUserId)`, `revokeAccess(bookingId)`, `accessStatus(customerId)`, `activate(input)`, `refresh(input)`, `logout(refreshToken)`, `getMe(customerId, tenantId)` — firme stabili tra definizione e uso. `hashToken`/`generateRawToken` riusati (non ridefiniti). PIN via `PasswordHasher` (non un nuovo hasher).

**Nota implementativa (verificare a inizio T9):** il nome del campo del nome stabilimento su `Establishment` in `schema.prisma` (assunto `name`) va confermato; se diverso, adeguare `getMe` e il test.
