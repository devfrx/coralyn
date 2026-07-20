import type { RentalTariff } from '@prisma/client';
import type { RentalTariffDTO } from '@coralyn/contracts';

export function toRentalTariffDTO(r: RentalTariff): RentalTariffDTO {
  return {
    id: r.id, rentalItemId: r.rentalItemId, seasonId: r.seasonId,
    label: r.label, price: Number(r.price), durationMinutes: r.durationMinutes,
    ...(r.archivedAt != null ? { archived: true } : {}),
  };
}
