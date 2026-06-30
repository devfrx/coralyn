import { resolvePayment } from './booking.payment';

const TODAY = '2026-07-15';

describe('resolvePayment', () => {
  it('amount 0 su totale > 0 → unpaid, method/date null', () => {
    const r = resolvePayment({ amountCollected: 0 }, 28, TODAY);
    expect(r).toEqual({
      ok: true,
      fields: { amountCollected: 0, paymentStatus: 'unpaid', paymentMethod: null, collectionDate: null },
    });
  });

  it('amount = totale con metodo → paid, date = today', () => {
    const r = resolvePayment({ amountCollected: 28, paymentMethod: 'cash' }, 28, TODAY);
    expect(r).toEqual({
      ok: true,
      fields: { amountCollected: 28, paymentStatus: 'paid', paymentMethod: 'cash', collectionDate: TODAY },
    });
  });

  it('0 < amount < totale con metodo → partial', () => {
    const r = resolvePayment({ amountCollected: 10, paymentMethod: 'card' }, 28, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { paymentStatus: 'partial', amountCollected: 10, paymentMethod: 'card' } });
  });

  it('amount > totale → OVER_TOTAL', () => {
    expect(resolvePayment({ amountCollected: 30, paymentMethod: 'cash' }, 28, TODAY)).toEqual({
      ok: false,
      reason: 'OVER_TOTAL',
    });
  });

  it('amount > 0 senza metodo → METHOD_REQUIRED', () => {
    expect(resolvePayment({ amountCollected: 10 }, 28, TODAY)).toEqual({ ok: false, reason: 'METHOD_REQUIRED' });
  });

  it('collectionDate esplicita rispettata', () => {
    const r = resolvePayment({ amountCollected: 28, paymentMethod: 'transfer', collectionDate: '2026-07-01' }, 28, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { collectionDate: '2026-07-01' } });
  });

  it('reset (amount 0) azzera method/date anche se forniti', () => {
    const r = resolvePayment({ amountCollected: 0, paymentMethod: 'cash', collectionDate: '2026-07-01' }, 28, TODAY);
    expect(r).toEqual({
      ok: true,
      fields: { amountCollected: 0, paymentStatus: 'unpaid', paymentMethod: null, collectionDate: null },
    });
  });

  it('totalPrice 0 → paid (niente da incassare)', () => {
    expect(resolvePayment({ amountCollected: 0 }, 0, TODAY)).toEqual({
      ok: true,
      fields: { amountCollected: 0, paymentStatus: 'paid', paymentMethod: null, collectionDate: null },
    });
  });

  it('totalPrice 0 con amount > 0 → OVER_TOTAL', () => {
    expect(resolvePayment({ amountCollected: 5, paymentMethod: 'cash' }, 0, TODAY)).toEqual({
      ok: false,
      reason: 'OVER_TOTAL',
    });
  });

  it('confronto in centesimi: 0.1 + 0.2 non rompe l’uguaglianza', () => {
    const r = resolvePayment({ amountCollected: 0.3, paymentMethod: 'cash' }, 0.3, TODAY);
    expect(r).toMatchObject({ ok: true, fields: { paymentStatus: 'paid' } });
  });
});
