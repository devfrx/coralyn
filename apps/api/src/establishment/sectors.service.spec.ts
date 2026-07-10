import { ConflictException, NotFoundException } from '@nestjs/common';
import { SectorsService } from './sectors.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    sector: {
      findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    },
    row: { count: jest.fn() },
    rate: { count: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new SectorsService(prisma, tenant), tx };
}

describe('SectorsService', () => {
  it('create: 409 se il nome esiste già (case-insensitive)', async () => {
    const { service, tx } = makeService();
    tx.sector.findFirst.mockResolvedValue({ id: 'x' });
    await expect(service.create({ name: 'Centro', kind: 'grid' })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sector.create).not.toHaveBeenCalled();
  });

  it('create: append con establishmentId, kind e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.sector.findFirst
      .mockResolvedValueOnce(null)            // clash check
      .mockResolvedValueOnce({ sortOrder: 4 }); // nextSortOrder
    tx.sector.create.mockResolvedValue({ id: 'n', name: 'Centro', sortOrder: 5, kind: 'grid', rows: [] });
    const res = await service.create({ name: '  Centro  ', kind: 'grid' });
    expect(tx.sector.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, name: 'Centro', kind: 'grid', sortOrder: 5 },
    }));
    expect(res).toEqual({ id: 'n', name: 'Centro', sortOrder: 5, kind: 'grid', rows: [] });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: rinomina e ritorna il DTO proiettato', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid' });
    tx.sector.findFirst.mockResolvedValue(null); // no clash
    tx.sector.update.mockResolvedValue({ id: 's', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
    const res = await service.update('s', { name: 'Centro Mare' });
    expect(res).toEqual({ id: 's', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 con messaggio sulle sole file se contiene file (non nomina le tariffe)', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(2);
    tx.rate.count.mockResolvedValue(0);
    await expect(service.remove('s')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('s')).rejects.toThrow('Il settore contiene delle file: eliminale prima.');
    expect(tx.sector.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 con messaggio sulle sole tariffe se referenziato da tariffe (non nomina le file)', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(3);
    await expect(service.remove('s')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('s')).rejects.toThrow('Il settore è usato da tariffe: rimuovile prima.');
    expect(tx.sector.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 con messaggio combinato se ha sia file sia tariffe', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(2);
    tx.rate.count.mockResolvedValue(3);
    await expect(service.remove('s')).rejects.toThrow(
      'Il settore contiene file ed è usato da tariffe: elimina le file e rimuovi le tariffe prima.',
    );
    expect(tx.sector.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se vuoto e senza tariffe, ritorna il DTO', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    tx.row.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(0);
    const res = await service.remove('s');
    expect(tx.sector.delete).toHaveBeenCalledWith({ where: { id: 's' } });
    expect(res).toEqual({ id: 's', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
  });
});
