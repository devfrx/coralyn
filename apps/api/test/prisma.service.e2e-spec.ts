import { PrismaService } from '../src/prisma/prisma.service';
import type { TenantId } from '../src/tenant/tenant-id';
import { createEstablishment } from './helpers/create-establishment';

describe('PrismaService RLS isolation', () => {
  const prisma = new PrismaService();
  let s1: TenantId;
  let s2: TenantId;

  beforeAll(async () => {
    await prisma.$connect();
    // Gli Establishment NON sono tenant-scoped: creazione libera (registro tenant).
    s1 = await createEstablishment(prisma, 'Lido A');
    s2 = await createEstablishment(prisma, 'Lido B');
    await prisma.forTenant(s1, (tx) =>
      tx.customer.create({ data: { establishmentId: s1, firstName: 'Mario', lastName: 'Rossi' } }),
    );
    await prisma.forTenant(s2, (tx) =>
      tx.customer.create({ data: { establishmentId: s2, firstName: 'Anna', lastName: 'Verdi' } }),
    );
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.customer.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.customer.deleteMany({}));
    await prisma.establishment.deleteMany({ where: { id: { in: [s1, s2] } } });
    await prisma.$disconnect();
  });

  it('un tenant vede solo i propri clienti', async () => {
    const customersS1 = await prisma.forTenant(s1, (tx) => tx.customer.findMany());
    expect(customersS1).toHaveLength(1);
    expect(customersS1[0].firstName).toBe('Mario');
  });

  it('senza tenant impostato non vede nulla', async () => {
    const customers = await prisma.customer.findMany();
    expect(customers).toHaveLength(0);
  });
});
