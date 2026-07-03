import type { Package, PackageEquipment, EquipmentType } from '@prisma/client';
import type { PackageDTO } from '@coralyn/contracts';

export type PackageWithLinks = Package & {
  packageLinks: Array<PackageEquipment & { equipmentType: EquipmentType }>;
};

/** Proietta una riga Package (+ link) nel DTO. Equipment risolto dal catalogo, ordinato per nome. */
export function toPackageDTO(p: PackageWithLinks): PackageDTO {
  const equipment = [...p.packageLinks]
    .map((l) => ({ equipmentTypeId: l.equipmentTypeId, name: l.equipmentType.name, quantity: l.quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: p.id,
    name: p.name,
    equipment,
    ...(p.archivedAt != null ? { archived: true } : {}),
  };
}
