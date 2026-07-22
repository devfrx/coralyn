import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Establishment di sviluppo con id fisso: è l'`establishmentId` dell'admin seedato,
// quindi il JWT emesso al login lo porta nelle richieste (tenant dal token, ADR-0026).
const DEV_ESTABLISHMENT_ID = '00000000-0000-0000-0000-000000000001';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed non può girare in produzione');
  }

  await prisma.establishment.upsert({
    where: { id: DEV_ESTABLISHMENT_ID },
    update: {},
    create: { id: DEV_ESTABLISHMENT_ID, name: 'Lido di Sviluppo' },
  });

  // Primo admin di sviluppo (per login locale). Password hashata con argon2id.
  const email = process.env.DEV_ADMIN_EMAIL ?? 'admin@coralyn.dev';
  const password = process.env.DEV_ADMIN_PASSWORD ?? 'coralyn-admin';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, role: Role.admin, establishmentId: DEV_ESTABLISHMENT_ID },
  });

  // Bootstrap del primo superuser di piattaforma (env-gated, idempotente). establishmentId null =
  // cross-tenant (ADR-0026). No-op se le env non sono impostate. Vedi spec Platform Console.
  const suEmail = process.env.PLATFORM_SUPERUSER_EMAIL;
  const suPassword = process.env.PLATFORM_SUPERUSER_PASSWORD;
  if (suEmail && suPassword) {
    const suHash = await argon2.hash(suPassword, { type: argon2.argon2id });
    await prisma.user.upsert({
      where: { email: suEmail },
      update: { passwordHash: suHash, role: Role.superuser, establishmentId: null },
      create: { email: suEmail, passwordHash: suHash, role: Role.superuser, establishmentId: null },
    });
  }

  // --- Map demo (idempotente) per il tenant dev. Forma allineata a mapSeed FE. ---
  // Le tabelle map hanno RLS FORCE: gli upsert devono girare con la GUC
  // app.current_tenant impostata, dentro UNA transazione (come PrismaService.forTenant).
  // uuid v4 validi (nibble versione = 4, variante = 8): gli id seed passano @IsUUID nei DTO
  // dell'editor Configura (rowId/sectorId/umbrellaTypeId nei body). Stesso helper → riferimenti
  // interni coerenti. In produzione gli id nascono da @default(uuid()) (già v4).
  const u = (prefix: number, n: number): string =>
    `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const t = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);
  const t2 = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`);
  const EID = DEV_ESTABLISHMENT_ID;
  const TYPE_MINI = u(1, 1);
  const TYPE_PALM = u(1, 2);
  const ROW_PALMS = u(4, 9);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${EID}, true)`;

    const umbrellaTypes = [
      { id: TYPE_MINI, name: 'Mini-palma', sortOrder: 1, icon: 'leaf' },
      { id: TYPE_PALM, name: 'Palma', sortOrder: 2, icon: 'palmtree' },
    ];
    for (const x of umbrellaTypes) {
      await tx.umbrellaType.upsert({
        where: { id: x.id },
        update: { name: x.name, sortOrder: x.sortOrder, icon: x.icon },
        create: { establishmentId: EID, ...x },
      });
    }

    const timeSlots = [
      { id: u(2, 1), name: 'Mattina', startTime: t('08:00'), endTime: t('13:00'), sortOrder: 1 },
      { id: u(2, 2), name: 'Pomeriggio', startTime: t('13:00'), endTime: t('19:00'), sortOrder: 2 },
    ];
    for (const x of timeSlots) {
      await tx.timeSlot.upsert({
        where: { id: x.id },
        update: { name: x.name, startTime: x.startTime, endTime: x.endTime, sortOrder: x.sortOrder },
        create: { establishmentId: EID, ...x },
      });
    }

    const sectors = [
      { id: u(3, 1), name: 'Centro', sortOrder: 1, kind: 'grid' as const },
      // kind special: la Mappa discrimina il blocco dedicato per kind, non per nome (D-056).
      { id: u(3, 2), name: 'Speciali', sortOrder: 99, kind: 'special' as const },
    ];
    for (const x of sectors) {
      await tx.sector.upsert({
        where: { id: x.id },
        update: { name: x.name, sortOrder: x.sortOrder, kind: x.kind },
        create: { establishmentId: EID, ...x },
      });
    }

    const rows = [
      { id: u(4, 1), sectorId: u(3, 1), label: 'Fila 1', sortOrder: 1 },
      { id: u(4, 2), sectorId: u(3, 1), label: 'Fila 2', sortOrder: 2 },
      { id: u(4, 3), sectorId: u(3, 1), label: 'Fila 3', sortOrder: 3 },
      { id: ROW_PALMS, sectorId: u(3, 2), label: 'Palme', sortOrder: 1 },
    ];
    for (const x of rows) {
      await tx.row.upsert({
        where: { id: x.id },
        update: { sectorId: x.sectorId, label: x.label, sortOrder: x.sortOrder },
        create: { establishmentId: EID, ...x },
      });
    }

    // Umbrellas: Fila 1/2 = Mini-palma (1..20), Fila 3 = Normale (21..30), Palme = Palma (P1..P4).
    type UmbrellaDef = {
      id: string;
      rowId: string;
      umbrellaTypeId: string | null;
      label: string;
      logicalOrder: number;
    };
    const umbrellas: UmbrellaDef[] = [];
    let k = 0;
    const push = (rowId: string, umbrellaTypeId: string | null, label: string, logicalOrder: number): void => {
      umbrellas.push({ id: u(5, ++k), rowId, umbrellaTypeId, label, logicalOrder });
    };
    for (let i = 1; i <= 10; i++) push(u(4, 1), TYPE_MINI, String(i), i);
    for (let i = 11; i <= 20; i++) push(u(4, 2), TYPE_MINI, String(i), i - 10);
    for (let i = 21; i <= 30; i++) push(u(4, 3), null, String(i), i - 20);
    for (let i = 1; i <= 4; i++) push(ROW_PALMS, TYPE_PALM, `P${i}`, i);

    for (const x of umbrellas) {
      await tx.umbrella.upsert({
        where: { id: x.id },
        update: { rowId: x.rowId, umbrellaTypeId: x.umbrellaTypeId, label: x.label, logicalOrder: x.logicalOrder },
        create: { establishmentId: EID, ...x },
      });
    }

    // --- Listino demo (A3.1): Package + Season + Pricing + Rate (catch-all + pomeriggio). ---
    const PKG_STANDARD = u(6, 1);
    await tx.package.upsert({
      where: { id: PKG_STANDARD },
      update: { name: 'Standard' },
      create: { id: PKG_STANDARD, establishmentId: EID, name: 'Standard' },
    });

    // Dotazione (catalogo tenant-scoped + link). Upsert per CHIAVE NATURALE (establishmentId, name):
    // idempotente sia su DB fresco sia su un DB già migrato (dove i tipi esistono con un id casuale
    // generato dalla migrazione dati) — un id fisso violerebbe @@unique([establishmentId, name]).
    const equipmentDefs = [
      { name: 'Lettino', quantity: 2 },
      { name: 'Sdraio', quantity: 1 },
    ];
    for (const d of equipmentDefs) {
      const type = await tx.equipmentType.upsert({
        where: { establishmentId_name: { establishmentId: EID, name: d.name } },
        update: {},
        create: { establishmentId: EID, name: d.name },
      });
      await tx.packageEquipment.upsert({
        where: { packageId_equipmentTypeId: { packageId: PKG_STANDARD, equipmentTypeId: type.id } },
        update: { quantity: d.quantity },
        create: { establishmentId: EID, packageId: PKG_STANDARD, equipmentTypeId: type.id, quantity: d.quantity },
      });
    }

    const SEASON = u(7, 1);
    await tx.season.upsert({
      where: { id: SEASON },
      update: { name: 'Estate 2026', startDate: t2('2026-05-01'), endDate: t2('2026-09-30') },
      create: { id: SEASON, establishmentId: EID, name: 'Estate 2026', startDate: t2('2026-05-01'), endDate: t2('2026-09-30') },
    });

    // --- Noleggio demo: articoli fungibili + tariffe stagionali. ---
    const PEDALO = '00000000-0000-0000-0000-0000000000a1';
    const BABYSIT = '00000000-0000-0000-0000-0000000000a2';
    await tx.rentalItem.upsert({
      where: { establishmentId_name: { establishmentId: EID, name: 'Pedalò' } },
      update: { stock: 5 },
      create: { id: PEDALO, establishmentId: EID, name: 'Pedalò', stock: 5 },
    });
    await tx.rentalItem.upsert({
      where: { establishmentId_name: { establishmentId: EID, name: 'Babysitting' } },
      update: { stock: null },
      create: { id: BABYSIT, establishmentId: EID, name: 'Babysitting', stock: null },
    });
    await tx.rentalTariff.deleteMany({ where: { rentalItemId: { in: [PEDALO, BABYSIT] } } });
    for (const t of [
      { itemId: PEDALO, label: '30 min', price: 5, durationMinutes: 30, sortOrder: 1 },
      { itemId: PEDALO, label: '1 ora', price: 8, durationMinutes: 60, sortOrder: 2 },
      { itemId: BABYSIT, label: '1 ora', price: 15, durationMinutes: 60, sortOrder: 1 },
    ]) {
      await tx.rentalTariff.create({
        data: { establishmentId: EID, rentalItemId: t.itemId, seasonId: SEASON, label: t.label,
                price: t.price, durationMinutes: t.durationMinutes, sortOrder: t.sortOrder },
      });
    }

    const PRICING = u(8, 1);
    await tx.pricing.upsert({
      where: { id: PRICING },
      update: { seasonId: SEASON },
      create: { id: PRICING, establishmentId: EID, seasonId: SEASON },
    });

    // Catch-all (tutte le dimensioni null): rete del listino, prezzo base giornaliero.
    const RATE_BASE = u(9, 1);
    await tx.rate.upsert({
      where: { id: RATE_BASE },
      update: { price: 28 },
      create: { id: RATE_BASE, establishmentId: EID, pricingId: PRICING, price: 28 },
    });
    // Pomeriggio (fascia u(2,2)) piu caro: dimostra la precedenza per fascia.
    const RATE_PM = u(9, 2);
    await tx.rate.upsert({
      where: { id: RATE_PM },
      update: { timeSlotId: u(2, 2), price: 40 },
      create: { id: RATE_PM, establishmentId: EID, pricingId: PRICING, timeSlotId: u(2, 2), price: 40 },
    });

    // Abbonamento (type=subscription) a forfait di stagione.
    const RATE_SUB = u(9, 3);
    await tx.rate.upsert({
      where: { id: RATE_SUB },
      update: { type: 'subscription', price: 800 },
      create: { id: RATE_SUB, establishmentId: EID, pricingId: PRICING, type: 'subscription', price: 800 },
    });

    // 2a stagione 2027 (listino con abbonamento a prezzo diverso: 850) per esercitare il rinnovo (A4.2).
    const SEASON_2027 = u(7, 2);
    await tx.season.upsert({
      where: { id: SEASON_2027 },
      update: { name: 'Estate 2027', startDate: t2('2027-05-01'), endDate: t2('2027-09-30') },
      create: { id: SEASON_2027, establishmentId: EID, name: 'Estate 2027', startDate: t2('2027-05-01'), endDate: t2('2027-09-30') },
    });
    const PRICING_2027 = u(8, 2);
    await tx.pricing.upsert({
      where: { id: PRICING_2027 },
      update: { seasonId: SEASON_2027 },
      create: { id: PRICING_2027, establishmentId: EID, seasonId: SEASON_2027 },
    });
    const RATE_BASE_2027 = u(9, 4);
    await tx.rate.upsert({
      where: { id: RATE_BASE_2027 },
      update: { price: 30 },
      create: { id: RATE_BASE_2027, establishmentId: EID, pricingId: PRICING_2027, price: 30 },
    });
    const RATE_SUB_2027 = u(9, 5);
    await tx.rate.upsert({
      where: { id: RATE_SUB_2027 },
      update: { type: 'subscription', price: 850 },
      create: { id: RATE_SUB_2027, establishmentId: EID, pricingId: PRICING_2027, type: 'subscription', price: 850 },
    });
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
