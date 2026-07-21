import type { BookingDTO, CustomerDTO, RowDTO, SectorDTO, UmbrellaDTO } from '@coralyn/contracts';

/** Disponibilità operativa (spec rework Riva §6): una postazione è occupata se ALMENO una
 *  fascia non è 'free'. 'covered' conta come occupata (non è prenotabile). Metrica DIVERSA
 *  dal Report (D-048), che misura il venduto: qui si misura il prenotabile. */
export function isOccupied(u: UmbrellaDTO): boolean {
  return Object.values(u.stateBySlot).some((s) => s !== 'free');
}

export function rowOccupancy(row: RowDTO): { occupied: number; total: number } {
  const occupied = row.umbrellas.filter(isOccupied).length;
  return { occupied, total: row.umbrellas.length };
}

export function sectorOccupancyPct(sector: SectorDTO): number {
  const umbrellas = sector.rows.flatMap((r) => r.umbrellas);
  if (umbrellas.length === 0) return 0;
  return Math.round((umbrellas.filter(isOccupied).length / umbrellas.length) * 100);
}

/** Ricerca: etichetta ESATTA (case-insensitive) oppure nome cliente substring (min 2 char). */
export function matchesQuery(u: UmbrellaDTO, query: string, customerNames: readonly string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (u.label.toLowerCase() === q) return true;
  return q.length >= 2 && customerNames.some((n) => n.toLowerCase().includes(q));
}

/** Nomi cliente per ombrellone dai booking del giorno (per ricerca e hovercard). */
export function namesByUmbrella(
  bookings: readonly BookingDTO[], customers: readonly CustomerDTO[],
): Map<string, string[]> {
  const byId = new Map(customers.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const out = new Map<string, string[]>();
  for (const b of bookings) {
    const list = out.get(b.umbrellaId) ?? [];
    const name = byId.get(b.customerId);
    if (name) list.push(name);
    out.set(b.umbrellaId, list);
  }
  return out;
}
