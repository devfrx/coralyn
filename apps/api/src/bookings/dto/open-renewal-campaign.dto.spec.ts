import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OpenRenewalCampaignDto } from './open-renewal-campaign.dto';

const ORIGIN = '11111111-1111-1111-1111-111111111111';
const DEST = '22222222-2222-2222-2222-222222222222';

async function errs(obj: unknown) {
  return validate(plainToInstance(OpenRenewalCampaignDto, obj));
}

describe('OpenRenewalCampaignDto', () => {
  it('accetta due id stagione + deadline calendariale', async () => {
    expect(await errs({ originSeasonId: ORIGIN, destinationSeasonId: DEST, deadline: '2026-12-31' })).toHaveLength(0);
  });
  it('rifiuta seasonId malformato', async () => {
    expect((await errs({ originSeasonId: 'not-a-uuid', destinationSeasonId: DEST, deadline: '2026-12-31' })).length).toBeGreaterThan(0);
  });
  it('rifiuta deadline non calendariale', async () => {
    expect((await errs({ originSeasonId: ORIGIN, destinationSeasonId: DEST, deadline: '2026-13-40' })).length).toBeGreaterThan(0);
  });
  it('rifiuta campo mancante', async () => {
    expect((await errs({ originSeasonId: ORIGIN, destinationSeasonId: DEST })).length).toBeGreaterThan(0);
  });
});
