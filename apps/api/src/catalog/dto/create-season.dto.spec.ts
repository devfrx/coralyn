import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSeasonDto } from './create-season.dto';

const errs = (obj: unknown) => validateSync(plainToInstance(CreateSeasonDto, obj), { whitelist: true });

describe('CreateSeasonDto', () => {
  it('accetta nome + date ISO valide', () => {
    expect(errs({ name: 'Estate 2028', startDate: '2028-06-01', endDate: '2028-09-30' })).toHaveLength(0);
  });
  it('rifiuta una data non-calendario', () => {
    expect(errs({ name: 'X', startDate: '2028-13-40', endDate: '2028-09-30' }).length).toBeGreaterThan(0);
  });
  it('rifiuta nome vuoto', () => {
    expect(errs({ name: '', startDate: '2028-06-01', endDate: '2028-09-30' }).length).toBeGreaterThan(0);
  });
});
