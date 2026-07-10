// Script DEV-ONLY: reset TOTALE del DB di sviluppo (§4.b). Azzera i dati di TUTTI i tenant (le 18
// tabelle RLS FORCE) preservando SOLO User+Establishment (+token/audit non-tenant), così da poter
// loggarsi su un DB pulito. Abilitatore di §4.1 (riprodurre «Configura» su struttura pulita).
// Come gli altri script ts-node "nudi" (seed-report-demo.ts), NON auto-carica .env → passa
// DATABASE_URL a mano. Guardie: NODE_ENV≠production + database ~ /^coralyn_(dev|test)/i + --yes obbligatorio (nel core, difesa in profondità).
//   Dry-run (default, nessuna modifica):
//     DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
//       corepack pnpm --filter @coralyn/api run db:reset
//   Esecuzione reale (aggiungi -- --yes):
//     DATABASE_URL="postgresql://coralyn_app:coralyn_app@localhost:5433/coralyn_dev?schema=public" \
//       corepack pnpm --filter @coralyn/api run db:reset -- --yes
import { PrismaClient } from '@prisma/client';
import { resetTenantData } from './reset-dev.core';

async function main(): Promise<void> {
  const yes = process.argv.includes('--yes');
  const prisma = new PrismaClient();
  try {
    const report = await resetTenantData(prisma, { dryRun: !yes });

    console.log(
      `\nreset-dev · database "${report.database}" · ${report.dryRun ? 'DRY-RUN (nessuna modifica)' : 'ESECUZIONE'}`,
    );
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
