import type { DayMapDTO } from '@coralyn/contracts';
import { revenueBuckets, revenueKpi, occupancyPct, stateMix, occupancyStates } from './report.projection';

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

describe('occupancyStates', () => {
  it('appiattisce ombrellone×fascia ed ESCLUDE le fasce coperte (no doppio conteggio)', () => {
    const dayMap: DayMapDTO = {
      date: '2026-07-15',
      umbrellaTypes: [],
      timeSlots: [
        { id: 's1', name: 'M', sortOrder: 1 },
        { id: 's2', name: 'P', sortOrder: 2 },
        { id: 'sf', name: 'G', sortOrder: 3 },
      ],
      sectors: [{
        id: 'sec', name: 'C', sortOrder: 1,
        rows: [{ id: 'r', label: 'F', sortOrder: 1, umbrellas: [
          // full-day venduto: sf diretta (season), s1/s2 coperte → conta SOLO sf
          { id: 'u1', label: '1', umbrellaTypeId: null, rowId: 'r', stateBySlot: { s1: 'covered', s2: 'covered', sf: 'season' } },
          // tutte libere
          { id: 'u2', label: '2', umbrellaTypeId: null, rowId: 'r', stateBySlot: { s1: 'free', s2: 'free', sf: 'free' } },
        ] }],
      }],
    };
    expect(occupancyStates(dayMap)).toEqual(['season', 'free', 'free', 'free']);
  });
});
