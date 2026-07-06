import { describe, it, expect, vi, afterEach } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('restituisce il formato yyyy-mm-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Oracolo indipendente dall'implementazione: pinniamo istanti UTC fissi e verifichiamo il
  // giorno di calendario a Roma. Non riusiamo la stessa costruzione Intl dell'impl.
  it('pinna il fuso Europe/Rome in ora solare (CET, UTC+1)', () => {
    vi.useFakeTimers();
    // 28 mar 2026 23:30 UTC = 29 mar 00:30 a Roma (CET) → giorno Rome = 29
    vi.setSystemTime(new Date('2026-03-28T23:30:00Z'));
    expect(todayIso()).toBe('2026-03-29');
  });

  it('pinna il fuso Europe/Rome in ora legale (CEST, UTC+2) e differisce dal giorno UTC', () => {
    vi.useFakeTimers();
    // 5 lug 2026 22:30 UTC = 6 lug 00:30 a Roma (CEST): UTC dice 5, Roma dice 6 → il fuso conta davvero
    vi.setSystemTime(new Date('2026-07-05T22:30:00Z'));
    expect(todayIso()).toBe('2026-07-06');
  });
});
