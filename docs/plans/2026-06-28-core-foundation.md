# Core — Foundation & Multi-tenant Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere in piedi il monorepo `@driftly/*` con un backend NestJS funzionante, PostgreSQL via Prisma, e dimostrare con test l'isolamento multi-tenant tramite Row-Level Security (il rischio #1 dello spec).

**Architecture:** Monorepo pnpm (`apps/`, `packages/`). Backend NestJS API-first; PostgreSQL con RLS come rete di sicurezza dell'isolamento tenant ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)); tipi condivisi in `@driftly/contracts` ([ADR-0008](../architecture/decisions/0008-stack-e-layout.md)). Il tenant, in questo piano, è risolto provvisoriamente da un header `X-Stabilimento-Id` (sarà sostituito dall'auth nel Piano 2).

**Tech Stack:** pnpm 10, Node 24, TypeScript (strict), NestJS, Jest (default NestJS) + Supertest, Prisma, PostgreSQL 16 (Docker), ESLint + Prettier.

**Riferimenti:** [spec Core](../specs/2026-06-27-core-operativo-design.md) · [data-model](../design/data-model.md) · [ADR-0007](../architecture/decisions/0007-stile-architetturale.md) · [ADR-0008](../architecture/decisions/0008-stack-e-layout.md) · [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)

**Scelte tattiche di questo piano (rubrica):**
- **Test runner API = Jest** (default NestJS): minore attrito/più convenzionale del forzare Vitest lato server; il frontend (Piano 7) userà Vitest, default Vue.
- **`contracts` buildato a `dist` con `tsc`** e consumato come pacchetto workspace: robusto, niente path-alias fragili a runtime.
- **Ruolo DB applicativo non-superuser** (`driftly_app`): i superuser PostgreSQL bypassano la RLS, quindi l'app DEVE connettersi con un ruolo `NOSUPERUSER NOBYPASSRLS`, altrimenti l'isolamento non viene applicato.
- **Tenant via header provvisorio** ora; sostituito da JWT nel Piano 2, dietro `TenantContext` (i moduli di dominio non cambiano).

---

## File Structure

```
driftly/
  pnpm-workspace.yaml
  package.json                 # root, private, script comuni
  tsconfig.base.json           # config TS condivisa (strict)
  .editorconfig
  .prettierrc.json
  eslint.config.mjs
  docker-compose.yml           # PostgreSQL per dev/test
  init/01-app-role.sql         # crea ruolo non-superuser + DB di test (RLS)
  .env / .env.test             # DATABASE_URL (gitignored)
  packages/
    contracts/
      package.json
      tsconfig.json
      src/index.ts             # tipi/enum condivisi (Ruolo, ClienteDTO)
  apps/
    api/
      package.json
      tsconfig.json
      tsconfig.build.json
      nest-cli.json
      jest.config.ts
      prisma/
        schema.prisma
        migrations/            # generate da Prisma
      src/
        main.ts
        app.module.ts
        health/health.controller.ts
        health/health.controller.spec.ts
        prisma/prisma.service.ts
        prisma/prisma.service.spec.ts   # test isolamento RLS
        prisma/prisma.module.ts
        tenant/tenant-context.ts
        tenant/tenant.module.ts
        tenant/tenant.middleware.ts
        clienti/clienti.service.ts
        clienti/clienti.controller.ts
        clienti/clienti.module.ts
      test/
        jest-e2e.json
        clienti.e2e-spec.ts
```

> Nota: la radice del repo è già `C:/Users/Jays/Desktop/new` (git inizializzato). I path sotto sono relativi a quella radice.

---

## Task 1: Scaffold del monorepo

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.editorconfig`, `.prettierrc.json`, `eslint.config.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Crea `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Crea `package.json` (root)**

```json
{
  "name": "@driftly/root",
  "private": true,
  "packageManager": "pnpm@10.33.3",
  "engines": { "node": ">=22" },
  "scripts": {
    "build:contracts": "pnpm --filter @driftly/contracts build",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "eslint": "^9.13.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.11.0"
  }
}
```

- [ ] **Step 3: Crea `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Crea `.editorconfig`, `.prettierrc.json`, `eslint.config.mjs`**

