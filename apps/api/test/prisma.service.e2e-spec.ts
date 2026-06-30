import { PrismaService } from '../src/prisma/prisma.service';

describe('PrismaService RLS isolation', () => {
  const prisma = new PrismaService();
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Gli Establishment NON sono tenant-scoped: creazione libera (registro tenant).
    s1 = (await prisma.establishment.create({ data: { name: 'Lido A' } })).id;
    s2 = (await prisma.establishment.create({ data: { name: 'Lido B' } })).id;
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
