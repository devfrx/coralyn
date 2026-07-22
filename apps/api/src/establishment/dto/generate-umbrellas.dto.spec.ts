import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GenerateUmbrellasDto } from './generate-umbrellas.dto';

const errs = (o: unknown) => validateSync(plainToInstance(GenerateUmbrellasDto, o), { whitelist: true });
const base = { rowId: '00000000-0000-4000-8000-000000000001', prefix: 'A', start: 1, umbrellaTypeId: null };

describe('GenerateUmbrellasDto', () => {
  it('valido: count = 1 (minimo)', () => {
    expect(errs({ ...base, count: 1 })).toHaveLength(0);
  });
  it('valido: count = 500 (cap lidi reali 400/500+)', () => {
    expect(errs({ ...base, count: 500 })).toHaveLength(0);
  });
  it('invalido: count = 0', () => {
    expect(errs({ ...base, count: 0 }).length).toBeGreaterThan(0);
  });
  it('invalido: count = 501 (oltre il cap)', () => {
    expect(errs({ ...base, count: 501 }).length).toBeGreaterThan(0);
  });
});
