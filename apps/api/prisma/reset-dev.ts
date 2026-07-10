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
