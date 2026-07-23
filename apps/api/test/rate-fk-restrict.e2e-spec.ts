import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Canary DB-level delle FK dimensionali di Rate (D-058, migration 20260723062405_rate_fk_restrict).
 * Le quattro relation opzionali (sector/row/package/timeSlot) sono ON DELETE RESTRICT esplicito:
 * col default Prisma (SET NULL) cancellare la dimensione non romperebbe la Rate ma la renderebbe
 * PIÙ GENERICA (wildcard sulla firma ADR-0032) — prezzi cambiati in silenzio. Le guardie 409 dei
 * service restano la prima linea; qui si bypassa l'app (delete raw via Prisma) per provare che il
 * backstop DB regge nella finestra read-committed che le guardie non coprono.
 *
 * Le fixture sono deliberatamente "nude" (settore senza file, fila senza ombrelloni, fascia senza
 * prenotazioni, pacchetto senza dotazioni): l'unico referente è la Rate, quindi un delete che
 * fallisce fallisce PER la FK di Rate, non per altre.
 */
describe('Rate FK ON DELETE RESTRICT (e2e, DB-level)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s1: string;

  let bareSectorId: string; // referenziato solo da rateSector
  let bareRowId: string; // referenziato solo da rateRow (il suo settore contenitore non si cancella mai)
  let barePackageId: string; // referenziato solo da ratePackage
  let bareSlotId: string; // referenziato solo da rateSlot
  let rateSectorId: string;

  // Asserisce anche QUALE FK è scattata (meta.field_name, es. "Rate_sectorId_fkey (index)"):
  // se una fixture smettesse di essere "nuda", il test fallisce invece di passare per la FK sbagliata.
  const expectP2003 = async (op: Promise<unknown>, constraint: string) => {
    let caught: unknown;
    try {
      await op;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const err = caught as Prisma.PrismaClientKnownRequestError;
    expect(err.code).toBe('P2003');
    expect(String(err.meta?.field_name)).toContain(constraint);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // bootstrap senza ValidationPipe né prefix: suite DB-level, nessuna request HTTP (cfr.
    // booking-overlap-constraint.e2e-spec.ts, stesso pattern e stessa motivazione).
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    s1 = (await prisma.establishment.create({ data: { name: 'Rate FK DB' } })).id;

    await prisma.forTenant(s1, async (tx) => {
      const bareSector = await tx.sector.create({ data: { establishmentId: s1, name: 'Solo tariffa', sortOrder: 1 } });
      const rowSector = await tx.sector.create({ data: { establishmentId: s1, name: 'Con fila', sortOrder: 2 } });
      const bareRow = await tx.row.create({
        data: { establishmentId: s1, sectorId: rowSector.id, label: 'Fila 1', sortOrder: 1 },
      });
      const pkg = await tx.package.create({ data: { establishmentId: s1, name: 'Standard' } });
      const slot = await tx.timeSlot.create({
        data: {
          establishmentId: s1,
          name: 'Mattina',
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T13:00:00Z'),
          sortOrder: 1,
        },
      });
      const season = await tx.season.create({
        data: {
          establishmentId: s1,
          name: 'Estate 2026',
          startDate: new Date('2026-05-01T00:00:00Z'),
          endDate: new Date('2026-09-30T00:00:00Z'),
        },
      });
      const pricing = await tx.pricing.create({ data: { establishmentId: s1, seasonId: season.id } });

      const rateSector = await tx.rate.create({
        data: { establishmentId: s1, pricingId: pricing.id, sectorId: bareSector.id, price: 30 },
      });
      await tx.rate.create({
        data: { establishmentId: s1, pricingId: pricing.id, rowId: bareRow.id, price: 35 },
      });
      await tx.rate.create({
        data: { establishmentId: s1, pricingId: pricing.id, packageId: pkg.id, price: 60 },
      });
      await tx.rate.create({
        data: { establishmentId: s1, pricingId: pricing.id, timeSlotId: slot.id, price: 40 },
      });

      bareSectorId = bareSector.id;
      bareRowId = bareRow.id;
      barePackageId = pkg.id;
      bareSlotId = slot.id;
      rateSectorId = rateSector.id;
    });
  });

  afterAll(async () => {
    await prisma.forTenant(s1, async (tx) => {
      await tx.rate.deleteMany({});
      await tx.pricing.deleteMany({});
      await tx.season.deleteMany({});
      await tx.package.deleteMany({});
      await tx.timeSlot.deleteMany({});
      await tx.row.deleteMany({});
      await tx.sector.deleteMany({});
    });
    await prisma.establishment.deleteMany({ where: { id: s1 } });
    await app.close();
  });

  it('delete raw di un Settore referenziato da una Rate → P2003, la Rate conserva sectorId', async () => {
    await expectP2003(
      prisma.forTenant(s1, (tx) => tx.sector.delete({ where: { id: bareSectorId } })),
      'Rate_sectorId_fkey',
    );
    const rate = await prisma.forTenant(s1, (tx) =>
      tx.rate.findFirstOrThrow({ where: { sectorId: bareSectorId } }),
    );
    expect(rate.sectorId).toBe(bareSectorId);
  });

  it('delete raw di una Fila referenziata da una Rate → P2003, la Rate conserva rowId', async () => {
    await expectP2003(
      prisma.forTenant(s1, (tx) => tx.row.delete({ where: { id: bareRowId } })),
      'Rate_rowId_fkey',
    );
    const rate = await prisma.forTenant(s1, (tx) => tx.rate.findFirstOrThrow({ where: { rowId: bareRowId } }));
    expect(rate.rowId).toBe(bareRowId);
  });

  it('delete raw di un Pacchetto referenziato da una Rate → P2003, la Rate conserva packageId', async () => {
    await expectP2003(
      prisma.forTenant(s1, (tx) => tx.package.delete({ where: { id: barePackageId } })),
      'Rate_packageId_fkey',
    );
    const rate = await prisma.forTenant(s1, (tx) =>
      tx.rate.findFirstOrThrow({ where: { packageId: barePackageId } }),
    );
    expect(rate.packageId).toBe(barePackageId);
  });

  it('delete raw di una Fascia referenziata da una Rate → P2003, la Rate conserva timeSlotId', async () => {
    await expectP2003(
      prisma.forTenant(s1, (tx) => tx.timeSlot.delete({ where: { id: bareSlotId } })),
      'Rate_timeSlotId_fkey',
    );
    const rate = await prisma.forTenant(s1, (tx) =>
      tx.rate.findFirstOrThrow({ where: { timeSlotId: bareSlotId } }),
    );
    expect(rate.timeSlotId).toBe(bareSlotId);
  });

  it('controllo: rimossa la Rate, il Settore torna cancellabile (il blocco era SOLO la FK di Rate)', async () => {
    await prisma.forTenant(s1, (tx) => tx.rate.delete({ where: { id: rateSectorId } }));
    await expect(
      prisma.forTenant(s1, (tx) => tx.sector.delete({ where: { id: bareSectorId } })),
    ).resolves.toBeDefined();
  });
});
