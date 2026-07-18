import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

// Bootstrap idempotente del PRIMO superuser di piattaforma in PRODUZIONE.
//
// prisma/seed.ts è volutamente bloccato in produzione (throw se NODE_ENV=production)
// e semina anche un lido demo con dati finti: inadatto alla produzione. Questo script
// crea SOLO il superuser cross-tenant (establishmentId = null, ADR-0026), leggendo le
// credenziali da PLATFORM_SUPERUSER_EMAIL / PLATFORM_SUPERUSER_PASSWORD. Password
// hashata con argon2id (ADR-0025). Rieseguibile: aggiorna la password se già esiste.
//
// Uso (una tantum, dopo il primo avvio):
//   docker compose -f docker-compose.prod.yml exec api \
//     pnpm --filter @coralyn/api db:bootstrap-superuser

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.PLATFORM_SUPERUSER_EMAIL;
  const password = process.env.PLATFORM_SUPERUSER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'PLATFORM_SUPERUSER_EMAIL e PLATFORM_SUPERUSER_PASSWORD sono obbligatorie (impostale in .env.prod).',
    );
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.superuser, establishmentId: null, disabledAt: null },
    create: { email, passwordHash, role: Role.superuser, establishmentId: null },
  });

  console.log(`[bootstrap] superuser pronto: ${user.email} (id ${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
