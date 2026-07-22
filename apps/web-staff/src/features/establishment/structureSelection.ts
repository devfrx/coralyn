import type { EstablishmentStructureDTO, StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO } from '@coralyn/contracts';

/** Cap del generatore ombrelloni (RowPanel/RowCreatePanel): i lidi reali hanno 400/500+ ombrelloni.
 * Deve restare in sync col `@Max` di `GenerateUmbrellasDto` lato api — il DTO è la fonte di verità
 * server-side, questa è la sola copia FE (niente hardcode duplicato nei due pannelli). */
export const GENERATE_MAX = 500;

export type Selection =
  | { kind: 'beach' }
  | { kind: 'sector'; id: string }
  | { kind: 'row'; id: string }
  | { kind: 'umbrella'; id: string }
  | { kind: 'multi'; ids: string[] }
  | { kind: 'create-sector' }
  | { kind: 'create-row'; sectorId: string }
  | { kind: 'create-umbrella'; rowId: string };

/** Risolve un ombrellone dall'albero via id, insieme alla fila e al settore che lo contengono
 * (stesso pattern di risoluzione per id usato per settore/fila nella shell — fallback a Spiaggia
 * se l'ombrellone sparisce, es. eliminato da un'altra scheda o dalla sua stessa delete). */
export function findUmbrella(
  data: EstablishmentStructureDTO,
  id: string,
): { umbrella: StructureUmbrellaDTO; row: StructureRowDTO; sector: StructureSectorDTO } | null {
  for (const sector of data.sectors) {
    for (const row of sector.rows) {
      const umbrella = row.umbrellas.find((u) => u.id === id);
      if (umbrella) return { umbrella, row, sector };
    }
  }
  return null;
}
