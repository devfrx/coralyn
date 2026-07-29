import { toEstablishmentStructure } from './establishment-structure.projection';

describe('toEstablishmentStructure', () => {
  it('proietta l’albero e mappa icon null→assente', () => {
    const dto = toEstablishmentStructure({
      sectors: [
        { id: 's1', name: 'Centro', sortOrder: 1, kind: 'grid', _count: { rates: 2 }, rows: [
          { id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
            { id: 'u1', label: '1', umbrellaTypeId: 't1', logicalOrder: 1 },
            { id: 'u2', label: '2', umbrellaTypeId: null, logicalOrder: 2 },
          ] },
        ] },
      ],
      umbrellaTypes: [
        { id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' },
        { id: 't2', name: 'Nuda', sortOrder: 2, icon: null },
      ],
    });
    // `_count.rates` diventa un booleano: al client serve sapere SE il settore ha tariffe dedicate,
    // non quante — e il numero non deve attraversare il confine per non promettere una semantica
    // che nessuno usa.
    expect(dto.sectors[0]).toEqual({ id: 's1', name: 'Centro', sortOrder: 1, kind: 'grid', hasDedicatedRates: true, rows: [
      { id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'u1', label: '1', umbrellaTypeId: 't1' },
        { id: 'u2', label: '2', umbrellaTypeId: null },
      ] } ] });
    expect(dto.umbrellaTypes).toEqual([
      { id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' },
      { id: 't2', name: 'Nuda', sortOrder: 2 },
    ]);
  });
});
