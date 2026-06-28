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
});
