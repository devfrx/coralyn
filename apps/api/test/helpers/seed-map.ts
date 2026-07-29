import type { PrismaService } from '../../src/prisma/prisma.service';
import type { TenantId } from '../../src/tenant/tenant-id';

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
  establishmentId: TenantId,
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

export interface SeededRow { id: string; umbrellas: string[] }

export interface MultiSectorSeedIds {
  /** Secondo settore `grid`, con DUE file: destinazione legittima di uno spostamento. */
  gridSectorId: string;
  gridRowA: SeededRow;
  gridRowB: SeededRow;
  /** Settore `special`: destinazione che uno spostamento da `grid` deve rifiutare. */
  specialSectorId: string;
  specialRow: SeededRow;
}

/**
 * Aggiunge a un tenant un secondo settore `grid` (due file) e un settore `special` (una fila).
 *
 * Sta accanto a `seedMapTenant` invece che dentro, e non è una preferenza: `seedMapTenant` è usato
 * da 16 spec e2e, e due di loro asseriscono la CARDINALITÀ del mondo seedato — `map.e2e-spec.ts:53`
 * (`sectors` di lunghezza 1) e `establishment.e2e-spec.ts:66` (`{ sectors: 1, umbrellas: 2, … }`).
 * Estendere l'helper condiviso avrebbe costretto a riscrivere asserzioni corrette per una fixture
 * che quelle spec non usano. Additivo, ogni spec dichiara il mondo che le serve.
 *
 * Non serve una `clean` dedicata: `cleanMapTenant` cancella tutti gli umbrella/row/sector del tenant.
 *
 * ⚠️ La fila B nasce con ordini SPARSI (10, 20). È lo stato in cui una fila finisce dopo il primo
 * spostamento verso un'altra fila — il buco non si richiude — quindi è il caso realistico, non
 * quello di laboratorio.
 */
export async function seedMultiSectorTenant(
  prisma: PrismaService,
  establishmentId: TenantId,
): Promise<MultiSectorSeedIds> {
  return prisma.forTenant(establishmentId, async (tx) => {
    const row = async (sectorId: string, label: string, sortOrder: number) =>
      tx.row.create({ data: { establishmentId, sectorId, label, sortOrder } });
    const umbrella = async (rowId: string, label: string, logicalOrder: number) =>
      tx.umbrella.create({ data: { establishmentId, rowId, umbrellaTypeId: null, label, logicalOrder } });

    const grid = await tx.sector.create({ data: { establishmentId, name: 'Levante', sortOrder: 2, kind: 'grid' } });
    const rowA = await row(grid.id, 'Fila A', 1);
    const a1 = await umbrella(rowA.id, 'A1', 1);
    const a2 = await umbrella(rowA.id, 'A2', 2);
    const rowB = await row(grid.id, 'Fila B', 2);
    const b1 = await umbrella(rowB.id, 'B1', 10);
    const b2 = await umbrella(rowB.id, 'B2', 20);

    const special = await tx.sector.create({ data: { establishmentId, name: 'Palme', sortOrder: 3, kind: 'special' } });
    const rowS = await row(special.id, 'Palme 1', 1);
    const s1 = await umbrella(rowS.id, 'P1', 1);
    const s2 = await umbrella(rowS.id, 'P2', 2);

    return {
      gridSectorId: grid.id,
      gridRowA: { id: rowA.id, umbrellas: [a1.id, a2.id] },
      gridRowB: { id: rowB.id, umbrellas: [b1.id, b2.id] },
      specialSectorId: special.id,
      specialRow: { id: rowS.id, umbrellas: [s1.id, s2.id] },
    };
  });
}

/** Pulisce la struttura mappa di un tenant (ordine FK: umbrellas → rows → sectors; types; slots). */
export async function cleanMapTenant(
  prisma: PrismaService,
  establishmentId: TenantId,
): Promise<void> {
  await prisma.forTenant(establishmentId, async (tx) => {
    await tx.umbrella.deleteMany({});
    await tx.row.deleteMany({});
    await tx.sector.deleteMany({});
    await tx.umbrellaType.deleteMany({});
    await tx.timeSlot.deleteMany({});
  });
}
