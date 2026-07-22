export type Selection =
  | { kind: 'beach' }
  | { kind: 'sector'; id: string }
  | { kind: 'row'; id: string }
  | { kind: 'umbrella'; id: string }
  | { kind: 'multi'; ids: string[] }
  | { kind: 'create-sector' }
  | { kind: 'create-row'; sectorId: string }
  | { kind: 'create-umbrella'; rowId: string };
