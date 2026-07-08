import { reconcileCessionPayment } from './cession.payment';

describe('reconcileCessionPayment (D-013 ADR-0047: movimento netto, refundedAmount intatto)', () => {
  it('lido processa (collected 1000, total 1000, refund 500, collect 500) -> netto 1000, paid', () => {
    expect(reconcileCessionPayment(1000, 1000, 500, 500)).toEqual({ ok: true, newCollected: 1000, paymentStatus: 'paid' });
  });
  it('regolamento privato (0/0) -> netto 1000, paid', () => {
    expect(reconcileCessionPayment(1000, 1000, 0, 0)).toEqual({ ok: true, newCollected: 1000, paymentStatus: 'paid' });
  });
  it('rinegoziato (refund 500, collect 400) -> netto 900, partial', () => {
    expect(reconcileCessionPayment(1000, 1000, 500, 400)).toEqual({ ok: true, newCollected: 900, paymentStatus: 'partial' });
  });
  it('azzera incasso (refund 1000, collect 0) -> netto 0, unpaid', () => {
    expect(reconcileCessionPayment(1000, 1000, 1000, 0)).toEqual({ ok: true, newCollected: 0, paymentStatus: 'unpaid' });
  });
  it('refund > collected -> BAD_REFUND', () => {
    expect(reconcileCessionPayment(1000, 1000, 1500, 0)).toEqual({ ok: false, reason: 'BAD_REFUND' });
  });
  it('collect negativo -> BAD_COLLECT', () => {
    expect(reconcileCessionPayment(1000, 1000, 0, -1)).toEqual({ ok: false, reason: 'BAD_COLLECT' });
  });
  it('netto oltre il totale -> OVER_TOTAL', () => {
    expect(reconcileCessionPayment(1000, 1000, 0, 1)).toEqual({ ok: false, reason: 'OVER_TOTAL' });
  });
  it('confronto in centesimi: decimali non falsano paid', () => {
    expect(reconcileCessionPayment(999.99, 999.99, 0, 0)).toEqual({ ok: true, newCollected: 999.99, paymentStatus: 'paid' });
  });
});
