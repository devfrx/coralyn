import type { CustomerBookingDTO } from '@coralyn/contracts';

/** Chip posizione della Scheda cliente. Vivo: «Settore · label». Ritirato (D-055/ADR-0053):
 *  lo snapshot storico «Settore · Fila» congelato al ritiro — il settore vivo non esiste più. */
export function positionLabel(
  b: Pick<CustomerBookingDTO, 'sectorName' | 'umbrellaLabel' | 'umbrellaRetiredAt' | 'umbrellaRetiredFrom'>,
): string {
  const place = b.umbrellaRetiredAt ? b.umbrellaRetiredFrom : b.sectorName;
  return `${place ?? '—'} · ${b.umbrellaLabel}`;
}
