import { validate } from 'class-validator';
import { IsIconKey } from './is-icon-key';

class Probe {
  @IsIconKey()
  icon!: string;
}

async function erroriSu(value: unknown): Promise<number> {
  const p = new Probe();
  (p as { icon: unknown }).icon = value;
  return (await validate(p)).length;
}

describe('IsIconKey', () => {
  it('accetta un nome lucide canonico', async () => {
    expect(await erroriSu('anchor')).toBe(0);
  });

  it('accetta i tre valori che il prodotto sa gia scrivere', async () => {
    for (const k of ['umbrella', 'leaf', 'palmtree']) expect(await erroriSu(k)).toBe(0);
  });

  it('accetta un alias, perche le righe gia salvate ne portano uno', async () => {
    expect(await erroriSu('palmtree')).toBe(0);
  });

  it('rifiuta un nome inventato', async () => {
    expect(await erroriSu('non-esiste-affatto')).toBe(1);
  });

  it('rifiuta un icona deprecata, che il picker non offre', async () => {
    expect(await erroriSu('search-large')).toBe(1);
  });

  it('rifiuta un valore non stringa', async () => {
    expect(await erroriSu(42)).toBe(1);
    expect(await erroriSu(null)).toBe(1);
  });
});
