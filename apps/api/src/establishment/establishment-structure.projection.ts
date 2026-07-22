import type { EstablishmentStructureDTO, RetiredUmbrellaDTO, SectorKind, StructureRowDTO, StructureSectorDTO, StructureUmbrellaDTO, UmbrellaTypeDTO } from '@coralyn/contracts';

type RawUmbrella = { id: string; label: string; umbrellaTypeId: string | null; logicalOrder: number };
type RawRow = { id: string; label: string; sortOrder: number; umbrellas: RawUmbrella[] };
type RawSector = { id: string; name: string; sortOrder: number; kind: string; rows: RawRow[] };
type RawType = { id: string; name: string; sortOrder: number; icon: string | null };

export function toStructureUmbrella(u: RawUmbrella): StructureUmbrellaDTO {
  return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId };
}

type RawRetired = { id: string; label: string; umbrellaTypeId: string | null; retiredAt: Date; retiredFrom: string | null };
/** Ombrellone ritirato (soft-delete, D-055). */
export function toRetiredUmbrella(u: RawRetired): RetiredUmbrellaDTO {
  return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId, retiredAt: u.retiredAt.toISOString(), retiredFrom: u.retiredFrom };
}

export function toStructureRow(r: RawRow): StructureRowDTO {
  return { id: r.id, label: r.label, sortOrder: r.sortOrder, umbrellas: r.umbrellas.map(toStructureUmbrella) };
}

export function toStructureSector(s: RawSector): StructureSectorDTO {
  return { id: s.id, name: s.name, sortOrder: s.sortOrder, kind: s.kind as SectorKind, rows: s.rows.map(toStructureRow) };
}

export function toEstablishmentStructure(raw: { sectors: RawSector[]; umbrellaTypes: RawType[] }): EstablishmentStructureDTO {
  const umbrellaTypes: UmbrellaTypeDTO[] = raw.umbrellaTypes.map((t) => ({
    id: t.id, name: t.name, sortOrder: t.sortOrder, ...(t.icon ? { icon: t.icon } : {}),
  }));
  return { sectors: raw.sectors.map(toStructureSector), umbrellaTypes };
}
