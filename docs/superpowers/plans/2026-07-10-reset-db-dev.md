# Reset totale DB dev (§4.b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando dev `db:reset` che azzera tutti i dati business/struttura/catalogo di tutti i tenant preservando solo `User`+`Establishment` (+ token/audit non-tenant), abilitatore di §4.1.

**Architecture:** Cuore riusabile in `prisma/reset-dev.core.ts` (funzioni pure + `resetTenantData(exec)` che introspetta l'RLS, valida con un coherence guard, e fa un `TRUNCATE … CASCADE` sulle 18 tabelle tenant). CLI sottile `prisma/reset-dev.ts` (guardie env, `--yes`/dry-run, output). Test: describe puri + integrazione in transazione-rollback (TRUNCATE è transazionale) nella suite e2e.

**Tech Stack:** TypeScript, Prisma 5 (`$queryRaw`/`$executeRawUnsafe`), ts-node (come `seed.ts`), Jest (ts-jest, config e2e `--runInBand`), Postgres (RLS FORCE, `pg_class`/`information_schema`/`pg_stat_user_tables`).

## Global Constraints

- **Preservare SEMPRE** (keep-list): `User`, `Establishment`, `CredentialSetupToken`, `PlatformAuditLog`, `_prisma_migrations`. Azzerare esattamente le 18 tabelle tenant (RLS FORCE).
- **`corepack pnpm`** — mai `npm` ([[coralyn-pnpm-not-npm]]).
- **e2e sempre `--runInBand`**; mirati con `--config ./test/jest-e2e.json`. Full-run flaky al default 5s → per il full-run usare `--testTimeout=30000`.
- **`@coralyn/contracts` build prima di typecheck/test** (dist gitignored) — qui non serve toccare i contracts.
- Ruolo DB app = `coralyn_app` (owner): può `TRUNCATE`; RLS FORCE non filtra `TRUNCATE`.
- Guardie: `NODE_ENV !== 'production'` e `current_database()` deve matchare `/dev|test/`.
- Baseline da non regredire: api unit 227 · api e2e 300 · web-staff 375 · typecheck pulito. Questo lavoro **aggiunge** test alla suite e2e (nuovo conteggio ≥ 300 + N).

---

### Task 1: Funzioni pure — guardie e selettori

**Files:**
- Create: `apps/api/prisma/reset-dev.core.ts`
- Test: `apps/api/test/reset-dev.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `KEEP_LIST: readonly string[]` = `['User','Establishment','CredentialSetupToken','PlatformAuditLog','_prisma_migrations']`
  - `assertResettableEnv(nodeEnv: string | undefined, dbName: string): void`
  - `selectTablesToWipe(forced: string[], keep: readonly string[]): string[]`
  - `assertCoherence(forced: string[], withEstablishmentId: string[], keep: readonly string[]): void`

- [ ] **Step 1: Write the failing tests** (pure, nessun DB)

Create `apps/api/test/reset-dev.e2e-spec.ts`:

```ts
import {
  KEEP_LIST,
  assertResettableEnv,
  selectTablesToWipe,
  assertCoherence,
} from '../prisma/reset-dev.core';

describe('reset-dev core — funzioni pure', () => {
  it('selectTablesToWipe rimuove la keep-list dalle forced', () => {
    expect(selectTablesToWipe(['Booking', 'User', 'Customer'], KEEP_LIST)).toEqual(['Booking', 'Customer']);
  });

  it('assertResettableEnv rifiuta NODE_ENV=production', () => {
    expect(() => assertResettableEnv('production', 'coralyn_dev')).toThrow(/production/);
  });

  it('assertResettableEnv rifiuta un DB che non è dev/test', () => {
    expect(() => assertResettableEnv('development', 'coralyn_prod')).toThrow(/non sembra dev\/test/);
  });

  it('assertResettableEnv accetta dev', () => {
    expect(() => assertResettableEnv('development', 'coralyn_dev')).not.toThrow();
  });

  it('assertCoherence passa col carve-out di User (establishmentId ma non-RLS)', () => {
    expect(() =>
      assertCoherence(['Booking', 'Customer'], ['Booking', 'Customer', 'User'], KEEP_LIST),
    ).not.toThrow();
  });

  it('assertCoherence aborta se una tenant table (establishmentId) manca RLS FORCE', () => {
    expect(() => assertCoherence(['Booking'], ['Booking', 'Customer'], KEEP_LIST)).toThrow(
      /senza RLS FORCE.*Customer/,
    );
  });

  it('assertCoherence aborta se una forced non ha establishmentId', () => {
    expect(() => assertCoherence(['Booking', 'Weird'], ['Booking'], KEEP_LIST)).toThrow(
      /senza establishmentId.*Weird/,
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand -t 'funzioni pure'`
Expected: FAIL — `Cannot find module '../prisma/reset-dev.core'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/prisma/reset-dev.core.ts`:

```ts
import type { PrismaClient, Prisma } from '@prisma/client';

/** Executor: il PrismaClient o un TransactionClient (per il test in rollback). */
export type Executor = PrismaClient | Prisma.TransactionClient;

/** Tabelle non-tenant preservate SEMPRE (identità/audit/migrazioni). */
export const KEEP_LIST: readonly string[] = [
  'User',
  'Establishment',
  'CredentialSetupToken',
  'PlatformAuditLog',
  '_prisma_migrations',
];

/** Guardia ambiente: rifiuta produzione e DB che non siano dev/test. */
export function assertResettableEnv(nodeEnv: string | undefined, dbName: string): void {
  if (nodeEnv === 'production') {
    throw new Error('reset-dev: rifiutato in NODE_ENV=production');
  }
  if (!/dev|test/.test(dbName)) {
    throw new Error(`reset-dev: database "${dbName}" non sembra dev/test — rifiutato`);
  }
}

/** Set da azzerare = forced meno la keep-list (belt-and-suspenders: le keep non sono forced comunque). */
export function selectTablesToWipe(forced: string[], keep: readonly string[]): string[] {
  const keepSet = new Set(keep);
  return forced.filter((t) => !keepSet.has(t));
}

/**
 * Coherence guard: incrocia due criteri indipendenti e aborta rumorosamente sulla divergenza.
 * `forced` (RLS FORCE) deve coincidere con `withEstablishmentId \ keep` (User è l'unica tenant-column
 * non-RLS by design, ADR-0026 → carve-out via keep-list).
 */
export function assertCoherence(
  forced: string[],
  withEstablishmentId: string[],
  keep: readonly string[],
): void {
  const keepSet = new Set(keep);
  const expected = new Set(withEstablishmentId.filter((t) => !keepSet.has(t)));
  const forcedSet = new Set(forced);
  const missingRls = [...expected].filter((t) => !forcedSet.has(t)); // tenant senza RLS FORCE
  const extraRls = [...forcedSet].filter((t) => !expected.has(t)); // RLS FORCE senza establishmentId
  if (missingRls.length || extraRls.length) {
    throw new Error(
      `reset-dev: coherence check fallito — tenant senza RLS FORCE: [${missingRls.join(', ')}]; ` +
        `RLS FORCE senza establishmentId: [${extraRls.join(', ')}]`,
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand -t 'funzioni pure'`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/reset-dev.core.ts apps/api/test/reset-dev.e2e-spec.ts
git commit -m "feat(reset-dev): funzioni pure guardie+selettori con coherence guard (§4.b)"
```

---

### Task 2: Introspezione + `resetTenantData` (integrazione tx-rollback)

**Files:**
- Modify: `apps/api/prisma/reset-dev.core.ts`
- Test: `apps/api/test/reset-dev.e2e-spec.ts`

**Interfaces:**
- Consumes: `KEEP_LIST`, `selectTablesToWipe`, `assertCoherence`, `Executor` (Task 1).
- Produces:
  - `forcedRlsTables(exec: Executor): Promise<string[]>`
  - `tablesWithEstablishmentId(exec: Executor): Promise<string[]>`
  - `estimatedRowCounts(exec: Executor, tables: string[]): Promise<Record<string, number>>`
  - `interface ResetReport { tables: string[]; estimatedRows: Record<string, number>; dryRun: boolean }`
  - `resetTenantData(exec: Executor, opts: { dryRun: boolean }): Promise<ResetReport>`

- [ ] **Step 1: Write the failing integration test**

Append to `apps/api/test/reset-dev.e2e-spec.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { resetTenantData } from '../prisma/reset-dev.core';

describe('resetTenantData — integrazione (transazione con rollback, non distruttivo)', () => {
  const prisma = new PrismaClient();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('TRUNCATE azzera le tenant e preserva User/Establishment (poi rollback)', async () => {
    const SENTINEL = new Error('rollback-sentinel');
    let report: Awaited<ReturnType<typeof resetTenantData>> | undefined;
    let customerAfter = -1;
    let establishmentAfter = -1;
    try {
      await prisma.$transaction(
        async (tx) => {
          // Seed nella tx: Establishment (non-RLS) + Customer (RLS → serve la GUC del tenant).
          const est = await tx.establishment.create({ data: { name: 'RESET TEST' } });
          await tx.$executeRaw`SELECT set_config('app.current_tenant', ${est.id}, true)`;
          await tx.customer.create({ data: { establishmentId: est.id, firstName: 'Del', lastName: 'Me' } });

          // Esegue il reset reale dentro la tx.
          report = await resetTenantData(tx, { dryRun: false });

          // Asserzioni dentro la tx, dopo il TRUNCATE.
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Customer"`;
          customerAfter = Number(n);
          const [{ e }] = await tx.$queryRaw<{ e: bigint }[]>`
            SELECT count(*) AS e FROM "Establishment" WHERE id = ${est.id}::uuid`;
          establishmentAfter = Number(e);

          throw SENTINEL; // forza il rollback: zero impatto sul DB condiviso
        },
        { timeout: 30000 },
      );
    } catch (err) {
      if (err !== SENTINEL) throw err;
    }

    expect(report?.tables).toContain('Customer');
    expect(report?.tables).not.toContain('User');
    expect(report?.tables).not.toContain('Establishment');
    expect(customerAfter).toBe(0); // TRUNCATE ha azzerato la tenant
    expect(establishmentAfter).toBe(1); // Establishment preservato
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand -t 'transazione con rollback'`
Expected: FAIL — `resetTenantData` non esportata / non definita.

- [ ] **Step 3: Write minimal implementation**

Append to `apps/api/prisma/reset-dev.core.ts`:

```ts
/** Tabelle con RLS FORCE (= le tenant, per convenzione di progetto). */
export async function forcedRlsTables(exec: Executor): Promise<string[]> {
  const rows = await exec.$queryRaw<{ relname: string }[]>`
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity = true
    ORDER BY c.relname`;
  return rows.map((r) => r.relname);
}

/** Tabelle con una colonna `establishmentId`. */
export async function tablesWithEstablishmentId(exec: Executor): Promise<string[]> {
  const rows = await exec.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'establishmentId'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

/**
 * Stima righe per tabella (n_live_tup): un COUNT esatto sarebbe filtrato dall'RLS FORCE senza GUC,
 * mentre pg_stat non è RLS-filtrato → riflette tutti i tenant, che è ciò che il TRUNCATE azzererà.
 */
export async function estimatedRowCounts(
  exec: Executor,
  tables: string[],
): Promise<Record<string, number>> {
  const rows = await exec.$queryRaw<{ relname: string; n: bigint }[]>`
    SELECT relname, n_live_tup AS n FROM pg_stat_user_tables WHERE schemaname = 'public'`;
  const byName = new Map(rows.map((r) => [r.relname, Number(r.n)]));
  return Object.fromEntries(tables.map((t) => [t, byName.get(t) ?? 0]));
}

export interface ResetReport {
  tables: string[];
  estimatedRows: Record<string, number>;
  dryRun: boolean;
}

/** Cuore riusabile: introspetta, valida (coherence + keep-list), e (se !dryRun) TRUNCATE … CASCADE. */
export async function resetTenantData(
  exec: Executor,
  opts: { dryRun: boolean },
): Promise<ResetReport> {
  const forced = await forcedRlsTables(exec);
  const withEstId = await tablesWithEstablishmentId(exec);
  assertCoherence(forced, withEstId, KEEP_LIST);
  const tables = selectTablesToWipe(forced, KEEP_LIST);
  // Asserzione anti-catastrofe: il set non deve MAI intersecare la keep-list.
  const keepSet = new Set(KEEP_LIST);
  const leaked = tables.filter((t) => keepSet.has(t));
  if (leaked.length) {
    throw new Error(`reset-dev: keep-list violata da [${leaked.join(', ')}] — abort`);
  }
  const estimatedRows = await estimatedRowCounts(exec, tables);
  if (!opts.dryRun && tables.length > 0) {
    const list = tables.map((t) => `"${t}"`).join(', ');
    await exec.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  return { tables, estimatedRows, dryRun: opts.dryRun };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand -t 'transazione con rollback'`
Expected: PASS. (Verifica anche che `-t 'funzioni pure'` resti verde.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/reset-dev.core.ts apps/api/test/reset-dev.e2e-spec.ts
git commit -m "feat(reset-dev): introspezione RLS + resetTenantData con test integrazione tx-rollback (§4.b)"
```

---

### Task 3: CLI `reset-dev.ts` + script `db:reset` + verifica LIVE

**Files:**
- Create: `apps/api/prisma/reset-dev.ts`
- Modify: `apps/api/package.json` (scripts)

**Interfaces:**
- Consumes: `assertResettableEnv`, `resetTenantData` (Task 1/2).

- [ ] **Step 1: Create the CLI entry**

Create `apps/api/prisma/reset-dev.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { assertResettableEnv, resetTenantData } from './reset-dev.core';

async function main(): Promise<void> {
  const yes = process.argv.includes('--yes');
  const prisma = new PrismaClient();
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    assertResettableEnv(process.env.NODE_ENV, db);

    const report = await resetTenantData(prisma, { dryRun: !yes });

    console.log(`\nreset-dev · database "${db}" · ${report.dryRun ? 'DRY-RUN (nessuna modifica)' : 'ESECUZIONE'}`);
    for (const t of report.tables) {
      const verb = report.dryRun ? 'azzererei ' : 'azzerata  ';
      console.log(`  ${verb} ${t.padEnd(20)} ~${report.estimatedRows[t]} righe`);
    }
    const [{ users }] = await prisma.$queryRaw<{ users: bigint }[]>`SELECT count(*) AS users FROM "User"`;
    const [{ est }] = await prisma.$queryRaw<{ est: bigint }[]>`SELECT count(*) AS est FROM "Establishment"`;
    console.log(`  preservati: User=${Number(users)} · Establishment=${Number(est)}`);

    console.log(
      report.dryRun
        ? '\nDry-run: rilancia con  -- --yes  per eseguire davvero.'
        : '\nFatto. Rilancia il seed per la demo (pnpm --filter @coralyn/api exec prisma db seed), o configura da UI.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the `db:reset` script**

Modify `apps/api/package.json` — nel blocco `"scripts"`, dopo `"seed:demo"`, aggiungi:

```json
    "db:reset": "ts-node prisma/reset-dev.ts"
```

(Ricorda la virgola dopo la riga precedente.)

- [ ] **Step 3: Verifica LIVE — dry-run (nessuna modifica)**

Assicurati che Docker sia su (`docker ps` → `coralyn-db` healthy).
Run: `corepack pnpm --filter @coralyn/api run db:reset`
Expected: stampa `DRY-RUN`, elenca le 18 tabelle con stima righe, `preservati: User=… · Establishment=…`, e il suggerimento `-- --yes`. **Nessuna** riga cancellata (verifica: `docker exec coralyn-db psql -U coralyn -d coralyn_dev -c 'SELECT count(*) FROM "Customer";'` invariato).

- [ ] **Step 4: Verifica LIVE — esecuzione reale**

Run: `corepack pnpm --filter @coralyn/api run db:reset -- --yes`
Expected: stampa `ESECUZIONE`, poi verifica:
`docker exec coralyn-db psql -U coralyn -d coralyn_dev -c 'SELECT (SELECT count(*) FROM "Customer") AS customers, (SELECT count(*) FROM "Booking") AS bookings, (SELECT count(*) FROM "Sector") AS sectors, (SELECT count(*) FROM "User") AS users, (SELECT count(*) FROM "Establishment") AS establishments;'`
Expected: `customers=0, bookings=0, sectors=0`, `users ≥ 1`, `establishments ≥ 1`.
Poi login `admin@coralyn.dev` / `coralyn-admin-8473` nel preview web-staff → la pagina «Configura» è **vuota** (struttura azzerata), l'utente resta loggabile.

- [ ] **Step 5: Ripristina il DB dev demo e committa**

```bash
corepack pnpm --filter @coralyn/api exec prisma db seed
git add apps/api/prisma/reset-dev.ts apps/api/package.json
git commit -m "feat(reset-dev): CLI db:reset con --yes/dry-run e guardie env (§4.b)"
```

(Il seed ripristina admin + struttura demo per continuare a lavorare; è idempotente.)

---

## Verifica finale (prima di presentare per merge)

- [ ] `corepack pnpm --filter @coralyn/api exec tsc -p tsconfig.json --noEmit` → pulito.
- [ ] `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json --runInBand --testTimeout=30000` → tutti verdi (300 baseline + i nuovi test reset-dev, nessuna regressione).
- [ ] Aggiornare la memoria roadmap (nuovo conteggio e2e, §4.b chiusa, §4.1 sbloccata).
- [ ] Presentare diff + evidenze, attendere OK esplicito per merge FF + push.
