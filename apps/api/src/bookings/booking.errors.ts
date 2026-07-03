import { Prisma } from '@prisma/client';

/**
 * True se `e` è la violazione dell'EXCLUDE constraint anti-overlap (booking_no_overlap, SQLSTATE 23P01).
 * Prisma 5 non mappa le exclusion violation a un codice dedicato: affiorano come errore Prisma il cui
 * messaggio riporta lo SQLSTATE e/o il nome del constraint. Il caso reale è pinnato dall'e2e (renew in
 * stagione sovrapposta → 409). NB: 23P01 (exclusion), NON 23505 (unique, usato da Rate_signature_key).
 */
export function isBookingOverlapExclusion(e: unknown): boolean {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const msg = e.message ?? '';
    return msg.includes('booking_no_overlap') || msg.includes('23P01');
  }
  return false;
}
