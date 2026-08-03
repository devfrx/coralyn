import { describe, it, expect, beforeEach } from 'vitest';
import { mount, config } from '@vue/test-utils';
import { h } from 'vue';
import IconPicker from './IconPicker.vue';
import Field from './Field.vue';
import { registerIconCatalog } from '../icons/registered-catalog';
import { lucideCatalog } from '../icons/lucide-catalog';

// ⚠️ Il pacchetto ui-kit NON ha `setupFiles`: ogni spec dichiara i propri stub. reka-ui misura
// l'arrow del Popover con `new ResizeObserver`, che jsdom non implementa e che non e' guardato:
// senza queste due righe i test che aprono il picker esplodono con un ReferenceError, e il difetto
// sembra stare in IconPicker.vue, che invece e' sano. Stesso stub di Popover.spec.ts e Select.spec.ts.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// ⚠️ AGGIUNTO oltre al brief, verificato isolando `Popover.vue` da solo prima di sospettare
// `IconPicker.vue`: reka-ui usa INTERNAMENTE un proprio componente chiamato anch'esso "Teleport"
// (per differire il teleport reale finche' non e' montato) — non e' il Teleport nativo di Vue.
// Lo stub `teleport: true` di vue-test-utils fa match per NOME, quindi intercetta anche questo
// wrapper interno, e senza `renderStubDefaultSlot` lo stub non proietta il suo slot: il contenuto
// del Popover (SearchInput, icone) sparirebbe dal wrapper anche a popover aperto, in un modo
// indistinguibile da un IconPicker rotto. Stesso genere di gap di Popover.spec.ts, diverso sintomo.
config.global.renderStubDefaultSlot = true;

beforeEach(() => registerIconCatalog(lucideCatalog));

const open = { props: { modelValue: 'umbrella', defaultOpen: true }, global: { stubs: { teleport: true } } };

describe('IconPicker', () => {
  it('apre sulle icone suggerite, non sull ordine alfabetico', async () => {
    const w = mount(IconPicker, open);
    const primo = w.get('[data-testid="icon-option"]');
    expect(primo.attributes('data-icon')).toBe('umbrella');
  });

  it('la ricerca filtra il catalogo intero', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('anchor');
    const nomi = w.findAll('[data-testid="icon-option"]').map((n) => n.attributes('data-icon'));
    expect(nomi).toContain('anchor');
    expect(nomi).not.toContain('umbrella');
  });

  it('emette il nome scelto', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('anchor');
    await w.get('[data-icon="anchor"]').trigger('click');
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['anchor']);
  });

  it('quando tronca lo DICE: un elenco troncato non e un elenco esaurito', async () => {
    const w = mount(IconPicker, { ...open, props: { ...open.props, limit: 5 } });
    await w.get('input[type="text"]').setValue('arrow');
    expect(w.findAll('[data-testid="icon-option"]')).toHaveLength(5);
    expect(w.get('[data-testid="icon-count"]').text()).toMatch(/\d+/);
  });

  it('una ricerca senza esiti lo dice invece di mostrare il vuoto', async () => {
    const w = mount(IconPicker, open);
    await w.get('input[type="text"]').setValue('zzzznonesiste');
    expect(w.findAll('[data-testid="icon-option"]')).toHaveLength(0);
    // .find(), non .get(): .get() già lancia se assente, quindi il tipo di vue-test-utils gli
    // toglie .exists() (chiamata sempre vera se non lancia) — vue-tsc lo boccia, non solo un lint.
    expect(w.find('[data-testid="icon-empty"]').exists()).toBe(true);
  });

  it('dentro un Field il trigger e etichettato dal Field, non dal valore', () => {
    // AUD-013, WCAG 4.1.2: un <button> non e' un labelable element, quindi il <label> di Field
    // non gli da' alcun nome e lo screen reader annuncerebbe "tree-palm".
    const w = mount(Field, {
      props: { label: 'Icona sulla mappa' },
      slots: { default: h(IconPicker, { modelValue: 'umbrella' }) },
      global: { stubs: { teleport: true } },
    });
    const trigger = w.get('[data-testid="icon-picker-trigger"]');
    const labelledBy = trigger.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(w.get(`#${labelledBy}`).text()).toBe('Icona sulla mappa');
  });

  it('fuori da un Field non inventa un aria-labelledby verso un id inesistente', () => {
    const w = mount(IconPicker, { props: { modelValue: 'umbrella' }, global: { stubs: { teleport: true } } });
    expect(w.get('[data-testid="icon-picker-trigger"]').attributes('aria-labelledby')).toBeUndefined();
  });
});
