import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenewBookingDto } from './renew-booking.dto';

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(RenewBookingDto, payload);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));
};

describe('RenewBookingDto', () => {
  it('accetta uno startDate calendariale', async () => {
    expect(await errorsFor({ startDate: '2027-07-01' })).toEqual([]);
  });
  it('rifiuta startDate mancante', async () => {
    expect(await errorsFor({})).toContain('startDate');
  });
  it('rifiuta startDate non calendariale', async () => {
    expect(await errorsFor({ startDate: '2027-13-40' })).toContain('startDate');
  });
});
