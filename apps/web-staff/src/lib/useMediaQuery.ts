import { ref, onScopeDispose, type Ref } from 'vue';

/** Ref reattivo a una media query. Difensivo: se matchMedia non c'è (jsdom), resta false. */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return matches;
  const mql = window.matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e: MediaQueryListEvent) => { matches.value = e.matches; };
  mql.addEventListener('change', onChange);
  onScopeDispose(() => mql.removeEventListener('change', onChange));
  return matches;
}
