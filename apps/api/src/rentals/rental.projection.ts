import type { Prisma, Rental, RentalItem } from '@prisma/client';
import type { PaymentMethod, RentalAvailabilityDTO, RentalDTO, RentalStatus } from '@coralyn/contracts';

export const RENTAL_INCLUDE = { rentalItem: true, rentalTariff: true, customer: true } as const;
type RentalRow = Prisma.RentalGetPayload<{ include: typeof RENTAL_INCLUDE }>;

export function rentalStatus(r: Pick<Rental, 'cancelledAt' | 'returnedAt'>): RentalStatus {
  if (r.cancelledAt != null) return 'cancelled';
  if (r.returnedAt != null) return 'returned';
  return 'active';
}

export function toRentalDTO(r: RentalRow): RentalDTO {
  const customerName = r.customer ? `${r.customer.firstName} ${r.customer.lastName}`.trim() : null;
  return {
    id: r.id, rentalItemId: r.rentalItemId, rentalItemName: r.rentalItem.name,
    rentalTariffId: r.rentalTariffId, tariffLabel: r.rentalTariff.label,
    customerId: r.customerId, customerName,
    units: r.units, startAt: r.startAt.toISOString(),
    returnedAt: r.returnedAt ? r.returnedAt.toISOString() : null, status: rentalStatus(r),
    totalPrice: Number(r.totalPrice), paymentStatus: r.paymentStatus, amountCollected: Number(r.amountCollected),
    ...(r.paymentMethod ? { paymentMethod: r.paymentMethod as PaymentMethod } : {}),
    ...(r.collectionDate ? { collectionDate: r.collectionDate.toISOString().slice(0, 10) } : {}),
  };
}

export function computeAvailability(item: Pick<RentalItem, 'id' | 'stock'>, out: number): RentalAvailabilityDTO {
  return { rentalItemId: item.id, stock: item.stock, out, available: item.stock == null ? null : Math.max(0, item.stock - out) };
}