`.editorconfig`:
```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
insert_final_newline = true
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

`eslint.config.mjs`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/migrations/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
```

- [ ] **Step 5: Aggiorna `.gitignore`** (aggiungi in fondo)

```gitignore
# Node / monorepo
node_modules/
**/dist/
*.tsbuildinfo
.env
.env.*
!.env.example
```

- [ ] **Step 6: Installa e committa**

Run:
```bash
pnpm install
git add -A && git commit -m "chore: scaffold pnpm monorepo, TS base config, lint/format"
```
Expected: `pnpm install` completa senza errori (crea `pnpm-lock.yaml`).

---

## Task 2: Pacchetto `@driftly/contracts`

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`

- [ ] **Step 1: Crea `packages/contracts/package.json`**

```json
{
  "name": "@driftly/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "devDependencies": { "typescript": "^5.6.3" }
}
```

- [ ] **Step 2: Crea `packages/contracts/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crea `packages/contracts/src/index.ts`**

```ts
/** Ruoli applicativi. Vedi ADR-0015 (superuser di piattaforma). */
export enum Ruolo {
  Admin = 'admin',
  Staff = 'staff',
  Superuser = 'superuser',
}

/** DTO minimale di un Cliente (il bagnante). Condiviso FE/BE. */
export interface ClienteDTO {
  id: string;
  nome: string;
  cognome: string;
}
```

- [ ] **Step 4: Builda e committa**

Run:
```bash
pnpm --filter @driftly/contracts build
git add -A && git commit -m "feat(contracts): shared types package skeleton (Ruolo, ClienteDTO)"
```
Expected: crea `packages/contracts/dist/index.js` e `index.d.ts`, nessun errore TS.

---

## Task 3: Skeleton NestJS + endpoint health (TDD)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/jest.config.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.controller.spec.ts`

- [ ] **Step 1: Crea `apps/api/package.json`**

```json
{
  "name": "@driftly/api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@driftly/contracts": "workspace:*",
    "@nestjs/common": "^10.4.4",
    "@nestjs/config": "^3.2.3",
    "@nestjs/core": "^10.4.4",
    "@nestjs/platform-express": "^10.4.4",
    "@prisma/client": "^5.20.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/schematics": "^10.1.4",
    "@nestjs/testing": "^10.4.4",
    "@types/express": "^5.0.0",
    "@types/jest": "^29.5.13",
    "@types/node": "^22.7.4",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.20.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Crea i config TS/Nest/Jest**

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "baseUrl": "./"
  }
}
```

`apps/api/tsconfig.build.json`:
```json
{ "extends": "./tsconfig.json", "exclude": ["node_modules", "dist", "test", "**/*.spec.ts"] }
```

