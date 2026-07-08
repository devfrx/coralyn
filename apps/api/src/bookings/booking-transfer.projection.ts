import type { BookingTransfer, Customer } from '@prisma/client';
import type { TransferDTO, CededSubscriptionDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

type WithCustomers = BookingTransfer & {
  previousCustomer: Pick<Customer, 'firstName' | 'lastName'>;
  newCustomer: Pick<Customer, 'firstName' | 'lastName'>;
};

const fullName = (c: Pick<Customer, 'firstName' | 'lastName'>): string => `${c.firstName} ${c.lastName}`;

/** Proietta una cessione nel DTO della Scheda (storia sul contratto). */
export function toTransferDTO(t: WithCustomers): TransferDTO {
  return {
    id: t.id,
    effectiveDate: formatDbDate(t.effectiveDate),
    previousCustomerId: t.previousCustomerId,
    previousCustomerName: fullName(t.previousCustomer),
    newCustomerId: t.newCustomerId,
    newCustomerName: fullName(t.newCustomer),
    refundToPrevious: Number(t.refundToPrevious),
    collectedFromNew: Number(t.collectedFromNew),
    reason: t.reason ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}

type WithNewCustomer = BookingTransfer & { newCustomer: Pick<Customer, 'firstName' | 'lastName'> };

/** Proietta una cessione per la sezione "cessioni effettuate" della Scheda del cedente. */
export function toCededSubscriptionDTO(
  t: WithNewCustomer,
  e: { umbrellaLabel: string; seasonName?: string },
): CededSubscriptionDTO {
  return {
    transferId: t.id,
    bookingId: t.bookingId,
    effectiveDate: formatDbDate(t.effectiveDate),
    newCustomerName: fullName(t.newCustomer),
    umbrellaLabel: e.umbrellaLabel,
    seasonName: e.seasonName,
    refundToPrevious: Number(t.refundToPrevious),
    reason: t.reason ?? undefined,
    createdAt: t.createdAt.toISOString(),
  };
}
