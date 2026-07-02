import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RenewalCampaignQueryDto } from './renewal-campaign-query.dto';

const DEST = '22222222-2222-2222-2222-222222222222';

async function errs(obj: unknown) {
  return validate(plainToInstance(RenewalCampaignQueryDto, obj));
}

describe('RenewalCampaignQueryDto', () => {
  it('accetta destinationSeasonId ben formato', async () => {
    expect(await errs({ destinationSeasonId: DEST })).toHaveLength(0);
  });
  it('rifiuta destinationSeasonId malformato', async () => {
    expect((await errs({ destinationSeasonId: 'not-a-uuid' })).length).toBeGreaterThan(0);
  });
  it('rifiuta campo mancante', async () => {
    expect((await errs({})).length).toBeGreaterThan(0);
  });
});
