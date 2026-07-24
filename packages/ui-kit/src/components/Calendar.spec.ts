import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { today, getLocalTimeZone } from '@internationalized/date';
import Calendar from './Calendar.vue';

// reka-ui usa ResizeObserver/pointer-capture, assenti in jsdom (additivi, come Select.spec).
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

let current: ReturnType<typeof mount> | undefined;
afterEach(() => { current?.unmount(); current = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); });

// Celle-giorno del mese corrente (escluse quelle fuori-mese, che ripetono numeri di mesi adiacenti).
function dayCells(w: ReturnType<typeof mount>): HTMLElement[] {
  return Array.from(w.element.querySelectorAll('[data-reka-calendar-cell-trigger]:not([data-outside-view])'));
}
function cell(w: ReturnType<typeof mount>, day: number): HTMLElement {
  const el = dayCells(w).find((c) => c.textContent?.trim() === String(day));
  if (!el) throw new Error(`cella ${day} non trovata: ${dayCells(w).map((c) => c.textContent?.trim()).join(' ')}`);
  return el;
}

describe('Calendar (reka-ui, v-model ISO)', () => {
  it('mostra il mese del v-model e marca il giorno selezionato', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    expect(w.text().toLowerCase()).toContain('luglio');
    expect(w.text()).toContain('2026');
    expect(cell(w, 15).hasAttribute('data-selected')).toBe(true);
  });

  it('cliccando un giorno emette la stringa ISO di quel giorno (round-trip)', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    cell(w, 20).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick(); await nextTick();
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['2026-07-20']);
  });

  it('prevent-deselect: cliccare il giorno già selezionato non azzera il modello', async () => {
    const w = current = mount(Calendar, { props: { modelValue: '2026-07-15' } });
    await nextTick();
    cell(w, 15).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick(); await nextTick();
    const emits = w.emitted('update:modelValue') ?? [];
    expect(emits.every((e) => e[0] !== '')).toBe(true);
    expect(cell(w, 15).hasAttribute('data-selected')).toBe(true); // la selezione resta (prevent-deselect ha davvero effetto)
  });

  it('senza v-model mostra comunque una griglia col giorno di oggi marcato', async () => {
    const w = current = mount(Calendar);
    await nextTick();
    expect(w.element.querySelector('[data-today]')).toBeTruthy();
  });

  it('un giorno che è oggi ED è selezionato mantiene lo stato selezionato (nessuna collisione oggi/selezionato)', async () => {
    const todayIso = today(getLocalTimeZone()).toString(); // stessa fonte di reka-ui (isToday usa getLocalTimeZone): niente time-bomb TZ
    const w = current = mount(Calendar, { props: { modelValue: todayIso } });
    await nextTick();
    const day = Number(todayIso.slice(8, 10));
    const c = cell(w, day);
    expect(c.hasAttribute('data-selected')).toBe(true);
    expect(c.hasAttribute('data-today')).toBe(true);
    // il colore "oggi" è gated su :not([data-selected]) così il selezionato (text-white) vince sempre.
    // (letto dall'attributo class, non da w.html(), perché la serializzazione HTML esegue l'escape di "&" in "&amp;")
    expect(c.getAttribute('class')).toContain('[&[data-today]:not([data-selected])]:text-[var(--color-brand)]');
  });
});
