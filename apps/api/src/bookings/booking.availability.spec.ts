import { slotsOverlap, dateRangesOverlap } from './booking.availability';

const t = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);
const morning = { startTime: t('08:00'), endTime: t('13:00') };
const afternoon = { startTime: t('13:00'), endTime: t('19:00') };
const fullDay = { startTime: t('08:00'), endTime: t('19:00') };

describe('slotsOverlap (semiaperto [start, end))', () => {
  it('fasce contigue al bordo (13:00) NON si sovrappongono', () => {
    expect(slotsOverlap(morning, afternoon)).toBe(false);
  });
  it('stessa fascia si sovrappone', () => {
    expect(slotsOverlap(morning, morning)).toBe(true);
  });
  it('giornata intera copre mattina e pomeriggio', () => {
    expect(slotsOverlap(fullDay, morning)).toBe(true);
    expect(slotsOverlap(fullDay, afternoon)).toBe(true);
  });
});

describe('dateRangesOverlap (estremi inclusi)', () => {
  const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
  it('intervalli intersecanti', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-20'), d('2026-07-15'), d('2026-07-15'))).toBe(true);
  });
  it('intervalli disgiunti', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-12'), d('2026-07-13'), d('2026-07-14'))).toBe(false);
  });
  it('estremo a contatto è incluso', () => {
    expect(dateRangesOverlap(d('2026-07-10'), d('2026-07-12'), d('2026-07-12'), d('2026-07-14'))).toBe(true);
  });
});
