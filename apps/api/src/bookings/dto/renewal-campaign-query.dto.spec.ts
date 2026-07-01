import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenewalCampaignQueryDto } from './renewal-campaign-query.dto';

async function errs(obj: unknown) {
  return validate(plainToInstance(RenewalCampaignQueryDto, obj));
}

describe('RenewalCampaignQueryDto', () => {
  it('accetta destinationDate calendariale', async () => {
    expect(await errs({ destinationDate: '2027-07-01' })).toHaveLength(0);
  });
  it('rifiuta data non calendariale', async () => {
    expect((await errs({ destinationDate: '2027-13-40' })).length).toBeGreaterThan(0);
  });
  it('rifiuta campo mancante', async () => {
    expect((await errs({})).length).toBeGreaterThan(0);
  });
});
