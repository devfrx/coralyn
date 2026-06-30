import { isValidCalendarDate, formatDbDate, todayInRome } from './dates';

describe('isValidCalendarDate', () => {
  it('accetta una data reale', () => {
    expect(isValidCalendarDate('2026-07-15')).toBe(true);
  });
  it('rifiuta forma sbagliata', () => {
    expect(isValidCalendarDate('15-07-2026')).toBe(false);
  });
  it('rifiuta una data calendariale impossibile', () => {
    expect(isValidCalendarDate('2026-13-40')).toBe(false);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
  });
});

describe('formatDbDate', () => {
  it('serializza una @db.Date (mezzanotte UTC) senza off-by-one', () => {
    expect(formatDbDate(new Date('2026-07-15T00:00:00Z'))).toBe('2026-07-15');
  });
});

describe('todayInRome', () => {
  it('ritorna yyyy-mm-dd', () => {
    expect(todayInRome()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
