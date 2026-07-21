import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from 'vue';

export interface DelayedLoadingOptions {
  /** ms prima che il loading diventi visibile (evita flash su risposte rapide). */
  delay?: number;
  /** ms minimi di visibilità una volta comparso (evita skeleton-lampo). */
  minVisible?: number;
}

/**
 * Gate anti-flicker per gli stati di caricamento (spec 2026-07-21-loading-states §3.3):
 * visibile solo se l'attesa supera `delay`; una volta visibile resta almeno `minVisible`.
 */
export function useDelayedLoading(
  source: Ref<boolean> | (() => boolean),
  opts: DelayedLoadingOptions = {},
): Ref<boolean> {
  const { delay = 150, minVisible = 300 } = opts;
  const src = typeof source === 'function' ? computed(source) : source;
  const visible = ref(false);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;

  watch(
    src,
    (loading) => {
      if (loading) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (visible.value || showTimer) return;
        showTimer = setTimeout(() => {
          showTimer = null;
          visible.value = true;
          shownAt = Date.now();
        }, delay);
      } else {
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        if (!visible.value) return;
        const elapsed = Date.now() - shownAt;
        if (elapsed >= minVisible) { visible.value = false; return; }
        hideTimer = setTimeout(() => { hideTimer = null; visible.value = false; }, minVisible - elapsed);
      }
    },
    { immediate: true },
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    });
  }
  return visible;
}
