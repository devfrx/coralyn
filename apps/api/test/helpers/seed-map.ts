import type { PrismaService } from '../../src/prisma/prisma.service';

export interface MapSeedIds {
  umbrellaTypeId: string;
  slotMorning: string;
  slotAfternoon: string;
  sectorId: string;
  rowId: string;
  u1: string;
  u2: string;
}

/** Crea una struttura mappa minima per `establishmentId` (RLS: dentro forTenant). */
export async function seedMapTenant(
  prisma: PrismaService,
  establishmentId: string,
): Promise<MapSeedIds> {
  return prisma.forTenant(establishmentId, async (tx) => {
    const type = await tx.umbrellaType.create({
      data: { establishmentId, name: 'Palma', sortOrder: 1, icon: 'palmtree' },
    });
    const morning = await tx.timeSlot.create({
      data: {
        establishmentId,
        name: 'Mattina',
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T13:00:00Z'),
        sortOrder: 1,
      },
    });
    const afternoon = await tx.timeSlot.create({
      data: {
        establishmentId,
        name: 'Pomeriggio',
        startTime: new Date('1970-01-01T13:00:00Z'),
        endTime: new Date('1970-01-01T19:00:00Z'),
        sortOrder: 2,
      },
    });
    const sector = await tx.sector.create({ data: { establishmentId, name: 'Centro', sortOrder: 1 } });
    const row = await tx.row.create({
      data: { establishmentId, sectorId: sector.id, label: 'Fila 1', sortOrder: 1 },
    });
    // logicalOrder volutamente invertito (2 creato prima di 1) per testare l'ordinamento.
    const u2 = await tx.umbrella.create({
      data: { establishmentId, rowId: row.id, umbrellaTypeId: null, label: '2', logicalOrder: 2 },
    });
    const u1 = await tx.umbrella.create({
      data: { establishmentId, rowId: row.id, umbrellaTypeId: type.id, label: '1', logicalOrder: 1 },
    });
    return {
      umbrellaTypeId: type.id,
      slotMorning: morning.id,
      slotAfternoon: afternoon.id,
      sectorId: sector.id,
      rowId: row.id,
      u1: u1.id,
      u2: u2.id,
    };
  });
}

/** Pulisce la struttura mappa di un tenant (ordine FK: umbrellas → rows → sectors; types; slots). */
export async function cleanMapTenant(
  prisma: PrismaService,
  establishmentId: string,
): Promise<void> {
  await prisma.forTenant(establishmentId, async (tx) => {
    await tx.umbrella.deleteMany({});
    await tx.row.deleteMany({});
    await tx.sector.deleteMany({});
    await tx.umbrellaType.deleteMany({});
    await tx.timeSlot.deleteMany({});
  });
}
