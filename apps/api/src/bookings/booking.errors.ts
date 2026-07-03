import { Prisma } from '@prisma/client';

/**
 * True se `e` è la violazione dell'EXCLUDE constraint anti-overlap (booking_no_overlap, SQLSTATE 23P01).
 * Prisma 5 non mappa le exclusion violation a un codice dedicato: affiorano come errore Prisma il cui
 * messaggio riporta lo SQLSTATE e/o il nome del constraint. Il caso reale è pinnato dall'e2e (renew in
 * stagione sovrapposta → 409). NB: 23P01 (exclusion), NON 23505 (unique, usato da Rate_signature_key).
 *
 * Match SOLO sul nome del constraint (booking_no_overlap), non sul bare SQLSTATE 23P01: 23P01 è
 * condiviso da QUALSIASI exclusion constraint del DB, presente o futuro. Postgres riporta sempre il
 * nome del constraint nel messaggio di violazione di una exclusion, quindi matchare il nome è
 * altrettanto affidabile ma specifico alla nostra regola anti-overlap — evita di mappare al 409
 * "ombrellone/fascia già prenotati" un'altra exclusion violation non correlata che capiti a condividere
 * lo stesso SQLSTATE.
 */
export function isBookingOverlapExclusion(e: unknown): boolean {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const msg = e.message ?? '';
    return msg.includes('booking_no_overlap');
  }
  return false;
}
