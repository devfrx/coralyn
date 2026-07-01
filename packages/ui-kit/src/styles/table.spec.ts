import { describe, it, expect } from 'vitest';
import { TD, TD_FIRST, TD_RIGHT, TD_NUM } from './table';

describe('classi di cella tabella', () => {
  it('TD è la classe base della cella standard', () => {
    expect(TD).toBe('border-b border-[var(--color-border-row)] px-3.5 py-3.5');
  });
  it('TD_FIRST è la cella di prima colonna (px-[18px])', () => {
    expect(TD_FIRST).toBe('border-b border-[var(--color-border-row)] px-[18px] py-3.5');
  });
  it('TD_RIGHT è la cella allineata a destra (ultima colonna)', () => {
    expect(TD_RIGHT).toBe('border-b border-[var(--color-border-row)] px-[18px] py-3.5 text-right');
  });
  it('TD_NUM aggiunge tabular-nums', () => {
    expect(TD_NUM).toBe('tabular-nums');
  });
});
