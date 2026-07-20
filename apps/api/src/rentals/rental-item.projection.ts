import type { RentalItem } from '@prisma/client';
import type { RentalItemDTO } from '@coralyn/contracts';

export function toRentalItemDTO(r: RentalItem): RentalItemDTO {
  return { id: r.id, name: r.name, stock: r.stock, ...(r.archivedAt != null ? { archived: true } : {}) };
}
