import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Select from './Select.vue';
import Option from './Option.vue';

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// SelectContent (reka-ui) pianifica un setTimeout(0) reale alla chiusura per lasciare assestare la
// Presence, e lo annulla in onUnmounted: se il DOM viene ripulito prima che il wrapper sia smontato,
// il timeout scatta a test successivo iniziato e patcha nodi rimossi ("insertBefore" su parent null).
// afterEach smonta quindi il wrapper corrente PRIMA di pulire il body.
let current: ReturnType<typeof mount> | undefined;
afterEach(() => { current?.unmount(); current = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); });

// vue-test-utils .trigger() prova a impostare le proprietà passate su un evento già costruito: per
// PointerEvent, 'button' è ereditata (getter-only) da MouseEvent.prototype e getOwnPropertyDescriptor
// diretto non la trova, quindi l'assegnazione fallisce ("has only a getter"). Serve costruire
// l'evento con le proprietà già valorizzate e dispatchare a mano (reka-ui legge event.button/ctrlKey/
// pointerId/pointerType in SelectTrigger.js: onTriggerPointerDown → isPlainLeftClick).
function pointerdown(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: false, pointerId: 1 }));
}

describe('Option', () => {
  it('option disabled non selezionabile e marcata data-disabled', async () => {
    const w = current = mount(Select, {
      props: { modelValue: 'x' },
      slots: { default: '<Option value="x">Attiva</Option><Option value="y" disabled>Spenta</Option>' },
      global: { components: { Option } },
    });
    pointerdown(w.get('[role="combobox"]').element);
    await nextTick(); await nextTick();
    const spenta = Array.from(document.body.querySelectorAll('[role="option"]')).find((o) => o.textContent?.includes('Spenta'))!;
    expect(spenta.hasAttribute('data-disabled')).toBe(true);
    spenta.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await nextTick(); await nextTick();
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it("l'item selezionato mostra l'indicatore check", async () => {
    const w = current = mount(Select, {
      props: { modelValue: 'x' },
      slots: { default: '<Option value="x">Attiva</Option>' },
      global: { components: { Option } },
    });
    pointerdown(w.get('[role="combobox"]').element);
    await nextTick(); await nextTick();
    const item = document.body.querySelector('[role="option"]')!;
    expect(item.getAttribute('data-state')).toBe('checked');
    expect(item.querySelector('svg')).toBeTruthy();
  });
});
