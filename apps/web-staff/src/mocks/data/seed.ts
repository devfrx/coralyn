import type { DayMapDTO } from '@coralyn/contracts';

export const mapSeed: DayMapDTO = {
  date: '2026-06-27',
  umbrellaTypes: [
    { id: 't-mini', name: 'Mini-palma', sortOrder: 1, icon: 'leaf' },
    { id: 't-palma', name: 'Palma', sortOrder: 2, icon: 'palmtree' },
  ],
  timeSlots: [
    { id: 'f-mat', name: 'Mattina', sortOrder: 1 },
    { id: 'f-pom', name: 'Pomeriggio', sortOrder: 2 },
  ],
  sectors: [
    {
      id: 's-centro', name: 'Centro', sortOrder: 1,
      rows: [
        {
          id: 'row-1', label: 'Fila 1', sortOrder: 1,
          umbrellas: [
            { id: 'o-1', label: '1', umbrellaTypeId: 't-mini', rowId: 'row-1', stateBySlot: { 'f-mat': 'daily', 'f-pom': 'daily' } },
            { id: 'o-2', label: '2', umbrellaTypeId: 't-mini', rowId: 'row-1', stateBySlot: { 'f-mat': 'free', 'f-pom': 'free' } },
            { id: 'o-8', label: '8', umbrellaTypeId: null, rowId: 'row-1', stateBySlot: { 'f-mat': 'booked', 'f-pom': 'free' } },
          ],
        },
      ],
    },
    {
      id: 's-speciali', name: 'Speciali', sortOrder: 99,
      rows: [
        {
          id: 'row-palme', label: 'Palme', sortOrder: 1,
          umbrellas: [
            { id: 'o-p1', label: 'P1', umbrellaTypeId: 't-palma', rowId: 'row-palme', stateBySlot: { 'f-mat': 'season', 'f-pom': 'season' } },
          ],
        },
      ],
    },
  ],
};
