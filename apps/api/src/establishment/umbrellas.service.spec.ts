import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UmbrellasService } from './umbrellas.service';
import { TEST_TENANT as TENANT, fakeTenantPrisma, fakeTenantContext } from '../test/tenant-prisma';

function makeService() {
  const tx = {
    row: { findUnique: jest.fn() },
    umbrellaType: { findUnique: jest.fn() },
    umbrella: {
      findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), createManyAndReturn: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn(),
    },
    booking: { count: jest.fn(), groupBy: jest.fn() },
  };
  const prisma = fakeTenantPrisma(tx) as any;
  const tenant = fakeTenantContext() as any;
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

  it('create: il clash label ignora i ritirati (label riusabile)', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findFirst
      .mockResolvedValueOnce(null)                 // clash label: nessun attivo con questa etichetta
      .mockResolvedValueOnce({ logicalOrder: 4 });  // last in row
    tx.umbrella.create.mockResolvedValue({ id: 'n', label: '12', umbrellaTypeId: null, logicalOrder: 5 });
    await service.create({ rowId: 'r-1', label: '12', umbrellaTypeId: null });
    expect(tx.umbrella.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
    );
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

  it('update: il clash label ignora i ritirati (label riusabile)', async () => {
    const { service, tx } = makeService();
    tx.umbrella.findUnique.mockResolvedValue({ id: 'u', label: '1', umbrellaTypeId: null, logicalOrder: 1 });
    tx.umbrella.findFirst.mockResolvedValue(null); // clash label: nessun attivo con questa etichetta
    tx.umbrella.update.mockResolvedValue({ id: 'u', label: '2', umbrellaTypeId: null, logicalOrder: 1 });
    await service.update('u', { label: '2' });
    expect(tx.umbrella.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ retiredAt: null, id: { not: 'u' } }) }),
    );
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
    tx.umbrella.createManyAndReturn.mockResolvedValue([
      { id: 'n3', label: '3', umbrellaTypeId: null, logicalOrder: 6 },
      { id: 'n4', label: '4', umbrellaTypeId: null, logicalOrder: 7 },
      { id: 'n5', label: '5', umbrellaTypeId: null, logicalOrder: 8 },
    ]);
    const res = await service.generate({ rowId: 'r-1', prefix: '', start: 1, count: 5, umbrellaTypeId: null });
    expect(res).toEqual({ created: 3, skipped: 2, umbrellas: [
      { id: 'n3', label: '3', umbrellaTypeId: null },
      { id: 'n4', label: '4', umbrellaTypeId: null },
      { id: 'n5', label: '5', umbrellaTypeId: null },
    ] });
    expect(tx.umbrella.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.umbrella.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
      data: [
        expect.objectContaining({ establishmentId: TENANT, rowId: 'r-1', label: '3', logicalOrder: 6 }),
        expect.objectContaining({ establishmentId: TENANT, rowId: 'r-1', label: '4', logicalOrder: 7 }),
        expect.objectContaining({ establishmentId: TENANT, rowId: 'r-1', label: '5', logicalOrder: 8 }),
      ],
    }));
  });

  // Presidio di AUD-022. `generate` deve restare a un numero di round-trip COSTANTE in `count`:
  // il loop `create` per ombrellone ne faceva 506 al cap di 500, dentro una `forTenant` che non
  // passa `transactionOptions` e quindi eredita il timeout di default di Prisma (5000 ms).
  // Misurato con latenza iniettata: P2028 e rollback totale già a RTT 8 ms (ADR-0062).
  // Se qualcuno reintroduce il loop, questo test diventa rosso in entrambe le asserzioni.
  it('generate: una sola scrittura in batch anche al cap di 500, mai una create per ombrellone', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findMany.mockResolvedValue([]);
    tx.umbrella.findFirst.mockResolvedValue({ logicalOrder: 0 });
    tx.umbrella.createManyAndReturn.mockImplementation(({ data }: { data: { label: string; logicalOrder: number }[] }) =>
      Promise.resolve(data.map((d, i) => ({ id: `n${i}`, label: d.label, umbrellaTypeId: null, logicalOrder: d.logicalOrder }))),
    );
    const res = await service.generate({ rowId: 'r-1', prefix: 'A', start: 1, count: 500, umbrellaTypeId: null });
    expect(res.created).toBe(500);
    expect(tx.umbrella.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.umbrella.create).not.toHaveBeenCalled();
    // ⚠️ `logicalOrder` NON è nel DTO: `toStructureUmbrella` proietta solo id/label/umbrellaTypeId.
    // L'unico posto in cui è osservabile è l'argomento della scrittura, ed è lì che va asserito —
    // asserirlo su `res` sarebbe un test che guarda un campo inesistente e passa sempre.
    const [args] = tx.umbrella.createManyAndReturn.mock.calls[0] as [{ data: { label: string; logicalOrder: number }[] }];
    expect(args.data).toHaveLength(500);
    expect(args.data.map((d) => d.logicalOrder)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    expect(args.data.map((d) => d.label)).toEqual(Array.from({ length: 500 }, (_, i) => `A${i + 1}`));
    // …e l'ordine del DTO segue i candidati su tutte e 500 le righe, non solo agli estremi.
    expect(res.umbrellas.map((u) => u.label)).toEqual(args.data.map((d) => d.label));
  });

  // `createManyAndReturn` con `data: []` è un round-trip inutile: quando tutti i candidati
  // esistono già, `generate` non deve scrivere affatto.
  it('generate: nessuna scrittura se tutti i candidati esistono già', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findMany.mockResolvedValue([{ label: '1' }, { label: '2' }]);
    tx.umbrella.findFirst.mockResolvedValue({ logicalOrder: 9 });
    const res = await service.generate({ rowId: 'r-1', prefix: '', start: 1, count: 2, umbrellaTypeId: null });
    expect(res).toEqual({ created: 0, skipped: 2, umbrellas: [] });
    expect(tx.umbrella.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.umbrella.create).not.toHaveBeenCalled();
  });

  it('generate: 404 se la fila non è del tenant', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue(null);
    await expect(service.generate({ rowId: 'r-x', prefix: '', start: 1, count: 3, umbrellaTypeId: null })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generate: i candidati non collidono coi ritirati', async () => {
    const { service, tx } = makeService();
    tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
    tx.umbrella.findMany.mockResolvedValue([]);
    tx.umbrella.findFirst.mockResolvedValue({ logicalOrder: 0 });
    tx.umbrella.createManyAndReturn.mockResolvedValue([{ id: 'n1', label: '1', umbrellaTypeId: null, logicalOrder: 1 }]);
    const res = await service.generate({ rowId: 'r-1', prefix: '', start: 1, count: 1, umbrellaTypeId: null });
    expect(tx.umbrella.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
    );
    // Confine a UN solo elemento da creare: è l'unico punto in cui la guardia `toCreate.length > 0`
    // è osservabile. Senza queste due righe, mutarla in `> 1` lasciava verdi unit ed e2e, e il
    // generatore diventava muto proprio nel caso di rifinitura (una fila cui manca un ombrellone).
    expect(res).toEqual({ created: 1, skipped: 0, umbrellas: [{ id: 'n1', label: '1', umbrellaTypeId: null }] });
    expect(tx.umbrella.createManyAndReturn).toHaveBeenCalledTimes(1);
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

    it('deleted riflette il count reale di deleteMany: id spariti sotto race → saltati, non sovrastimati', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
      tx.booking.groupBy.mockResolvedValue([]);
      // u-2 eliminato da una richiesta concorrente tra findMany e deleteMany: il DB ne cancella 1 solo.
      tx.umbrella.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.bulkDelete({ ids: ['u-1', 'u-2'] });
      expect(res).toEqual({ deleted: 1, skipped: 1 });
    });

    it('opera solo sugli attivi: i ritirati sono esclusi dal lookup', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findMany.mockResolvedValue([]);
      tx.booking.groupBy.mockResolvedValue([]);
      await service.bulkDelete({ ids: ['u-1'] });
      expect(tx.umbrella.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
      );
    });
  });

  describe('bulkAssignType', () => {
    it('assegna la tipologia agli id del tenant e riporta il conteggio', async () => {
      const { service, tx } = makeService();
      tx.umbrellaType.findUnique.mockResolvedValue({ id: 'typ-1' });
      tx.umbrella.updateMany.mockResolvedValue({ count: 3 });
      const res = await service.bulkAssignType({ ids: ['u-1', 'u-2', 'u-3'], umbrellaTypeId: 'typ-1' });
      expect(tx.umbrella.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['u-1', 'u-2', 'u-3'] }, retiredAt: null }, data: { umbrellaTypeId: 'typ-1' },
      });
      expect(res).toEqual({ updated: 3 });
    });

    it('opera solo sugli attivi: i ritirati sono esclusi da updateMany', async () => {
      const { service, tx } = makeService();
      tx.umbrella.updateMany.mockResolvedValue({ count: 0 });
      await service.bulkAssignType({ ids: ['u-1'], umbrellaTypeId: null });
      expect(tx.umbrella.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ retiredAt: null }) }),
      );
    });

    it('null = Normale: nessuna validazione tipologia, updateMany con null', async () => {
      const { service, tx } = makeService();
      tx.umbrella.updateMany.mockResolvedValue({ count: 2 });
      const res = await service.bulkAssignType({ ids: ['u-1', 'u-2'], umbrellaTypeId: null });
      expect(tx.umbrellaType.findUnique).not.toHaveBeenCalled();
      expect(res).toEqual({ updated: 2 });
    });

    it('422 se la tipologia è estranea', async () => {
      const { service, tx } = makeService();
      tx.umbrellaType.findUnique.mockResolvedValue(null);
      await expect(service.bulkAssignType({ ids: ['u-1'], umbrellaTypeId: 'typ-x' }))
        .rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(tx.umbrella.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('retire/restore (D-055)', () => {
    it('retire: 409 se esistono prenotazioni confermate con endDate >= oggi', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: null, row: { label: 'F1', sector: { name: 'Centro' } } });
      tx.booking.count.mockResolvedValue(1);
      await expect(service.retire('u-1')).rejects.toBeInstanceOf(ConflictException);
      expect(tx.umbrella.update).not.toHaveBeenCalled();
    });

    it('retire: sgancia dalla fila, timbra retiredAt e salva lo snapshot posizione', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: null, row: { label: 'F1', sector: { name: 'Centro' } } });
      tx.booking.count.mockResolvedValue(0);
      tx.umbrella.update.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-22T10:00:00Z'), retiredFrom: 'Centro · F1' });
      const dto = await service.retire('u-1');
      expect(tx.umbrella.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ rowId: null, retiredFrom: 'Centro · F1', retiredAt: expect.any(Date) }),
      }));
      expect(dto.retiredFrom).toBe('Centro · F1');
    });

    it('retire: idempotente se già ritirato (nessun update, nessun 409)', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-01T00:00:00Z'), retiredFrom: 'Centro · F1', row: null });
      const dto = await service.retire('u-1');
      expect(tx.umbrella.update).not.toHaveBeenCalled();
      expect(dto.id).toBe('u-1');
    });

    it('restore: 409 se un ATTIVO ha già la stessa label', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: new Date() });
      tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
      tx.umbrella.findFirst.mockResolvedValue({ id: 'u-9' }); // clash attivo
      await expect(service.restore('u-1', { rowId: 'r-1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('restore: azzera retiredAt/retiredFrom, riaggancia alla fila scelta e ricalcola logicalOrder', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findUnique.mockResolvedValue({ id: 'u-1', label: '12', retiredAt: new Date() });
      tx.row.findUnique.mockResolvedValue({ id: 'r-1' });
      tx.umbrella.findFirst
        .mockResolvedValueOnce(null) // nessun clash attivo
        .mockResolvedValueOnce({ logicalOrder: 7 }); // nextLogicalOrder
      tx.umbrella.update.mockResolvedValue({ id: 'u-1', label: '12', umbrellaTypeId: null, logicalOrder: 8 });
      await service.restore('u-1', { rowId: 'r-1' });
      expect(tx.umbrella.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { retiredAt: null, retiredFrom: null, rowId: 'r-1', logicalOrder: 8 },
      }));
    });

    it('listRetired: filtra retiredAt not-null, ordina per retiredAt desc', async () => {
      const { service, tx } = makeService();
      tx.umbrella.findMany.mockResolvedValue([{ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: new Date('2026-07-22T10:00:00Z'), retiredFrom: 'Centro · F1' }]);
      const list = await service.listRetired();
      expect(tx.umbrella.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { retiredAt: { not: null } }, orderBy: { retiredAt: 'desc' },
      }));
      expect(list[0]).toEqual({ id: 'u-1', label: '12', umbrellaTypeId: null, retiredAt: '2026-07-22T10:00:00.000Z', retiredFrom: 'Centro · F1' });
    });
  });
});
