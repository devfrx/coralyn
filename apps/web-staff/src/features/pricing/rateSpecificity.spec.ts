import { describe, it, expect } from 'vitest';
import type { RateDTO } from '@coralyn/contracts';
import { rateSpecificity } from './rateSpecificity';

const base = (over: Partial<RateDTO>): RateDTO => ({ id: 'r', seasonId: 's', price: 10, ...over });

describe('rateSpecificity', () => {
  it('la catch-all (nessuna dimensione) è la meno specifica', () => {
    expect(rateSpecificity(base({}))).toBe(0);
  });
  it('il periodo (priorità 1) batte la fila (priorità 2)', () => {
    const period = rateSpecificity(base({ periodStart: '2026-08-01', periodEnd: '2026-08-10' }));
    const row = rateSpecificity(base({ rowId: 'row-1' }));
    expect(period).toBeGreaterThan(row);
  });
  it('la fila batte il settore batte il pacchetto batte la fascia batte il tipo', () => {
    const row = rateSpecificity(base({ rowId: 'r1' }));
    const sector = rateSpecificity(base({ sectorId: 's1' }));
    const pkg = rateSpecificity(base({ packageId: 'p1' }));
    const slot = rateSpecificity(base({ timeSlotId: 't1' }));
    const type = rateSpecificity(base({ type: 'daily' }));
    expect(row).toBeGreaterThan(sector);
    expect(sector).toBeGreaterThan(pkg);
    expect(pkg).toBeGreaterThan(slot);
    expect(slot).toBeGreaterThan(type);
  });
});
