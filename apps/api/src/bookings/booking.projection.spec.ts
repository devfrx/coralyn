import { Prisma } from '@prisma/client';
import { toBookingDTO } from './booking.projection';

const terminatedBase = {
  id: 'b1', establishmentId: 'e1', customerId: 'c1', umbrellaId: 'u1', timeSlotId: 's1',
  previousBookingId: null, packageId: null,
  startDate: new Date('2026-05-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z'),
  type: 'subscription' as const, status: 'confirmed' as const,
  totalPrice: new Prisma.Decimal('800'), extras: null, paymentStatus: 'paid' as const,
  amountCollected: new Prisma.Decimal('800'), paymentMethod: null, collectionDate: null,
  createdAt: new Date('2026-05-01T10:00:00Z'),
  terminatedAt: new Date('2026-06-20T09:30:00Z'), terminationReason: 'Trasloco',
  refundedAmount: new Prisma.Decimal('250'),
};

const row = {
  id: 'b1',
  establishmentId: 'e1',
  customerId: 'c1',
  umbrellaId: 'u1',
  timeSlotId: 's1',
  previousBookingId: null,
  packageId: null,
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
  terminatedAt: null,
  terminationReason: null,
  refundedAmount: new Prisma.Decimal('0'),
};

describe('toBookingDTO', () => {
  it('mappa date in yyyy-mm-dd e Decimal in number', () => {
    const dto = toBookingDTO(row);
    expect(dto).toEqual({
      id: 'b1', customerId: 'c1', umbrellaId: 'u1', timeSlotId: 's1',
      startDate: '2026-07-15', endDate: '2026-07-15',
      type: 'daily', status: 'confirmed', totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0,
      refundedAmount: 0,
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

  it('mappa packageId quando valorizzato e null → undefined', () => {
    expect(toBookingDTO({ ...row, packageId: 'pkg-1' }).packageId).toBe('pkg-1');
    expect(toBookingDTO(row).packageId).toBeUndefined();
  });

  it('mappa previousBookingId quando valorizzato e null → undefined', () => {
    expect(toBookingDTO({ ...row, previousBookingId: 'prev-1' }).previousBookingId).toBe('prev-1');
    expect(toBookingDTO(row).previousBookingId).toBeUndefined();
  });
});

describe('toBookingDTO — campi disdetta (D-013)', () => {
  it('mappa terminatedAt (ISO), terminationReason e refundedAmount (Decimal→number)', () => {
    const dto = toBookingDTO(terminatedBase);
    expect(dto.refundedAmount).toBe(250);
    expect(dto.terminatedAt).toBe('2026-06-20T09:30:00.000Z');
    expect(dto.terminationReason).toBe('Trasloco');
  });

  it('non disdetto: terminatedAt/reason assenti, refundedAmount 0', () => {
    const dto = toBookingDTO({
      ...terminatedBase, terminatedAt: null, terminationReason: null, refundedAmount: new Prisma.Decimal('0'),
    });
    expect(dto.terminatedAt).toBeUndefined();
    expect(dto.terminationReason).toBeUndefined();
    expect(dto.refundedAmount).toBe(0);
  });
});
