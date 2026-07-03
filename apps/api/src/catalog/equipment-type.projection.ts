import type { EquipmentType } from '@prisma/client';
import type { EquipmentTypeDTO } from '@coralyn/contracts';

/** Proietta una riga EquipmentType nel DTO condiviso. `archived` omesso quando attivo. */
export function toEquipmentTypeDTO(t: EquipmentType): EquipmentTypeDTO {
  return {
    id: t.id,
    name: t.name,
    ...(t.archivedAt != null ? { archived: true } : {}),
  };
}
