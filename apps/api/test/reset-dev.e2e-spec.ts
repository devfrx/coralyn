import { PrismaClient } from '@prisma/client';
import {
  KEEP_LIST,
  assertResettableEnv,
  selectTablesToWipe,
  assertCoherence,
  resetTenantData,
} from '../prisma/reset-dev.core';

describe('reset-dev core — funzioni pure', () => {
  it('selectTablesToWipe rimuove la keep-list dalle forced', () => {
    expect(selectTablesToWipe(['Booking', 'User', 'Customer'], KEEP_LIST)).toEqual(['Booking', 'Customer']);
  });

  it('assertResettableEnv rifiuta NODE_ENV=production', () => {
    expect(() => assertResettableEnv('production', 'coralyn_dev')).toThrow(/production/);
  });

  it('assertResettableEnv rifiuta un DB che non è dev/test', () => {
    expect(() => assertResettableEnv('development', 'coralyn_prod')).toThrow(/non matcha/);
  });

  it('assertResettableEnv accetta dev', () => {
    expect(() => assertResettableEnv('development', 'coralyn_dev')).not.toThrow();
  });

  it('assertCoherence passa col carve-out di User (establishmentId ma non-RLS)', () => {
    expect(() =>
      assertCoherence(['Booking', 'Customer'], ['Booking', 'Customer', 'User'], KEEP_LIST),
    ).not.toThrow();
  });

  it('assertCoherence aborta se una tenant table (establishmentId) manca RLS FORCE', () => {
    expect(() => assertCoherence(['Booking'], ['Booking', 'Customer'], KEEP_LIST)).toThrow(
      /senza RLS FORCE.*Customer/,
    );
  });

  it('assertCoherence aborta se una forced non ha establishmentId', () => {
    expect(() => assertCoherence(['Booking', 'Weird'], ['Booking'], KEEP_LIST)).toThrow(
      /senza establishmentId.*Weird/,
    );
  });
});

describe('resetTenantData — integrazione (transazione con rollback, non distruttivo)', () => {
  const prisma = new PrismaClient();
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('TRUNCATE azzera le tenant e preserva User/Establishment (poi rollback)', async () => {
    const SENTINEL = new Error('rollback-sentinel');
    let report: Awaited<ReturnType<typeof resetTenantData>> | undefined;
    let customerAfter = -1;
    let establishmentAfter = -1;
    try {
      await prisma.$transaction(
        async (tx) => {
          // Seed nella tx: Establishment (non-RLS) + Customer (RLS → serve la GUC del tenant).
          const est = await tx.establishment.create({ data: { name: 'RESET TEST' } });
          await tx.$executeRaw`SELECT set_config('app.current_tenant', ${est.id}, true)`;
          await tx.customer.create({ data: { establishmentId: est.id, firstName: 'Del', lastName: 'Me' } });

          // Esegue il reset reale dentro la tx.
          report = await resetTenantData(tx, { dryRun: false });

          // Asserzioni dentro la tx, dopo il TRUNCATE.
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Customer"`;
          customerAfter = Number(n);
          const [{ e }] = await tx.$queryRaw<{ e: bigint }[]>`
            SELECT count(*) AS e FROM "Establishment" WHERE id = ${est.id}::uuid`;
          establishmentAfter = Number(e);

          throw SENTINEL; // forza il rollback: zero impatto sul DB condiviso
        },
        { timeout: 30000 },
      );
    } catch (err) {
      if (err !== SENTINEL) throw err;
    }

    expect(report?.tables).toContain('Customer');
    expect(report?.tables).not.toContain('User');
    expect(report?.tables).not.toContain('Establishment');
    expect(customerAfter).toBe(0); // TRUNCATE ha azzerato la tenant
    expect(establishmentAfter).toBe(1); // Establishment preservato
  });

  it('dry-run non trunca — Customer sopravvive, report.dryRun=true (poi rollback)', async () => {
    const SENTINEL = new Error('rollback-sentinel-dry-run');
    let report: Awaited<ReturnType<typeof resetTenantData>> | undefined;
    let customerAfter = -1;
    try {
      await prisma.$transaction(
        async (tx) => {
          // Seed nella tx: Establishment (non-RLS) + Customer (RLS → serve la GUC del tenant).
          const est = await tx.establishment.create({ data: { name: 'RESET DRY-RUN TEST' } });
          await tx.$executeRaw`SELECT set_config('app.current_tenant', ${est.id}, true)`;
          await tx.customer.create({ data: { establishmentId: est.id, firstName: 'Del', lastName: 'Me' } });

          // Esegue il reset in dry-run dentro la tx: nessun TRUNCATE deve avvenire.
          report = await resetTenantData(tx, { dryRun: true });

          // Asserzioni dentro la tx: il dry-run NON deve aver azzerato nulla.
          const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Customer"`;
          customerAfter = Number(n);

          throw SENTINEL; // forza il rollback: zero impatto sul DB condiviso
        },
        { timeout: 30000 },
      );
    } catch (err) {
      if (err !== SENTINEL) throw err;
    }

    expect(customerAfter).toBe(1); // dry-run non ha truncato: il Customer seedato sopravvive
    expect(report?.dryRun).toBe(true);
    expect(report?.tables).toContain('Customer');
  });
});
