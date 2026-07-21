import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
  });
  it('defaultOpen: contenuto montato subito', async () => {
    mount(Popover, { props: { defaultOpen: true }, slots, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Stato misto — metà per fascia');
  });
});
