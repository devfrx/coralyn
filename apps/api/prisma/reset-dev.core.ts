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
