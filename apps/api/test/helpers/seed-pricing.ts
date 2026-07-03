import type { PrismaService } from '../../src/prisma/prisma.service';

export interface PricingSeedIds {
  seasonId: string;
  season2027Id: string;
  pricingId: string;
  packageId: string;
}

/** Listino minimo per `establishmentId`: catch-all (28/giorno) + pomeriggio specifico (40/giorno). */
export async function seedPricingTenant(
  prisma: PrismaService,
  establishmentId: string,
  opts: { afternoonSlotId: string },
): Promise<PricingSeedIds> {
  return prisma.forTenant(establishmentId, async (tx) => {
    const pkg = await tx.package.create({
      data: { establishmentId, name: 'Standard' },
    });
    const lettino = await tx.equipmentType.create({
      data: { establishmentId, name: 'Lettino' },
    });
    await tx.packageEquipment.create({
      data: { establishmentId, packageId: pkg.id, equipmentTypeId: lettino.id, quantity: 2 },
    });
    const season = await tx.season.create({
      data: {
        establishmentId,
        name: 'Estate 2026',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-09-30T00:00:00Z'),
      },
    });
    const pricing = await tx.pricing.create({ data: { establishmentId, seasonId: season.id } });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing.id, price: 28 },
    });
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        timeSlotId: opts.afternoonSlotId,
        price: 40,
      },
    });
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        packageId: pkg.id,
        price: 60,
      },
    });
    await tx.rate.create({
      data: {
        establishmentId,
        pricingId: pricing.id,
        type: 'subscription',
        price: 800,
      },
    });

    // 2a stagione 2027 con proprio listino (prezzo abbonamento DIVERSO: 850) per esercitare il rinnovo.
    const season2027 = await tx.season.create({
      data: {
        establishmentId,
        name: 'Estate 2027',
        startDate: new Date('2027-05-01T00:00:00Z'),
        endDate: new Date('2027-09-30T00:00:00Z'),
      },
    });
    const pricing2027 = await tx.pricing.create({ data: { establishmentId, seasonId: season2027.id } });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing2027.id, price: 30 },
    });
    await tx.rate.create({
      data: { establishmentId, pricingId: pricing2027.id, type: 'subscription', price: 850 },
    });

    return { seasonId: season.id, season2027Id: season2027.id, pricingId: pricing.id, packageId: pkg.id };
  });
}

/** Pulisce il listino di un tenant (ordine FK: rate → pricing → season; package). */
export async function cleanPricingTenant(prisma: PrismaService, establishmentId: string): Promise<void> {
  await prisma.forTenant(establishmentId, async (tx) => {
    await tx.rate.deleteMany({});
    await tx.pricing.deleteMany({});
    await tx.season.deleteMany({});
    await tx.packageEquipment.deleteMany({});
    await tx.package.deleteMany({});
    await tx.equipmentType.deleteMany({});
  });
}
