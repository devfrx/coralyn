import { PrismaService } from '../src/prisma/prisma.service';

describe('PrismaService RLS isolation', () => {
  const prisma = new PrismaService();
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Gli Stabilimento NON sono tenant-scoped: creazione libera (registro tenant).
    s1 = (await prisma.stabilimento.create({ data: { nome: 'Lido A' } })).id;
    s2 = (await prisma.stabilimento.create({ data: { nome: 'Lido B' } })).id;
    await prisma.forTenant(s1, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: s1, nome: 'Mario', cognome: 'Rossi' } }),
    );
    await prisma.forTenant(s2, (tx) =>
      tx.cliente.create({ data: { stabilimentoId: s2, nome: 'Anna', cognome: 'Verdi' } }),
    );
  });

  afterAll(async () => {
    await prisma.forTenant(s1, (tx) => tx.cliente.deleteMany({}));
    await prisma.forTenant(s2, (tx) => tx.cliente.deleteMany({}));
    await prisma.stabilimento.deleteMany({ where: { id: { in: [s1, s2] } } });
    await prisma.$disconnect();
  });

  it('un tenant vede solo i propri clienti', async () => {
    const clientiS1 = await prisma.forTenant(s1, (tx) => tx.cliente.findMany());
    expect(clientiS1).toHaveLength(1);
    expect(clientiS1[0].nome).toBe('Mario');
  });

  it('senza tenant impostato non vede nulla', async () => {
    const clienti = await prisma.cliente.findMany();
    expect(clienti).toHaveLength(0);
  });
});
