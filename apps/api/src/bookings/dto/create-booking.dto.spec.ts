import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBookingDto } from './create-booking.dto';

// id sintetici ma canonici, come quelli del seed di sviluppo (e del tenant 00000000-...-0001):
// Postgres li accetta come `uuid`, ma non rispettano version/variant RFC-4122.
const SEED_UMBRELLA = '50000000-0000-0000-0000-000000000001';
const SEED_SLOT = '20000000-0000-0000-0000-000000000001';
const REAL_V4 = '7d9c1f2e-1a2b-4c3d-8e4f-0123456789ab';

const base = {
  customerId: REAL_V4,
  umbrellaId: SEED_UMBRELLA,
  timeSlotId: SEED_SLOT,
  date: '2026-08-20',
  totalPrice: 20,
};

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(CreateBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('CreateBookingDto', () => {
  it('accetta gli UUID canonici del seed (non-v4)', async () => {
    expect(await errorsFor(base)).toEqual([]);
  });

  it('accetta UUID v4 reali', async () => {
    expect(await errorsFor({ ...base, umbrellaId: REAL_V4, timeSlotId: REAL_V4 })).toEqual([]);
  });

  it('rifiuta id non UUID-shaped (evita 500 da cast Postgres)', async () => {
    const errs = await errorsFor({ ...base, umbrellaId: 'not-a-uuid' });
    expect(errs).toContain('umbrellaId');
  });

  it('rifiuta prezzo negativo e data non calendariale', async () => {
    const errs = await errorsFor({ ...base, totalPrice: -1, date: '2026-13-40' });
    expect(errs).toContain('totalPrice');
    expect(errs).toContain('date');
  });
});
