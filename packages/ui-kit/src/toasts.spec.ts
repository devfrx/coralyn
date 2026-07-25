import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pushToast, dismissToast, clearToasts, useToasts } from './toasts';

beforeEach(() => { clearToasts(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it('pushToast accoda; dismissToast rimuove', () => {
    pushToast('Errore A');
    pushToast('Errore B');
    const { items } = useToasts();
    expect(items.map((t) => t.message)).toEqual(['Errore A', 'Errore B']);
    dismissToast(items[0].id);
    expect(items.map((t) => t.message)).toEqual(['Errore B']);
  });

  it('auto-dismiss dopo 6 secondi', () => {
    pushToast('Errore effimero');
    expect(useToasts().items).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(useToasts().items).toHaveLength(0);
  });
});
