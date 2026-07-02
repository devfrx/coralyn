import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenewBookingDto } from './renew-booking.dto';

const DEST = '22222222-2222-2222-2222-222222222222';

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(RenewBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('RenewBookingDto', () => {
  it('accetta un destinationSeasonId ben formato', async () => {
    expect(await errorsFor({ destinationSeasonId: DEST })).toEqual([]);
  });
  it('rifiuta destinationSeasonId mancante', async () => {
    expect(await errorsFor({})).toContain('destinationSeasonId');
  });
  it('rifiuta destinationSeasonId malformato', async () => {
    expect(await errorsFor({ destinationSeasonId: 'not-a-uuid' })).toContain('destinationSeasonId');
  });
});
