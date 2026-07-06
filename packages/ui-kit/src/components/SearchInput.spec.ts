import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchInput from './SearchInput.vue';

describe('SearchInput', () => {
  it('riflette il modelValue ed emette update:modelValue digitando', async () => {
    const w = mount(SearchInput, { props: { modelValue: 'ab' } });
    expect(w.find('input').element.value).toBe('ab');
    await w.find('input').setValue('abc');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['abc']);
  });

  it('mostra il pulsante di pulizia solo con testo e lo azzera', async () => {
    const w = mount(SearchInput, { props: { modelValue: '' } });
    expect(w.find('[aria-label="Cancella ricerca"]').exists()).toBe(false);
    await w.setProps({ modelValue: 'x' });
    expect(w.find('[aria-label="Cancella ricerca"]').exists()).toBe(true);
    await w.find('[aria-label="Cancella ricerca"]').trigger('click');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['']);
  });

  it('usa placeholder e aria-label forniti', () => {
    const w = mount(SearchInput, { props: { modelValue: '', placeholder: 'Cerca per nome o telefono…', ariaLabel: 'Cerca clienti' } });
    const input = w.find('input');
    expect(input.attributes('placeholder')).toBe('Cerca per nome o telefono…');
    expect(input.attributes('aria-label')).toBe('Cerca clienti');
  });
});
