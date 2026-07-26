import { pickActiveSeason, toEstablishmentOverview, type OverviewRaw } from './establishment.projection';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('pickActiveSeason', () => {
  const seasons = [
    { name: 'Estate 2026', startDate: d('2026-06-01'), endDate: d('2026-09-15') },
    { name: 'Estate 2027', startDate: d('2027-06-01'), endDate: d('2027-09-15') },
  ];

  it('ritorna la stagione che contiene oggi (bordi inclusivi)', () => {
    expect(pickActiveSeason(seasons, '2026-07-04')).toEqual({ name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' });
    expect(pickActiveSeason(seasons, '2026-06-01')?.name).toBe('Estate 2026');
    expect(pickActiveSeason(seasons, '2026-09-15')?.name).toBe('Estate 2026');
  });

  it('off-season → null', () => {
    expect(pickActiveSeason(seasons, '2026-10-01')).toBeNull();
    expect(pickActiveSeason([], '2026-07-04')).toBeNull();
  });
});

describe('toEstablishmentOverview', () => {
  const raw: OverviewRaw = {
    establishment: { id: 'e-1', name: 'Lido Maestrale' },
    seasons: [{ name: 'Estate 2026', startDate: d('2026-06-01'), endDate: d('2026-09-15') }],
    timeSlots: [{ id: 't1', name: 'Mattina' }, { id: 't2', name: 'Pomeriggio' }],
    structure: { sectors: 3, umbrellas: 41, types: 3, packages: 3 },
    todayIso: '2026-07-04',
  };

  it('compone establishment, activeSeason, timeSlots e structure', () => {
    const dto = toEstablishmentOverview(raw);
    expect(dto.establishment).toEqual({ id: 'e-1', name: 'Lido Maestrale' });
    expect(dto.activeSeason).toEqual({ name: 'Estate 2026', startDate: '2026-06-01', endDate: '2026-09-15' });
    expect(dto.timeSlots).toHaveLength(2);
    expect(dto.structure).toEqual({ sectors: 3, umbrellas: 41, types: 3, packages: 3 });
  });

  // D-064: questo payload è leggibile con `establishment.read`, cioè da tutto lo staff. La lista
  // esatta delle chiavi è il presidio nel job veloce (le e2e girano nel job con Postgres): un campo
  // nuovo qui dentro deve passare da questa riga, e chi la aggiorna decide consapevolmente se è
  // materiale che ogni operatore può leggere.
  it('non espone dati personali: le chiavi sono esattamente quelle dello shell', () => {
    expect(Object.keys(toEstablishmentOverview(raw)).sort()).toEqual(['activeSeason', 'establishment', 'structure', 'timeSlots']);
  });
});
