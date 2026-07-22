import type { EstablishmentStructureDTO } from '@coralyn/contracts';

/** Albero base per gli spec del Cantiere: 2 settori, 1 fila, 2 ombrelloni, 1 tipologia. */
export const STRUCTURE_FIXTURE: EstablishmentStructureDTO = {
  sectors: [
    { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
      { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'u-1', label: 'A1', umbrellaTypeId: null },
        { id: 'u-2', label: 'A2', umbrellaTypeId: 'typ-1' },
      ] },
    ] },
    { id: 's-2', name: 'Speciali', sortOrder: 2, kind: 'special', rows: [] },
  ],
  umbrellaTypes: [{ id: 'typ-1', name: 'Gazebo', sortOrder: 1, icon: 'palmtree' }],
};

export const EMPTY_STRUCTURE: EstablishmentStructureDTO = { sectors: [], umbrellaTypes: [] };
