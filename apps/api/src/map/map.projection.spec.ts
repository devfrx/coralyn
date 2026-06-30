import { projectDayMap, resolveDate, type MapSource } from './map.projection';

const source: MapSource = {
  umbrellaTypes: [{ id: 't1', establishmentId: 'e', name: 'Palma', sortOrder: 2, icon: 'palmtree' }],
  timeSlots: [
    { id: 's1', establishmentId: 'e', name: 'Mattina', startTime: new Date(), endTime: new Date(), sortOrder: 1 },
    { id: 's2', establishmentId: 'e', name: 'Pomeriggio', startTime: new Date(), endTime: new Date(), sortOrder: 2 },
  ],
  sectors: [
    {
      id: 'sec1',
      establishmentId: 'e',
      name: 'Centro',
      sortOrder: 1,
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
};

describe('projectDayMap', () => {
  it('echoes the date and projects types/slots/sectors', () => {
    const dto = projectDayMap('2026-07-15', source);
    expect(dto.date).toBe('2026-07-15');
    expect(dto.umbrellaTypes).toEqual([{ id: 't1', name: 'Palma', sortOrder: 2, icon: 'palmtree' }]);
    expect(dto.timeSlots).toEqual([
      { id: 's1', name: 'Mattina', sortOrder: 1 },
      { id: 's2', name: 'Pomeriggio', sortOrder: 2 },
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

  it('resolveDate: echoes if provided, defaults to today if absent', () => {
    expect(resolveDate('2026-07-15')).toBe('2026-07-15');
    const today = resolveDate(undefined);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today).toBe(new Date().toISOString().slice(0, 10));
  });
});
