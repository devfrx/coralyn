import { Prisma } from '@prisma/client';
import { isBookingOverlapExclusion } from './booking.errors';

describe('isBookingOverlapExclusion', () => {
  it('riconosce una violazione del constraint booking_no_overlap (per nome constraint nel messaggio)', () => {
    const e = new Prisma.PrismaClientUnknownRequestError(
      'raw query failed. code: `23P01`. message: `conflicting key value violates exclusion constraint "booking_no_overlap"`',
      { clientVersion: '5.20.0' },
    );
    expect(isBookingOverlapExclusion(e)).toBe(true);
  });

  it('NON scatta su un 23P01 di un altro exclusion constraint (nessun nome booking_no_overlap)', () => {
    const e = new Prisma.PrismaClientUnknownRequestError('… code: 23P01 …', { clientVersion: '5.20.0' });
    expect(isBookingOverlapExclusion(e)).toBe(false);
  });

  it('NON scatta su una unique violation (23505 / P2002)', () => {
    const e = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.20.0',
    });
    expect(isBookingOverlapExclusion(e)).toBe(false);
  });

  it('NON scatta su un errore generico', () => {
    expect(isBookingOverlapExclusion(new Error('boom'))).toBe(false);
    expect(isBookingOverlapExclusion(null)).toBe(false);
  });
});
