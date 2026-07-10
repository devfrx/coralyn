import { ConflictException, NotFoundException } from '@nestjs/common';
import { RowsService } from './rows.service';

const TENANT = 't-1';

function makeService() {
  const tx = {
    sector: { findUnique: jest.fn() },
    row: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    umbrella: { count: jest.fn() },
    rate: { count: jest.fn() },
  };
  const prisma = { forTenant: (_t: string, cb: (tx: unknown) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new RowsService(prisma, tenant), tx };
}

describe('RowsService', () => {
  it('create: 404 se il settore non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue(null);
    await expect(service.create({ sectorId: 's-x', label: 'Fila 1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.row.create).not.toHaveBeenCalled();
  });

  it('create: append nel settore con establishmentId e sortOrder = max+1', async () => {
    const { service, tx } = makeService();
    tx.sector.findUnique.mockResolvedValue({ id: 's-1' });
    tx.row.findFirst.mockResolvedValue({ sortOrder: 2 }); // nextSortOrder nel settore
    tx.row.create.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 3, umbrellas: [] });
    const res = await service.create({ sectorId: 's-1', label: '  Fila 1  ' });
    expect(tx.row.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { establishmentId: TENANT, sectorId: 's-1', label: 'Fila 1', sortOrder: 3 },
    }));
    expect(res).toEqual({ id: 'r', label: 'Fila 1', sortOrder: 3, umbrellas: [] });
  });

  it('update: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { label: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 404 se assente', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: 409 con messaggio sui soli ombrelloni se ne contiene (non nomina le tariffe)', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(4);
    tx.rate.count.mockResolvedValue(0);
    await expect(service.remove('r')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('r')).rejects.toThrow('La fila contiene ombrelloni: eliminali prima.');
    expect(tx.row.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 con messaggio sulle sole tariffe se referenziata da tariffe (non nomina gli ombrelloni)', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(1);
    await expect(service.remove('r')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('r')).rejects.toThrow('La fila è usata da tariffe: rimuovile prima.');
    expect(tx.row.delete).not.toHaveBeenCalled();
  });

  it('remove: 409 con messaggio combinato se ha sia ombrelloni sia tariffe', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(4);
    tx.rate.count.mockResolvedValue(1);
    await expect(service.remove('r')).rejects.toThrow(
      'La fila contiene ombrelloni ed è usata da tariffe: elimina gli ombrelloni e rimuovi le tariffe prima.',
    );
    expect(tx.row.delete).not.toHaveBeenCalled();
  });

  it('remove: elimina se vuota e senza tariffe', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    tx.umbrella.count.mockResolvedValue(0);
    tx.rate.count.mockResolvedValue(0);
    const res = await service.remove('r');
    expect(tx.row.delete).toHaveBeenCalledWith({ where: { id: 'r' } });
    expect(res).toEqual({ id: 'r', label: 'Fila 1', sortOrder: 1, umbrellas: [] });
  });
});
