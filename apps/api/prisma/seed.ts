import { PrismaClient, Ruolo } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Stabilimento di sviluppo con id fisso: è lo `stabilimentoId` dell'admin seedato,
// quindi il JWT emesso al login lo porta nelle richieste (tenant dal token, ADR-0026).
const DEV_STABILIMENTO_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed non può girare in produzione');
  }

  await prisma.stabilimento.upsert({
    where: { id: DEV_STABILIMENTO_ID },
    update: {},
    create: { id: DEV_STABILIMENTO_ID, nome: 'Lido di Sviluppo' },
  });

  // Primo admin di sviluppo (per login locale). Password hashata con argon2id.
  const email = process.env.DEV_ADMIN_EMAIL ?? 'admin@coralyn.dev';
  const password = process.env.DEV_ADMIN_PASSWORD ?? 'coralyn-admin';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.utente.upsert({
    where: { email },
    update: { passwordHash },
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
