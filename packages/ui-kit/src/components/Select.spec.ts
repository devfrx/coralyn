import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Select from './Select.vue';
import Option from './Option.vue';

// reka-ui Popper misura via ResizeObserver (assente in jsdom); il trigger usa le pointer-capture API.
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

const OPTS = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
];

// vue-test-utils .trigger() prova a impostare le proprietà passate su un evento già costruito: per
// PointerEvent, 'button' è ereditata (getter-only) da MouseEvent.prototype e getOwnPropertyDescriptor
// diretto non la trova, quindi l'assegnazione fallisce ("has only a getter"). Serve costruire
// l'evento con le proprietà già valorizzate e dispatchare a mano (reka-ui legge event.button/ctrlKey/
// pointerId/pointerType in SelectTrigger.js: onTriggerPointerDown → isPlainLeftClick).
function pointerdown(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, ctrlKey: false, pointerId: 1 }));
}

async function open(w: ReturnType<typeof mount>) {
  pointerdown(w.get('[role="combobox"]').element);
  await nextTick(); await nextTick();
}

function bodyOptions(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="option"]'));
}

async function pick(label: string) {
  const el = bodyOptions().find((o) => o.textContent?.trim() === label);
  expect(el, `option «${label}» nel portal`).toBeTruthy();
  el!.dispatchEvent(new Event('pointerup', { bubbles: true }));
  await nextTick(); await nextTick();
}

describe('Select (reka-ui)', () => {
  it('mostra la label del valore selezionato nel trigger, anche a menu chiuso', async () => {
    const w = current = mount(Select, { props: { options: OPTS, modelValue: 'a' } });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Alfa');
  });

  it('apre il menu, elenca le option e aggiorna v-model alla selezione', async () => {
    const w = current = mount(Select, { props: { options: OPTS, modelValue: 'a' } });
    await open(w);
    expect(bodyOptions().map((o) => o.textContent?.trim())).toEqual(['Alfa', 'Beta']);
    await pick('Beta');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['b']);
  });

  it('round-trip del valore vuoto: Option value="" selezionabile, modello \'\' e label mostrata', async () => {
    const w = current = mount(Select, {
      props: { modelValue: 'p1' },
      slots: { default: '<Option value="">Nessun pacchetto</Option><Option value="p1">Standard</Option>' },
      global: { components: { Option } },
    });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Standard');
    await open(w);
    await pick('Nessun pacchetto');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    await w.setProps({ modelValue: '' });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Nessun pacchetto');
  });

  it('round-trip del valore vuoto anche via prop options (non solo via slot Option)', async () => {
    const withEmpty = [
      { value: '', label: 'Tutte' },
      { value: 's1', label: 'Fascia 1' },
    ];
    const w = current = mount(Select, { props: { options: withEmpty, modelValue: 's1' } });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Fascia 1');
    await open(w);
    await pick('Tutte');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    await w.setProps({ modelValue: '' });
    await nextTick();
    expect(w.get('[role="combobox"]').text()).toContain('Tutte');
  });

  it('emette le classi standard del trigger stilizzato (dichiarazione della resa 5.2)', () => {
    const w = current = mount(Select, { props: { modelValue: '' } });
    expect(w.get('[role="combobox"]').classes()).toEqual(
      expect.arrayContaining([
        'flex', 'w-full', 'items-center', 'justify-between', 'gap-2', 'text-left',
        'rounded-[var(--radius-md)]', 'border-[1.5px]', 'border-[var(--color-border-input)]',
        'bg-[var(--color-surface)]', 'px-3.5', 'py-3', 'text-[13.5px]', 'text-[var(--color-text)]',
        'outline-none', 'focus:border-[var(--color-brand)]', 'focus:[box-shadow:var(--ring-focus)]',
        'disabled:opacity-50', 'disabled:cursor-not-allowed',
      ]),
    );
  });

  it('inoltra gli attributi al trigger (data-test, class aggiuntive) e rispetta disabled', async () => {
    const w = current = mount(Select, { props: { options: OPTS, modelValue: 'a', disabled: true }, attrs: { 'data-test': 'season-select', class: 'min-w-[150px]' } });
    const t = w.get('[role="combobox"]');
    expect(t.attributes('data-test')).toBe('season-select');
    expect(t.classes()).toContain('min-w-[150px]');
    expect(t.attributes('disabled')).toBeDefined();
    pointerdown(t.element);
    await nextTick();
    expect(bodyOptions()).toHaveLength(0); // disabled: non apre
  });
});
