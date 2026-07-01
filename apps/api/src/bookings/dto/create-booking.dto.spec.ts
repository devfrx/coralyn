import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateBookingDto } from './create-booking.dto';

// id sintetici ma canonici (come il seed di sviluppo): Postgres li accetta come `uuid`.
const SEED_UMBRELLA = '50000000-0000-0000-0000-000000000001';
const SEED_SLOT = '20000000-0000-0000-0000-000000000001';
const REAL_V4 = '7d9c1f2e-1a2b-4c3d-8e4f-0123456789ab';

const base = {
  customerId: REAL_V4,
  umbrellaId: SEED_UMBRELLA,
  timeSlotId: SEED_SLOT,
  type: 'daily',
  startDate: '2026-08-20',
};

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(CreateBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('CreateBookingDto', () => {
  it('accetta una daily valida (UUID canonici del seed)', async () => {
    expect(await errorsFor(base)).toEqual([]);
  });

  it('accetta una periodic con endDate', async () => {
    expect(await errorsFor({ ...base, type: 'periodic', endDate: '2026-08-25' })).toEqual([]);
  });

  it('rifiuta type mancante', async () => {
    const { type, ...noType } = base;
    void type;
    expect(await errorsFor(noType)).toContain('type');
  });

  it('rifiuta type non valido', async () => {
    expect(await errorsFor({ ...base, type: 'weekly' })).toContain('type');
  });

  it('rifiuta id non UUID-shaped (evita 500 da cast Postgres)', async () => {
    expect(await errorsFor({ ...base, umbrellaId: 'not-a-uuid' })).toContain('umbrellaId');
  });

  it('rifiuta startDate non calendariale', async () => {
    expect(await errorsFor({ ...base, startDate: '2026-13-40' })).toContain('startDate');
  });

  it('rifiuta endDate non calendariale (se presente)', async () => {
    expect(await errorsFor({ ...base, type: 'periodic', endDate: '2026-13-40' })).toContain('endDate');
  });
});
