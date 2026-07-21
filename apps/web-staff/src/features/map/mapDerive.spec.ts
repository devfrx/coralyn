import { describe, it, expect } from 'vitest';
import type { RowDTO, SectorDTO, UmbrellaDTO } from '@coralyn/contracts';
import { isOccupied, rowOccupancy, sectorOccupancyPct, matchesQuery, namesByUmbrella } from './mapDerive';

const u = (id: string, stateBySlot: UmbrellaDTO['stateBySlot']): UmbrellaDTO =>
  ({ id, label: id.replace('o-', ''), umbrellaTypeId: null, rowId: 'r-1', stateBySlot });

describe('isOccupied — disponibilità operativa (spec §6)', () => {
  it('tutte le fasce libere → NON occupata', () => {
    expect(isOccupied(u('o-1', { m: 'free', p: 'free' }))).toBe(false);
  });
  it('almeno una fascia ≠ free → occupata', () => {
    expect(isOccupied(u('o-1', { m: 'booked', p: 'free' }))).toBe(true);
  });
  it('covered CONTA come occupata (non prenotabile)', () => {
    expect(isOccupied(u('o-1', { m: 'covered', p: 'free' }))).toBe(true);
  });
  it('stateBySlot vuoto → non occupata (difensivo)', () => {
    expect(isOccupied(u('o-1', {}))).toBe(false);
  });
});

describe('rowOccupancy / sectorOccupancyPct', () => {
  const row: RowDTO = { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
    u('o-1', { m: 'daily', p: 'daily' }), u('o-2', { m: 'free', p: 'free' }), u('o-8', { m: 'booked', p: 'free' }),
  ] };
  it('conta occupate/totali per fila', () => {
    expect(rowOccupancy(row)).toEqual({ occupied: 2, total: 3 });
  });
  it('percentuale settore arrotondata', () => {
    const sector: SectorDTO = { id: 's-1', name: 'Centro', sortOrder: 1, rows: [row] };
    expect(sectorOccupancyPct(sector)).toBe(67); // 2/3
  });
  it('settore vuoto → 0 (niente divisione per zero)', () => {
    expect(sectorOccupancyPct({ id: 's', name: 'X', sortOrder: 1, rows: [] })).toBe(0);
  });
});

describe('matchesQuery — ricerca (spec §7)', () => {
  const omb = u('o-8', { m: 'booked', p: 'free' }); // label '8'
  it('match per etichetta esatta, case-insensitive', () => {
    expect(matchesQuery(omb, '8', [])).toBe(true);
    expect(matchesQuery({ ...omb, label: '20BIS' }, '20bis', [])).toBe(true);
  });
  it('NO match per etichetta parziale (8 non matcha 18)', () => {
    expect(matchesQuery({ ...omb, label: '18' }, '8', [])).toBe(false);
  });
  it('match per cliente substring (min 2 char)', () => {
    expect(matchesQuery(omb, 'ross', ['Mario Rossi'])).toBe(true);
    expect(matchesQuery(omb, 'r', ['Mario Rossi'])).toBe(false);
  });
  it('query vuota/spazi → mai match', () => {
    expect(matchesQuery(omb, '  ', ['Mario Rossi'])).toBe(false);
  });
});

describe('namesByUmbrella', () => {
  it('aggrega i nomi dei clienti per ombrellone dai booking del giorno', () => {
    const bookings = [
      { id: 'b-1', umbrellaId: 'o-8', customerId: 'c-1' },
      { id: 'b-2', umbrellaId: 'o-8', customerId: 'c-2' },
      { id: 'b-3', umbrellaId: 'o-1', customerId: 'c-manca' },
    ] as never[];
    const customers = [
      { id: 'c-1', firstName: 'Mario', lastName: 'Rossi' },
      { id: 'c-2', firstName: 'Luca', lastName: 'Bianchi' },
    ] as never[];
    const m = namesByUmbrella(bookings, customers);
    expect(m.get('o-8')).toEqual(['Mario Rossi', 'Luca Bianchi']);
    expect(m.get('o-1')).toEqual([]); // cliente non trovato → nessun nome, nessun crash
  });
});
