import type { DayMapDTO, TimeSlotDTO } from '@coralyn/contracts';

export const mapSeed: DayMapDTO = {
  date: '2026-06-27',
  umbrellaTypes: [
    { id: 't-mini', name: 'Mini-palma', sortOrder: 1, icon: 'leaf' },
    { id: 't-palma', name: 'Palma', sortOrder: 2, icon: 'palmtree' },
  ],
  timeSlots: [
    { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
    { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
  ],
  sectors: [
    {
      id: 's-centro', name: 'Centro', sortOrder: 1, kind: 'grid',
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
      id: 's-speciali', name: 'Speciali', sortOrder: 99, kind: 'special',
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

export const timeSlotsSeed: TimeSlotDTO[] = [
  { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
  { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
];

// Config a 3 fasce con nomi NON standard: esercita il caso N>2 (fascia centrale + nomi reali).
export const mapSeed3: DayMapDTO = {
  date: '2026-06-27',
  umbrellaTypes: [{ id: 't-palma', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
  timeSlots: [
    { id: 'alba', name: 'Alba', startTime: '06:00', endTime: '10:00', sortOrder: 1 },
    { id: 'giorno', name: 'Pieno giorno', startTime: '10:00', endTime: '16:00', sortOrder: 2 },
    { id: 'tramonto', name: 'Tramonto', startTime: '16:00', endTime: '20:00', sortOrder: 3 },
  ],
  sectors: [
    {
      id: 's-centro', name: 'Centro', sortOrder: 1, kind: 'grid',
      rows: [
        {
          id: 'row-1', label: 'Fila 1', sortOrder: 1,
          umbrellas: [
            // Fascia centrale occupata, estreme libere → "Libera nelle fasce: Alba, Tramonto"
            { id: 'o-mid', label: '1', umbrellaTypeId: 't-palma', rowId: 'row-1', stateBySlot: { alba: 'free', giorno: 'daily', tramonto: 'free' } },
            // Tutte libere → "Postazione libera tutto il giorno"
            { id: 'o-free', label: '2', umbrellaTypeId: 't-palma', rowId: 'row-1', stateBySlot: { alba: 'free', giorno: 'free', tramonto: 'free' } },
          ],
        },
      ],
    },
  ],
};
