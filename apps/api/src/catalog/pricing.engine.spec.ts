import { resolvePrice, type PricingContext, type RateRow } from './pricing.engine';

const ctx = (over: Partial<PricingContext> = {}): PricingContext => ({
  type: 'daily',
  sectorId: 'sec-1',
  rowId: 'row-1',
  packageId: null,
  timeSlotId: 'slot-am',
  startDate: '2026-07-15',
  endDate: '2026-07-15',
  ...over,
});

const rate = (over: Partial<RateRow>): RateRow => ({
  id: 'r-test', type: null, sectorId: null, rowId: null, packageId: null, timeSlotId: null,
  periodStart: null, periodEnd: null, price: 0, ...over,
});

const CATCH_ALL = rate({ price: 28 });

describe('resolvePrice', () => {
  it('nessuna rate -> NO_RATE', () => {
    expect(resolvePrice(ctx(), [])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('rate esistenti ma nessuna applicabile (manca catch-all) -> NO_RATE', () => {
    const only = rate({ rowId: 'row-ALTRA', price: 50 });
    expect(resolvePrice(ctx(), [only])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('solo catch-all -> la sceglie (daily = 1 giorno)', () => {
    const r = resolvePrice(ctx(), [CATCH_ALL]);
    expect(r).toMatchObject({ ok: true, totalPrice: 28 });
  });

  it('precedenza: rowId batte packageId batte catch-all (esempio §3 -> 45)', () => {
    const rRow = rate({ rowId: 'row-1', price: 45 });
    const rPkg = rate({ packageId: 'pkg-1', price: 50 });
    const r = resolvePrice(ctx({ packageId: 'pkg-1' }), [CATCH_ALL, rPkg, rRow]);
    expect(r).toMatchObject({ ok: true, totalPrice: 45 });
  });

  it('sectorId batte catch-all ma perde su rowId', () => {
    const rSector = rate({ sectorId: 'sec-1', price: 35 });
    const rRow = rate({ rowId: 'row-1', price: 45 });
    expect(resolvePrice(ctx(), [CATCH_ALL, rSector])).toMatchObject({ totalPrice: 35 });
    expect(resolvePrice(ctx(), [CATCH_ALL, rSector, rRow])).toMatchObject({ totalPrice: 45 });
  });

  it('periodo (sotto-periodo) batte una regola di fila (priorita 1)', () => {
    const rRow = rate({ rowId: 'row-1', price: 45 });
    const rPeriod = rate({ periodStart: '2026-08-10', periodEnd: '2026-08-20', price: 60 });
    const r = resolvePrice(ctx({ startDate: '2026-08-15', endDate: '2026-08-15' }), [rRow, rPeriod, CATCH_ALL]);
    expect(r).toMatchObject({ totalPrice: 60 });
  });

  it('matching periodo: fuori dal sotto-periodo NON applica quella rate', () => {
    const rPeriod = rate({ periodStart: '2026-08-10', periodEnd: '2026-08-20', price: 60 });
    const r = resolvePrice(ctx({ startDate: '2026-07-15', endDate: '2026-07-15' }), [CATCH_ALL, rPeriod]);
    expect(r).toMatchObject({ totalPrice: 28 }); // catch-all
  });

  it('matching fascia: una rate slot-specifica si applica solo a quello slot', () => {
    const rPm = rate({ timeSlotId: 'slot-pm', price: 40 });
    expect(resolvePrice(ctx({ timeSlotId: 'slot-pm' }), [CATCH_ALL, rPm])).toMatchObject({ totalPrice: 40 });
    expect(resolvePrice(ctx({ timeSlotId: 'slot-am' }), [CATCH_ALL, rPm])).toMatchObject({ totalPrice: 28 });
  });

  it('daily -> price x 1', () => {
    const r = resolvePrice(ctx({ type: 'daily' }), [rate({ price: 28 })]);
    expect(r).toMatchObject({ ok: true, totalPrice: 28 });
  });

  it('periodic su piu giorni -> price x giorni (estremi inclusi)', () => {
    const r = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 10 })]);
    expect(r).toMatchObject({ totalPrice: 30 }); // 3 giorni
  });

  it('subscription -> forfait, indipendente dai giorni', () => {
    const r = resolvePrice(ctx({ type: 'subscription', startDate: '2026-07-15', endDate: '2026-07-20' }), [rate({ price: 200 })]);
    expect(r).toMatchObject({ totalPrice: 200 });
  });

  it('centesimi: 0.1 x 3 senza errore float (periodic)', () => {
    const r = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [rate({ price: 0.1 })]);
    expect(r).toMatchObject({ totalPrice: 0.3 });
  });

  it('pareggio di firma -> scelta deterministica (prima in input)', () => {
    const a = rate({ rowId: 'row-1', price: 45 });
    const b = rate({ rowId: 'row-1', price: 99 });
    expect(resolvePrice(ctx(), [a, b])).toMatchObject({ totalPrice: 45 });
  });

  it('ritorna la Rate vincente con il suo id (provenienza B2)', () => {
    const rPkg = rate({ id: 'r-pkg', packageId: 'pkg-1', price: 50 });
    const res = resolvePrice(ctx({ packageId: 'pkg-1' }), [CATCH_ALL, rPkg]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rate.id).toBe('r-pkg');
  });
});
