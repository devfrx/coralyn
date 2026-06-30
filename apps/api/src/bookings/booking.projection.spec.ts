import { Prisma } from '@prisma/client';
import { toBookingDTO } from './booking.projection';

const row = {
  id: 'b1',
  establishmentId: 'e1',
  customerId: 'c1',
  umbrellaId: 'u1',
  timeSlotId: 's1',
  previousBookingId: null,
  startDate: new Date('2026-07-15T00:00:00Z'),
  endDate: new Date('2026-07-15T00:00:00Z'),
  type: 'daily' as const,
  status: 'confirmed' as const,
  totalPrice: new Prisma.Decimal('28.00'),
  extras: null,
  paymentStatus: 'unpaid' as const,
  amountCollected: new Prisma.Decimal('0'),
  paymentMethod: null,
  collectionDate: null,
  createdAt: new Date(),
};

describe('toBookingDTO', () => {
  it('mappa date in yyyy-mm-dd e Decimal in number', () => {
    const dto = toBookingDTO(row);
    expect(dto).toEqual({
      id: 'b1', customerId: 'c1', umbrellaId: 'u1', timeSlotId: 's1',
      startDate: '2026-07-15', endDate: '2026-07-15',
      type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0,
    });
  });

  it('mappa paymentMethod/collectionDate quando valorizzati', () => {
    const dto = toBookingDTO({
      ...row,
      paymentStatus: 'paid' as const,
      amountCollected: new Prisma.Decimal('28.00'),
      paymentMethod: 'cash' as const,
      collectionDate: new Date('2026-07-15T00:00:00Z'),
    });
    expect(dto.paymentMethod).toBe('cash');
    expect(dto.collectionDate).toBe('2026-07-15');
  });

  it('mappa null → undefined per paymentMethod/collectionDate', () => {
    const dto = toBookingDTO(row);
    expect(dto.paymentMethod).toBeUndefined();
    expect(dto.collectionDate).toBeUndefined();
  });
});
