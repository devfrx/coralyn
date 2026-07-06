import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

const TENANT = 't-1';

function makeService(overrides: {
  customer?: Partial<{ findFirst: jest.Mock; delete: jest.Mock; update: jest.Mock; findMany: jest.Mock }>;
  booking?: Partial<{ count: jest.Mock; findMany: jest.Mock }>;
  renewalCampaign?: Partial<{ findMany: jest.Mock }>;
  season?: Partial<{ findFirst: jest.Mock }>;
} = {}) {
  const customer = { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn(), findMany: jest.fn(), ...overrides.customer };
  const booking = { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]), ...overrides.booking };
  const renewalCampaign = { findMany: jest.fn().mockResolvedValue([]), ...overrides.renewalCampaign };
  const season = { findFirst: jest.fn(), ...overrides.season };
  const tx = { customer, booking, renewalCampaign, season };
  const prisma = { forTenant: (_t: string, cb: (t: typeof tx) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new CustomersService(prisma, tenant), customer, booking, renewalCampaign, season };
}

describe('CustomersService.remove', () => {
  it('404 se il cliente non è nel tenant', async () => {
    const { service, customer } = makeService();
    customer.findFirst.mockResolvedValue(null);
    await expect(service.remove('c-x', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('DELETE reale se il cliente non ha prenotazioni', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(0); // conteggio totale
    const res = await service.remove('c-1', 'admin-1');
    expect(customer.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(customer.update).not.toHaveBeenCalled();
    expect(res).toEqual({ outcome: 'deleted' });
  });

  it('409 se ha una prenotazione attiva/futura', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1); // totale, poi attive/future
    await expect(service.remove('c-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(customer.delete).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('409 se il cliente ha una prelazione di rinnovo APERTA (campagna attiva + abbonamento origine confirmed, nessun rinnovo)', async () => {
    const { service, customer, booking, renewalCampaign, season } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0); // totale, poi 0 attive/future
    renewalCampaign.findMany.mockResolvedValue([
      { id: 'camp-1', originSeasonId: 'origin-1', destinationSeasonId: 'dest-1', deadline: new Date('2099-12-31T00:00:00Z') },
    ]);
    season.findFirst
      .mockResolvedValueOnce({ id: 'origin-1', startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') })
      .mockResolvedValueOnce({ id: 'dest-1', startDate: new Date('2027-05-01T00:00:00Z'), endDate: new Date('2027-09-30T00:00:00Z') });
    booking.findMany.mockResolvedValue([
      {
        id: 'b-origin-1',
        customerId: 'c-1',
        status: 'confirmed',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-09-30T00:00:00Z'),
        renewals: [],
      },
    ]);

    let error: unknown;
    try {
      await service.remove('c-1', 'admin-1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      'Il cliente ha una prelazione di rinnovo aperta: chiudi la campagna o attendine la scadenza prima di rimuovere i dati.',
    );
    expect(customer.delete).not.toHaveBeenCalled();
    expect(customer.update).not.toHaveBeenCalled();
  });

  it('NON blocca se la finestra è EXERCISED (un rinnovo confirmed copre la stagione destinazione)', async () => {
    const { service, customer, booking, renewalCampaign, season } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    renewalCampaign.findMany.mockResolvedValue([
      { id: 'camp-1', originSeasonId: 'origin-1', destinationSeasonId: 'dest-1', deadline: new Date('2099-12-31T00:00:00Z') },
    ]);
    season.findFirst
      .mockResolvedValueOnce({ id: 'origin-1', startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') })
      .mockResolvedValueOnce({ id: 'dest-1', startDate: new Date('2027-05-01T00:00:00Z'), endDate: new Date('2027-09-30T00:00:00Z') });
    booking.findMany.mockResolvedValue([
      {
        id: 'b-origin-1',
        customerId: 'c-1',
        status: 'confirmed',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-09-30T00:00:00Z'),
        renewals: [
          { status: 'confirmed', startDate: new Date('2027-05-01T00:00:00Z'), endDate: new Date('2027-09-30T00:00:00Z') },
        ],
      },
    ]);

    const res = await service.remove('c-1', 'admin-1');
    expect(res).toEqual({ outcome: 'anonymized' });
    expect(customer.update).toHaveBeenCalled();
  });

  it('anonimizza (scrub + anonymizedAt/By) se ha solo prenotazioni passate/cancellate', async () => {
    const { service, customer, booking } = makeService();
    customer.findFirst.mockResolvedValue({ id: 'c-1' });
    booking.count.mockResolvedValueOnce(2).mockResolvedValueOnce(0); // totale, poi 0 attive
    const res = await service.remove('c-1', 'admin-1');
    expect(customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c-1' },
      data: expect.objectContaining({
        firstName: 'Cliente', lastName: 'rimosso', phone: null, email: null, notes: null,
        anonymizedBy: 'admin-1',
      }),
    }));
    const arg = customer.update.mock.calls[0][0];
    expect(arg.data.anonymizedAt).toBeInstanceOf(Date);
    expect(res).toEqual({ outcome: 'anonymized' });
  });
});

describe('CustomersService.list', () => {
  it('esclude gli anonimizzati (where anonymizedAt null)', async () => {
    const { service, customer } = makeService();
    customer.findMany.mockResolvedValue([]);
    await service.list();
    expect(customer.findMany).toHaveBeenCalledWith({ where: { anonymizedAt: null } });
  });
});
