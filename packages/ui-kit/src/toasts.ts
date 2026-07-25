import { reactive } from 'vue';

/** Coda toast module-scope (non Pinia): dev'essere usabile anche fuori dal contesto
 *  componente/store, es. dall'onError di default di `mutationResource` (@coralyn/data-layer).
 *
 *  Vive qui e non nel data-layer perché `Toast.vue` (il singolo toast) e `ToastHost.vue` (il
 *  contenitore che rende la coda) sono già componenti di questo package: item, coda e host sono
 *  una feature sola, e spaccarla su due package obbligherebbe a toccarne due per aggiungere una
 *  variante. È stato di PRESENTAZIONE senza contenuto di dominio, quindi rientra nel perimetro
 *  di ui-kit dichiarato in ADR-0056 (ADR-0058 §2 lo ratifica esplicitamente). */
export interface ToastItem { id: number; message: string }

const state = reactive<{ items: ToastItem[] }>({ items: [] });
let nextId = 1;
const AUTO_DISMISS_MS = 6000;

export function useToasts(): { items: ToastItem[] } {
  return state;
}
export function pushToast(message: string): void {
  const id = nextId++;
  state.items.push({ id, message });
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
}
export function dismissToast(id: number): void {
  const i = state.items.findIndex((t) => t.id === id);
  if (i >= 0) state.items.splice(i, 1);
}
export function clearToasts(): void {
  state.items.splice(0);
}
