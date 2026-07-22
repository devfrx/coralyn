import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UmbrellasService } from './umbrellas.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    row: { findUnique: jest.fn() },
    umbrellaType: { findUnique: jest.fn() },
    umbrella: {
      findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
    },
    booking: { count: jest.fn(), groupBy: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new UmbrellasService(prisma, tenant), tx };
}

describe('UmbrellasService', () => {
  it('create: 404 se la fila non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.create({ rowId: 'r-x', label: '1', umbrellaTypeId: null })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: 422 se la tipologia è estranea', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.create({ rowId: 'r-1', label: '1', umbrellaTypeId: 'typ-x' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: 409 se l’etichetta esiste già', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findFirst.mockResolvedValueOnce({ id: 'dup' }); // clash label
    await expect(service.create({ rowId: 'r-1', label: '1', umbrellaTypeId: null })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId e logicalOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findFirst
      .mockResolvedValueOnce(null)              // clash label
      .mockResolvedValueOnce({ logicalOrder: 4 }); // last in row
    tx.umbrella.create.mockResolvedValue({ id: 'n', label: '  5  ', umbrellaTypeId: null, logicalOrder: 5 });
    const res = await service.create({ rowId: 'r-1', label: '  5  ', umbrellaTypeId: null });
    expect(tx.umbrella.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, rowId: 'r-1', umbrellaTypeId: null, label: '5', logicalOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', label: '  5  ', umbrellaTypeId: null });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: 409 etichetta duplicata', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.umbrella.findFirst.mockResolvedValue({ id: 'other' });
    await expect(service.update('u', { label: '2' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('update: 422 tipologia estranea', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.umbrellaType.findUnique.mockResolvedValue(null);
    await expect(service.update('u', { umbrellaTypeId: 'typ-x' })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 se ha prenotazioni', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.booking.count.mockResolvedValue(2);
    await expect(service.remove('u')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.umbrella.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se senza prenotazioni', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: 't1', logicalOrder: 1 });
    tx.booking.count.mockResolvedValue(0);
    const res = await service.remove('u');
    expect(tx.umbrella.delete).toHaveBeenCalledWith({ where: { id: 'u' } });
    expect(res).toEqual({ id: 'u', label: '1', umbrellaTypeId: 't1' });
  });

  it('generate: salta le esistenti e crea le nuove con logicalOrder progressivo', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findMany.mockResolvedValue([{ label: '1' }, { label: '2' }]); // esistenti fra i candidati
    tx.umbrella.findFirst.mockResolvedValue({ logicalOrder: 5 });               // last in row
    tx.umbrella.create
      .mockResolvedValueOnce({ id: 'n3', label: '3', umbrellaTypeId: null, logicalOrder: 6 })
      .mockResolvedValueOnce({ id: 'n4', label: '4', umbrellaTypeId: null, logicalOrder: 7 })
      .mockResolvedValueOnce({ id: 'n5', label: '5', umbrellaTypeId: null, logicalOrder: 8 });
    const res = await service.generate({ rowId: 'r-1', prefix: '', start: 1, count: 5, umbrellaTypeId: null });
    expect(res).toEqual({ created: 3, skipped: 2, umbrellas: [
      { id: 'n3', label: '3', umbrellaTypeId: null },
      { id: 'n4', label: '4', umbrellaTypeId: null },
      { id: 'n5', label: '5', umbrellaTypeId: null },
    ] });
    expect(tx.umbrella.create).toHaveBeenCalledTimes(3);
    expect(tx.umbrella.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ establishmentId: TENANT, rowId: 'r-1', label: '3', logicalOrder: 6 }),
    }));
  });

  it('generate: 404 se la fila non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.generate({ rowId: 'r-x', prefix: '', start: 1, count: 3, umbrellaTypeId: null })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('bulkDelete', () => {
    it('elimina i non prenotati, salta i protetti e gli id estranei', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]); // u-3 estraneo/altro tenant: non trovato
      tx.booking.groupBy.mockResolvedValue([{ umbrellaId: 'u-2' }]);          // u-2 protetto da prenotazioni
      tx.umbrella.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.bulkDelete({ ids: ['u-1', 'u-2', 'u-3'] });
      expect(tx.umbrella.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1'] } } });
      expect(res).toEqual({ deleted: 1, skipped: 2 });
    });

    it('nessun eliminabile → deleteMany NON viene chiamato', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }]);
      tx.booking.groupBy.mockResolvedValue([{ umbrellaId: 'u-1' }]);
      const res = await service.bulkDelete({ ids: ['u-1'] });
      expect(tx.umbrella.deleteMany).not.toHaveBeenCalled();
      expect(res).toEqual({ deleted: 0, skipped: 1 });
    });
  });
});
