import type { PrismaService } from '../../src/prisma/prisma.service';

export interface MappaSeedIds {
  tipologiaId: string;
  fasciaMat: string;
  fasciaPom: string;
  settoreId: string;
  filaId: string;
  o1: string;
  o2: string;
}

/** Crea una struttura mappa minima per `stabilimentoId` (RLS: dentro forTenant). */
export async function seedMappaTenant(
  prisma: PrismaService,
  stabilimentoId: string,
): Promise<MappaSeedIds> {
  return prisma.forTenant(stabilimentoId, async (tx) => {
    const tip = await tx.tipologia.create({
      data: { stabilimentoId, nome: 'Palma', ordine: 1, icona: 'palmtree' },
    });
    const mat = await tx.fascia.create({
      data: {
        stabilimentoId,
        nome: 'Mattina',
        oraInizio: new Date('1970-01-01T08:00:00Z'),
        oraFine: new Date('1970-01-01T13:00:00Z'),
        ordine: 1,
      },
    });
    const pom = await tx.fascia.create({
      data: {
        stabilimentoId,
        nome: 'Pomeriggio',
        oraInizio: new Date('1970-01-01T13:00:00Z'),
        oraFine: new Date('1970-01-01T19:00:00Z'),
        ordine: 2,
      },
    });
    const set = await tx.settore.create({ data: { stabilimentoId, nome: 'Centro', ordine: 1 } });
    const fila = await tx.fila.create({
      data: { stabilimentoId, settoreId: set.id, etichetta: 'Fila 1', ordine: 1 },
    });
    // ordineLogico volutamente invertito (2 creato prima di 1) per testare l'ordinamento.
    const o2 = await tx.ombrellone.create({
      data: { stabilimentoId, filaId: fila.id, tipologiaId: null, etichetta: '2', ordineLogico: 2 },
    });
    const o1 = await tx.ombrellone.create({
      data: { stabilimentoId, filaId: fila.id, tipologiaId: tip.id, etichetta: '1', ordineLogico: 1 },
    });
    return {
      tipologiaId: tip.id,
      fasciaMat: mat.id,
      fasciaPom: pom.id,
      settoreId: set.id,
      filaId: fila.id,
      o1: o1.id,
      o2: o2.id,
    };
  });
}

/** Pulisce la struttura mappa di un tenant (ordine FK: ombrelloni → file → settori; tipologie; fasce). */
export async function cleanMappaTenant(
  prisma: PrismaService,
  stabilimentoId: string,
): Promise<void> {
  await prisma.forTenant(stabilimentoId, async (tx) => {
    await tx.ombrellone.deleteMany({});
    await tx.fila.deleteMany({});
    await tx.settore.deleteMany({});
    await tx.tipologia.deleteMany({});
    await tx.fascia.deleteMany({});
  });
}
