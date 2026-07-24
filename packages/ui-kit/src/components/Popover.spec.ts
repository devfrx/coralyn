import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import Popover from './Popover.vue';

// reka-ui Popper misura il contenuto via ResizeObserver, assente in jsdom (stesso stub di HoverCard.spec).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const slots = {
  trigger: '<button>Legenda</button>',
  content: '<p>Stato misto — metà per fascia</p>',
};

describe('Popover', () => {
  it('chiuso di default: trigger presente, contenuto assente', () => {
    const w = mount(Popover, { slots, attachTo: document.body });
    expect(w.find('button').exists()).toBe(true);
    expect(document.body.textContent).not.toContain('Stato misto');
  });
  it('click sul trigger: il contenuto è nel portal (body)', async () => {
    const w = mount(Popover, { slots, attachTo: document.body });
    await w.get('button').trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain('Stato misto — metà per fascia');
    w.unmount(); // ferma l'autoUpdate di floating-ui (reka-ui); orfano altrimenti,
    // riemerge come rifiuto async non gestito quando un test successivo tocca il DOM.
  });
  it('defaultOpen: contenuto montato subito', async () => {
    const w = mount(Popover, { props: { defaultOpen: true }, slots, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Stato misto — metà per fascia');
    w.unmount();
  });
  it('v-model:open controllato: aperto mostra il contenuto, chiuso lo nasconde', async () => {
    const w = mount(Popover, { props: { open: true }, slots, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Stato misto');
    await w.setProps({ open: false });
    await flushPromises();
    expect(document.body.textContent).not.toContain('Stato misto');
    w.unmount();
  });
  it('v-model:open: chiudendo dall’esterno il Popover emette update:open=false', async () => {
    const w = mount(Popover, { props: { open: true }, slots, attachTo: document.body });
    await nextTick();
    await w.get('button').trigger('click'); // il trigger fa toggle
    expect(w.emitted('update:open')?.some((e) => e[0] === false)).toBe(true);
    w.unmount();
  });
});