`apps/api/nest-cli.json`:
```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

`apps/api/jest.config.ts`:
```ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
};
export default config;
```

- [ ] **Step 3: Scrivi il test che fallisce — `apps/api/src/health/health.controller.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('ritorna stato ok', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const controller = moduleRef.get(HealthController);
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 4: Esegui il test e verifica che fallisce**

Run: `pnpm --filter @driftly/api test`
Expected: FAIL — `Cannot find module './health.controller'`.

- [ ] **Step 5: Implementazione minima**

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
```

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
```

`apps/api/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

- [ ] **Step 6: Esegui il test e verifica che passa**

Run: `pnpm --filter @driftly/api test`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(api): NestJS skeleton with health endpoint (TDD)"
```

---

## Task 4: PostgreSQL via Docker + ruolo non-superuser (per RLS)

**Files:**
- Create: `docker-compose.yml`, `init/01-app-role.sql`, `.env`, `.env.test`, `.env.example`

- [ ] **Step 1: Crea `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    container_name: driftly-db
    environment:
      POSTGRES_USER: driftly
      POSTGRES_PASSWORD: driftly
      POSTGRES_DB: driftly_dev
    ports:
      - "5432:5432"
    volumes:
      - driftly-pgdata:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
volumes:
  driftly-pgdata:
```

- [ ] **Step 2: Crea `init/01-app-role.sql`** (eseguito SOLO alla prima init del volume)

> I superuser PostgreSQL **bypassano** la RLS. L'app deve connettersi con un ruolo `NOSUPERUSER NOBYPASSRLS` (con `CREATEDB` per lo shadow DB di Prisma) e proprietario dello schema `public`, così le policy RLS vengono applicate anche a lui.

```sql
CREATE ROLE driftly_app WITH LOGIN PASSWORD 'driftly_app' NOSUPERUSER NOBYPASSRLS CREATEDB;

GRANT ALL ON DATABASE driftly_dev TO driftly_app;
ALTER SCHEMA public OWNER TO driftly_app;

CREATE DATABASE driftly_test OWNER driftly_app;
\connect driftly_test
ALTER SCHEMA public OWNER TO driftly_app;
```

- [ ] **Step 3: Crea `.env`, `.env.test`, `.env.example`** (l'app usa `driftly_app`)

`.env`:
```
DATABASE_URL="postgresql://driftly_app:driftly_app@localhost:5432/driftly_dev?schema=public"
```
`.env.test`:
```
DATABASE_URL="postgresql://driftly_app:driftly_app@localhost:5432/driftly_test?schema=public"
```
`.env.example`:
```
DATABASE_URL="postgresql://driftly_app:driftly_app@localhost:5432/driftly_dev?schema=public"
```

- [ ] **Step 4: Avvia il database e verifica il ruolo**

Run:
```bash
docker compose up -d
docker exec driftly-db psql -U driftly -d driftly_dev -c "\du driftly_app"
```
Expected: container `driftly-db` attivo; il ruolo `driftly_app` esiste con attributo *Create DB*. (Se il volume esisteva già da prove precedenti, lo script init non rigira: `docker compose down -v` e ripeti.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml init/ .env.example && git commit -m "chore: postgres via docker compose + non-superuser app role for RLS"
```
> `.env` e `.env.test` sono gitignored.

---

## Task 5: Prisma — schema, migrazione, PrismaService

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Crea `apps/api/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Stabilimento {
  id      String    @id @default(uuid()) @db.Uuid
  nome    String
  clienti Cliente[]
}

model Cliente {
  id             String       @id @default(uuid()) @db.Uuid
  stabilimentoId String       @db.Uuid
  nome           String
  cognome        String
  stabilimento   Stabilimento @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```

- [ ] **Step 2: Genera la prima migrazione**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma migrate dev --name init
```
Expected: crea `apps/api/prisma/migrations/<ts>_init/migration.sql`, applica al DB dev (`driftly_app`), genera il client.

- [ ] **Step 3: Crea `apps/api/src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: Crea `apps/api/src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Registra `PrismaModule` in `app.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Applica le migrazioni al DB di test e committa**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api exec prisma migrate deploy
git add -A && git commit -m "feat(api): prisma schema (Stabilimento, Cliente) + PrismaService"
```
Expected: migrazione applicata anche su `driftly_test`.

---

## Task 6: Row-Level Security + `forTenant` + test di isolamento (lo spike)

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_rls/migration.sql` (editato a mano), `apps/api/src/prisma/prisma.service.spec.ts`
- Modify: `apps/api/src/prisma/prisma.service.ts`

- [ ] **Step 1: Crea la migrazione RLS (solo SQL, senza applicare)**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma migrate dev --create-only --name rls
```
Expected: crea una cartella `..._rls/` con un `migration.sql` (vuoto, perché lo schema non è cambiato).

- [ ] **Step 2: Scrivi l'SQL RLS** in `apps/api/prisma/migrations/<ts>_rls/migration.sql`

```sql
-- Abilita RLS sulla prima tabella tenant-scoped e forza anche per l'owner.
ALTER TABLE "Cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cliente" FORCE ROW LEVEL SECURITY;

-- Una riga è visibile/scrivibile solo se appartiene al tenant corrente.
-- Tenant corrente = GUC di sessione app.current_tenant (NULL => nessuna riga).
CREATE POLICY tenant_isolation ON "Cliente"
  USING ("stabilimentoId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("stabilimentoId" = current_setting('app.current_tenant', true)::uuid);
```

- [ ] **Step 3: Applica la migrazione (dev e test)**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma migrate dev
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api exec prisma migrate deploy
```
Expected: la policy `tenant_isolation` creata su entrambi i DB.

- [ ] **Step 4: Aggiungi `forTenant` a `PrismaService`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Esegue `fn` dentro una transazione con la GUC app.current_tenant impostata,
   * così le policy RLS filtrano per quel tenant. Vedi ADR-0010.
   */
  async forTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
```

- [ ] **Step 5: Scrivi il test di isolamento — `apps/api/src/prisma/prisma.service.spec.ts`**

```ts
import { PrismaService } from './prisma.service';

describe('PrismaService RLS isolation', () => {
  const prisma = new PrismaService();
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Gli Stabilimento NON sono tenant-scoped: creazione libera (registro tenant).
    s1 = (await prisma.stabilimento.create({ data: { nome: 'Lido A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'Lido B' } })).id;
    await prisma.forTenant(s1, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: s1, nome: 'Mario', cognome: 'Rossi' } }),
    );
    await prisma.forTenant(s2, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: s2, nome: 'Anna', cognome: 'Verdi' } }),
    );
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.cliente.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.cliente.deleteMany({}));
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await prisma.$disconnect();
  });

  it('un tenant vede solo i propri clienti', async () => {
    const clientiS1 = await prisma.forTenant(s1, (tx) => tx.cliente.findMany());
    expect(clientiS1).toHaveLength(1);
    expect(clientiS1[0].nome).toBe('Mario');
  });

  it('senza tenant impostato non vede nulla', async () => {
    const clienti = await prisma.cliente.findMany();
    expect(clienti).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Esegui il test contro il DB di test**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test -- prisma.service
```
Expected: PASS (2 test). Dimostra che RLS isola i tenant e che senza tenant non si vede nulla. (Se entrambi i clienti compaiono, l'app si sta connettendo come superuser: verifica che `.env.test` usi `driftly_app`.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(api): RLS tenant isolation + PrismaService.forTenant (spike)"
```

---

## Task 7: Tenant context (provvisorio via header) + `GET/POST /clienti` isolato (e2e)

**Files:**
- Create: `apps/api/src/tenant/tenant-context.ts`, `apps/api/src/tenant/tenant.module.ts`, `apps/api/src/tenant/tenant.middleware.ts`, `apps/api/src/clienti/clienti.service.ts`, `apps/api/src/clienti/clienti.controller.ts`, `apps/api/src/clienti/clienti.module.ts`, `apps/api/test/jest-e2e.json`, `apps/api/test/clienti.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

> Il tenant arriva dall'header `X-Stabilimento-Id`. È **provvisorio**: nel Piano 2 sarà ricavato dal JWT impostando lo stesso `req.tenantId`. `TenantContext` legge da `REQUEST`, così middleware e service condividono sempre lo stesso valore (niente problemi di scope).

- [ ] **Step 1: Crea `apps/api/src/tenant/tenant-context.ts`**

```ts
import { Injectable, Scope, Inject, BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

type TenantRequest = Request & { tenantId?: string };

@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly req: TenantRequest) {}

  /** Lancia se il tenant non è stato risolto per questa richiesta. */
  require(): string {
    if (!this.req.tenantId) {
      throw new BadRequestException('Tenant non risolto');
    }
    return this.req.tenantId;
  }
}
```

- [ ] **Step 2: Crea `apps/api/src/tenant/tenant.module.ts`** (`@Global`, provider unico)

```ts
import { Global, Module } from '@nestjs/common';
import { TenantContext } from './tenant-context';

@Global()
@Module({
  providers: [TenantContext],
  exports: [TenantContext],
})
export class TenantModule {}
```

- [ ] **Step 3: Crea `apps/api/src/tenant/tenant.middleware.ts`**

```ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { tenantId?: string }, _res: Response, next: NextFunction): void {
    const header = req.header('X-Stabilimento-Id');
    if (header && UUID_RE.test(header)) {
      req.tenantId = header;
    }
    next();
  }
}
```

- [ ] **Step 4: Crea il modulo `clienti`**

`apps/api/src/clienti/clienti.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { ClienteDTO } from '@driftly/contracts';

@Injectable()
export class ClientiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(): Promise<ClienteDTO[]> {
    const tenantId = this.tenant.require();
    const rows = await this.prisma.forTenant(tenantId, (tx) => tx.cliente.findMany());
    return rows.map((c) => ({ id: c.id, nome: c.nome, cognome: c.cognome }));
  }

  async create(input: { nome: string; cognome: string }): Promise<ClienteDTO> {
    const tenantId = this.tenant.require();
    const c = await this.prisma.forTenant(tenantId, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: tenantId, ...input } }),
    );
    return { id: c.id, nome: c.nome, cognome: c.cognome };
  }
}
```

`apps/api/src/clienti/clienti.controller.ts`:
```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClienteDTO } from '@driftly/contracts';

@Controller('clienti')
export class ClientiController {
  constructor(private readonly clienti: ClientiService) {}

  @Get()
  list(): Promise<ClienteDTO[]> {
    return this.clienti.list();
  }

  @Post()
  create(@Body() body: { nome: string; cognome: string }): Promise<ClienteDTO> {
    return this.clienti.create(body);
  }
}
```

`apps/api/src/clienti/clienti.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ClientiService } from './clienti.service';
import { ClientiController } from './clienti.controller';

@Module({
  controllers: [ClientiController],
  providers: [ClientiService],
})
export class ClientiModule {}
```

- [ ] **Step 5: Registra middleware + moduli in `app.module.ts`**

```ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenant/tenant.module';
import { ClientiModule } from './clienti/clienti.module';
import { TenantMiddleware } from './tenant/tenant.middleware';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TenantModule, ClientiModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 6: Crea config e test e2e**

`apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" }
}
```

`apps/api/test/clienti.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clienti (e2e) isolamento per tenant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.stabilimento.create({ data: { nome: 'E2E A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'E2E B' } })).id;
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.cliente.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.cliente.deleteMany({}));
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await app.close();
  });

  it('crea un cliente per s1 e non lo mostra a s2', async () => {
    await request(app.getHttpServer())
      .post('/clienti')
      .set('X-Stabilimento-Id', s1)
      .send({ nome: 'Mario', cognome: 'Rossi' })
      .expect(201);

    const resS1 = await request(app.getHttpServer())
      .get('/clienti')
      .set('X-Stabilimento-Id', s1)
      .expect(200);
    expect(resS1.body).toHaveLength(1);

    const resS2 = await request(app.getHttpServer())
      .get('/clienti')
      .set('X-Stabilimento-Id', s2)
      .expect(200);
    expect(resS2.body).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Esegui i test e2e contro il DB di test**

Run (dalla radice):
```bash
pnpm dlx dotenv-cli -e .env.test -- pnpm --filter @driftly/api test:e2e
```
Expected: PASS — il cliente di `s1` è visibile a `s1` (1) e invisibile a `s2` (0). Isolamento end-to-end via API.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(api): tenant context (header) + clienti module with tenant-isolated reads (e2e)"
```

---

## Definition of Done (Piano 1)

- `pnpm install` e build di `contracts` ok; `pnpm lint` pulito.
- `docker compose up -d` avvia Postgres; init crea `driftly_app` (non-superuser) e `driftly_test`; migrazioni applicate su `driftly_dev` e `driftly_test`.
- `GET /health` → `{ status: 'ok' }`.
- Test RLS verdi: un tenant vede solo i propri clienti; senza tenant non si vede nulla.
- Test e2e verde: isolamento per tenant attraverso l'API.
- Tutto committato; working tree pulito.

## Note per i piani successivi
- L'header `X-Stabilimento-Id` è **provvisorio**: il Piano 2 (Identità & auth) ricava il tenant dal JWT e imposta `req.tenantId` (nessuna modifica ai moduli di dominio né a `TenantContext`).
- Ogni nuova tabella tenant-scoped dovrà: avere `stabilimentoId`, abilitare RLS con la stessa policy, ed essere usata via `forTenant`. Da estrarre come pattern/migrazione riutilizzabile nel Piano 3.
- `Stabilimento` non è tenant-scoped (registro dei tenant); il suo controllo d'accesso sarà definito con auth/superuser (Piano 2 / ADR-0015).
