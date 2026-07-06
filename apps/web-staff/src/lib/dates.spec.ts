import { describe, it, expect } from 'vitest';
import { addDays, todayIso } from './dates';

describe('addDays', () => {
  it('somma e sottrae giorni nello stesso mese', () => {
    expect(addDays('2026-07-06', 1)).toBe('2026-07-07');
    expect(addDays('2026-07-06', -1)).toBe('2026-07-05');
    expect(addDays('2026-07-06', 0)).toBe('2026-07-06');
  });
  it('attraversa il confine di mese', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
  it('attraversa il confine di anno', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('gestisce l anno bisestile (29 feb 2028)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
  it('e DST-safe: attorno al cambio ora legale in Italia (29 mar 2026) resta stabile', () => {
    // La primavera 2026 in Europa: ora legale dal 29 marzo. L aritmetica UTC non deve saltare/duplicare un giorno.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    // ora solare (autunno): 25 ott 2026
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('e simmetrica: addDays(addDays(x, n), -n) === x', () => {
    expect(addDays(addDays('2026-03-29', 5), -5)).toBe('2026-03-29');
  });
});

describe('todayIso', () => {
  it('restituisce il formato yyyy-mm-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('e coerente con la data odierna nel fuso Europe/Rome', () => {
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    expect(todayIso()).toBe(expected);
  });
});
