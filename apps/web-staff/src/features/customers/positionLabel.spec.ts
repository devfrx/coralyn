import { describe, it, expect } from 'vitest';
import { positionLabel } from './positionLabel';

describe('positionLabel — chip posizione Scheda cliente', () => {
  it('vivo: «Settore · label»', () => {
    expect(positionLabel({ sectorName: 'Centro', umbrellaLabel: '12' })).toBe('Centro · 12');
  });
  it('vivo senza settore (fallback esistente): «– · label»', () => {
    expect(positionLabel({ umbrellaLabel: '12' })).toBe('– · 12');
  });
  it('ritirato: snapshot storico «Settore · Fila · label», ignora sectorName', () => {
    expect(positionLabel({
      sectorName: undefined, umbrellaLabel: '12',
      umbrellaRetiredAt: '2026-07-01T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    })).toBe('Centro · Fila 1 · 12');
  });
  it('ritirato senza snapshot: «– · label» (la marca resta compito del Badge)', () => {
    expect(positionLabel({ umbrellaLabel: '12', umbrellaRetiredAt: '2026-07-01T10:00:00.000Z' })).toBe('– · 12');
  });
});
