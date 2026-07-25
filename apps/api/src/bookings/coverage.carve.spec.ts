import { carveInterval, type DateSpan } from './coverage.carve';

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
const span = (id: string, start: string, end: string): DateSpan & { id: string } => ({
  id,
  startDate: d(start),
  endDate: d(end),
});
/** Forma leggibile del risultato: `[idFrammento, [[start, end], …]]`. */
const shape = <T extends DateSpan & { id: string }>(
  ops: { fragment: T; remaining: DateSpan[] }[],
): [string, [string, string][]][] =>
  ops.map((o) => [
    o.fragment.id,
    o.remaining.map((r) => [r.startDate.toISOString().slice(0, 10), r.endDate.toISOString().slice(0, 10)]),
  ]);

describe('carveInterval — buco chiuso [from, to]', () => {
  const full = [span('A', '2026-05-01', '2026-09-30')];

  it('buco interno → il frammento si spezza in testa e coda', () => {
    expect(shape(carveInterval(full, d('2026-07-20'), d('2026-07-26')))).toEqual([
      ['A', [['2026-05-01', '2026-07-19'], ['2026-07-27', '2026-09-30']]],
    ]);
  });

  it('buco a giorno singolo (assenza comunicata) → testa e coda', () => {
    expect(shape(carveInterval(full, d('2026-08-15'), d('2026-08-15')))).toEqual([
      ['A', [['2026-05-01', '2026-08-14'], ['2026-08-16', '2026-09-30']]],
    ]);
  });

  it('buco ancorato all’inizio del frammento → nessuna testa vuota, solo la coda', () => {
    expect(shape(carveInterval(full, d('2026-05-01'), d('2026-05-10')))).toEqual([
      ['A', [['2026-05-11', '2026-09-30']]],
    ]);
  });

  it('buco ancorato alla fine del frammento → nessuna coda invertita, solo la testa (P1-001)', () => {
    expect(shape(carveInterval(full, d('2026-09-01'), d('2026-09-30')))).toEqual([
      ['A', [['2026-05-01', '2026-08-31']]],
    ]);
  });

  it('buco che copre il frammento intero → il frammento sparisce', () => {
    expect(shape(carveInterval(full, d('2026-04-01'), d('2026-10-31')))).toEqual([['A', []]]);
  });

  it('frammenti non intersecati non compaiono nel risultato', () => {
    const fragments = [span('A', '2026-05-01', '2026-06-30'), span('B', '2026-08-01', '2026-09-30')];
    expect(shape(carveInterval(fragments, d('2026-08-10'), d('2026-08-20')))).toEqual([
      ['B', [['2026-08-01', '2026-08-09'], ['2026-08-21', '2026-09-30']]],
    ]);
  });

  it('un buco a cavallo di piu’ frammenti li taglia ciascuno rispetto a se’ stesso', () => {
    const fragments = [span('A', '2026-05-01', '2026-08-14'), span('B', '2026-08-16', '2026-09-30')];
    expect(shape(carveInterval(fragments, d('2026-08-01'), d('2026-08-20')))).toEqual([
      ['A', [['2026-05-01', '2026-07-31']]],
      ['B', [['2026-08-21', '2026-09-30']]],
    ]);
  });

  // Il caso che produceva il range invertito: `to` coincide con la fine del FRAMMENTO ma cade
  // dentro lo span di contratto, quindi la guardia RETURN_OUT di `suspend` non lo intercetta.
  it('REGRESSIONE P1-001: to = fine del frammento su coverage frammentata → nessuna coda', () => {
    const fragments = [span('A', '2026-05-01', '2026-08-14'), span('B', '2026-08-16', '2026-09-30')];
    expect(shape(carveInterval(fragments, d('2026-08-01'), d('2026-08-14')))).toEqual([
      ['A', [['2026-05-01', '2026-07-31']]],
    ]);
  });
});

describe('carveInterval — buco aperto a destra (to = null)', () => {
  it('tronca il frammento che contiene `from` ed elimina quelli successivi', () => {
    const fragments = [span('A', '2026-05-01', '2026-06-30'), span('B', '2026-07-01', '2026-09-30')];
    expect(shape(carveInterval(fragments, d('2026-06-15'), null))).toEqual([
      ['A', [['2026-05-01', '2026-06-14']]],
      ['B', []],
    ]);
  });

  it('`from` sul primo giorno del frammento → il frammento sparisce, nessuna testa vuota', () => {
    expect(shape(carveInterval([span('A', '2026-05-01', '2026-09-30')], d('2026-05-01'), null))).toEqual([
      ['A', []],
    ]);
  });

  it('`from` oltre tutti i frammenti → nessuna operazione', () => {
    expect(shape(carveInterval([span('A', '2026-05-01', '2026-06-30')], d('2026-07-01'), null))).toEqual([]);
  });
});

describe('carveInterval — invariante', () => {
  const fragments = [span('A', '2026-05-01', '2026-08-14'), span('B', '2026-08-16', '2026-09-30')];
  const days = ['2026-04-25', '2026-05-01', '2026-07-31', '2026-08-14', '2026-08-15', '2026-08-16', '2026-09-30', '2026-10-05'];

  it('nessuno span prodotto e’ vuoto o invertito, su ogni combinazione from ≤ to', () => {
    for (const from of days) {
      for (const to of [...days, null]) {
        if (to !== null && to < from) continue;
        for (const op of carveInterval(fragments, d(from), to === null ? null : d(to))) {
          for (const r of op.remaining) {
            expect(r.startDate.getTime()).toBeLessThanOrEqual(r.endDate.getTime());
          }
        }
      }
    }
  });
});
