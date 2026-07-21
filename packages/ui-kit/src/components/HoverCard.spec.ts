import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import HoverCard from './HoverCard.vue';

// jsdom non implementa ResizeObserver; reka-ui lo usa internamente per il
// Popper Arrow (HoverCardArrow) anche quando la card è chiusa. Stub minimo
// solo per l'ambiente di test — non riguarda il contratto del componente.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

afterEach(() => { document.body.innerHTML = ''; });

const slots = {
  trigger: '<button>cella</button>',
  content: '<p>Ombrellone 8 — Mattina Prenotato</p>',
};

describe('HoverCard', () => {
  it('disabled: rende solo il trigger, nessun contenuto montato', () => {
    const w = mount(HoverCard, { props: { disabled: true }, slots });
    expect(w.find('button').exists()).toBe(true);
    expect(document.body.textContent).not.toContain('Ombrellone 8');
  });
  it('defaultOpen: il contenuto è nel portal (body)', async () => {
    // reka-ui monta il contenuto tramite un `Presence` che flusha lo stato
    // dopo un tick (stesso pattern osservato in Modal.spec.ts / Drawer.spec.ts).
    mount(HoverCard, { props: { defaultOpen: true }, slots, attachTo: document.body });
    await nextTick();
    expect(document.body.textContent).toContain('Ombrellone 8 — Mattina Prenotato');
  });
  it('default (chiuso): trigger presente, contenuto assente', () => {
    const w = mount(HoverCard, { slots, attachTo: document.body });
    expect(w.find('button').exists()).toBe(true);
    expect(document.body.textContent).not.toContain('Ombrellone 8');
  });
});
