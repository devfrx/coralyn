import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BulkDeleteUmbrellasDto } from './bulk-delete-umbrellas.dto';

// Pin della conversione @IsUUID(undefined, { each: true }) → @IsUuidShape({ each: true }):
// `each` e' l'opzione che si applica elemento per elemento, ed e' l'unico punto in cui la firma
// del decoratore e' cambiata (AUD-011).
const SEED_UMBRELLA = '50000000-0000-0000-0000-000000000001';
const REAL_V4 = '7d9c1f2e-1a2b-4c3d-8e4f-0123456789ab';

const errorsFor = async (ids: unknown): Promise<string[]> => {
  const dto = plainToInstance(BulkDeleteUmbrellasDto, { ids });
  return (await validate(dto)).map((e) => e.property);
};

describe('BulkDeleteUmbrellasDto', () => {
  it('accetta un array di id sintetici del seed e di uuid v4 reali', async () => {
    expect(await errorsFor([SEED_UMBRELLA, REAL_V4])).toEqual([]);
  });

  it('rifiuta l’array se anche UN SOLO elemento non e’ UUID-shaped', async () => {
    expect(await errorsFor([SEED_UMBRELLA, 'ombrellone-12'])).toContain('ids');
  });

  it('rifiuta l’array vuoto (ArrayMinSize)', async () => {
    expect(await errorsFor([])).toContain('ids');
  });
});
