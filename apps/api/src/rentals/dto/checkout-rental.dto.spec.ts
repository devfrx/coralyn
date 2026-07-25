import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CheckoutRentalDto } from './checkout-rental.dto';

// Gli id LETTERALI del seed di sviluppo (prisma/seed.ts:189-190): non passano dall'helper `u()`,
// quindi non hanno nibble di versione/variante RFC-4122. Postgres li accetta come `uuid` e
// `common/uuid.ts` li dichiara validi — `@IsUUID()` no. Con quel decoratore il Pedalo' seedato
// non era noleggiabile (P1-003/AUD-011).
const SEED_PEDALO = '00000000-0000-0000-0000-0000000000a1';
const SEED_TARIFF = '00000000-0000-0000-0000-0000000000b1';
const REAL_V4 = '7d9c1f2e-1a2b-4c3d-8e4f-0123456789ab';

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const dto = plainToInstance(CheckoutRentalDto, payload);
  return (await validate(dto)).map((e) => e.property);
};

describe('CheckoutRentalDto', () => {
  it('accetta gli id sintetici del seed (il Pedalo` shippato e` noleggiabile)', async () => {
    expect(await errorsFor({ rentalItemId: SEED_PEDALO, rentalTariffId: SEED_TARIFF })).toEqual([]);
  });

  it('accetta gli UUID v4 reali della produzione', async () => {
    expect(await errorsFor({ rentalItemId: REAL_V4, rentalTariffId: REAL_V4, customerId: REAL_V4 })).toEqual([]);
  });

  it('accetta customerId null (noleggio al banco, senza cliente)', async () => {
    expect(await errorsFor({ rentalItemId: SEED_PEDALO, rentalTariffId: SEED_TARIFF, customerId: null })).toEqual([]);
  });

  it('rifiuta un id non UUID-shaped (evita il 500 da cast Postgres)', async () => {
    expect(await errorsFor({ rentalItemId: 'pedalo', rentalTariffId: SEED_TARIFF })).toContain('rentalItemId');
  });
});
