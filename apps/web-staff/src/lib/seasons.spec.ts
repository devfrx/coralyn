import { describe, it, expect } from 'vitest';
import type { SeasonDTO } from '@coralyn/contracts';
import { seasonCoveringDate, seasonIdCoveringDate } from './seasons';

const s = (id: string, startDate: string, endDate: string): SeasonDTO =>
  ({ id, name: id, startDate, endDate }) as SeasonDTO;

// L'ordine è deliberato: la stagione che copre le date di test NON è la prima dell'elenco.
// È esattamente la configurazione in cui banco ed editor divergevano.
const seasons = [s('s-2025', '2025-05-01', '2025-09-30'), s('s-2026', '2026-05-01', '2026-09-30')];

describe('seasonCoveringDate', () => {
  it('sceglie la stagione che CONTIENE la data, non la prima dell\'elenco', () => {
    expect(seasonCoveringDate(seasons, '2026-07-15')?.id).toBe('s-2026');
  });

  it('include gli estremi: primo e ultimo giorno appartengono alla stagione', () => {
    expect(seasonCoveringDate(seasons, '2026-05-01')?.id).toBe('s-2026');
    expect(seasonCoveringDate(seasons, '2026-09-30')?.id).toBe('s-2026');
  });

  it('fuori da ogni stagione ricade sulla prima: una vista vuota è peggio di una imprecisa', () => {
    expect(seasonCoveringDate(seasons, '2026-12-25')?.id).toBe('s-2025');
  });

  it('elenco vuoto → null, e id vuoto (contratto dei Select)', () => {
    expect(seasonCoveringDate([], '2026-07-15')).toBeNull();
    expect(seasonIdCoveringDate([], '2026-07-15')).toBe('');
  });

  it('con una sola stagione il risultato è quella, dentro o fuori dalle date', () => {
    const one = [s('unica', '2026-05-01', '2026-09-30')];
    expect(seasonIdCoveringDate(one, '2026-07-15')).toBe('unica');
    expect(seasonIdCoveringDate(one, '2020-01-01')).toBe('unica');
  });
});
