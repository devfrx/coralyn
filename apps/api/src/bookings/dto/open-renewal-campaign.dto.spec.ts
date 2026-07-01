import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OpenRenewalCampaignDto } from './open-renewal-campaign.dto';

async function errs(obj: unknown) {
  return validate(plainToInstance(OpenRenewalCampaignDto, obj));
}

describe('OpenRenewalCampaignDto', () => {
  it('accetta 3 date calendariali', async () => {
    expect(await errs({ originDate: '2026-07-01', destinationDate: '2027-07-01', deadline: '2026-12-31' })).toHaveLength(0);
  });
  it('rifiuta data non calendariale', async () => {
    expect((await errs({ originDate: '2026-13-40', destinationDate: '2027-07-01', deadline: '2026-12-31' })).length).toBeGreaterThan(0);
  });
  it('rifiuta campo mancante', async () => {
    expect((await errs({ originDate: '2026-07-01', destinationDate: '2027-07-01' })).length).toBeGreaterThan(0);
  });
});
