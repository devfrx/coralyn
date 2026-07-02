import type { RateDTO } from '@coralyn/contracts';

/** Rank di specificità (ADR-0032): più alto = più specifico. Ordine: periodo › fila › settore › pacchetto › fascia › tipo. */
export function rateSpecificity(r: RateDTO): number {
  const bits = [
    r.periodStart != null, // 1
    r.rowId != null,       // 2
    r.sectorId != null,    // 3
    r.packageId != null,   // 4
    r.timeSlotId != null,  // 5
    r.type != null,        // 6
  ];
  return bits.reduce((acc, present, i) => acc + (present ? 1 << (bits.length - 1 - i) : 0), 0);
}
