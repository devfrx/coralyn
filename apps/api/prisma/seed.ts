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

  // --- Mappa demo (idempotente) per il tenant dev. Forma allineata a mappaSeed FE. ---
  // Le 5 tabelle mappa hanno RLS FORCE: gli upsert devono girare con la GUC
  // app.current_tenant impostata, dentro UNA transazione (come PrismaService.forTenant).
  const u = (prefix: number, n: number): string =>
    `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const t = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);
  const SID = DEV_STABILIMENTO_ID;
  const TIP_MINI = u(1, 1);
  const TIP_PALMA = u(1, 2);
  const FILA_PALME = u(4, 9);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${SID}, true)`;

    const tipologie = [
      { id: TIP_MINI, nome: 'Mini-palma', ordine: 1, icona: 'leaf' },
      { id: TIP_PALMA, nome: 'Palma', ordine: 2, icona: 'palmtree' },
    ];
    for (const x of tipologie) {
      await tx.tipologia.upsert({
        where: { id: x.id },
        update: { nome: x.nome, ordine: x.ordine, icona: x.icona },
        create: { stabilimentoId: SID, ...x },
      });
    }

    const fasce = [
      { id: u(2, 1), nome: 'Mattina', oraInizio: t('08:00'), oraFine: t('13:00'), ordine: 1 },
      { id: u(2, 2), nome: 'Pomeriggio', oraInizio: t('13:00'), oraFine: t('19:00'), ordine: 2 },
    ];
    for (const x of fasce) {
      await tx.fascia.upsert({
        where: { id: x.id },
        update: { nome: x.nome, oraInizio: x.oraInizio, oraFine: x.oraFine, ordine: x.ordine },
        create: { stabilimentoId: SID, ...x },
      });
    }

    const settori = [
      { id: u(3, 1), nome: 'Centro', ordine: 1 },
      { id: u(3, 2), nome: 'Speciali', ordine: 99 },
    ];
    for (const x of settori) {
      await tx.settore.upsert({
        where: { id: x.id },
        update: { nome: x.nome, ordine: x.ordine },
        create: { stabilimentoId: SID, ...x },
      });
    }

    const file = [
      { id: u(4, 1), settoreId: u(3, 1), etichetta: 'Fila 1', ordine: 1 },
      { id: u(4, 2), settoreId: u(3, 1), etichetta: 'Fila 2', ordine: 2 },
      { id: u(4, 3), settoreId: u(3, 1), etichetta: 'Fila 3', ordine: 3 },
      { id: FILA_PALME, settoreId: u(3, 2), etichetta: 'Palme', ordine: 1 },
    ];
    for (const x of file) {
      await tx.fila.upsert({
        where: { id: x.id },
        update: { settoreId: x.settoreId, etichetta: x.etichetta, ordine: x.ordine },
        create: { stabilimentoId: SID, ...x },
      });
    }

    // Ombrelloni: Fila 1/2 = Mini-palma (1..20), Fila 3 = Normale (21..30), Palme = Palma (P1..P4).
    type OmbDef = {
      id: string;
      filaId: string;
      tipologiaId: string | null;
      etichetta: string;
      ordineLogico: number;
    };
    const ombrelloni: OmbDef[] = [];
    let k = 0;
    const push = (filaId: string, tipologiaId: string | null, etichetta: string, ordineLogico: number): void => {
      ombrelloni.push({ id: u(5, ++k), filaId, tipologiaId, etichetta, ordineLogico });
    };
    for (let i = 1; i <= 10; i++) push(u(4, 1), TIP_MINI, String(i), i);
    for (let i = 11; i <= 20; i++) push(u(4, 2), TIP_MINI, String(i), i - 10);
    for (let i = 21; i <= 30; i++) push(u(4, 3), null, String(i), i - 20);
    for (let i = 1; i <= 4; i++) push(FILA_PALME, TIP_PALMA, `P${i}`, i);

    for (const x of ombrelloni) {
      await tx.ombrellone.upsert({
        where: { id: x.id },
        update: { filaId: x.filaId, tipologiaId: x.tipologiaId, etichetta: x.etichetta, ordineLogico: x.ordineLogico },
        create: { stabilimentoId: SID, ...x },
      });
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
