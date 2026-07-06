import { projectDayMap, type MapSource } from './map.projection';
import { todayInRome, resolveDate } from '../common/dates';

const source: MapSource = {
  umbrellaTypes: [{ id: 't1', establishmentId: 'e', name: 'Palma', sortOrder: 2, icon: 'palmtree' }],
  timeSlots: [
    { id: 's1', establishmentId: 'e', name: 'Mattina', startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T13:00:00Z'), sortOrder: 1 },
    { id: 's2', establishmentId: 'e', name: 'Pomeriggio', startTime: new Date('1970-01-01T13:00:00Z'), endTime: new Date('1970-01-01T19:00:00Z'), sortOrder: 2 },
  ],
  sectors: [
    {
      id: 'sec1',
      establishmentId: 'e',
      name: 'Centro',
      sortOrder: 1,
      kind: 'grid',
      rows: [
        {
          id: 'row1',
          establishmentId: 'e',
          sectorId: 'sec1',
          label: 'Fila 1',
          sortOrder: 1,
          umbrellas: [
            { id: 'u1', establishmentId: 'e', rowId: 'row1', umbrellaTypeId: 't1', label: '1', logicalOrder: 1, presentationPosition: null },
            { id: 'u2', establishmentId: 'e', rowId: 'row1', umbrellaTypeId: null, label: '2', logicalOrder: 2, presentationPosition: null },
          ],
        },
      ],
    },
  ],
  bookings: [],
};

describe('projectDayMap', () => {
  it('echoes the date and projects types/slots/sectors', () => {
    const dto = projectDayMap('2026-07-15', source);
    expect(dto.date).toBe('2026-07-15');
    expect(dto.umbrellaTypes).toEqual([{ id: 't1', name: 'Palma', sortOrder: 2, icon: 'palmtree' }]);
    expect(dto.timeSlots).toEqual([
      { id: 's1', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
      { id: 's2', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
    ]);
    expect(dto.sectors[0].rows[0].umbrellas).toHaveLength(2);
  });

  it('sets every umbrella to `free` for every slot (keys = slot ids)', () => {
    const dto = projectDayMap('2026-07-15', source);
    const u = dto.sectors[0].rows[0].umbrellas[0];
    expect(u.stateBySlot).toEqual({ s1: 'free', s2: 'free' });
    expect(u.umbrellaTypeId).toBe('t1');
    expect(dto.sectors[0].rows[0].umbrellas[1].umbrellaTypeId).toBeNull();
  });

  it('resolveDate: echoes if provided, defaults to today (Europe/Rome) if absent', () => {
    expect(resolveDate('2026-07-15')).toBe('2026-07-15');
    expect(resolveDate(undefined)).toBe(todayInRome());
  });

  it('una prenotazione daily accende lo slot sovrapposto, gli altri restano free', () => {
    const withBooking = {
      ...source,
      bookings: [{ umbrellaId: 'u1', timeSlotId: 's1', type: 'daily' as const }],
    };
    const dto = projectDayMap('2026-07-15', withBooking);
    const u1 = dto.sectors[0].rows[0].umbrellas[0];
    expect(u1.stateBySlot).toEqual({ s1: 'daily', s2: 'free' });
    expect(dto.sectors[0].rows[0].umbrellas[1].stateBySlot).toEqual({ s1: 'free', s2: 'free' });
  });

  it('popola stateBySlot per OGNI fascia configurata (N=3, non solo 2) — §5 FE-only lock', () => {
    const source3: MapSource = {
      ...source,
      timeSlots: [
        ...source.timeSlots, // s1 (Mattina), s2 (Pomeriggio)
        { id: 's3', establishmentId: 'e', name: 'Sera', startTime: new Date('1970-01-01T19:00:00Z'), endTime: new Date('1970-01-01T23:00:00Z'), sortOrder: 3 },
      ],
      bookings: [{ umbrellaId: 'u1', timeSlotId: 's2', type: 'daily' as const }],
    };
    const dto = projectDayMap('2026-07-15', source3);
    const u1 = dto.sectors[0].rows[0].umbrellas[0];
    // Tutte e 3 le fasce presenti come chiavi (la centrale/s2 non "sparisce")
    expect(Object.keys(u1.stateBySlot).sort()).toEqual(['s1', 's2', 's3']);
    // La prenotazione daily accende SOLO la fascia sovrapposta; le altre restano free
    expect(u1.stateBySlot).toEqual({ s1: 'free', s2: 'daily', s3: 'free' });
  });

  it('due confermate sullo stesso slot: stato deterministico (prima per createdAt)', () => {
    const withBookings = {
      ...source,
      bookings: [
        { umbrellaId: 'u1', timeSlotId: 's1', type: 'daily' as const },
        { umbrellaId: 'u1', timeSlotId: 's1', type: 'subscription' as const },
      ],
    };
    const dto = projectDayMap('2026-07-15', withBookings);
    expect(dto.sectors[0].rows[0].umbrellas[0].stateBySlot.s1).toBe('daily');
  });
});
