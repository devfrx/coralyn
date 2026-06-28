import { PrismaClient } from '@prisma/client';

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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
