import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useMediaQuery } from './useMediaQuery';

type Listener = (e: { matches: boolean }) => void;
function fakeMatchMedia(initial: boolean) {
  let listener: Listener | null = null;
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => { listener = l; },
    removeEventListener: vi.fn(),
    // emette un cambio simulando il browser
    _emit(v: boolean) { mql.matches = v; listener?.({ matches: v }); },
  };
  return mql;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('useMediaQuery', () => {
  it('senza window.matchMedia ritorna false senza lanciare', () => {
    vi.stubGlobal('matchMedia', undefined);
    const scope = effectScope();
    scope.run(() => { expect(useMediaQuery('(min-width: 1024px)').value).toBe(false); });
    scope.stop();
  });

  it('riflette il valore iniziale e reagisce ai cambi', async () => {
    const mql = fakeMatchMedia(false);
    vi.stubGlobal('matchMedia', () => mql);
    const scope = effectScope();
    let r!: { value: boolean };
    scope.run(() => { r = useMediaQuery('(min-width: 1024px)'); });
    expect(r.value).toBe(false);
    mql._emit(true);
    await nextTick();
    expect(r.value).toBe(true);
    scope.stop();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});
