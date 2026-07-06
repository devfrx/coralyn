import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';

const TENANT = 't-1';

function makeService(overrides: {
  customer?: Partial<{ findFirst: jest.Mock; delete: jest.Mock; update: jest.Mock; findMany: jest.Mock }>;
  booking?: Partial<{ count: jest.Mock }>;
} = {}) {
  const customer = { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn(), findMany: jest.fn(), ...overrides.customer };
  const booking = { count: jest.fn(), ...overrides.booking };
  const tx = { customer, booking };
  const prisma = { forTenant: (_t: string, cb: (t: typeof tx) => unknown) => cb(tx) } as any;
  const tenant = { require: () => TENANT } as any;
  return { service: new CustomersService(prisma, tenant), customer, booking };
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
