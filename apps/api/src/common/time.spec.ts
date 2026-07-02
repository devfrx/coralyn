import { isValidClockTime, toDbTime, formatDbTime } from './time';

describe('isValidClockTime', () => {
  it('accetta un orario 24h reale', () => {
    expect(isValidClockTime('08:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('00:00')).toBe(true);
  });
  it('rifiuta forma o valore fuori range', () => {
    expect(isValidClockTime('8:00')).toBe(false);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('08:60')).toBe(false);
    expect(isValidClockTime('0800')).toBe(false);
  });
});

describe('round-trip UTC (ADR-0031)', () => {
  it('toDbTime scrive su base 1970-01-01 in UTC', () => {
    expect(toDbTime('08:00').toISOString()).toBe('1970-01-01T08:00:00.000Z');
  });
  it('formatDbTime legge una @db.Time senza slittamento locale', () => {
    expect(formatDbTime(new Date('1970-01-01T13:00:00Z'))).toBe('13:00');
    expect(formatDbTime(new Date('1970-01-01T00:05:00Z'))).toBe('00:05');
  });
});
