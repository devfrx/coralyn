import { suggestedCessionRefund } from './cessionRefund';

const b = { startDate: '2026-06-01', endDate: '2026-09-30', totalPrice: 1000, amountCollected: 1000, refundedAmount: 0 };

describe('suggestedCessionRefund', () => {
  it('pro-rata del residuo [effectiveDate, end]', () => {
    // plannedDays = 122; residualDays da 2026-08-01 a 2026-09-30 = 61 -> round2(1000*61/122) = 500
    expect(suggestedCessionRefund(b, '2026-08-01')).toBe(500);
  });
  it('effectiveDate = start -> intero (tutto residuo)', () => {
    expect(suggestedCessionRefund(b, '2026-06-01')).toBe(1000);
  });
  it('clampa al residuo incassato (amountCollected − refundedAmount)', () => {
    expect(suggestedCessionRefund({ ...b, amountCollected: 300, refundedAmount: 0 }, '2026-06-01')).toBe(300);
  });
  it('effectiveDate oltre end -> 0', () => {
    expect(suggestedCessionRefund(b, '2026-10-15')).toBe(0);
  });
});
