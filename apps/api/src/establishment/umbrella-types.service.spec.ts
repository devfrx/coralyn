import { ConflictException, NotFoundException } from '@nestjs/common';
import { UmbrellaTypesService } from './umbrella-types.service';

const TENANT = 't-1';

function makeService(txOverrides: Record<string, jest.Mock> = {}) {
  const tx = {
    umbrellaType: {
      findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    umbrella: { count: jest.fn() },
    ...txOverrides,
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new UmbrellaTypesService(prisma, tenant), tx };
}

describe('UmbrellaTypesService', () => {
  it('create: 409 se il nome esiste già', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findFirst.mockResolvedValue({ id: 'x' });
    await expect(service.create({ name: 'Palma', icon: 'palmtree' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrellaType.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findFirst
      .mockResolvedValueOnce(null) // clash check
      .mockResolvedValueOnce({ sortOrder: 4 }); // nextSortOrder
    tx.umbrellaType.create.mockResolvedValue({ id: 'n', name: 'Palma', sortOrder: 5, icon: 'palmtree' });
    const res = await service.create({ name: 'Palma', icon: 'palmtree' });
    expect(tx.umbrellaType.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, name: 'Palma', icon: 'palmtree', sortOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', name: 'Palma', sortOrder: 5, icon: 'palmtree' });
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se assegnata a ombrelloni', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
    tx.umbrella.count.mockResolvedValue(3);
    await expect(service.remove('t')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrellaType.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se non in uso e ritorna il DTO', async () => {
    const { service, tx } = makeService();
    tx.umbrellaType.findUnique.mockResolvedValue({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
    tx.umbrella.count.mockResolvedValue(0);
    const res = await service.remove('t');
    expect(tx.umbrellaType.delete).toHaveBeenCalledWith({ where: { id: 't' } });
    expect(res).toEqual({ id: 't', name: 'Palma', sortOrder: 1, icon: 'palmtree' });
  });
});
