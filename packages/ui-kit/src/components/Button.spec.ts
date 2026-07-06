import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from './Button.vue';

describe('Button', () => {
  it('rende lo slot ed emette click', async () => {
    const w = mount(Button, { slots: { default: 'Salva' } });
    expect(w.text()).toContain('Salva');
    await w.trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });
  it('rende un elemento button', () => {
    expect(mount(Button).element.tagName).toBe('BUTTON');
  });
  it('applica la taglia sm', () => {
    const cls = mount(Button, { props: { size: 'sm' } }).classes().join(' ');
    expect(cls).toContain('px-3');
    expect(cls).toContain('py-1.5');
  });
  it('in loading mostra lo spinner, è disabilitato e aria-busy', () => {
    const w = mount(Button, { props: { loading: true }, slots: { default: 'Salva' } });
    expect(w.find('svg').exists()).toBe(true);           // spinner (loader-2)
    expect(w.attributes('disabled')).toBeDefined();
    expect(w.attributes('aria-busy')).toBe('true');
  });
  it('in loading non emette click', async () => {
    const w = mount(Button, { props: { loading: true } });
    await w.trigger('click');
    expect(w.emitted('click')).toBeFalsy();
  });
  it('ha feedback di press (active:scale) e focus-ring', () => {
    const cls = mount(Button).classes().join(' ');
    expect(cls).toContain('active:scale-[.98]');
    expect(cls).toContain('focus-visible:[box-shadow:var(--ring-focus)]');
  });
});
