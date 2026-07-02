import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateRateDto } from './create-rate.dto';

const UUID = '11111111-1111-1111-1111-111111111111';
const errs = (obj: unknown) => validateSync(plainToInstance(CreateRateDto, obj), { whitelist: true });

describe('CreateRateDto', () => {
  it('accetta una catch-all (solo seasonId + price)', () => {
    expect(errs({ seasonId: UUID, price: 28 })).toHaveLength(0);
  });
  it('accetta le dimensioni opzionali valide', () => {
    expect(errs({ seasonId: UUID, packageId: UUID, timeSlotId: UUID, type: 'subscription', price: 800 })).toHaveLength(0);
  });
  it('rifiuta seasonId non-UUID', () => {
    expect(errs({ seasonId: 'nope', price: 28 }).length).toBeGreaterThan(0);
  });
  it('rifiuta prezzo con più di 2 decimali', () => {
    expect(errs({ seasonId: UUID, price: 28.999 }).length).toBeGreaterThan(0);
  });
  it('rifiuta prezzo negativo', () => {
    expect(errs({ seasonId: UUID, price: -1 }).length).toBeGreaterThan(0);
  });
});
