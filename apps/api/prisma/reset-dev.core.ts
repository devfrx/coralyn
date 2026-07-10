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
