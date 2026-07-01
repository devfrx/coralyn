import { describe, it, expect } from 'vitest';
import { formatEuro, initials, dateRange } from './format';

describe('formatEuro', () => {
  it('formatta un numero come "€ x.xx"', () => {
    expect(formatEuro(28)).toBe('€ 28.00');
    expect(formatEuro(0)).toBe('€ 0.00');
    expect(formatEuro(1234.5)).toBe('€ 1234.50');
  });
});

describe('initials', () => {
  it('prende le iniziali maiuscole delle prime 2 parole', () => {
    expect(initials('Mario Rossi')).toBe('MR');
    expect(initials('anna verdi')).toBe('AV');
  });
  it('con una sola parola prende una sola iniziale', () => {
    expect(initials('Mario')).toBe('M');
  });
  it('ignora parole oltre la seconda', () => {
    expect(initials('Anna Maria Verdi')).toBe('AM');
  });
});

describe('dateRange', () => {
  it('ritorna la data singola se start === end', () => {
    expect(dateRange('2026-07-15', '2026-07-15')).toBe('2026-07-15');
  });
  it('ritorna "start → end" se diverse', () => {
    expect(dateRange('2026-07-24', '2026-07-26')).toBe('2026-07-24 → 2026-07-26');
  });
});
