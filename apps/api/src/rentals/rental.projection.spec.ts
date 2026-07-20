import { rentalStatus, toRentalDTO, computeAvailability } from './rental.projection';

const row = {
  id: 'x1', rentalItemId: 'i1', rentalTariffId: 'r1', customerId: null,
  units: 2, startAt: new Date('2026-07-20T10:00:00Z'), returnedAt: null, cancelledAt: null,
  totalPrice: { toString: () => '16' }, paymentStatus: 'unpaid',
  amountCollected: { toString: () => '0' }, paymentMethod: null, collectionDate: null,
  rentalItem: { name: 'Pedalò' }, rentalTariff: { label: '1 ora' }, customer: null,
};

describe('rentalStatus', () => {
  it('cancelled > returned > active', () => {
    expect(rentalStatus({ cancelledAt: new Date(), returnedAt: new Date() } as never)).toBe('cancelled');
    expect(rentalStatus({ cancelledAt: null, returnedAt: new Date() } as never)).toBe('returned');
    expect(rentalStatus({ cancelledAt: null, returnedAt: null } as never)).toBe('active');
  });
});
describe('toRentalDTO', () => {
  it('risolve nomi/stato, Decimal→number, date→ISO', () => {
    expect(toRentalDTO(row as never)).toMatchObject({
      rentalItemName: 'Pedalò', tariffLabel: '1 ora', customerName: null,
      units: 2, status: 'active', totalPrice: 16, amountCollected: 0, startAt: '2026-07-20T10:00:00.000Z',
    });
  });
});
describe('computeAvailability', () => {
  it('stock null→available null; out>stock→clamp 0', () => {
    expect(computeAvailability({ id: 'i1', stock: null } as never, 3)).toEqual({ rentalItemId: 'i1', stock: null, out: 3, available: null });
    expect(computeAvailability({ id: 'i1', stock: 2 } as never, 5)).toEqual({ rentalItemId: 'i1', stock: 2, out: 5, available: 0 });
    expect(computeAvailability({ id: 'i1', stock: 5 } as never, 2)).toEqual({ rentalItemId: 'i1', stock: 5, out: 2, available: 3 });
  });
});
