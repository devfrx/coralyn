import { toCustomerBookingDTO, resolveSeasonName } from './customer-booking.projection';
import type { Booking } from '@prisma/client';

function bookingRow(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    establishmentId: 't1',
    customerId: 'c1',
    umbrellaId: 'u1',
    timeSlotId: 's1',
    previousBookingId: null,
    packageId: null,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-01'),
    type: 'daily',
    status: 'confirmed',
    totalPrice: { toString: () => '30' } as unknown as Booking['totalPrice'],
    extras: null,
    paymentStatus: 'unpaid',
    amountCollected: { toString: () => '0' } as unknown as Booking['amountCollected'],
    paymentMethod: null,
    collectionDate: null,
    createdAt: new Date('2026-07-01'),
    slotStartMin: 0,
    slotEndMin: 0,
    terminatedAt: null,
    terminationReason: null,
    refundedAmount: { toString: () => '0' } as unknown as Booking['refundedAmount'],
    ...over,
  } as Booking;
}

describe('toCustomerBookingDTO', () => {
  it('mappa i campi base + arricchimenti, omette customerId', () => {
    const dto = toCustomerBookingDTO(bookingRow(), {
      umbrellaLabel: 'A12',
      seasonName: 'Estate 2026',
    });
    expect(dto).toMatchObject({
      id: 'b1',
      umbrellaId: 'u1',
      type: 'daily',
      totalPrice: 30,
      amountCollected: 0,
      umbrellaLabel: 'A12',
      seasonName: 'Estate 2026',
    });
    expect('customerId' in dto).toBe(false);
    expect(dto.seniority).toBeUndefined();
    expect(dto.renewed).toBeUndefined();
    expect(dto.prelazione).toBeUndefined();
  });

  it('valorizza seniority/renewed per una subscription', () => {
    const dto = toCustomerBookingDTO(bookingRow({ type: 'subscription' }), {
      umbrellaLabel: 'A12',
      seniority: 3,
      renewed: true,
    });
    expect(dto.type).toBe('subscription');
    expect(dto.seniority).toBe(3);
    expect(dto.renewed).toBe(true);
  });

  it('valorizza packageName e sectorName quando presenti', () => {
    const dto = toCustomerBookingDTO(bookingRow(), {
      umbrellaLabel: 'A12',
      sectorName: 'Centro',
      packageName: 'Comfort',
    });
    expect(dto.sectorName).toBe('Centro');
    expect(dto.packageName).toBe('Comfort');
  });

  it('omette packageName se assente (booking senza pacchetto)', () => {
    const dto = toCustomerBookingDTO(bookingRow(), { umbrellaLabel: 'A12', sectorName: 'Centro' });
    expect(dto.packageName).toBeUndefined();
    expect(dto.sectorName).toBe('Centro');
  });

  it('mappa i campi disdetta (refundedAmount, terminatedAt ISO, terminationReason)', () => {
    const dto = toCustomerBookingDTO(
      bookingRow({
        type: 'subscription',
        terminatedAt: new Date('2026-06-20T09:30:00Z'),
        terminationReason: 'Trasloco',
        refundedAmount: { toString: () => '250' } as unknown as Booking['refundedAmount'],
      }),
      { umbrellaLabel: 'A12' },
    );
    expect(dto.refundedAmount).toBe(250);
    expect(dto.terminatedAt).toBe('2026-06-20T09:30:00.000Z');
    expect(dto.terminationReason).toBe('Trasloco');
  });

  it('non disdetto: terminatedAt/reason assenti, refundedAmount 0', () => {
    const dto = toCustomerBookingDTO(bookingRow(), { umbrellaLabel: 'A12' });
    expect(dto.terminatedAt).toBeUndefined();
    expect(dto.terminationReason).toBeUndefined();
    expect(dto.refundedAmount).toBe(0);
  });
});

describe('resolveSeasonName', () => {
  const seasons = [
    { name: 'Estate 2026', startDate: new Date('2026-06-01'), endDate: new Date('2026-09-15') },
    { name: 'Estate 2027', startDate: new Date('2027-05-01'), endDate: new Date('2027-09-30') },
  ];
  it('ritorna la stagione che contiene la data', () => {
    expect(resolveSeasonName(seasons, new Date('2026-07-10'))).toBe('Estate 2026');
  });
  it('ritorna undefined fuori stagione', () => {
    expect(resolveSeasonName(seasons, new Date('2026-01-01'))).toBeUndefined();
  });
  it('su stagioni sovrapposte sceglie quella con startDate più recente', () => {
    const overlap = [
      { name: 'Vecchia', startDate: new Date('2026-06-01'), endDate: new Date('2026-09-30') },
      { name: 'Nuova', startDate: new Date('2026-07-01'), endDate: new Date('2026-08-31') },
    ];
    expect(resolveSeasonName(overlap, new Date('2026-07-15'))).toBe('Nuova');
  });
});
