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

  it('subscription -> forfait, indipendente dai giorni (tariffa subscription-specifica)', () => {
    const r = resolvePrice(
      ctx({ type: 'subscription', startDate: '2026-07-15', endDate: '2026-07-20' }),
      [rate({ type: 'subscription', price: 200 })],
    );
    expect(r).toMatchObject({ totalPrice: 200 });
  });

  it('subscription: la tariffa Abbonamento (800) batte una fascia-specifica wildcard (28) — il bug esatto', () => {
    const fasciaWildcard = rate({ timeSlotId: 'slot-am', price: 28 }); // type=null, fascia-specifica
    const abbonamento = rate({ type: 'subscription', price: 800 });    // subscription, fascia null
    const r = resolvePrice(ctx({ type: 'subscription' }), [fasciaWildcard, abbonamento]);
    expect(r).toMatchObject({ ok: true, totalPrice: 800 });
  });

  it('subscription: con solo catch-all wildcard -> NO_RATE (partizione: il wildcard non prezza l abbonamento)', () => {
    expect(resolvePrice(ctx({ type: 'subscription' }), [CATCH_ALL])).toEqual({ ok: false, reason: 'NO_RATE' });
  });

  it('partizione non regredisce per/day: daily e periodic sono ancora prezzati dal catch-all wildcard', () => {
    expect(resolvePrice(ctx({ type: 'daily' }), [CATCH_ALL])).toMatchObject({ ok: true, totalPrice: 28 });
    const per = resolvePrice(ctx({ type: 'periodic', startDate: '2026-07-15', endDate: '2026-07-17' }), [CATCH_ALL]);
    expect(per).toMatchObject({ ok: true, totalPrice: 84 }); // 28 x 3 giorni
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

/**
 * L'ordine totale di ADR-0032 §2 era testato su **3 coppie su 15** (AUD-025): scambiare settore e
 * pacchetto in `specificity()` lasciava **tutti e 17 i test verdi**, misurato prima di scrivere
 * questo blocco. Un listino con una regola di settore e una di pacchetto entrambe applicabili
 * avrebbe cominciato a prezzare con l'altra, in silenzio.
 *
 * L'ordine è dichiarato **una volta** qui sotto — è la specifica, non una copia del codice — e le
 * 15 coppie sono derivate da quella dichiarazione. Cambiare l'ordine nell'engine senza cambiare
 * questa lista rende rossi tutti i confronti che la traversata attraversa.
 *
 * ⚠️ La coppia fascia↔tipo non è testabile passando dagli abbonamenti: per `type='subscription'`
 * la partizione di ADR-0035 **filtra via** la rate a fascia wildcard dentro `isApplicable`, quindi
 * resta un solo candidato e `compareSpecificity` non viene mai invocato (è la ragione per cui il
 * test «Abbonamento batte fascia-specifica» non copriva questa coppia). Qui il contesto è `daily`,
 * dove entrambe le rate restano applicabili e il confronto avviene davvero.
 */
describe('resolvePrice — ordine totale di precedenza (ADR-0032 §2)', () => {
  /** Contesto che rende applicabile OGNI dimensione insieme: è ciò che fa avvenire il confronto. */
  const ctxCompleto = ctx({
    type: 'daily', sectorId: 'sec-1', rowId: 'row-1', packageId: 'pkg-1', timeSlotId: 'slot-am',
    startDate: '2026-07-15', endDate: '2026-07-15',
  });

  const PRECEDENZA: Array<{ nome: string; dim: Partial<RateRow> }> = [
    { nome: 'periodo', dim: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } },
    { nome: 'fila', dim: { rowId: 'row-1' } },
    { nome: 'settore', dim: { sectorId: 'sec-1' } },
    { nome: 'pacchetto', dim: { packageId: 'pkg-1' } },
    { nome: 'fascia', dim: { timeSlotId: 'slot-am' } },
    { nome: 'tipo', dim: { type: 'daily' } },
  ];

  const coppie = PRECEDENZA.flatMap((piuForte, i) =>
    PRECEDENZA.slice(i + 1).map((piuDebole) => ({ piuForte, piuDebole })),
  );

  it('le coppie derivate dall’ordine sono tutte e 15 (il test guarda dove crede di guardare)', () => {
    expect(coppie).toHaveLength(15);
  });

  it.each(coppie.map((c) => [c.piuForte.nome, c.piuDebole.nome, c] as const))(
    '%s batte %s',
    (_a, _b, { piuForte, piuDebole }) => {
      const vince = rate({ id: `r-${piuForte.nome}`, price: 10, ...piuForte.dim });
      const perde = rate({ id: `r-${piuDebole.nome}`, price: 99, ...piuDebole.dim });

      // In entrambi gli ordini di input: la precedenza non deve dipendere da come arrivano le rate.
      for (const rates of [[vince, perde], [perde, vince]]) {
        const res = resolvePrice(ctxCompleto, rates);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.rate.id).toBe(`r-${piuForte.nome}`);
        expect(res).toMatchObject({ totalPrice: 10 });
      }
    },
  );
});
