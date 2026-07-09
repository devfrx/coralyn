import { describe, it, expect } from 'vitest';
import { suggestedRefund } from './terminationRefund';

// Stagione 2026: 2026-05-01 → 2026-09-30 (153 giorni inclusivi), abbonamento pagato per intero.
const paid = { startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, amountCollected: 800 };

describe('suggestedRefund', () => {
  it('metà stagione: rende ~la quota non goduta', () => {
    // servedDays(05-01→07-01)=61; earned=800*61/153=318.95; suggested=481.05
    expect(suggestedRefund(paid, '2026-07-01')).toBeCloseTo(481.05, 2);
  });

  it('disdetta subito dopo l\'inizio: rimborso quasi pieno', () => {
    // servedDays=1; earned=800/153=5.23; suggested=794.77
    expect(suggestedRefund(paid, '2026-05-02')).toBeCloseTo(794.77, 2);
  });

  it('disdetta all\'ultimo giorno: rimborso minimo', () => {
    // servedDays=152; earned=794.77; suggested=5.23
    expect(suggestedRefund(paid, '2026-09-30')).toBeCloseTo(5.23, 2);
  });

  it('non pagato: nessun rimborso (clamp a 0)', () => {
    expect(suggestedRefund({ ...paid, amountCollected: 0 }, '2026-07-01')).toBe(0);
  });

  it('clampa al residuo quando ci sono già rimborsi (es. sospensione)', () => {
    // pianificati 153 giorni (05-01→09-30), serviti pochi → suggerimento grezzo alto,
    // ma residuo = 800 − 700 = 100 → il suggerimento non supera 100
    const out = suggestedRefund(
      { startDate: '2026-05-01', endDate: '2026-09-30', totalPrice: 800, amountCollected: 800, refundedAmount: 700 },
      '2026-05-10',
    );
    expect(out).toBeLessThanOrEqual(100);
  });
});
