import type { Package } from '@prisma/client';
import type { PackageDTO } from '@coralyn/contracts';

/** Proietta una riga Package nel DTO condiviso (equipment Json → Record<string, number>). */
export function toPackageDTO(p: Package): PackageDTO {
  return {
    id: p.id,
    name: p.name,
    equipment: p.equipment as Record<string, number>,
  };
}
