import { describe, it, expect } from 'vitest';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { suggestedSuspensionRefund } from './suspensionRefund';

const sub = (over: Partial<CustomerBookingDTO> = {}): CustomerBookingDTO => ({
  id: 's1', umbrellaId: 'u1', timeSlotId: 't1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12', ...over,
});

describe('suggestedSuspensionRefund', () => {
  it('pro-rata sui giorni sospesi (R − S) / giorni pianificati', () => {
    // pianificati = 153 (2026-05-01..2026-09-30 incl.); sospesi = 7 (2026-07-20..2026-07-26) = R−S con R=07-27
    expect(suggestedSuspensionRefund(sub(), '2026-07-20', '2026-07-27')).toBeCloseTo(36.6, 1);
  });

  it('clampa al residuo incassato (amountCollected − refundedAmount)', () => {
    const r = suggestedSuspensionRefund(sub({ amountCollected: 20, refundedAmount: 5 }), '2026-05-01', '2026-09-30');
    expect(r).toBe(15); // residuo 15, il pro-rata pieno è ben oltre
  });

  it('ritorno ≤ inizio → 0', () => {
    expect(suggestedSuspensionRefund(sub(), '2026-07-20', '2026-07-20')).toBe(0);
  });
});
