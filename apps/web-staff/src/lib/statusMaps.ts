import type { BookingType, PaymentMethod, PaymentStatus, RentalStatus } from '@coralyn/contracts';

/** Mappe stato→presentazione (ADR-0033 §2, di dominio: conoscono i contratti Booking). */
export const PAY_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Da incassare',
  partial: 'Parziale',
  paid: 'Saldato',
};
export const PAY_TONE: Record<PaymentStatus, 'success' | 'warning' | 'neutral'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'neutral',
};
export const TYPE_LABEL: Record<BookingType, string> = {
  daily: 'Giornaliera',
  periodic: 'Periodica',
  subscription: 'Abbonamento',
};
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Contanti',
  card: 'Carta',
  transfer: 'Bonifico',
  other: 'Altro',
};
export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  active: 'Attivo',
  returned: 'Rientrato',
  cancelled: 'Annullato',
};
export const RENTAL_STATUS_TONE: Record<RentalStatus, 'accent' | 'success' | 'neutral'> = {
  active: 'accent',
  returned: 'success',
  cancelled: 'neutral',
};
