import { revenueBuckets, revenueKpi, occupancyPct, stateMix } from './report.projection';

describe('revenueKpi', () => {
  const rows = [
    { date: '2026-07-04', amount: 100 }, { date: '2026-07-04', amount: 40 },
    { date: '2026-07-01', amount: 60 },
  ];
  it('today = somma del solo giorno odierno', () => {
    expect(revenueKpi(rows, 'today', '2026-07-04')).toBe(140);
  });
  it('week/season = somma di tutte le righe nel range', () => {
    expect(revenueKpi(rows, 'week', '2026-07-04')).toBe(200);
  });
});

describe('revenueBuckets', () => {
  it('week → 7 barre giornaliere etichettate per giorno (ultimi 7 gg incluso oggi)', () => {
    const b = revenueBuckets([{ date: '2026-07-04', amount: 200 }], 'week', '2026-07-04');
    expect(b).toHaveLength(7);
    expect(b[6].value).toBe(200); // l'ultimo bucket è oggi
  });
});

describe('occupancyPct', () => {
  it('arrotonda occupati/totali a intero percentuale', () => {
    expect(occupancyPct(39, 50)).toBe(78);
    expect(occupancyPct(0, 0)).toBe(0);
  });
});

describe('stateMix', () => {
  it('conta gli stati e calcola le percentuali sul totale', () => {
    const mix = stateMix(['daily', 'daily', 'free', 'season']);
    expect(mix.find((m) => m.state === 'daily')).toEqual({ state: 'daily', count: 2, pct: 50 });
    expect(mix.find((m) => m.state === 'free')).toEqual({ state: 'free', count: 1, pct: 25 });
  });
});
