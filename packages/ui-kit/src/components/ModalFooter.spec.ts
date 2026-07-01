import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ModalFooter from './ModalFooter.vue';

describe('ModalFooter', () => {
  it('rende Annulla (secondary) + submitLabel (primary) e le classi del wrapper', () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Salva cliente' } });
    const wrapper = w.find('div');
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['flex', 'justify-end', 'gap-2.5', 'pt-1']));
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toBe('Annulla');
    expect(buttons[1].text()).toBe('Salva cliente');
  });

  it('supporta cancelLabel custom e submitVariant danger', () => {
    const w = mount(ModalFooter, { props: { cancelLabel: 'Chiudi', submitLabel: 'Elimina', submitVariant: 'danger' } });
    const buttons = w.findAll('button');
    expect(buttons[0].text()).toBe('Chiudi');
    expect(buttons[1].text()).toBe('Elimina');
  });

  it('emette cancel/submit al click', async () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Conferma' } });
    await w.findAll('button')[0].trigger('click');
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('submit')).toHaveLength(1);
  });

  it('submitDisabled disabilita il bottone di conferma', () => {
    const w = mount(ModalFooter, { props: { submitLabel: 'Conferma', submitDisabled: true } });
    expect(w.findAll('button')[1].attributes('disabled')).toBeDefined();
  });
});
