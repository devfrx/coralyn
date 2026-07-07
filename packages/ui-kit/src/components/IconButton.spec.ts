import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import IconButton from './IconButton.vue';

describe('IconButton', () => {
  it('rende un button con aria-label e un svg (icona dal registry)', () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } });
    expect(w.element.tagName).toBe('BUTTON');
    expect(w.attributes('aria-label')).toBe('Chiudi');
    expect(w.find('svg').exists()).toBe(true);
  });
  it('emette click', async () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });
  it('porta il focus-ring e cambia stile sull hover (variante ghost di default)', () => {
    const cls = mount(IconButton, { props: { icon: 'x', label: 'Chiudi' } }).classes().join(' ');
    expect(cls).toContain('focus-visible:[box-shadow:var(--ring-focus)]');
    expect(cls).toContain('hover:');
  });
  it('disabilitato non emette click', async () => {
    const w = mount(IconButton, { props: { icon: 'x', label: 'Chiudi', disabled: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeFalsy();
    expect(w.attributes('disabled')).toBeDefined();
  });
  it('variante subtle usa la superficie raised (come i close attuali)', () => {
    const cls = mount(IconButton, { props: { icon: 'x', label: 'Chiudi', variant: 'subtle' } }).classes().join(' ');
    expect(cls).toContain('bg-[var(--color-raised)]');
  });
  it('applica la variante danger (hover su token --color-danger)', () => {
    const wrapper = mount(IconButton, { props: { icon: 'trash-2', label: 'Elimina', variant: 'danger' } });
    const cls = wrapper.get('button').classes().join(' ');
    expect(cls).toContain('hover:text-[var(--color-danger)]');
    expect(cls).toContain('hover:bg-[var(--color-danger-bg)]');
  });
});
